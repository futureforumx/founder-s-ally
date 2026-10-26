import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CompanyProfile } from "@/components/CompanyProfile";
import { EMPTY_FORM, type CompanyData } from "@/components/company-profile/types";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1", email: "founder@example.com" } }),
}));

const profile: CompanyData = {
  ...EMPTY_FORM,
  name: "Track3D",
  website: "https://track3d.ai",
  onePagerUrl: "https://example.com/one-pager.pdf",
};

describe("Company settings document fields", () => {
  beforeEach(() => {
    localStorage.setItem("company-profile", JSON.stringify(profile));
  });

  it("keeps company name and website and omits pitch deck and one-pager", async () => {
    render(
      <TooltipProvider>
        <CompanyProfile companyData={profile} />
      </TooltipProvider>,
    );

    expect(await screen.findByText("Company Name *")).toBeInTheDocument();
    expect(screen.getByText("Website URL")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Track3D")).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://track3d.ai")).toBeInTheDocument();

    expect(screen.queryByText("Pitch Deck (PDF)")).not.toBeInTheDocument();
    expect(screen.queryByText("One-pager (link)")).not.toBeInTheDocument();
    expect(document.querySelector('[data-field="pitch-deck"]')).toBeNull();
    expect(document.querySelector('[data-field="one-pager-url"]')).toBeNull();
  });
});
