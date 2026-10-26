import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DirectoryFirmTypeFilter } from "@/components/dashboard/DirectoryFirmTypeFilter";

describe("DirectoryFirmTypeFilter", () => {
  it("renders the empty, single, and multi-select trigger labels", () => {
    const { rerender } = render(<DirectoryFirmTypeFilter selected={[]} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /filter by firm type/i })).toHaveTextContent("Firm type");

    rerender(<DirectoryFirmTypeFilter selected={["vc"]} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /venture capital/i })).toHaveTextContent("Venture Capital");

    rerender(<DirectoryFirmTypeFilter selected={["vc", "cvc"]} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /firm type · 2/i })).toHaveTextContent("Firm type · 2");
  });

  it("exposes a menu trigger for keyboard and screen-reader users", () => {
    render(<DirectoryFirmTypeFilter selected={["family_office"]} onChange={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: /family office/i });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("type", "button");
  });
});
