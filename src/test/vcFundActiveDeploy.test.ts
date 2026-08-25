import { describe, expect, it } from "vitest";
import { deriveFirmCapitalState } from "@/lib/vc-funds/derivations";
import type { CanonicalFundDraft } from "@/lib/vc-funds/types";

function draft(partial: Partial<CanonicalFundDraft> = {}): CanonicalFundDraft {
  return {
    firmRecordId: "firm-1",
    name: "Fund I",
    normalizedName: "fund 1",
    normalizedKey: "firm-1:fund 1",
    fundType: "venture",
    fundSequenceNumber: 1,
    vintageYear: 2021,
    announcedDate: "2021-01-01",
    closeDate: null,
    targetSizeUsd: 50_000_000,
    finalSizeUsd: null,
    currency: "USD",
    status: "announced",
    sourceConfidence: 0.8,
    sourceCount: 1,
    leadSource: null,
    announcementUrl: null,
    announcementTitle: null,
    rawSourceText: null,
    isNewFundSignal: true,
    activeDeploymentWindowStart: null,
    activeDeploymentWindowEnd: null,
    likelyActivelyDeploying: true,
    stageFocus: [],
    sectorFocus: [],
    geographyFocus: [],
    estimatedCheckMinUsd: null,
    estimatedCheckMaxUsd: null,
    fieldConfidence: {},
    fieldProvenance: {},
    verificationStatus: "verified",
    lastVerifiedAt: null,
    freshnessSyncedAt: new Date().toISOString(),
    latestSourcePublishedAt: null,
    metadata: {},
    ...partial,
  };
}

describe("deriveFirmCapitalState", () => {
  it("marks a newly promoted fund as actively deploying even with an old announced date", () => {
    const result = deriveFirmCapitalState(draft({ isNewFundSignal: true, announcedDate: "2021-01-01" }));
    expect(result.likelyActivelyDeploying).toBe(true);
  });

  it("still uses the deployment window when the fund is not a new-vehicle signal", () => {
    const result = deriveFirmCapitalState(
      draft({
        isNewFundSignal: false,
        announcedDate: "2021-01-01",
        status: "final_close",
      }),
    );
    expect(result.likelyActivelyDeploying).toBe(false);
  });
});
