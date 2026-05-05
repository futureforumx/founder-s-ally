import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { ArrowUp, ChevronLeft, ChevronRight, TrendingUp, Users, Swords, Zap } from "lucide-react";
import { AnimatedPlaceholderInput } from "@/components/AnimatedPlaceholderInput";
import { cn } from "@/lib/utils";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";

interface HomeViewProps {
  onViewChange: (view: string) => void;
  companyName?: string | null;
}

const QUICK_ACTIONS = [
  {
    icon: Users,
    title: "Find investors",
    description: "Discover VCs aligned to your stage, sector, and traction",
    frame: "Workflow 01",
    art: "from-[#1f2530] via-[#12161f] to-[#06080c]",
    view: "investors",
  },
  {
    icon: TrendingUp,
    title: "Check market pulse",
    description: "Live intelligence on funding rounds, exits, and sector moves",
    frame: "Workflow 02",
    art: "from-[#20242c] via-[#161a22] to-[#080a0f]",
    view: "market-intelligence",
  },
  {
    icon: Swords,
    title: "Map competitors",
    description: "Landscape your competition and surface positioning gaps",
    frame: "Workflow 03",
    art: "from-[#2a2320] via-[#1b1918] to-[#090909]",
    view: "competitors",
  },
] as const;

/** Pixels per animation frame for suggestion + workflow strip auto-scroll (lower = slower). */
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

  const workflowsScrollRef = useRef<HTMLDivElement>(null);
  const [workflowsOverflow, setWorkflowsOverflow] = useState(false);
  const [pauseWorkflowAuto, setPauseWorkflowAuto] = useState(false);
  const workflowResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workflowDragRef = useRef<{
    pointerId: number | null;
    startX: number;
    startScroll: number;
    dragging: boolean;
  }>({ pointerId: null, startX: 0, startScroll: 0, dragging: false });
  const suppressWorkflowCardClickRef = useRef(false);
  const workflowMarqueeAccRef = useRef(0);

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
    const el = workflowsScrollRef.current;
    if (!el) return;
    const measure = () => setWorkflowsOverflow(el.scrollWidth > el.clientWidth + 2);
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
    if (!workflowsOverflow || pauseWorkflowAuto) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const el = workflowsScrollRef.current;
    if (!el) return;

    workflowMarqueeAccRef.current = 0;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 1) return;
      advanceMarqueePx(el, workflowMarqueeAccRef);
      normalizeHorizontalLoop(el);
      requestAnimationFrame(tick);
    };

    const id = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [workflowsOverflow, pauseWorkflowAuto]);

  function pauseWorkflowsAutoBriefly() {
    setPauseWorkflowAuto(true);
    if (workflowResumeTimerRef.current) clearTimeout(workflowResumeTimerRef.current);
    workflowResumeTimerRef.current = setTimeout(() => setPauseWorkflowAuto(false), 3200);
  }

  function scrollWorkflows(delta: number) {
    workflowsScrollRef.current?.scrollBy({ left: delta, behavior: "smooth" });
    pauseWorkflowsAutoBriefly();
  }

  useEffect(() => {
    return () => {
      if (suggestionResumeTimerRef.current) clearTimeout(suggestionResumeTimerRef.current);
      if (workflowResumeTimerRef.current) clearTimeout(workflowResumeTimerRef.current);
    };
  }, []);

  const glassArrowClass =
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.06] text-[#d1d5dc] shadow-[0_4px_24px_rgba(0,0,0,0.35)] backdrop-blur-md transition hover:border-white/[0.18] hover:bg-white/[0.1] hover:text-[#f4f4f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 disabled:pointer-events-none disabled:opacity-25";

  return (
    <section className="relative isolate min-h-[calc(100vh-5rem)] overflow-hidden rounded-2xl border border-[#27272a] bg-[#030303] px-4 py-10 text-[#f2f2f2] sm:px-6 sm:py-14 lg:px-10">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,rgba(71,85,105,0.32)_0%,rgba(3,3,3,0)_58%)]" />
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#40444c] to-transparent" />

      <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center">
        <div className="mb-6 flex items-center gap-2 rounded-md bg-[#111319]/70 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.35px] text-[#9aa0aa] outline-none">
          <span
            className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 animate-command-desk-status-dot"
            aria-hidden
          />
          VEKTA COMMAND DESK
        </div>

        <div className="relative mb-8 flex items-center justify-center">
          <div
            className="absolute h-28 w-28 rounded-full animate-home-vyta-mark-aura-pulse"
            style={{
              background:
                "radial-gradient(circle, rgba(148,163,184,0.28) 0%, rgba(100,116,139,0.12) 52%, transparent 82%)",
              filter: "blur(20px)",
            }}
            aria-hidden
          />
          <img
            src="/brand/vyta-mark.svg"
            alt=""
            width={52}
            height={52}
            className="relative z-10 h-[52px] w-[52px] object-contain invert"
            style={{ filter: "invert(1)" }}
          />
        </div>

        <h1
          className="text-center font-['Clash_Grotesk','Inter',ui-sans-serif,system-ui,sans-serif] text-3xl font-medium leading-[1.02] tracking-[-0.04em] text-[#ffffff] sm:text-4xl lg:text-5xl"
        >
          {greeting}
        </h1>
        <p className="mt-3 mb-10 max-w-2xl text-center text-sm text-[#8b919c] sm:text-base">{sub}</p>

        <div
          className={cn(
            "relative w-full max-w-3xl rounded-xl border bg-[#0f1115]/92 transition-colors duration-200",
            focused ? "border-[#5a616d]" : "border-[#27272a]",
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
              "w-full max-h-52 resize-none overflow-y-auto rounded-xl px-4 pt-4 pb-12 text-sm text-[#f3f4f6]",
              "placeholder:text-[#8b919c] focus:outline-none",
            )}
            style={{ minHeight: "58px" }}
          />

          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 pb-3">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-[#2d313a] bg-[#131720] px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.35px] text-[#b4bac4] transition-colors hover:border-[#464c56] hover:text-[#eceef2]"
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
                  ? "border-[#606978] bg-[#e4e8ef] text-[#07090d] hover:bg-[#f0f3f8]"
                  : "cursor-not-allowed border-[#27272a] bg-[#15171d] text-[#5d6470]",
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
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.06] text-[#d1d5dc] shadow-[0_4px_24px_rgba(0,0,0,0.35)] backdrop-blur-md transition",
              "hover:border-white/[0.18] hover:bg-white/[0.1] hover:text-[#f4f4f5]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25",
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
                  className="shrink-0 rounded-md border border-[#27272a] bg-[#0d0f13] px-3 py-1.5 text-left text-[11px] uppercase tracking-[0.28px] text-[#8f95a0] transition-colors hover:border-[#49505a] hover:text-[#e8eaee]"
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
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.06] text-[#d1d5dc] shadow-[0_4px_24px_rgba(0,0,0,0.35)] backdrop-blur-md transition",
              "hover:border-white/[0.18] hover:bg-white/[0.1] hover:text-[#f4f4f5]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25",
              !suggestionsOverflow && "pointer-events-none opacity-25",
            )}
          >
            <ChevronRight className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </button>
        </div>

        <div className="mt-12 w-full max-w-5xl">
          <div className="mb-3 flex items-center justify-between px-1">
            <p className="text-[11px] uppercase tracking-[0.35px] text-[#8f95a0]">Pick a workflow</p>
            <p className="text-[11px] uppercase tracking-[0.35px] text-[#656b76]">Instant navigation</p>
          </div>

          <div className="flex w-full items-center gap-2">
            <button
              type="button"
              aria-label="Scroll workflows left"
              aria-disabled={!workflowsOverflow}
              disabled={!workflowsOverflow}
              onClick={() => scrollWorkflows(-340)}
              className={glassArrowClass}
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </button>

            <div
              ref={workflowsScrollRef}
              onMouseEnter={() => setPauseWorkflowAuto(true)}
              onMouseLeave={() => setPauseWorkflowAuto(false)}
              onPointerDown={(e) => {
                const el = workflowsScrollRef.current;
                if (!el || !workflowsOverflow) return;
                if (e.pointerType === "mouse" && e.button !== 0) return;
                setPauseWorkflowAuto(true);

                const pointerId = e.pointerId;
                const startX = e.clientX;
                const startScroll = el.scrollLeft;

                workflowDragRef.current = {
                  pointerId,
                  startX,
                  startScroll,
                  dragging: false,
                };

                const onMove = (ev: PointerEvent) => {
                  if (ev.pointerId !== pointerId) return;
                  const d = workflowDragRef.current;
                  if (d.pointerId !== pointerId) return;
                  const dx = ev.clientX - startX;
                  if (!d.dragging && Math.abs(dx) > 10) {
                    d.dragging = true;
                    suppressWorkflowCardClickRef.current = true;
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

                  const d = workflowDragRef.current;
                  const didDrag = d.dragging;
                  try {
                    el.releasePointerCapture(pointerId);
                  } catch {
                    /* ignore */
                  }
                  delete el.dataset.dragging;
                  workflowDragRef.current = { pointerId: null, startX: 0, startScroll: 0, dragging: false };

                  if (didDrag) {
                    normalizeHorizontalLoop(el);
                    pauseWorkflowsAutoBriefly();
                    window.setTimeout(() => {
                      suppressWorkflowCardClickRef.current = false;
                    }, 0);
                  } else {
                    suppressWorkflowCardClickRef.current = false;
                  }
                };

                window.addEventListener("pointermove", onMove, { passive: true });
                window.addEventListener("pointerup", onEnd);
                window.addEventListener("pointercancel", onEnd);
              }}
              className={cn(
                "min-w-0 flex-1 overflow-x-auto overscroll-x-contain py-0.5 touch-pan-x",
                "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                workflowsOverflow && "cursor-grab active:cursor-grabbing data-[dragging=true]:cursor-grabbing",
              )}
            >
              <div className="flex w-max flex-nowrap items-stretch justify-start gap-3">
                {[...QUICK_ACTIONS, ...QUICK_ACTIONS].map(({ icon: Icon, title, description, frame, art, view }, idx) => (
                  <button
                    key={`${view}-${idx}`}
                    type="button"
                    onClick={() => {
                      if (suppressWorkflowCardClickRef.current) return;
                      onViewChange(view);
                    }}
                    className={cn(
                      "group relative min-w-[260px] max-w-[320px] shrink-0 overflow-hidden rounded-lg border border-[#27272a] bg-[#0b0d10] p-4 text-left transition-colors duration-200 hover:border-[#4e5661]",
                      "sm:min-w-[300px]",
                    )}
                    style={{
                      animation: "fade-in 380ms ease-out both",
                      animationDelay: `${(idx % QUICK_ACTIONS.length) * 90}ms`,
                    }}
                  >
                    <div className={cn("mb-4 h-24 rounded-md bg-gradient-to-br", art)} aria-hidden>
                      <div className="h-full w-full bg-[linear-gradient(180deg,rgba(255,255,255,0.06)_0%,rgba(255,255,255,0)_45%,rgba(0,0,0,0.48)_100%)]" />
                    </div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-[0.35px] text-[#949ba6]">{frame}</span>
                      <Icon className="h-3.5 w-3.5 text-[#b8bec9] transition-colors group-hover:text-[#ffffff]" />
                    </div>
                    <p className="text-base font-medium leading-tight tracking-[-0.01em] text-[#ffffff]">{title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-[#8d949f]">{description}</p>
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              aria-label="Scroll workflows right"
              aria-disabled={!workflowsOverflow}
              disabled={!workflowsOverflow}
              onClick={() => scrollWorkflows(340)}
              className={glassArrowClass}
            >
              <ChevronRight className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
