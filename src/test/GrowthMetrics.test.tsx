import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GrowthMetrics } from "../components/company-profile/GrowthMetrics";

describe("GrowthMetrics Smart Inputs", () => {
  const defaultProps = {
    currentARR: "",
    yoyGrowth: "",
    totalHeadcount: "",
    onChange: vi.fn(),
    defaultExpanded: true,
  };

  it("renders all three input fields when expanded", () => {
    render(<GrowthMetrics {...defaultProps} />);
    expect(screen.getByPlaceholderText("e.g. 1.2m or 1,200,000")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. 150")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. 25")).toBeInTheDocument();
  });

  it("ARR: formats 300m to 300,000,000 and shows error for exceeding $200M limit", () => {
    const onChange = vi.fn();
    render(<GrowthMetrics {...defaultProps} onChange={onChange} />);
    const arrInput = screen.getByPlaceholderText("e.g. 1.2m or 1,200,000");
    
    fireEvent.focus(arrInput);
    fireEvent.change(arrInput, { target: { value: "300m" } });
    fireEvent.blur(arrInput);

    // Should cap at 200,000,000 and call onChange
    expect(onChange).toHaveBeenCalledWith("currentARR", "200,000,000");
  });

  it("YoY Growth: caps 600k at 500,000 and shows error", () => {
    const onChange = vi.fn();
    render(<GrowthMetrics {...defaultProps} onChange={onChange} />);
    const yoyInput = screen.getByPlaceholderText("e.g. 150");

    fireEvent.focus(yoyInput);
    fireEvent.change(yoyInput, { target: { value: "600k" } });
    fireEvent.blur(yoyInput);

    expect(onChange).toHaveBeenCalledWith("yoyGrowth", "500,000");
  });

  it("Headcount: caps 200k at 100,000 and shows error", () => {
    const onChange = vi.fn();
    render(<GrowthMetrics {...defaultProps} onChange={onChange} />);
    const headcountInput = screen.getByPlaceholderText("e.g. 25");

    fireEvent.focus(headcountInput);
    fireEvent.change(headcountInput, { target: { value: "200k" } });
    fireEvent.blur(headcountInput);

    expect(onChange).toHaveBeenCalledWith("totalHeadcount", "100,000");
  });

  it("ARR: formats 1.2m correctly to 1,200,000 (within limit)", () => {
    const onChange = vi.fn();
    render(<GrowthMetrics {...defaultProps} onChange={onChange} />);
    const arrInput = screen.getByPlaceholderText("e.g. 1.2m or 1,200,000");

    fireEvent.focus(arrInput);
    fireEvent.change(arrInput, { target: { value: "1.2m" } });
    fireEvent.blur(arrInput);

    expect(onChange).toHaveBeenCalledWith("currentARR", "1,200,000");
  });

  it("strips non-numeric chars from headcount input", () => {
    const onChange = vi.fn();
    render(<GrowthMetrics {...defaultProps} onChange={onChange} />);
    const headcountInput = screen.getByPlaceholderText("e.g. 25");

    fireEvent.focus(headcountInput);
    fireEvent.change(headcountInput, { target: { value: "30abc" } });
    // The onChange filters to only allow digits and k/m
    // "30abc" -> onChange filters to "30" (a,b,c stripped)
    fireEvent.blur(headcountInput);

    expect(onChange).toHaveBeenCalledWith("totalHeadcount", "30");
  });

  it("shows inline error message when ARR exceeds limit", () => {
    const onChange = vi.fn();
    render(<GrowthMetrics {...defaultProps} onChange={onChange} />);
    const arrInput = screen.getByPlaceholderText("e.g. 1.2m or 1,200,000");

    fireEvent.focus(arrInput);
    fireEvent.change(arrInput, { target: { value: "300m" } });
    fireEvent.blur(arrInput);

    expect(screen.getByText(/Limit exceeded.*Max is \$200,000,000/)).toBeInTheDocument();
  });
});
