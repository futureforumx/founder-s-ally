import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readCookie: vi.fn(),
  findViewerSession: vi.fn(),
  getDeckShareService: vi.fn(() => ({})),
  consumeDeckShareLimit: vi.fn(async () => true),
  getR2PitchDeckObject: vi.fn(),
  parseR2StoredValue: vi.fn(),
}));

vi.mock("../../api/_deckShareServer.js", () => ({
  readCookie: mocks.readCookie,
  findViewerSession: mocks.findViewerSession,
  getDeckShareService: mocks.getDeckShareService,
  consumeDeckShareLimit: mocks.consumeDeckShareLimit,
  shareIsActive: (share: { revoked_at?: string | null; expires_at?: string | null }) => share.revoked_at ? "revoked" : share.expires_at && Date.parse(share.expires_at) <= Date.now() ? "expired" : null,
}));
vi.mock("../../api/_r2UserAssets.js", () => ({ getR2PitchDeckObject: mocks.getR2PitchDeckObject, parseR2StoredValue: mocks.parseR2StoredValue }));

import handler from "../../api/deck-share-file";

function response() {
  const result = { statusCode: 200, payload: undefined as unknown, status(code: number) { this.statusCode = code; return this; }, end(payload?: unknown) { this.payload = payload; return this; }, json(payload: unknown) { this.payload = payload; return this; }, setHeader() {}, headersSent: false };
  return result;
}

describe("private deck file API access", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not serve a private PDF when a browser bypasses the share viewer session", async () => {
    mocks.readCookie.mockReturnValue("");
    const res = response();
    await handler({ method: "GET", headers: {} } as never, res as never);
    expect(res.statusCode).toBe(401);
    expect(mocks.findViewerSession).not.toHaveBeenCalled();
    expect(mocks.getR2PitchDeckObject).not.toHaveBeenCalled();
  });

  it("rechecks revocation before each direct PDF request", async () => {
    mocks.readCookie.mockReturnValue("session-secret");
    mocks.findViewerSession.mockResolvedValue({ expires_at: new Date(Date.now() + 60_000).toISOString(), deck_shares: { id: "share", user_id: "owner", revoked_at: new Date().toISOString(), file_url_snapshot: "r2://pitch-decks/owner/deck.pdf", company_pitch_decks: { id: "deck", user_id: "owner", file_name: "pitch.pdf" } } });
    const res = response();
    await handler({ method: "GET", headers: {} } as never, res as never);
    expect(res.statusCode).toBe(410);
    expect(mocks.getR2PitchDeckObject).not.toHaveBeenCalled();
  });
});
