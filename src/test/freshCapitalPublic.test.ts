import { describe, expect, it } from "vitest";
import { firmMarkCandidateUrls } from "@/lib/freshCapitalPublic";

describe("freshCapitalPublic firm mark candidates", () => {
  it("prefers VC Sheet logos before proxy favicon services for known funds", () => {
    const candidates = firmMarkCandidateUrls({
      firm_name: "Andreessen Horowitz",
      firm_domain: "a16z.com",
      firm_logo_url: "https://cdn.example.com/old-logo.png",
    });

    expect(candidates).toEqual([
      "https://cdn.prod.website-files.com/62f3f3ccd0cfd515f3b095e4/693b180b9b8a6daa57ede490_a16z_logo%20(2).jpeg",
      "https://img.logo.dev/a16z.com?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=a16z.com",
      "https://img.logo.dev/andreessenhorowitz.com?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=andreessenhorowitz.com",
      "https://img.logo.dev/andreessenhorowitz.vc?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=andreessenhorowitz.vc",
      "https://img.logo.dev/andreessenhorowitz.ventures?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=andreessenhorowitz.ventures",
      "https://img.logo.dev/andreessenhorowitz.capital?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=andreessenhorowitz.capital",
    ]);
    expect(candidates).not.toContain("https://cdn.example.com/old-logo.png");
  });

  it("falls back to logo.dev and then Google when no VC Sheet mark is known", () => {
    expect(
      firmMarkCandidateUrls({
        firm_name: "Northline Ventures",
        firm_domain: "northline.vc",
        firm_logo_url: null,
      }),
    ).toEqual([
      "https://img.logo.dev/northline.vc?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=northline.vc",
      "https://img.logo.dev/northlineventures.com?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=northlineventures.com",
      "https://img.logo.dev/northlineventures.vc?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=northlineventures.vc",
      "https://img.logo.dev/northlineventures.ventures?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=northlineventures.ventures",
      "https://img.logo.dev/northlineventures.capital?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=northlineventures.capital",
      "https://img.logo.dev/northline.com?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=northline.com",
      "https://img.logo.dev/northline.ventures?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=northline.ventures",
      "https://img.logo.dev/northline.capital?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=northline.capital",
    ]);
  });

  it("uses Eka's website logo and domain hint for Eka Ventures", () => {
    expect(
      firmMarkCandidateUrls({
        firm_name: "Eka Ventures",
        firm_domain: null,
        firm_logo_url: null,
      }),
    ).toEqual([
      "https://cdn.prod.website-files.com/68fb32edfd991098f5733b6b/690247c9911044cfc16d90e6_Eka_logo_white.svg",
      "https://img.logo.dev/ekavc.com?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=ekavc.com",
      "https://img.logo.dev/ekaventures.com?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=ekaventures.com",
      "https://img.logo.dev/ekaventures.vc?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=ekaventures.vc",
      "https://img.logo.dev/ekaventures.ventures?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=ekaventures.ventures",
      "https://img.logo.dev/ekaventures.capital?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=ekaventures.capital",
      "https://img.logo.dev/eka.com?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=eka.com",
      "https://img.logo.dev/eka.vc?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=eka.vc",
      "https://img.logo.dev/eka.ventures?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=eka.ventures",
      "https://img.logo.dev/eka.capital?size=64&format=png&fallback=404",
      "https://www.google.com/s2/favicons?sz=32&domain=eka.capital",
    ]);
  });
});
