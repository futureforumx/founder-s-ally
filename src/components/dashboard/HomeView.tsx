import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import {
  ArrowUp,
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Users,
  UserPlus,
  Activity,
  Swords,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { AnimatedPlaceholderInput } from "@/components/AnimatedPlaceholderInput";
import { cn } from "@/lib/utils";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";

interface HomeViewProps {
  onViewChange: (view: string) => void;
  companyName?: string | null;
}

type UpdateTrend = "up" | "down" | "neutral";

interface UpdateTile {
  icon: LucideIcon;
  label: string;
  metric: string;
  delta: string;
  trend: UpdateTrend;
  description: string;
  view: string;
}

const UPDATE_TILES: UpdateTile[] = [
  {
    icon: Users,
    label: "New investor matches",
    metric: "12",
    delta: "+12 this week",
    trend: "up",
    description: "Fresh VCs aligned to your stage, sector, and traction.",
    view: "investors",
  },
  {
    icon: UserPlus,
    label: "Connection recommendations",
    metric: "8",
    delta: "+8 warm paths",
    trend: "up",
    description: "New intro routes surfaced across your network.",
    view: "connections",
  },
  {
    icon: Activity,
    label: "Company health score",
    metric: "82",
    delta: "+4 pts",
    trend: "up",
    description: "Up from last week's snapshot in Mission Control.",
    view: "dashboard",
  },
  {
    icon: TrendingUp,
    label: "Market moves",
    metric: "23",
    delta: "+23 rounds",
    trend: "up",
    description: "New funding activity detected in your sector.",
    view: "market-intelligence",
  },
  {
    icon: Swords,
    label: "Competitor updates",
    metric: "3",
    delta: "3 shifts",
    trend: "neutral",
    description: "Positioning and funding changes among rivals.",
    view: "competitors",
  },
];

/** Pixels per animation frame for suggestion strip auto-scroll (lower = slower). */
const HORIZONTAL_MARQUEE_PX_PER_FRAME = 0.14;

/** Typewriter overlay + chip suggestions */
const HERO_PROMPT_SUGGESTIONS = [
  "What's the average check size for my stage?",
  "Show me recent funding rounds in my sector",
  "Which investors are active in AI right now?",
  "Find founders similar to me",
  "Who should I reach out to this week?",
] as const;

export function HomeView({ onViewChange, companyName }: HomeViewProps) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const suggestionsScrollRef = useRef<HTMLDivElement>(null);
  const [suggestionsOverflow, setSuggestionsOverflow] = useState(false);
  const [pauseSuggestionAuto, setPauseSuggestionAuto] = useState(false);
  const suggestionResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionDragRef = useRef<{
    pointerId: number | null;
    startX: number;
    startScroll: number;
    dragging: boolean;
  }>({ pointerId: null, startX: 0, startScroll: 0, dragging: false });
  const suppressSuggestionChipClickRef = useRef(false);
  /** Fractional scroll remainder — browsers round scrollLeft to px; tiny per-frame deltas must accumulate. */
  const suggestionMarqueeAccRef = useRef(0);

  const { profile } = useProfile();
  const { user } = useAuth();

  // Extract first name: profile full_name → user metadata → email prefix
  const rawName =
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split("@")[0] ||
    "";
  const firstName = rawName.trim().split(/\s+/)[0] || "";

  const greeting = firstName ? `Welcome back, ${firstName}.` : "Welcome back.";
  const sub = companyName
    ? `What can we help ${companyName} accomplish today?`
    : "Your investor intelligence command centre";

  function handleSubmit() {
    const trimmed = query.trim();
    if (!trimmed) return;
    // For now navigate to the investor Network view; VEX will intercept later
    onViewChange("investors");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  /** Duplicate-strip marquee: scrollWidth is 2× one cycle; reset forward-only when crossing the midpoint. */
  function normalizeHorizontalLoop(el: HTMLDivElement) {
    const loopW = el.scrollWidth / 2;
    if (loopW <= 1) return;
    while (el.scrollLeft >= loopW - 0.5) {
      el.scrollLeft -= loopW;
    }
  }

  function advanceMarqueePx(el: HTMLDivElement, accRef: React.MutableRefObject<number>) {
    accRef.current += HORIZONTAL_MARQUEE_PX_PER_FRAME;
    const whole = Math.trunc(accRef.current);
    if (whole !== 0) {
      accRef.current -= whole;
      el.scrollLeft += whole;
    }
  }

  useEffect(() => {
    const el = suggestionsScrollRef.current;
    if (!el) return;
    const measure = () => setSuggestionsOverflow(el.scrollWidth > el.clientWidth + 2);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!suggestionsOverflow || pauseSuggestionAuto) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const el = suggestionsScrollRef.current;
    if (!el) return;

    suggestionMarqueeAccRef.current = 0;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 1) return;
      advanceMarqueePx(el, suggestionMarqueeAccRef);
      normalizeHorizontalLoop(el);
      requestAnimationFrame(tick);
    };

    const id = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [suggestionsOverflow, pauseSuggestionAuto]);

  function pauseSuggestionsAutoBriefly() {
    setPauseSuggestionAuto(true);
    if (suggestionResumeTimerRef.current) clearTimeout(suggestionResumeTimerRef.current);
    suggestionResumeTimerRef.current = setTimeout(() => setPauseSuggestionAuto(false), 3200);
  }

  function scrollSuggestions(delta: number) {
    suggestionsScrollRef.current?.scrollBy({ left: delta, behavior: "smooth" });
    pauseSuggestionsAutoBriefly();
  }

  useEffect(() => {
    return () => {
      if (suggestionResumeTimerRef.current) clearTimeout(suggestionResumeTimerRef.current);
    };
  }, []);

  return (
    <section className="relative isolate min-h-[calc(100vh-5rem)] overflow-hidden rounded-2xl border border-border bg-background px-4 py-10 text-foreground sm:px-6 sm:py-14 lg:px-10">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,hsl(var(--muted))_0%,transparent_58%)] opacity-90 dark:opacity-70"
      />
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

      <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center">
        <div className="mb-6 flex items-center gap-2 rounded-md bg-muted/80 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.35px] text-muted-foreground outline-none">
          <span
            className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-success animate-command-desk-status-dot"
            aria-hidden
          />
          VEKTA COMMAND DESK
        </div>

        <div className="relative mb-8 flex items-center justify-center">
          <div
            className="absolute h-28 w-28 rounded-full animate-home-vyta-mark-aura-pulse bg-[radial-gradient(circle,hsl(var(--primary)/0.16)_0%,hsl(var(--muted)/0.55)_52%,transparent_82%)] blur-[20px] dark:bg-[radial-gradient(circle,rgba(148,163,184,0.28)_0%,rgba(100,116,139,0.12)_52%,transparent_82%)]"
            aria-hidden
          />
          <div className="relative z-10">
            <ThinkingOrb state="working" size={64} speed={0.90} />
          </div>
        </div>

        <h1
          className="text-center font-['Clash_Grotesk','Inter',ui-sans-serif,system-ui,sans-serif] text-[1.75rem] font-medium leading-[1.02] tracking-[-0.04em] text-foreground sm:text-[2.125rem] lg:text-[2.75rem]"
        >
          {greeting}
        </h1>
        <p className="mt-3 mb-10 max-w-2xl text-center text-sm text-muted-foreground sm:text-base">{sub}</p>

        <div
          className={cn(
            "relative w-full max-w-3xl rounded-xl border bg-card/90 transition-colors duration-200",
            focused ? "border-ring/50" : "border-border",
          )}
        >
          <AnimatedPlaceholderInput
            ref={inputRef}
            rows={1}
            value={query}
            phrases={[...HERO_PROMPT_SUGGESTIONS]}
            staticPlaceholder="Describe the investor outcome you want"
            aria-label="Ask VEX a question"
            onChange={(e) => {
              setQuery(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={handleKeyDown}
            className={cn(
              "w-full max-h-52 resize-none overflow-y-auto rounded-xl px-4 pt-4 pb-12 text-sm text-foreground",
              "placeholder:text-muted-foreground focus:outline-none",
            )}
            style={{ minHeight: "58px" }}
          />

          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 pb-3">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.35px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
            >
              <Zap className="h-3 w-3" />
              VEX
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!query.trim()}
              aria-label="Submit"
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md border transition-colors",
                query.trim()
                  ? "border-foreground/20 bg-foreground text-background hover:bg-foreground/90"
                  : "cursor-not-allowed border-border bg-muted text-muted-foreground/40",
              )}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="mt-5 flex w-full max-w-3xl items-center gap-2">
          <button
            type="button"
            aria-label="Scroll suggestions left"
            aria-disabled={!suggestionsOverflow}
            disabled={!suggestionsOverflow}
            onClick={() => scrollSuggestions(-300)}
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm backdrop-blur-md transition",
              "hover:border-border hover:bg-muted hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              !suggestionsOverflow && "pointer-events-none opacity-25",
            )}
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </button>

          <div
            ref={suggestionsScrollRef}
            onMouseEnter={() => setPauseSuggestionAuto(true)}
            onMouseLeave={() => setPauseSuggestionAuto(false)}
            onPointerDown={(e) => {
              const el = suggestionsScrollRef.current;
              if (!el || !suggestionsOverflow) return;
              if (e.pointerType === "mouse" && e.button !== 0) return;
              setPauseSuggestionAuto(true);

              const pointerId = e.pointerId;
              const startX = e.clientX;
              const startScroll = el.scrollLeft;

              suggestionDragRef.current = {
                pointerId,
                startX,
                startScroll,
                dragging: false,
              };

              /** Do not call setPointerCapture here — it steals clicks from suggestion chips. Capture only after a drag threshold. */
              const onMove = (ev: PointerEvent) => {
                if (ev.pointerId !== pointerId) return;
                const d = suggestionDragRef.current;
                if (d.pointerId !== pointerId) return;
                const dx = ev.clientX - startX;
                if (!d.dragging && Math.abs(dx) > 10) {
                  d.dragging = true;
                  suppressSuggestionChipClickRef.current = true;
                  el.dataset.dragging = "true";
                  try {
                    el.setPointerCapture(pointerId);
                  } catch {
                    /* ignore */
                  }
                }
                if (d.dragging) {
                  el.scrollLeft = startScroll - (ev.clientX - startX);
                }
              };

              const onEnd = (ev: PointerEvent) => {
                if (ev.pointerId !== pointerId) return;
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onEnd);
                window.removeEventListener("pointercancel", onEnd);

                const d = suggestionDragRef.current;
                const didDrag = d.dragging;
                try {
                  el.releasePointerCapture(pointerId);
                } catch {
                  /* ignore */
                }
                delete el.dataset.dragging;
                suggestionDragRef.current = { pointerId: null, startX: 0, startScroll: 0, dragging: false };

                if (didDrag) {
                  normalizeHorizontalLoop(el);
                  pauseSuggestionsAutoBriefly();
                  window.setTimeout(() => {
                    suppressSuggestionChipClickRef.current = false;
                  }, 0);
                } else {
                  suppressSuggestionChipClickRef.current = false;
                }
              };

              window.addEventListener("pointermove", onMove, { passive: true });
              window.addEventListener("pointerup", onEnd);
              window.addEventListener("pointercancel", onEnd);
            }}
            className={cn(
              "min-w-0 flex-1 overflow-x-auto overscroll-x-contain py-0.5 touch-pan-x",
              "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
              suggestionsOverflow && "cursor-grab active:cursor-grabbing data-[dragging=true]:cursor-grabbing",
            )}
          >
            <div className="flex w-max flex-nowrap items-center justify-start gap-2 select-none">
              {[...HERO_PROMPT_SUGGESTIONS, ...HERO_PROMPT_SUGGESTIONS].map((prompt, i) => (
                <button
                  key={`${prompt}-${i}`}
                  type="button"
                  onClick={() => {
                    if (suppressSuggestionChipClickRef.current) return;
                    setQuery(prompt);
                    inputRef.current?.focus();
                  }}
                  className="shrink-0 rounded-md border border-border bg-card px-3 py-1.5 text-left text-[11px] uppercase tracking-[0.28px] text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            aria-label="Scroll suggestions right"
            aria-disabled={!suggestionsOverflow}
            disabled={!suggestionsOverflow}
            onClick={() => scrollSuggestions(300)}
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm backdrop-blur-md transition",
              "hover:border-border hover:bg-muted hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              !suggestionsOverflow && "pointer-events-none opacity-25",
            )}
          >
            <ChevronRight className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </button>
        </div>

        <div className="mt-12 w-full max-w-5xl">
          <div className="mb-3 flex items-center justify-between px-1">
            <p className="text-[11px] uppercase tracking-[0.35px] text-muted-foreground">What's changed</p>
            <p className="text-[11px] uppercase tracking-[0.35px] text-muted-foreground/70">Since your last visit</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {UPDATE_TILES.map(({ icon: Icon, label, metric, delta, trend, description, view }, idx) => {
              const TrendIcon = trend === "down" ? ArrowDownRight : ArrowUpRight;
              const trendClass =
                trend === "up"
                  ? "text-success"
                  : trend === "down"
                    ? "text-destructive"
                    : "text-muted-foreground";
              return (
                <button
                  key={view}
                  type="button"
                  onClick={() => onViewChange(view)}
                  className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card p-4 text-left transition-colors duration-200 hover:border-border hover:bg-muted/40"
                  style={{
                    animation: "fade-in 380ms ease-out both",
                    animationDelay: `${idx * 70}ms`,
                  }}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted">
                      <Icon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border border-border bg-muted/70 px-2 py-0.5 text-[11px] font-medium",
                        trendClass,
                      )}
                    >
                      {trend !== "neutral" ? <TrendIcon className="h-3 w-3" aria-hidden /> : null}
                      {delta}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold leading-none tracking-[-0.02em] text-foreground">{metric}</span>
                    <span className="text-[11px] uppercase tracking-[0.3px] text-muted-foreground">{label}</span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{description}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
