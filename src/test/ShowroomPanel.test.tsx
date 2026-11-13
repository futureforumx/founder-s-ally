import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ShowroomPanel } from "@/components/data-room/ShowroomPanel";

const mocks = vi.hoisted(() => ({
  getSupabaseAccessToken: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  getSupabaseAccessToken: mocks.getSupabaseAccessToken,
}));

const links = [
  {
    id: "first-link", name: "Seed deck", recipient_name: "Alex Investor", recipient_firm: "First Fund",
    company_slug: "example-company", presentation_slug: "seed-alex", token: "legacy-token-first",
    expires_at: null, revoked_at: null, company_pitch_decks: { file_name: "seed.pdf" },
  },
  {
    id: "revoked-link", name: "Previous deck", recipient_name: "Sam Investor", recipient_firm: "Second Fund",
    company_slug: "example-company", presentation_slug: "previous-sam", token: null,
    expires_at: null, revoked_at: "2026-01-01T00:00:00Z", company_pitch_decks: { file_name: "previous.pdf" },
  },
  {
    id: "legacy-link", name: "Legacy deck", recipient_name: "Taylor Investor", recipient_firm: null,
    company_slug: null, presentation_slug: null, token: "legacy-token-taylor",
    expires_at: null, revoked_at: null, company_pitch_decks: { file_name: "legacy.pdf" },
  },
];

const linksResponse = (value = links) => ({ ok: true, json: async () => ({ links: value }) });

describe("Showroom link previews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSupabaseAccessToken.mockResolvedValue("owner-access-token");
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads the owner's links and switches between branded, revoked, and legacy previews", async () => {
    const fetchMock = vi.fn().mockResolvedValue(linksResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(<ShowroomPanel />);

    const select = await screen.findByRole("combobox", { name: "Preview sharing link" });
    await waitFor(() => expect(screen.getByTitle("External viewer preview")).toHaveAttribute("src", "/share/example-company/seed-alex?preview=1"));
    expect(fetchMock).toHaveBeenCalledWith("/api/deck-shares", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer owner-access-token" }),
    }));
    expect(screen.getByRole("option", { name: /Previous deck/ })).toBeInTheDocument();

    fireEvent.change(select, { target: { value: "revoked-link" } });
    expect(screen.getByTitle("External viewer preview")).toHaveAttribute("src", "/share/example-company/previous-sam?preview=1");

    fireEvent.change(select, { target: { value: "legacy-link" } });
    expect(screen.getByTitle("External viewer preview")).toHaveAttribute("src", "/share/legacy-token-taylor?preview=1");
  });

  it("directs the owner to create a sharing link when there is nothing to preview", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(linksResponse([])));
    const onCreateLink = vi.fn();
    render(<ShowroomPanel onCreateLink={onCreateLink} />);

    fireEvent.click(await screen.findByRole("button", { name: "Create a sharing link" }));
    expect(onCreateLink).toHaveBeenCalledOnce();
    expect(screen.queryByTitle("External viewer preview")).not.toBeInTheDocument();
  });

  it("shows each selected link's feature settings and returns to that link's viewer", async () => {
    const featureLinks = [
      {
        ...links[0], require_email: true, has_password: true, show_download: false,
        allowed_emails: ["alex@firstfund.com"], contact_email: "founder@example.com",
        company_stage_snapshot: "Seed",
      },
      {
        ...links[1], require_email: false, has_password: false, show_download: true,
        allowed_emails: [], contact_email: null, company_stage_snapshot: null,
      },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(linksResponse(featureLinks)));
    render(<ShowroomPanel />);

    const featuresTab = await screen.findByRole("tab", { name: "FEATURES" });
    fireEvent.mouseDown(featuresTab, { button: 0, ctrlKey: false });
    fireEvent.click(featuresTab);
    const featurePanel = screen.getByRole("tabpanel", { name: "FEATURES" });
    const featureRow = (label: string) => within(featurePanel).getByText(label, { exact: true }).closest("div")!;
    expect(within(featureRow("Password protection")).getByText("On", { exact: true })).toBeInTheDocument();
    expect(within(featureRow("Email requirement")).getByText("On", { exact: true })).toBeInTheDocument();
    expect(within(featureRow("Downloads")).getByText("Off", { exact: true })).toBeInTheDocument();
    expect(within(featureRow("Printing")).getByText("Off", { exact: true })).toBeInTheDocument();
    expect(featureRow("Email viewing list")).toHaveTextContent("alex@firstfund.com");
    expect(featureRow("Questions & feedback")).toHaveTextContent("Not connected");

    fireEvent.change(screen.getByRole("combobox", { name: "Preview sharing link" }), { target: { value: "revoked-link" } });
    expect(within(featureRow("Password protection")).getByText("Off", { exact: true })).toBeInTheDocument();
    expect(within(featureRow("Downloads")).getByText("On", { exact: true })).toBeInTheDocument();
    expect(featureRow("Link access")).toHaveTextContent("Revoked");

    const viewerTab = screen.getByRole("tab", { name: "WHAT VIEWERS SEE" });
    fireEvent.mouseDown(viewerTab, { button: 0, ctrlKey: false });
    fireEvent.click(viewerTab);
    expect(screen.getByTitle("External viewer preview")).toHaveAttribute("src", "/share/example-company/previous-sam?preview=1");
  });

  it("lets the owner retry a failed links request", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Sharing links are temporarily unavailable." }) })
      .mockResolvedValueOnce(linksResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(<ShowroomPanel />);

    const retry = await screen.findByRole("button", { name: "Try again" });
    expect(screen.getByText("Sharing links are temporarily unavailable.")).toBeInTheDocument();
    fireEvent.click(retry);

    await waitFor(() => expect(screen.getByTitle("External viewer preview")).toHaveAttribute("src", "/share/example-company/seed-alex?preview=1"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
