import { useState } from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle, Lightbulb, MessageSquareWarning, ChevronLeft, ChevronRight } from "lucide-react";

interface SlideData {
  number: number;
  title: string;
  dropoffRisk: number;
  edits: string[];
  missing: string[];
  objections: string[];
}

const MOCK_SLIDES: SlideData[] = [
  {
    number: 1, title: "Title Slide",
    dropoffRisk: 5,
    edits: ["Add a one-line tagline under the company name."],
    missing: ["Include founding year or team size for context."],
    objections: [],
  },
  {
    number: 2, title: "Problem",
    dropoffRisk: 8,
    edits: ["Lead with a real customer quote or data point instead of a generic statement."],
    missing: ["Quantify the cost of the problem — dollar value or time wasted."],
    objections: ["Is this a vitamin or a painkiller? Make the pain visceral."],
  },
  {
    number: 3, title: "Solution",
    dropoffRisk: 12,
    edits: ["Replace the paragraph with 3 crisp bullet points.", "Add a product screenshot or diagram."],
    missing: ["Show a before/after workflow to illustrate the value delta."],
    objections: ["Why can't an incumbent add this as a feature?"],
  },
  {
    number: 4, title: "Market Size",
    dropoffRisk: 35,
    edits: ["Restructure TAM → SAM → SOM as a visual funnel, not a text list."],
    missing: ["Add a bottom-up TAM calculation alongside the top-down estimate.", "Include data sources for every number."],
    objections: ["Market sizing feels aspirational — where's the bottoms-up math?", "I still don't see why now."],
  },
  {
    number: 5, title: "Business Model",
    dropoffRisk: 18,
    edits: ["Simplify pricing tiers to a 2×2 grid."],
    missing: ["Show unit economics: LTV, CAC, payback period."],
    objections: ["What's the path to $10M ARR at this price point?"],
  },
  {
    number: 6, title: "Traction",
    dropoffRisk: 10,
    edits: ["Replace the table with a line chart showing MoM growth."],
    missing: [],
    objections: ["Revenue is early — what leading indicators validate the trend?"],
  },
  {
    number: 7, title: "Team",
    dropoffRisk: 7,
    edits: ["Add LinkedIn headshots and one-line bios."],
    missing: ["Mention key advisors or pending hires."],
    objections: [],
  },
  {
    number: 8, title: "The Ask",
    dropoffRisk: 22,
    edits: ["Break down use of funds into 3-4 clear buckets with percentages."],
    missing: ["State the exact raise amount and instrument (SAFE / priced round).", "Include target milestones for the next 12-18 months."],
    objections: ["How long does this runway give you?"],
  },
];

export function SlideCoachingView() {
  const [activeSlide, setActiveSlide] = useState(0);
  const slide = MOCK_SLIDES[activeSlide];

  const getRiskColor = (risk: number) =>
    risk >= 30 ? "text-destructive bg-destructive/10" :
    risk >= 15 ? "text-warning bg-warning/10" :
    "text-success bg-success/10";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Slide Carousel */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Slide Preview</h3>
        <div className="relative rounded-xl border border-border bg-card overflow-hidden">
          {/* Slide mock */}
          <div className="aspect-[16/9] bg-muted/30 flex items-center justify-center relative">
            <div className="text-center">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Slide {slide.number}</span>
              <p className="text-lg font-bold text-foreground mt-1">{slide.title}</p>
            </div>
            {/* Drop-off risk badge */}
            <div className={cn("absolute top-3 right-3 rounded-full px-2.5 py-1 text-[10px] font-bold tabular-nums", getRiskColor(slide.dropoffRisk))}>
              {slide.dropoffRisk}% drop-off
            </div>
          </div>
          {/* Nav */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border">
            <button
              onClick={() => setActiveSlide(Math.max(0, activeSlide - 1))}
              disabled={activeSlide === 0}
              className="rounded-md p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex gap-1">
              {MOCK_SLIDES.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setActiveSlide(i)}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === activeSlide ? "w-5 bg-accent" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                  )}
                />
              ))}
            </div>
            <button
              onClick={() => setActiveSlide(Math.min(MOCK_SLIDES.length - 1, activeSlide + 1))}
              disabled={activeSlide === MOCK_SLIDES.length - 1}
              className="rounded-md p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Slide thumbnails */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {MOCK_SLIDES.map((s, i) => (
            <button
              key={i}
              onClick={() => setActiveSlide(i)}
              className={cn(
                "shrink-0 w-16 aspect-[16/9] rounded-md border text-[9px] font-medium flex items-center justify-center transition-all",
                i === activeSlide
                  ? "border-accent bg-accent/5 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-accent/40"
              )}
            >
              {s.number}
            </button>
          ))}
        </div>
      </div>

      {/* Right: Insights */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">
          Insights — <span className="text-accent">Slide {slide.number}: {slide.title}</span>
        </h3>

        {/* Concrete Edits */}
        {slide.edits.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-2.5">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-3.5 w-3.5 text-accent" />
              <span className="text-xs font-semibold text-foreground">Concrete Edits</span>
            </div>
            <ul className="space-y-2">
              {slide.edits.map((e, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                  {e}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Missing Elements */}
        {slide.missing.length > 0 && (
          <div className="rounded-xl border border-warning/20 bg-warning/5 p-4 space-y-2.5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              <span className="text-xs font-semibold text-foreground">Missing Elements</span>
            </div>
            <ul className="space-y-2">
              {slide.missing.map((m, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-warning" />
                  {m}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Investor Objections */}
        {slide.objections.length > 0 && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 space-y-2.5">
            <div className="flex items-center gap-2">
              <MessageSquareWarning className="h-3.5 w-3.5 text-destructive" />
              <span className="text-xs font-semibold text-foreground">Likely Investor Objections</span>
            </div>
            <ul className="space-y-2">
              {slide.objections.map((o, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground italic">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-destructive" />
                  "{o}"
                </li>
              ))}
            </ul>
          </div>
        )}

        {slide.edits.length === 0 && slide.missing.length === 0 && slide.objections.length === 0 && (
          <div className="rounded-xl border border-success/20 bg-success/5 p-6 text-center">
            <p className="text-xs font-semibold text-success">This slide looks solid — no major issues detected.</p>
          </div>
        )}
      </div>
    </div>
  );
}
