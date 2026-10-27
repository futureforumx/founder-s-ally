import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const deckQuery: Record<string, unknown> = {};
  const sessionInsert = vi.fn(async () => ({ error: null }));
  const service = {
    from: vi.fn((table: string) => table === "company_pitch_decks"
      ? deckQuery
      : { insert: sessionInsert }),
  };
  return {
    service,
    deckQuery,
    sessionInsert,
    getDeckShareService: vi.fn(() => service),
    consumeDeckShareLimit: vi.fn(async () => true),
    findShareByPath: vi.fn(),
    findShareByToken: vi.fn(),
    getVerifiedViewer: vi.fn(async () => null),
    setViewerCookies: vi.fn(),
    shareIsActive: vi.fn(() => null),
    readJsonBody: vi.fn(async (req: { body?: unknown }) => req.body ?? {}),
  };
});

vi.mock("../../api/_deckShareServer.js", () => ({
  getDeckShareService: mocks.getDeckShareService,
  consumeDeckShareLimit: mocks.consumeDeckShareLimit,
  findShareByPath: mocks.findShareByPath,
  findShareByToken: mocks.findShareByToken,
  getVerifiedViewer: mocks.getVerifiedViewer,
  setViewerCookies: mocks.setViewerCookies,
  shareIsActive: mocks.shareIsActive,
}));
vi.mock("../../api/_deckShareCrypto.js", () => ({ hashShareToken: (value: string) => value, verifySharePassword: () => true }));
vi.mock("../../api/_deckShareEmail.js", () => ({ isAllowedDeckViewerEmail: () => true }));
vi.mock("../../api/_readJsonBody.js", () => ({ readJsonBody: mocks.readJsonBody }));

import handler from "../../api/deck-share-view";

function response() {
  const result = { statusCode: 200, payload: undefined as unknown, status(code: number) { this.statusCode = code; return this; }, json(payload: unknown) { this.payload = payload; return this; }, setHeader() {} };
  return result;
}

describe("workspace-branded deck share routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mocks.deckQuery, {
      select: vi.fn(() => mocks.deckQuery),
      eq: vi.fn(() => mocks.deckQuery),
      maybeSingle: vi.fn(async () => ({ data: { id: "deck-id", user_id: "owner-id", file_name: "pitch.pdf", file_size_bytes: 1024, slide_count: 8 }, error: null })),
    });
  });

  it("resolves a company and presentation path through the same gated viewer session", async () => {
    mocks.findShareByPath.mockResolvedValue({ id: "share-id", user_id: "owner-id", deck_id: "deck-id", token_hash: "hash", company_slug: "vekta", presentation_slug: "seed-deck-acme", file_url_snapshot: "r2://pitch-decks/owner-id/pitch.pdf", company_name_snapshot: "Vekta", company_stage_snapshot: "Seed", company_logo_url_snapshot: null, contact_email: "founder@vekta.so", password_hash: null, require_email: false, allowed_emails: [], revoked_at: null, expires_at: null, show_download: true });
    const res = response();
    await handler({ method: "POST", headers: {}, body: { companySlug: "vekta", presentationSlug: "seed-deck-acme" } } as never, res as never);
    expect(mocks.findShareByPath).toHaveBeenCalledWith(mocks.service, "vekta", "seed-deck-acme");
    expect(res.statusCode).toBe(200);
    expect(res.payload).toMatchObject({ ok: true, companyName: "Vekta", contactEmail: "founder@vekta.so", showDownload: true });
    expect(mocks.sessionInsert).toHaveBeenCalledOnce();
  });

  it("denies the old opaque URL after a branded path is assigned", async () => {
    mocks.findShareByToken.mockResolvedValue({ id: "share-id", presentation_slug: "seed-deck-acme" });
    const res = response();
    await handler({ method: "POST", headers: {}, body: { token: "a".repeat(43) } } as never, res as never);
    expect(res.statusCode).toBe(404);
    expect(mocks.service.from).not.toHaveBeenCalled();
  });
});
