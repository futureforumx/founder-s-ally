import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SectorChipGrid } from "@/components/company-profile/SectorChipGrid";

function renderGrid(primary: string | null = null, secondary: string[] = []) {
  return render(
    <SectorChipGrid
      value={{ primary_sector: primary, secondary_sectors: secondary }}
      onChange={vi.fn()}
      businessModel={[]}
      onBusinessModelChange={vi.fn()}
      targetCustomer={[]}
      onTargetCustomerChange={vi.fn()}
    />,
  );
}

describe("SectorChipGrid", () => {
  it("replaces the always-visible sector matrix with a search field", () => {
    renderGrid();

    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.queryByText("Web3, Crypto & DeFi")).not.toBeInTheDocument();
    expect(screen.queryByText("PropTech & Construction Tech")).not.toBeInTheDocument();
  });

  it("keeps the sector alignment section below the search field", () => {
    renderGrid("Fintech", ["Cybersecurity & Privacy"]);

    expect(screen.getByText("Sector alignment")).toBeInTheDocument();
    expect(screen.getByText("2/3 selected")).toBeInTheDocument();
    expect(screen.getByText("Primary")).toBeInTheDocument();
    expect(screen.getAllByText("Secondary")).toHaveLength(2);
  });

  it("drops the rank badges from selected sectors", () => {
    renderGrid("Fintech", ["Cybersecurity & Privacy"]);

    expect(screen.queryByText("P", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("S", { exact: true })).not.toBeInTheDocument();
  });

  it("still renders the business model and target customer rows", () => {
    renderGrid();

    expect(screen.getByText("Business Model")).toBeInTheDocument();
    expect(screen.getByText("Target Customer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "B2B SaaS" })).toBeInTheDocument();
  });
});
