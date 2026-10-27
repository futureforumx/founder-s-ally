import { describe, expect, it } from "vitest";
import {
  buildDeckAnalyticsDashboard,
  deckVersionLabel,
  deckVersionNumber,
  formatCompletionRate,
  formatDuration,
  formatRelativeTime,
  shareLinkUrl,
  slidesProgressLabel,
} from "@/components/data-room/deckAnalyticsModel";

const NOW = Date.parse("2026-10-26T19:00:00.000Z");

function payload(overrides: Record<string, unknown> = {}) {
  return {
    deck: { id: "deck-1", fileName: "Pitch Deck.pdf", uploadedAt: "2026-10-01T00:00:00.000Z", slideCount: 4 },
    totals: {
      totalVisits: 10,
      uniqueViewers: 6,
      viewingSecondsEstimate: 2040,
      completionRate: 25,
      lastActivityAt: "2026-10-26T18:46:00.000Z",
    },
    links: [],
    lastSyncedAt: "2026-10-26T19:00:00.000Z",
    ...overrides,
  };
}

describe("deck analytics formatting", () => {
  it("formats durations and leaves missing time blank", () => {
    expect(formatDuration(204)).toBe("3m 24s");
    expect(formatDuration(48)).toBe("48s");
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(null)).toBe("—");
  });

  it("shows 0% for a real zero and a dash when completion is unknown", () => {
    expect(formatCompletionRate(0)).toBe("0%");
    expect(formatCompletionRate(null)).toBe("—");
    expect(formatCompletionRate(12.5)).toBe("12.5%");
  });

  it("formats recent activity relative to now", () => {
    expect(formatRelativeTime("2026-10-26T18:46:00.000Z", NOW)).toBe("14 mins ago");
    expect(formatRelativeTime(null, NOW)).toBe("—");
  });

  it("labels the active upload with a chronological version", () => {
    const decks = [
      { id: "new", uploadedAt: "2026-10-20T00:00:00.000Z" },
      { id: "old", uploadedAt: "2026-10-01T00:00:00.000Z" },
    ];
    expect(deckVersionNumber(decks, "old")).toBe(1);
    expect(deckVersionNumber(decks, "new")).toBe(2);
    expect(deckVersionLabel("Pitch Deck.pdf", 2, true)).toBe("Pitch Deck v2 (Active)");
    expect(deckVersionLabel("Pitch Deck v3.pdf", 9, false)).toBe("Pitch Deck v3");
  });

  it("builds a branded share url and falls back to a legacy token", () => {
    expect(shareLinkUrl("https://app.vekta.test/", "acme", "bessemer", null)).toBe("https://app.vekta.test/share/acme/bessemer");
    expect(shareLinkUrl("https://app.vekta.test", null, null, "token")).toBe("https://app.vekta.test/share/token");
    expect(slidesProgressLabel(12, 14)).toBe("12 / 14 slides");
  });
});

describe("buildDeckAnalyticsDashboard", () => {
  it("averages dwell, marks the two longest slides, and flags drop-off above 40%", () => {
    const dashboard = buildDeckAnalyticsDashboard(payload({
      links: [{
        id: "link-1",
        name: "Shared deck",
        totalVisits: 10,
        uniqueViewers: 10,
        viewingSecondsEstimate: 720,
        completionRate: 20,
        lastActivityAt: "2026-10-26T18:46:00.000Z",
        slideEngagement: [
          { slideNumber: 1, viewers: 10, activeSecondsEstimate: 100, category: "Cover" },
          { slideNumber: 2, viewers: 8, activeSecondsEstimate: 400, category: "Problem" },
          { slideNumber: 3, viewers: 2, activeSecondsEstimate: 200, title: "Traction" },
          { slideNumber: 4, viewers: 2, activeSecondsEstimate: 20 },
        ],
      }],
    }), {}, NOW);

    expect(dashboard.summary.averageViewingSeconds).toBe(204);
    expect(dashboard.slides.map((slide) => slide.isHotspot)).toEqual([false, true, true, false]);
    expect(dashboard.slides[2].title).toBe("Traction");
    expect(dashboard.slides[1].isHighDropOff).toBe(true);
    expect(dashboard.slides[1].dropOffRate).toBe(75);
    expect(dashboard.slides[3].dropOffRate).toBeNull();
    expect(dashboard.slides[0].averageSeconds).toBe(10);
  });

  it("classifies link signals and names firm, person, and general links", () => {
    const dashboard = buildDeckAnalyticsDashboard(payload({
      slideCount: undefined,
      deck: { id: "deck-1", fileName: "Pitch Deck.pdf", uploadedAt: "2026-10-01T00:00:00.000Z", slideCount: 14 },
      links: [
        {
          id: "forwarded",
          intendedInvestorFirm: "Bessemer",
          totalVisits: 4,
          uniqueViewers: 3,
          viewingSecondsEstimate: 400,
          completionRate: 40,
          lastActivityAt: "2026-10-26T18:00:00.000Z",
          slideEngagement: [{ slideNumber: 8, viewers: 3, activeSecondsEstimate: 400 }],
        },
        {
          id: "conviction",
          intendedInvestorName: "Benchmark",
          totalVisits: 1,
          uniqueViewers: 1,
          viewingSecondsEstimate: 300,
          completionRate: 100,
          lastActivityAt: "2026-10-26T18:30:00.000Z",
          slideEngagement: [{ slideNumber: 14, viewers: 1, activeSecondsEstimate: 300 }],
        },
        {
          id: "bounce",
          name: "Shared deck",
          totalVisits: 2,
          uniqueViewers: 2,
          viewingSecondsEstimate: 20,
          completionRate: 0,
          lastActivityAt: "2026-10-26T12:00:00.000Z",
          slideEngagement: [{ slideNumber: 1, viewers: 2, activeSecondsEstimate: 20 }],
        },
        {
          id: "quiet",
          name: "Shared deck",
          totalVisits: 0,
          uniqueViewers: 0,
          viewingSecondsEstimate: 0,
          completionRate: 0,
          slideEngagement: [],
        },
      ],
    }), {
      forwarded: "https://app.vekta.test/share/acme/bessemer",
    }, NOW);

    const byId = Object.fromEntries(dashboard.links.map((link) => [link.id, link]));
    expect(byId.forwarded.signal).toBe("likely_forwarded");
    expect(byId.forwarded.recipientLabel).toBe("Bessemer");
    expect(byId.forwarded.url).toBe("https://app.vekta.test/share/acme/bessemer");
    expect(byId.conviction.signal).toBe("high_conviction");
    expect(byId.conviction.recipientLabel).toBe("Benchmark");
    expect(byId.conviction.slidesViewed).toBe(14);
    expect(slidesProgressLabel(byId.conviction.slidesViewed, byId.conviction.slideCount)).toBe("14 / 14 slides");
    expect(byId.bounce.signal).toBe("quick_dropoff");
    expect(byId.bounce.recipientLabel).toBe("General Link");
    expect(buildDeckAnalyticsDashboard(payload({
      links: [{ id: "generated", name: "Pitch Deck Rough (Do Not Share) · Pitch deck", totalVisits: 0 }],
    }), {}, NOW).links[0].recipientLabel).toBe("General Link");
    expect(byId.quiet.signal).toBeNull();
    expect(dashboard.links.map((link) => link.id)[0]).toBe("conviction");
  });

  it("prefers a short session over a forwarded-link badge and keeps a finished short deck from looking like an early exit", () => {
    const dashboard = buildDeckAnalyticsDashboard(payload({
      deck: { id: "deck-1", fileName: "Teaser.pdf", uploadedAt: "2026-10-01T00:00:00.000Z", slideCount: 2 },
      links: [
        {
          id: "skim",
          intendedInvestorFirm: "Bessemer",
          totalVisits: 1,
          uniqueViewers: 4,
          viewingSecondsEstimate: 12,
          completionRate: 100,
          slideEngagement: [{ slideNumber: 2, viewers: 1, activeSecondsEstimate: 12 }],
        },
        {
          id: "teaser",
          name: "Partner",
          totalVisits: 1,
          uniqueViewers: 1,
          viewingSecondsEstimate: 120,
          completionRate: 50,
          slideEngagement: [{ slideNumber: 2, viewers: 1, activeSecondsEstimate: 120 }],
        },
      ],
    }), {}, NOW);

    expect(dashboard.links.find((link) => link.id === "skim")?.signal).toBe("quick_dropoff");
    expect(dashboard.links.find((link) => link.id === "teaser")?.signal).toBeNull();
  });

  it("counts slide questions and survives a deck with no page count or events", () => {
    const dashboard = buildDeckAnalyticsDashboard(payload({
      deck: { id: "deck-1", fileName: "Pitch Deck.pdf", uploadedAt: "2026-10-01T00:00:00.000Z", slideCount: null },
      totals: { totalVisits: 0, uniqueViewers: 0, viewingSecondsEstimate: 0, completionRate: null, lastActivityAt: null },
      links: [{ id: "link-1", name: "Bessemer", totalVisits: 0, slideEngagement: null }],
      questions: [{
        id: "q-1",
        slideNumber: 8,
        question: "What is gross margin?",
        linkId: "link-1",
        viewerEmail: "lp@bessemer.com",
        createdAt: "2026-10-26T18:40:00.000Z",
      }],
    }), {}, NOW);

    expect(dashboard.summary.completionRate).toBeNull();
    expect(dashboard.summary.averageViewingSeconds).toBeNull();
    expect(dashboard.summary.inboundQuestions).toBe(1);
    expect(dashboard.slides).toEqual([]);
    expect(dashboard.links[0].questions).toBe(1);
    expect(dashboard.questions[0]).toMatchObject({
      slideNumber: 8,
      body: "What is gross margin?",
      recipientLabel: "Bessemer",
      viewerEmail: "lp@bessemer.com",
    });
  });

  it("rejects a payload that is not an analytics response", () => {
    expect(() => buildDeckAnalyticsDashboard({ error: "nope" })).toThrow("Deck analytics are unavailable.");
  });
});
