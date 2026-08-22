import { describe, expect, it } from "vitest";
import {
  isPipelineSourceEnabled,
  lastScannedFromSyncRun,
  normalizeDisabledSourceKeys,
  slugFromSourceName,
  withSourceEnabled,
  normalizeSourceUrl,
} from "@/lib/freshCapitalPipelineSources";

describe("freshCapitalPipelineSources", () => {
  it("normalizes disabled keys", () => {
    expect(normalizeDisabledSourceKeys([" TECHCRUNCH_VENTURE ", "TECHCRUNCH_VENTURE", 3, ""])).toEqual([
      "TECHCRUNCH_VENTURE",
    ]);
  });

  it("toggles a key on and off", () => {
    const off = withSourceEnabled([], "ALLEYWATCH_FUNDING", false);
    expect(isPipelineSourceEnabled("ALLEYWATCH_FUNDING", off)).toBe(false);
    const on = withSourceEnabled(off, "ALLEYWATCH_FUNDING", true);
    expect(on).toEqual([]);
  });

  it("uses the sync completed time as last scanned", () => {
    expect(
      lastScannedFromSyncRun(
        { sourceStats: { TECHCRUNCH_VENTURE: { fetched: 4 } } },
        "TECHCRUNCH_VENTURE",
        "2026-08-21T07:00:00.000Z",
      ),
    ).toBe("2026-08-21T07:00:00.000Z");
  });

  it("builds a slug and HTTPS URL for a new source", () => {
    expect(slugFromSourceName("GeekWire Fundings")).toBe("geekwire_fundings");
    expect(normalizeSourceUrl("geekwire.com/fundings")).toBe("https://geekwire.com/fundings");
    expect(normalizeSourceUrl("not a url")).toBeNull();
  });
});
