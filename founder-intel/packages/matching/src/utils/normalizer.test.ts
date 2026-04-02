import {
  normalizeDomain,
  normalizeLinkedinSlug,
  normalizeName,
  levenshtein,
  similarity,
  tokenSimilarity,
  combinedSimilarity,
} from "./normalizer";

describe("normalizeDomain", () => {
  it("strips https://www.", () =>
    expect(normalizeDomain("https://www.stripe.com/")).toBe("stripe.com"));
  it("strips http://", () =>
    expect(normalizeDomain("http://stripe.com")).toBe("stripe.com"));
  it("preserves bare domain", () =>
    expect(normalizeDomain("stripe.com")).toBe("stripe.com"));
  it("strips path", () =>
    expect(normalizeDomain("https://stripe.com/docs/api")).toBe("stripe.com"));
  it("lowercases", () =>
    expect(normalizeDomain("STRIPE.COM")).toBe("stripe.com"));
});

describe("normalizeLinkedinSlug", () => {
  it("extracts company slug", () =>
    expect(normalizeLinkedinSlug("https://www.linkedin.com/company/stripe")).toBe("stripe"));
  it("extracts person slug", () =>
    expect(normalizeLinkedinSlug("https://linkedin.com/in/john-doe")).toBe("john-doe"));
  it("handles trailing slash", () =>
    expect(normalizeLinkedinSlug("https://linkedin.com/company/stripe/")).toBe("stripe"));
  it("returns lowercased input when no match", () =>
    expect(normalizeLinkedinSlug("stripe")).toBe("stripe"));
});

describe("normalizeName", () => {
  it("strips Inc", () =>
    expect(normalizeName("Stripe Inc")).toBe("stripe"));
  it("strips LLC and punctuation", () =>
    expect(normalizeName("Acme, LLC.")).toBe("acme"));
  it("lowercases", () =>
    expect(normalizeName("STRIPE")).toBe("stripe"));
  it("handles multi-word names", () =>
    expect(normalizeName("Y Combinator")).toBe("y combinator"));
});

describe("levenshtein", () => {
  it("identical strings → 0", () => expect(levenshtein("abc", "abc")).toBe(0));
  it("empty string", () => expect(levenshtein("", "abc")).toBe(3));
  it("single substitution", () => expect(levenshtein("abc", "abd")).toBe(1));
  it("insertion", () => expect(levenshtein("ac", "abc")).toBe(1));
});

describe("similarity", () => {
  it("identical → 1.0", () => expect(similarity("stripe", "stripe")).toBe(1));
  it("empty strings → 0", () => expect(similarity("", "abc")).toBe(0));
  it("stripe vs stripe inc → >0.7", () =>
    expect(similarity("stripe", "stripe inc")).toBeGreaterThan(0.7));
});

describe("tokenSimilarity", () => {
  it("identical → 1.0", () => expect(tokenSimilarity("hello world", "hello world")).toBe(1));
  it("no overlap → 0", () => expect(tokenSimilarity("foo", "bar")).toBe(0));
  it("partial overlap", () =>
    expect(tokenSimilarity("y combinator", "y combinator demo")).toBeGreaterThan(0.5));
});

describe("combinedSimilarity", () => {
  it("is max of char and token", () => {
    const a = "y combinator";
    const b = "y combinator demo";
    const combined = combinedSimilarity(a, b);
    expect(combined).toBeGreaterThanOrEqual(similarity(a, b));
    expect(combined).toBeGreaterThanOrEqual(tokenSimilarity(a, b));
  });
});
