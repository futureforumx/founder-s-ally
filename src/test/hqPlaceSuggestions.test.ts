import { describe, expect, it } from "vitest";
import { suggestHqCities, suggestHqCountries, suggestHqStates } from "@/lib/hqPlaceSuggestions";

describe("company HQ place suggestions", () => {
  it("suggests countries from a prefix or a short code", () => {
    const united = suggestHqCountries("uni").map((row) => row.country);
    expect(united).toEqual(expect.arrayContaining(["United States", "United Kingdom", "United Arab Emirates"]));
    expect(suggestHqCountries("us")[0]?.country).toBe("United States");
    expect(suggestHqCountries("uae")[0]?.country).toBe("United Arab Emirates");
  });

  it("suggests US postal codes and province abbreviations", () => {
    const ny = suggestHqStates("ny", "United States")[0];
    expect(ny?.label).toBe("New York");
    expect(ny?.state).toBe("NY");
    expect(ny?.country).toBe("United States");
    expect(suggestHqStates("on", "Canada")[0]).toMatchObject({ label: "Ontario", state: "Ontario", country: "Canada" });
    expect(suggestHqStates("nsw", null)[0]).toMatchObject({ label: "New South Wales", country: "Australia" });
  });

  it("suggests cities and fills the matching state and country", () => {
    const nyc = suggestHqCities("new yo", null, null)[0];
    expect(nyc).toMatchObject({ city: "New York", state: "NY", country: "United States" });
    expect(suggestHqCities("nyc", null, null)[0]?.city).toBe("New York");
    expect(suggestHqCities("palo", "United States", "CA")[0]).toMatchObject({
      city: "Palo Alto",
      state: "CA",
      country: "United States",
    });
    expect(suggestHqCities("bangalore", null, null)[0]).toMatchObject({
      city: "Bengaluru",
      state: "Karnataka",
      country: "India",
    });
    expect(suggestHqCities("lon", "United Kingdom", null)[0]).toMatchObject({
      city: "London",
      state: "England",
      country: "United Kingdom",
    });
    expect(suggestHqCities("n", null, null)).toEqual([]);
  });
});
