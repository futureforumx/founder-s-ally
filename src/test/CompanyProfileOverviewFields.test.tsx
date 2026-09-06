import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CompanyProfile } from "@/components/CompanyProfile";

describe("Company Overview fields", () => {
  it("keeps the company name, website and sector inputs", () => {
    const { container } = render(<CompanyProfile />);

    expect(container.querySelector('[data-field="company-name"]')).not.toBeNull();
    expect(container.querySelector('[data-field="website-url"]')).not.toBeNull();
    expect(container.querySelector('[data-field="sector-tags"]')).not.toBeNull();
  });

  it("drops the pitch deck and one-pager fields", () => {
    const { container } = render(<CompanyProfile />);

    expect(container.querySelector('[data-field="pitch-deck"]')).toBeNull();
    expect(container.querySelector('[data-field="one-pager-url"]')).toBeNull();
    expect(container.querySelector('input[type="file"][accept*=".pdf"]')).toBeNull();
    expect(screen.queryByText(/pitch deck/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/one-pager/i)).not.toBeInTheDocument();
  });
});
