import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SectorMultiSelect } from "@/components/company-profile/SectorMultiSelect";

function Harness({ initial = [] as string[] }) {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <>
      <SectorMultiSelect value={value} onChange={setValue} inputId="sector-search" />
      <output data-testid="value">{value.join(" | ")}</output>
    </>
  );
}

const input = () => screen.getByRole("combobox");
const selection = () => screen.getByTestId("value").textContent;
const type = (text: string) => fireEvent.change(input(), { target: { value: text } });

describe("SectorMultiSelect", () => {
  it("offers suggested sectors and keeps the list closed before the user types", () => {
    render(<Harness />);

    expect(input()).toHaveAttribute("placeholder", "Search or enter a sector…");
    expect(input()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    expect(screen.getByText("Suggested")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fintech" })).toBeInTheDocument();
  });

  it("opens a dropdown of matches as the user types and selects with Enter", () => {
    render(<Harness />);

    type("fin");
    const list = screen.getByRole("listbox");
    expect(input()).toHaveAttribute("aria-expanded", "true");
    expect(within(list).getByRole("option", { name: /Fintech/ })).toBeInTheDocument();
    expect(within(list).queryByRole("option", { name: /Cybersecurity/ })).not.toBeInTheDocument();

    fireEvent.keyDown(input(), { key: "Enter" });
    expect(selection()).toBe("Fintech");
    expect(input()).toHaveValue("");
  });

  it("matches on search tags rather than the label alone", () => {
    render(<Harness />);

    type("llm");
    expect(screen.getByRole("option", { name: /AI, Data & Analytics/ })).toBeInTheDocument();
  });

  it("moves the active option with the arrow keys", () => {
    render(<Harness />);

    fireEvent.keyDown(input(), { key: "ArrowDown" });
    const options = screen.getAllByRole("option");
    expect(input()).toHaveAttribute("aria-activedescendant", options[0].id);

    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(input()).toHaveAttribute("aria-activedescendant", options[1].id);

    fireEvent.keyDown(input(), { key: "ArrowUp" });
    expect(input()).toHaveAttribute("aria-activedescendant", options[0].id);

    fireEvent.keyDown(input(), { key: "Enter" });
    expect(selection()).toBe("Fintech");
  });

  it("toggles a sector by clicking its row", () => {
    render(<Harness />);

    type("saas");
    fireEvent.click(screen.getByRole("option", { name: /Enterprise Software & SaaS/ }));
    expect(selection()).toBe("Enterprise Software & SaaS");

    fireEvent.keyDown(input(), { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("option", { name: /Enterprise Software & SaaS/ }));
    expect(selection()).toBe("");
  });

  it("adds a suggested sector when its chip is clicked", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Fintech" }));
    expect(selection()).toBe("Fintech");
    // Once selected it moves out of the suggestions and into the chip row.
    expect(screen.queryByRole("button", { name: "Fintech" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Fintech" })).toBeInTheDocument();
  });

  it("keeps multiple sectors as removable chips", () => {
    render(<Harness initial={["Fintech", "Cybersecurity & Privacy"]} />);

    expect(selection()).toBe("Fintech | Cybersecurity & Privacy");
    fireEvent.click(screen.getByRole("button", { name: "Remove Fintech" }));
    expect(selection()).toBe("Cybersecurity & Privacy");
    expect(screen.queryByRole("button", { name: "Remove Fintech" })).not.toBeInTheDocument();
  });

  it("removes the last chip on backspace when the query is empty", () => {
    render(<Harness initial={["Fintech", "Web3, Crypto & DeFi"]} />);

    fireEvent.keyDown(input(), { key: "Backspace" });
    expect(selection()).toBe("Fintech");
  });

  it("stops at three sectors and says how to add another", () => {
    render(<Harness initial={["Fintech", "Web3, Crypto & DeFi", "Cybersecurity & Privacy"]} />);

    expect(screen.queryByText("Suggested")).not.toBeInTheDocument();

    type("health");
    const option = screen.getByRole("option", { name: /HealthTech/ });
    expect(option).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText(/Limit 3 sectors/)).toBeInTheDocument();

    fireEvent.click(option);
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(selection()).toBe("Fintech | Web3, Crypto & DeFi | Cybersecurity & Privacy");
  });

  it("accepts a sector that is not in the taxonomy", () => {
    render(<Harness />);

    // "quantum" is a search tag on GovTech, so the taxonomy match still ranks first.
    type("Quantum Sensing");
    fireEvent.click(screen.getByRole("option", { name: /Add “Quantum Sensing”/ }));
    expect(selection()).toBe("Quantum Sensing");
  });

  it("offers only the typed sector when nothing in the taxonomy matches", () => {
    render(<Harness />);

    type("Artisanal Cheese");
    expect(screen.getAllByRole("option")).toHaveLength(1);

    fireEvent.keyDown(input(), { key: "Enter" });
    expect(selection()).toBe("Artisanal Cheese");
  });

  it("reports an empty result rather than a stray row", () => {
    render(<Harness initial={["Artisanal Cheese"]} />);

    type("Artisanal Cheese");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText(/No sector matches/)).toBeInTheDocument();
  });

  it("disables custom entry once the limit is reached", () => {
    render(<Harness initial={["Fintech", "Web3, Crypto & DeFi", "Cybersecurity & Privacy"]} />);

    type("Artisanal Cheese");
    expect(screen.getByRole("option", { name: /Add “Artisanal Cheese”/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("marks AI-prefilled chips without changing the selection", () => {
    render(
      <SectorMultiSelect
        value={["Fintech"]}
        onChange={() => {}}
        aiSuggested={["Fintech"]}
      />,
    );

    expect(screen.getByText(/Pre-selected based on your description/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Fintech" })).toBeInTheDocument();
  });
});
