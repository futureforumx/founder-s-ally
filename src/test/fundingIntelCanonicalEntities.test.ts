import { describe, expect, it } from "vitest";
import { aliasesFromFirmRecord } from "../../scripts/funding-intel/lib/canonical-entities";

describe("aliasesFromFirmRecord", () => {
  it("flattens legal name, aliases, and website domain", () => {
    const aliases = aliasesFromFirmRecord({
      id: "firm-1",
      firm_name: "Sequoia Capital",
      legal_name: "Sequoia Capital Operations LLC",
      aliases: ["Sequoia"],
      alternate_names: ["Sequoia US"],
      website_url: "https://www.sequoiacap.com/companies",
    });
    expect(aliases).toEqual(
      expect.arrayContaining([
        { firm_id: "firm-1", alias_value: "Sequoia Capital Operations LLC", alias_type: "LEGAL_NAME" },
        { firm_id: "firm-1", alias_value: "Sequoia", alias_type: "ALIAS" },
        { firm_id: "firm-1", alias_value: "Sequoia US", alias_type: "ALIAS" },
        { firm_id: "firm-1", alias_value: "sequoiacap.com", alias_type: "WEBSITE_DOMAIN" },
      ]),
    );
  });

  it("skips empty alias values", () => {
    expect(
      aliasesFromFirmRecord({
        id: "firm-2",
        firm_name: "Solo GP",
        aliases: ["", "  "],
        alternate_names: null,
      }),
    ).toEqual([]);
  });
});
