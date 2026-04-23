import { useState, useRef, type KeyboardEvent } from "react";
import { ArrowUp, TrendingUp, Users, Swords, Zap } from "lucide-react";
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
    frame: "Scene 01",
    art: "from-[#1f2530] via-[#12161f] to-[#06080c]",
    view: "investors",
  },
  {
    icon: TrendingUp,
    title: "Check market pulse",
    description: "Live intelligence on funding rounds, exits, and sector moves",
    frame: "Scene 02",
    art: "from-[#20242c] via-[#161a22] to-[#080a0f]",
    view: "market-intelligence",
  },
  {
    icon: Swords,
    title: "Map competitors",
    description: "Landscape your competition and surface positioning gaps",
    frame: "Scene 03",
    art: "from-[#2a2320] via-[#1b1918] to-[#090909]",
    view: "competitors",
  },
] as const;

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

  return (
    <section className="relative isolate min-h-[calc(100vh-5rem)] overflow-hidden rounded-2xl border border-[#27272a] bg-[#030303] px-4 py-10 text-[#f2f2f2] sm:px-6 sm:py-14 lg:px-10">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,rgba(71,85,105,0.32)_0%,rgba(3,3,3,0)_58%)]" />
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#40444c] to-transparent" />

      <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center">
        <div className="mb-6 flex items-center gap-2 rounded-md border border-[#2d313a] bg-[#111319]/70 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.35px] text-[#9aa0aa]">
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[#d0d4d4]" />
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

        <div className="mt-5 flex w-full max-w-3xl flex-wrap justify-center gap-2">
          {HERO_PROMPT_SUGGESTIONS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => {
                setQuery(prompt);
                inputRef.current?.focus();
              }}
              className="rounded-md border border-[#27272a] bg-[#0d0f13] px-3 py-1.5 text-[11px] uppercase tracking-[0.28px] text-[#8f95a0] transition-colors hover:border-[#49505a] hover:text-[#e8eaee]"
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className="mt-12 w-full max-w-5xl">
          <div className="mb-3 flex items-center justify-between px-1">
            <p className="text-[11px] uppercase tracking-[0.35px] text-[#8f95a0]">Pick a scene</p>
            <p className="text-[11px] uppercase tracking-[0.35px] text-[#656b76]">Instant navigation</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {QUICK_ACTIONS.map(({ icon: Icon, title, description, frame, art, view }, idx) => (
              <button
                key={view}
                type="button"
                onClick={() => onViewChange(view)}
                className="group relative overflow-hidden rounded-lg border border-[#27272a] bg-[#0b0d10] p-4 text-left transition-colors duration-200 hover:border-[#4e5661]"
                style={{ animation: "fade-in 380ms ease-out both", animationDelay: `${idx * 90}ms` }}
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
      </div>
    </section>
  );
}
