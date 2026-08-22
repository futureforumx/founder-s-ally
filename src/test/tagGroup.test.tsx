import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TagGroup } from "@/components/ui/TagGroup";

describe("TagGroup", () => {
  it("renders a dash when items are empty or missing", () => {
    const { rerender } = render(<TagGroup items={[]} />);
    expect(screen.getByText("—")).toBeInTheDocument();

    rerender(<TagGroup items={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows one tag and expands extra pills on +N click", () => {
    render(<TagGroup items={["Pre-Seed", "Seed", "Series A"]} maxVisible={1} variant="stage" />);
    expect(screen.getByText("Pre-Seed")).toBeInTheDocument();
    expect(screen.queryByText("Seed")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /2 more/i }));
    expect(screen.getByText("Seed")).toBeInTheDocument();
    expect(screen.getByText("Series A")).toBeInTheDocument();
  });
});
