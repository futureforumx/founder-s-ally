import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { parseReviewSummary } from "@/lib/adminEnrichmentReview";

const invoke = vi.fn();
vi.mock("@/lib/invokeEdgeFunction", () => ({ invokeEdgeFunction: (...a: unknown[]) => invoke(...a) }));

import { AdminRecordEnrichment } from "@/components/admin/AdminRecordEnrichment";

const PAYLOAD = {
  recent_days: 7,
  generated_at: "2026-10-26T22:29:15Z",
  needs_review: { records: 12, fields: 40, identity_reviews: 2, by_entity: [{ entity_type: "firm", records: 9 }, { entity_type: "investor", records: 3 }] },
  backlog: { records: 70, fields: 305, identity_reviews: 12, older_records: 58, oldest_at: "2026-10-01T00:00:00Z", by_entity: [{ entity_type: "firm", records: 61 }, { entity_type: "investor", records: 9 }] },
};

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AdminRecordEnrichment />
    </QueryClientProvider>,
  );
}

describe("parseReviewSummary", () => {
  it("maps the SQL payload and tolerates missing parts", () => {
    const s = parseReviewSummary(PAYLOAD);
    expect(s.needsReview.records).toBe(12);
    expect(s.backlog.records).toBe(70);
    expect(s.backlog.olderRecords).toBe(58);
    expect(s.backlog.byEntity[0]).toEqual({ entityType: "firm", records: 61 });
    const empty = parseReviewSummary(null);
    expect(empty.needsReview.records).toBe(0);
    expect(empty.backlog.byEntity).toEqual([]);
    expect(empty.recentDays).toBe(7);
  });
});

describe("AdminRecordEnrichment", () => {
  beforeEach(() => invoke.mockReset());

  it("renders Needs Review and Backlog cards with counts and entity breakdown", async () => {
    invoke.mockResolvedValue({ data: { review: PAYLOAD }, error: null });
    renderSection();
    expect(screen.getByText("Record Enrichment")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("enrichment-card-needs-review")).toHaveTextContent("12"));
    const needs = screen.getByTestId("enrichment-card-needs-review");
    expect(needs).toHaveTextContent("Needs Review");
    expect(needs).toHaveTextContent("Firms");
    expect(needs).toHaveTextContent("40 proposed values");
    const backlog = screen.getByTestId("enrichment-card-backlog");
    expect(backlog).toHaveTextContent("Backlog");
    expect(backlog).toHaveTextContent("70");
    expect(backlog).toHaveTextContent("58 older than 7 days");
    expect(invoke).toHaveBeenCalledWith("admin-enrichment-report", expect.objectContaining({ body: { view: "review", recent_days: 7 } }));
  });

  it("shows an error instead of zeros when the function fails", async () => {
    invoke.mockResolvedValue({ data: { error: "Caller is not an admin" }, error: null });
    renderSection();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Caller is not an admin"));
    expect(screen.queryByTestId("enrichment-card-backlog")).toBeNull();
  });
});
