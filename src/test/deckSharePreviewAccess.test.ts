import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const deckQuery: Record<string, ReturnType<typeof vi.fn>> = {};
  const shareQuery: Record<string, ReturnType<typeof vi.fn>> = {};
  const sessionInsert = vi.fn(async () => ({ error: null }));
  const service = { from: vi.fn((table: string) => table === "company_pitch_decks" ? deckQuery : table === "deck_shares" ? shareQuery : { insert: sessionInsert }) };
  return {
    service, deckQuery, shareQuery, sessionInsert,
    getDeckShareService: vi.fn(() => service),
    getVerifiedOwnerId: vi.fn(async () => "owner-id" as string | null),
    getVerifiedViewer: vi.fn(async () => null),
    consumeDeckShareLimit: vi.fn(async () => true),
    findShareByPath: vi.fn(),
    findShareByToken: vi.fn(),
    findViewerSession: vi.fn(),
    readCookie: vi.fn(),
    setViewerCookies: vi.fn(),
    verifySharePassword: vi.fn(() => true),
    getR2PitchDeckObject: vi.fn(),
  };
});

vi.mock("../../api/_deckShareServer.js", () => ({
  ...mocks,
  shareIsActive: (share: { revoked_at?: string | null; expires_at?: string | null }) => share.revoked_at ? "revoked" : share.expires_at && Date.parse(share.expires_at) <= Date.now() ? "expired" : null,
}));
vi.mock("../../api/_deckShareCrypto.js", () => ({ hashShareToken: (value: string) => value, verifySharePassword: mocks.verifySharePassword }));
vi.mock("../../api/_deckShareEmail.js", () => ({ isAllowedDeckViewerEmail: () => true }));
vi.mock("../../api/_readJsonBody.js", () => ({ readJsonBody: async (req: { body?: unknown }) => req.body ?? {} }));
vi.mock("../../api/_r2UserAssets.js", () => ({ getR2PitchDeckObject: mocks.getR2PitchDeckObject, parseR2StoredValue: (stored: string) => stored.replace(/^r2:\/\//, "") }));

import viewHandler from "../../api/deck-share-view";
import fileHandler from "../../api/deck-share-file";

const shareId = "11111111-1111-4111-8111-111111111111";
const deck = { id: "deck-id", user_id: "owner-id", file_name: "pitch.pdf", file_size_bytes: 3, slide_count: 8 };
const share = {
  id: shareId, user_id: "owner-id", deck_id: deck.id, company_slug: "vekta", presentation_slug: "seed-deck",
  file_url_snapshot: "r2://pitch-decks/owner-id/pitch.pdf", company_name_snapshot: "Vekta", company_logo_url_snapshot: null,
  password_hash: null, require_email: false, allowed_emails: [], revoked_at: null, expires_at: null, show_download: true,
  company_pitch_decks: deck,
};

function response() {
  return {
    statusCode: 200, payload: undefined as unknown, headersSent: false, setHeader: vi.fn(),
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.payload = payload; return this; },
    end(payload?: unknown) { this.payload = payload; return this; },
  };
}

const previewViewRequest = () => ({ method: "POST", headers: { authorization: "Bearer owner-token" }, body: { companySlug: "vekta", presentationSlug: "seed-deck", preview: true } });
const previewFileRequest = () => ({ method: "GET", headers: { authorization: "Bearer owner-token" }, query: { previewLinkId: shareId } });

describe("owner-only deck showroom previews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getVerifiedOwnerId.mockResolvedValue("owner-id");
    mocks.verifySharePassword.mockReturnValue(true);
    mocks.findShareByPath.mockResolvedValue({ ...share });
    Object.assign(mocks.deckQuery, {
      select: vi.fn(() => mocks.deckQuery), eq: vi.fn(() => mocks.deckQuery),
      maybeSingle: vi.fn(async () => ({ data: deck, error: null })),
    });
    Object.assign(mocks.shareQuery, {
      select: vi.fn(() => mocks.shareQuery), eq: vi.fn(() => mocks.shareQuery),
      maybeSingle: vi.fn(async () => ({ data: { ...share }, error: null })),
    });
    mocks.getR2PitchDeckObject.mockImplementation(async () => ({ Body: Readable.from([Buffer.from("pdf")]) }));
  });

  it("requires a verified owner to open preview metadata", async () => {
    mocks.getVerifiedOwnerId.mockResolvedValue(null);
    const res = response();
    await viewHandler(previewViewRequest() as never, res as never);
    expect(res.statusCode).toBe(401);
    expect(mocks.sessionInsert).not.toHaveBeenCalled();
    expect(mocks.setViewerCookies).not.toHaveBeenCalled();
  });

  it("rejects preview metadata for another owner's link", async () => {
    mocks.getVerifiedOwnerId.mockResolvedValue("different-owner");
    const res = response();
    await viewHandler(previewViewRequest() as never, res as never);
    expect(res.statusCode).toBe(403);
    expect(mocks.service.from).not.toHaveBeenCalled();
  });

  it("returns preview metadata without starting analytics or replacing viewer cookies", async () => {
    const res = response();
    await viewHandler(previewViewRequest() as never, res as never);
    expect(res.statusCode).toBe(200);
    expect(res.payload).toMatchObject({ ok: true, previewLinkId: shareId, companyName: "Vekta", showDownload: true });
    expect(mocks.sessionInsert).not.toHaveBeenCalled();
    expect(mocks.setViewerCookies).not.toHaveBeenCalled();
    expect(mocks.getVerifiedOwnerId).toHaveBeenCalledWith("Bearer owner-token", mocks.service);
  });

  it("preserves the external password gate during an owner preview", async () => {
    mocks.findShareByPath.mockResolvedValue({ ...share, password_hash: "password-hash" });
    mocks.verifySharePassword.mockReturnValue(false);
    const res = response();
    await viewHandler(previewViewRequest() as never, res as never);
    expect(res.statusCode).toBe(401);
    expect(res.payload).toMatchObject({ requiresPassword: true, companyName: "Vekta" });
    expect(res.payload).not.toHaveProperty("previewLinkId");
  });

  it("preserves the external email gate during an owner preview", async () => {
    mocks.findShareByPath.mockResolvedValue({ ...share, require_email: true });
    const res = response();
    await viewHandler(previewViewRequest() as never, res as never);
    expect(res.statusCode).toBe(401);
    expect(res.payload).toMatchObject({ requiresEmail: true });
    expect(res.payload).not.toHaveProperty("previewLinkId");
  });

  it("requires bearer authentication for preview PDF requests even with a link ID", async () => {
    mocks.getVerifiedOwnerId.mockResolvedValue(null);
    const res = response();
    await fileHandler(previewFileRequest() as never, res as never);
    expect(res.statusCode).toBe(401);
    expect(mocks.service.from).not.toHaveBeenCalled();
    expect(mocks.getR2PitchDeckObject).not.toHaveBeenCalled();
  });

  it("scopes preview PDF lookup to the authenticated owner", async () => {
    mocks.shareQuery.maybeSingle.mockResolvedValue({ data: null, error: null });
    const res = response();
    await fileHandler(previewFileRequest() as never, res as never);
    expect(res.statusCode).toBe(404);
    expect(mocks.shareQuery.eq).toHaveBeenCalledWith("id", shareId);
    expect(mocks.shareQuery.eq).toHaveBeenCalledWith("user_id", "owner-id");
    expect(mocks.getR2PitchDeckObject).not.toHaveBeenCalled();
  });

  it("streams an owner's snapshot without reading or creating a viewer session", async () => {
    const res = response();
    await fileHandler(previewFileRequest() as never, res as never);
    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual(Buffer.from("pdf"));
    expect(mocks.readCookie).not.toHaveBeenCalled();
    expect(mocks.findViewerSession).not.toHaveBeenCalled();
    expect(mocks.setViewerCookies).not.toHaveBeenCalled();
  });

  it("rechecks link revocation on every preview PDF request", async () => {
    mocks.shareQuery.maybeSingle.mockResolvedValue({ data: { ...share, revoked_at: new Date().toISOString() }, error: null });
    const res = response();
    await fileHandler(previewFileRequest() as never, res as never);
    expect(res.statusCode).toBe(410);
    expect(mocks.getR2PitchDeckObject).not.toHaveBeenCalled();
  });
});
