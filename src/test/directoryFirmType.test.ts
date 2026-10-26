import { describe, expect, it } from "vitest";
import {
  canonicalizeDirectoryFirmTypeKey,
  directoryFirmTypeBadgeLabel,
  directoryFirmTypeMatchesFilters,
  directoryFirmTypeTriggerLabel,
  mapEntityTypeToDirectoryFirmTypeKey,
  parseDirectoryFirmTypeSearchParam,
  serializeDirectoryFirmTypeSearchParam,
} from "@/lib/directoryFirmType";
import { computeInvestorFocusBadge } from "@/lib/investorFocusBadge";
import { resolveDirectoryFirmTypeKey } from "@/lib/resolveDirectoryFirmType";

describe("directory firm type mapping", () => {
  it("canonicalizes stored firm_type aliases", () => {
    expect(canonicalizeDirectoryFirmTypeKey("Venture Capital")).toBe("VC");
    expect(canonicalizeDirectoryFirmTypeKey("institutional")).toBe("INSTITUTIONAL");
    expect(canonicalizeDirectoryFirmTypeKey("Corporate (CVC)")).toBe("CVC");
    expect(canonicalizeDirectoryFirmTypeKey("Angel Group / Syndicate")).toBe("ANGEL_NETWORK");
    expect(canonicalizeDirectoryFirmTypeKey("Fund of Funds")).toBe("FUND_OF_FUNDS");
    expect(canonicalizeDirectoryFirmTypeKey("Private equity")).toBe("PE");
  });

  it("maps Postgres entity_type labels without collapsing FoF or syndicates", () => {
    expect(mapEntityTypeToDirectoryFirmTypeKey("Fund of Funds")).toBe("FUND_OF_FUNDS");
    expect(mapEntityTypeToDirectoryFirmTypeKey("Syndicate")).toBe("ANGEL_NETWORK");
    expect(mapEntityTypeToDirectoryFirmTypeKey("Corporate (CVC)")).toBe("CVC");
    expect(mapEntityTypeToDirectoryFirmTypeKey("Accelerator / Studio")).toBe("ACCELERATOR");
  });

  it("prefers entity_type when firm_type is the generic institutional default", () => {
    expect(resolveDirectoryFirmTypeKey("Example Capital", "INSTITUTIONAL", "Fund of Funds")).toBe(
      "FUND_OF_FUNDS",
    );
    expect(resolveDirectoryFirmTypeKey("Example Angels", "Institutional", "Syndicate")).toBe(
      "ANGEL_NETWORK",
    );
    expect(resolveDirectoryFirmTypeKey("Example Ventures", "VC", "Family Office")).toBe("VC");
  });

  it("matches multi-select filters including institutional VCs", () => {
    expect(directoryFirmTypeMatchesFilters("INSTITUTIONAL", ["vc"])).toBe(true);
    expect(directoryFirmTypeMatchesFilters("FAMILY_OFFICE", ["vc", "family_office"])).toBe(true);
    expect(directoryFirmTypeMatchesFilters("FUND_OF_FUNDS", ["vc"])).toBe(false);
    expect(directoryFirmTypeMatchesFilters("FUND_OF_FUNDS", ["fund_of_funds"])).toBe(true);
    expect(directoryFirmTypeMatchesFilters("ANGEL_NETWORK", ["angel_group"])).toBe(true);
    expect(directoryFirmTypeMatchesFilters("PUBLIC", ["other"])).toBe(true);
    expect(directoryFirmTypeMatchesFilters("INDIVIDUAL", ["other"])).toBe(false);
    expect(directoryFirmTypeMatchesFilters("CVC", [])).toBe(true);
  });

  it("serializes URL-safe multi-select state", () => {
    expect(serializeDirectoryFirmTypeSearchParam(["cvc", "vc"])).toBe("vc,cvc");
    expect(parseDirectoryFirmTypeSearchParam("vc,family_office,not-a-type")).toEqual([
      "vc",
      "family_office",
    ]);
    expect(parseDirectoryFirmTypeSearchParam("")).toEqual([]);
    expect(serializeDirectoryFirmTypeSearchParam([])).toBeNull();
  });

  it("builds trigger labels", () => {
    expect(directoryFirmTypeTriggerLabel([])).toBe("Firm type");
    expect(directoryFirmTypeTriggerLabel(["vc"])).toBe("Venture Capital");
    expect(directoryFirmTypeTriggerLabel(["vc", "cvc"])).toBe("Firm type · 2");
  });

  it("uses classification badges instead of generic INSTITUTIONAL", () => {
    expect(directoryFirmTypeBadgeLabel("INSTITUTIONAL")).toBe("VC FIRM");
    expect(directoryFirmTypeBadgeLabel("VC")).toBe("VC FIRM");
    expect(directoryFirmTypeBadgeLabel("FAMILY_OFFICE")).toBe("FAMILY OFFICE");
    expect(directoryFirmTypeBadgeLabel("CVC")).toBe("CVC");
    expect(directoryFirmTypeBadgeLabel("ANGEL_NETWORK")).toBe("ANGEL GROUP");
    expect(directoryFirmTypeBadgeLabel("ACCELERATOR")).toBe("ACCELERATOR");
    expect(computeInvestorFocusBadge({ fallbackFirmTypeKey: "INSTITUTIONAL" }).pill).toBe("VC FIRM");
    expect(computeInvestorFocusBadge({ fallbackFirmTypeKey: "FAMILY_OFFICE" }).pill).toBe(
      "FAMILY OFFICE",
    );
  });
});
