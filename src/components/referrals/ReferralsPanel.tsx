import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, Copy, Loader2, Mail, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { referralShareOutlineButtonClass } from "@/lib/referralShareUi";
import { resolvePublicReferralLink } from "@/lib/publicReferralLink";
import { useReferralShareActions } from "@/hooks/useReferralShareActions";
import { trackWaitlistAnalytics } from "@/lib/waitlistAnalytics";
import { waitlistGetStatus, type WaitlistStatusResponse } from "@/lib/waitlist";

const FIELD_SURFACE =
  "border-zinc-600 bg-[#242424] text-zinc-100 placeholder:text-zinc-500 ring-offset-[#242424] focus-visible:border-zinc-500 focus-visible:ring-zinc-400/50";

const inputClass = cn(FIELD_SURFACE, "h-11 w-full rounded-lg px-3.5 py-2 text-[0.9375rem] md:text-sm");

const lookupCard = cn(
  "rounded-2xl border border-zinc-800/90 bg-[#050505]/90 shadow-xl shadow-black/40 backdrop-blur-sm",
  "px-5 py-7 sm:px-8 sm:py-8",
);

const metricsCard = cn(
  "rounded-2xl border border-zinc-800/90 bg-[#050505]/90 shadow-lg shadow-black/30 backdrop-blur-sm",
  "px-5 py-6 sm:px-7 sm:py-7",
);

const inviteCard = cn(
  "rounded-2xl border border-primary/15 bg-[#080808]/95 shadow-xl shadow-black/50 backdrop-blur-sm",
  "ring-1 ring-inset ring-white/[0.04]",
  "px-5 py-7 sm:px-8 sm:py-8",
);

const accent = "text-[#2EE6A6]";

function parseLookupInput(raw: string): { email?: string; referral_code?: string } {
  const t = raw.trim();
  if (!t) return {};
  if (t.includes("@")) return { email: t.toLowerCase() };
  return { referral_code: t.toUpperCase().replace(/\s+/g, "") };
}

export function ReferralsPanel() {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [status, setStatus] = useState<WaitlistStatusResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const emailParam = searchParams.get("email")?.trim();
    const refParam = searchParams.get("ref")?.trim() || searchParams.get("referral_code")?.trim();
    if (emailParam) setQuery(emailParam);
    else if (refParam) setQuery(refParam);
  }, [searchParams]);

  const referralLink = useMemo(() => resolvePublicReferralLink(status ?? {}), [status]);
  const { copied, copyFailed, copyReferralLink, xIntentHref, mailtoHref } =
    useReferralShareActions(referralLink);

  const runLookup = useCallback(async () => {
    const parsed = parseLookupInput(query);
    if (!parsed.email && !parsed.referral_code) {
      setErrorMessage("Enter the email you used to join the waitlist, or your referral code.");
      setPhase("error");
      return;
    }
    setPhase("loading");
    setErrorMessage(null);
    setStatus(null);
    try {
      const data = await waitlistGetStatus(parsed);
      setStatus(data);
      setPhase("success");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong. Please try again.";
      setStatus(null);
      setErrorMessage(msg);
      setPhase("error");
    }
  }, [query]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runLookup();
  };

  return (
    <div className="space-y-10">
      <section className={lookupCard} aria-labelledby="referrals-lookup-heading">
        <h2 id="referrals-lookup-heading" className="text-[1.125rem] font-semibold tracking-tight text-zinc-50">
          Look up your dashboard
        </h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-[#a1a1aa]">
          Enter the email you used to join the waitlist, or your referral code.
        </p>
        <form onSubmit={onSubmit} className="mt-7 space-y-5">
          <div className="space-y-2.5">
            <label htmlFor="referrals-lookup" className="text-xs font-medium text-[#a1a1aa]">
              Email or referral code
            </label>
            <Input
              id="referrals-lookup"
              className={inputClass}
              autoComplete="email"
              placeholder="you@company.com or ABCD1234"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Button
            type="submit"
            className="h-11 w-full font-semibold sm:w-auto sm:min-w-[220px]"
            disabled={phase === "loading"}
          >
            {phase === "loading" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Loading…
              </>
            ) : (
              "View my dashboard"
            )}
          </Button>
        </form>

        {phase === "error" && errorMessage ? (
          <div
            className="mt-5 rounded-lg border border-destructive/35 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
            role="alert"
          >
            {errorMessage}
          </div>
        ) : null}
      </section>

      {phase === "loading" ? (
        <div
          className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-2xl border border-zinc-800/80 bg-[#0a0a0a]/80 px-6 py-14 text-center"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
          <p className="text-sm font-medium text-[#a1a1aa]">Fetching your waitlist status…</p>
        </div>
      ) : null}

      {phase === "success" && status ? (
        <div className="space-y-8">
          {/* Position — primary focal point */}
          <section
            className={cn(
              "rounded-2xl border border-zinc-600/40 bg-gradient-to-b from-zinc-900/60 to-[#070707]",
              "px-6 py-9 text-center shadow-inner shadow-black/20 sm:px-10 sm:py-10 sm:text-left",
            )}
            aria-labelledby="position-heading"
          >
            <p
              id="position-heading"
              className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500"
            >
              Position
            </p>
            {status.waitlist_position != null ? (
              <p className="mt-4 text-5xl font-bold tabular-nums tracking-tight text-zinc-50 sm:text-6xl">
                #{status.waitlist_position}
              </p>
            ) : (
              <p className="mt-4 text-xl font-medium text-zinc-400 sm:text-2xl">Calculating…</p>
            )}
          </section>

          {/* Secondary metrics — balanced strip */}
          <section className={metricsCard} aria-label="Scores and referrals">
            <div className="grid grid-cols-3 gap-3 sm:gap-4">
              <MetricCell
                label="Referrals"
                value={
                  typeof status.referral_count === "number" ? (
                    <span className="tabular-nums">{status.referral_count}</span>
                  ) : (
                    "—"
                  )
                }
              />
              <MetricCell
                label="Referral score"
                value={
                  typeof status.referral_score === "number" ? (
                    <span className="tabular-nums">{status.referral_score}</span>
                  ) : (
                    "—"
                  )
                }
              />
              <MetricCell
                label="Total score"
                value={
                  typeof status.total_score === "number" ? (
                    <span className="tabular-nums">{status.total_score}</span>
                  ) : (
                    "—"
                  )
                }
              />
            </div>
          </section>

          {referralLink ? (
            <section className={inviteCard} aria-labelledby="invite-heading">
              <h3 id="invite-heading" className="text-lg font-semibold tracking-tight text-zinc-50">
                Invite others with your personal link
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#a1a1aa]">
                Each successful referral helps you move up the waitlist.
              </p>
              <p className="mt-6 break-all rounded-xl border border-zinc-700/90 bg-[#141414] px-3.5 py-3 font-mono text-[0.8125rem] leading-relaxed text-zinc-100">
                {referralLink}
              </p>

              <div className="mt-6 flex flex-col gap-3">
                <Button
                  type="button"
                  variant="default"
                  size="lg"
                  className="h-12 w-full gap-2 text-[0.9375rem] font-semibold shadow-lg shadow-primary/15"
                  onClick={copyReferralLink}
                >
                  {copied ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : <Copy className="h-4 w-4 shrink-0" aria-hidden />}
                  {copied ? "Copied!" : "Copy invite link"}
                </Button>
                <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                  {xIntentHref ? (
                    <Button
                      asChild
                      variant="outline"
                      size="lg"
                      className={cn(
                        "h-11 flex-1 gap-2 text-[0.8125rem] font-medium",
                        referralShareOutlineButtonClass,
                      )}
                    >
                      <a
                        href={xIntentHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() =>
                          trackWaitlistAnalytics("referral_link_shared", { channel: "twitter" })
                        }
                      >
                        <Share2 className="h-4 w-4 shrink-0" aria-hidden />
                        Share on X
                      </a>
                    </Button>
                  ) : null}
                  {mailtoHref ? (
                    <Button
                      asChild
                      variant="outline"
                      size="lg"
                      className={cn(
                        "h-11 flex-1 gap-2 text-[0.8125rem] font-medium",
                        referralShareOutlineButtonClass,
                      )}
                    >
                      <a
                        href={mailtoHref}
                        rel="noopener noreferrer"
                        onClick={() =>
                          trackWaitlistAnalytics("referral_link_shared", { channel: "email" })
                        }
                      >
                        <Mail className="h-4 w-4 shrink-0" aria-hidden />
                        Share via email
                      </a>
                    </Button>
                  ) : null}
                </div>
              </div>
              {copyFailed ? (
                <p className={cn("mt-4 text-2xs leading-relaxed", accent)}>
                  Could not copy — select the link above and copy manually.
                </p>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MetricCell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-[#101010] px-3 py-3.5 text-center sm:px-4 sm:py-4">
      <p className="text-[0.625rem] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1.5 text-lg font-semibold tabular-nums text-zinc-100 sm:text-xl">{value}</p>
    </div>
  );
}
