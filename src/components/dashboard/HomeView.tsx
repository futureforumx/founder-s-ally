import { useState, useRef, type KeyboardEvent } from "react";
import { ArrowUp, TrendingUp, Users, Swords, Zap } from "lucide-react";
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
    view: "investors",
  },
  {
    icon: TrendingUp,
    title: "Check market pulse",
    description: "Live intelligence on funding rounds, exits, and sector moves",
    view: "market-intelligence",
  },
  {
    icon: Swords,
    title: "Map competitors",
    description: "Landscape your competition and surface positioning gaps",
    view: "competitors",
  },
] as const;

const SUGGESTED_PROMPTS = [
  "Who are the top Series A investors in B2B SaaS right now?",
  "What's the average check size for my stage?",
  "Show me recent funding rounds in my sector",
  "Which firms lead deals in my space?",
];

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
    // For now navigate to the investor Network view; Vyta will intercept later
    onViewChange("investors");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-5rem)] flex-col items-center justify-center px-4 py-12">
      {/* ── Hero mark ─────────────────────────────────────────────────── */}
      <div className="relative mb-8 flex items-center justify-center">
        {/* Blurred aura behind the mark — mirrors the Linear screenshot */}
        <div
          className="absolute h-32 w-32 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(166,103,255,0.28) 0%, rgba(166,103,255,0.08) 55%, transparent 80%)",
            filter: "blur(18px)",
          }}
          aria-hidden
        />
        <img
          src="/brand/vyta-mark.svg"
          alt=""
          width={52}
          height={52}
          className="relative z-10 h-[52px] w-[52px] object-contain invert"
          style={{ filter: "invert(1) drop-shadow(0 0 12px rgba(196,176,232,0.55))" }}
        />
      </div>

      {/* ── Heading ───────────────────────────────────────────────────── */}
      <h1 className="mb-2 text-center text-[26px] font-semibold tracking-tight text-foreground">
        {greeting}
      </h1>
      <p className="mb-10 text-center text-sm text-muted-foreground">{sub}</p>

      {/* ── Input ─────────────────────────────────────────────────────── */}
      <div
        className={cn(
          "relative w-full max-w-[600px] rounded-2xl border bg-card transition-all duration-200",
          focused
            ? "border-[#a667ff]/50 shadow-[0_0_0_3px_rgba(166,103,255,0.10)]"
            : "border-border shadow-sm",
        )}
      >
        <textarea
          ref={inputRef}
          rows={1}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            // Auto-resize
            e.target.style.height = "auto";
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Vyta anything…"
          className={cn(
            "block w-full resize-none rounded-2xl bg-transparent px-4 pt-4 pb-12 text-sm text-foreground",
            "placeholder:text-muted-foreground/60 focus:outline-none",
            "max-h-48 overflow-y-auto",
          )}
          style={{ minHeight: "56px" }}
        />

        {/* Bottom action row */}
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 pb-3">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Zap className="h-3 w-3" />
              Vyta
            </button>
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!query.trim()}
            aria-label="Submit"
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-lg transition-all",
              query.trim()
                ? "bg-[#a667ff] text-white hover:bg-[#9556ee]"
                : "bg-secondary text-muted-foreground/40 cursor-not-allowed",
            )}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── Suggested prompts ─────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => {
              setQuery(prompt);
              inputRef.current?.focus();
            }}
            className="rounded-full border border-border bg-card px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-[#a667ff]/40 hover:text-foreground"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* ── Quick-action cards ─────────────────────────────────────────── */}
      <div className="mt-12 flex w-full max-w-[600px] flex-col gap-2">
        <p className="mb-1 px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
          Jump to
        </p>
        <div className="grid grid-cols-3 gap-3">
          {QUICK_ACTIONS.map(({ icon: Icon, title, description, view }) => (
            <button
              key={view}
              type="button"
              onClick={() => onViewChange(view)}
              className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-left transition-all duration-150 hover:border-[#a667ff]/30 hover:bg-card/80 hover:shadow-sm"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary transition-colors group-hover:bg-[#a667ff]/15">
                <Icon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-[#a667ff] transition-colors" />
              </div>
              <div>
                <p className="text-[12px] font-semibold text-foreground">{title}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
