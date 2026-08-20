import { describe, expect, it } from "vitest";
import { resolveActivelyDeploying } from "@/lib/activelyDeploying";

const NOW = new Date("2026-08-20T12:00:00.000Z");

describe("resolveActivelyDeploying", () => {
  it("treats a fresh fund or live fund flag as active even when velocity is slow", () => {
    expect(
      resolveActivelyDeploying(
        { isActivelyDeploying: true, dealVelocityScore: 5, recentDealCount: 0 },
        NOW,
      ),
    ).toBe(true);
    expect(
      resolveActivelyDeploying(
        { hasFreshCapital: true, isActivelyDeploying: false, dealVelocityScore: 5 },
        NOW,
      ),
    ).toBe(true);
    expect(
      resolveActivelyDeploying(
        { likelyActivelyDeploying: true, isActivelyDeploying: false, dealVelocityScore: 5 },
        NOW,
      ),
    ).toBe(true);
    expect(
      resolveActivelyDeploying(
        { fundLikelyActivelyDeploying: true, isActivelyDeploying: false, dealVelocityScore: 5 },
        NOW,
      ),
    ).toBe(true);
  });

  it("treats a recent investment or current-vintage fund as active", () => {
    expect(
      resolveActivelyDeploying({ isActivelyDeploying: false, recentDealCount: 1 }, NOW),
    ).toBe(true);
    expect(
      resolveActivelyDeploying(
        { isActivelyDeploying: false, lastDealAt: "2025-09-01T00:00:00.000Z" },
        NOW,
      ),
    ).toBe(true);
    expect(
      resolveActivelyDeploying({ isActivelyDeploying: false, latestFundVintageYear: 2025 }, NOW),
    ).toBe(true);
    expect(
      resolveActivelyDeploying(
        { isActivelyDeploying: false, lastFundAnnouncementAt: "2025-03-01T00:00:00.000Z" },
        NOW,
      ),
    ).toBe(true);
  });

  it("stays inactive when there is no fund raise and no recent investment", () => {
    expect(
      resolveActivelyDeploying(
        {
          isActivelyDeploying: false,
          hasFreshCapital: false,
          likelyActivelyDeploying: false,
          fundLikelyActivelyDeploying: false,
          recentDealCount: 0,
          dealVelocityScore: 5,
          latestFundVintageYear: 2019,
          lastDealAt: "2023-01-01T00:00:00.000Z",
        },
        NOW,
      ),
    ).toBe(false);
  });
});
