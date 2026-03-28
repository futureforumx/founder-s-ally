import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Copy, Check, Loader2, Mail } from "lucide-react";
import { useRevealContact, useUserCredits } from "@/hooks/useContactReveal";
import { toast } from "sonner";

interface ContactRevealProps {
  investorId: string | null;
  firmName: string;
  /** If the user is admin, show source metadata after reveal */
  isAdmin?: boolean;
  /** Automatically reveal on mount without requiring a click */
  autoReveal?: boolean;
}

function maskEmail(firmName: string): string {
  const slug = firmName.toLowerCase().replace(/[^a-z]/g, "").slice(0, 7);
  const first = slug.charAt(0) || "c";
  return `${first}${"••••"}@${slug.slice(0, 4) || "firm"}.com`;
}

export function ContactRevealButton({ investorId, firmName, isAdmin, autoReveal }: ContactRevealProps) {
  const reveal = useRevealContact();
  const { data: credits } = useUserCredits();
  const [revealed, setRevealed] = useState<{ email: string; source?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (autoReveal && investorId && !revealed && !reveal.isPending) {
      handleReveal(true); // silent — no toasts on auto-fetch
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoReveal, investorId]);

  const handleReveal = async (silent = false) => {
    if (!investorId) {
      if (!silent) toast.error("Investor ID not available");
      return;
    }
    try {
      const result = await reveal.mutateAsync(investorId);
      if (result.error) {
        if (!silent) toast.error(result.error);
        return;
      }
      if (result.email) {
        setRevealed({ email: result.email });
        if (!silent) toast.success(`Contact revealed · ${result.credits_remaining === -1 ? "Unlimited" : result.credits_remaining} credits remaining`);
      }
    } catch (e) {
      if (!silent) toast.error("Failed to reveal contact info");
    }
  };

  const handleCopy = async () => {
    if (!revealed?.email) return;
    await navigator.clipboard.writeText(revealed.email);
    setCopied(true);
    toast.success("Email copied");
    setTimeout(() => setCopied(false), 2000);
  };

  // Auto-reveal mode: just show a spinner while loading, then the email — no masked button
  if (autoReveal) {
    if (!revealed && reveal.isPending) {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
          <span>Loading contact…</span>
        </div>
      );
    }
    if (!revealed) return null;
    return (
      <div className="flex items-center gap-1.5">
        <Mail className="h-3.5 w-3.5 text-accent" />
        <a
          href={`mailto:${revealed.email}`}
          className="text-sm font-medium text-foreground hover:text-accent transition-colors"
        >
          {revealed.email}
        </a>
        <button
          onClick={handleCopy}
          className="ml-1 p-1 rounded-md hover:bg-secondary transition-colors"
          title="Copy email"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-accent" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
        {isAdmin && (
          <span
            className="ml-2 text-[8px] font-bold uppercase tracking-wider text-muted-foreground bg-secondary px-1.5 py-0.5 rounded"
            title="Confidence: 98%"
          >
            Source: Apollo API
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <AnimatePresence mode="wait">
        {revealed ? (
          <motion.div
            key="revealed"
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-1.5"
          >
            <Mail className="h-3.5 w-3.5 text-accent" />
            <span className="text-sm font-medium text-foreground">{revealed.email}</span>
            <button
              onClick={handleCopy}
              className="ml-1 p-1 rounded-md hover:bg-secondary transition-colors"
              title="Copy email"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-accent" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
            {/* Admin-only source metadata badge */}
            {isAdmin && (
              <span
                className="ml-2 text-[8px] font-bold uppercase tracking-wider text-muted-foreground bg-secondary px-1.5 py-0.5 rounded"
                title="Confidence: 98%"
              >
                Source: Apollo API
              </span>
            )}
          </motion.div>
        ) : (
          <motion.button
            key="masked"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleReveal}
            disabled={reveal.isPending}
            className="group flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm transition-all hover:border-accent/40 hover:bg-secondary/60 disabled:opacity-50"
          >
            {reveal.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
            ) : (
              <Lock className="h-3.5 w-3.5 text-muted-foreground group-hover:text-accent transition-colors" />
            )}
            <span className="font-mono text-muted-foreground text-xs tracking-wide">
              {maskEmail(firmName)}
            </span>
            <span className="text-[10px] font-semibold text-accent uppercase tracking-wider">
              {reveal.isPending ? "Revealing…" : "Click to Reveal"}
            </span>
            {credits && credits.tier === "free" && (
              <span className="text-[9px] text-muted-foreground/60 ml-1">
                ({credits.credits_remaining} left)
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
