import { useState } from "react";
import { Check, Clock3, Mail, Share2 } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Pulse } from "@/components/loading-ui/pulse";
import { useReferralShareActions } from "@/hooks/useReferralShareActions";
import { trackWaitlistAnalytics } from "@/lib/waitlistAnalytics";

type WaitlistConfirmationState = {
  email?: string;
  confirmationEmailSent?: boolean;
  referralCode?: string;
  referralLink?: string;
};

const SESSION_KEY = "vekta.waitlistConfirmation";

function readConfirmationState(routeState: unknown): WaitlistConfirmationState {
  if (routeState && typeof routeState === "object") {
    const state = routeState as WaitlistConfirmationState;
    if (typeof state.email === "string") return state;
  }

  try {
    const saved = window.sessionStorage.getItem(SESSION_KEY);
    if (!saved) return {};
    const parsed = JSON.parse(saved) as WaitlistConfirmationState;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export default function WaitlistConfirmation() {
  const location = useLocation();
  const state = readConfirmationState(location.state);
  const email = typeof state.email === "string" ? state.email.trim().toLowerCase() : "";
  const referralCode = typeof state.referralCode === "string" ? state.referralCode.trim() : "";
  const referralLink =
    typeof state.referralLink === "string" && state.referralLink.trim()
      ? state.referralLink.trim()
      : referralCode
        ? `${window.location.origin}/register?ref=${encodeURIComponent(referralCode)}`
        : "";
  const { copied, copyFailed, copyReferralLink } = useReferralShareActions(referralLink);
  const [shared, setShared] = useState(false);

  const shareWithNetwork = async () => {
    if (!referralLink) return;

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "Join the Vekta waitlist",
          text: "Join me on the Vekta waitlist.",
          url: referralLink,
        });
        trackWaitlistAnalytics("referral_link_shared", { channel: "native_share" });
        setShared(true);
        window.setTimeout(() => setShared(false), 2000);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    await copyReferralLink();
  };

  return (
    <main className="min-h-screen bg-black px-5 py-8 font-sans text-zinc-100 sm:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col">
        <header className="flex items-center justify-between border-b border-zinc-900 pb-6">
          <Link to="/" aria-label="Vekta home">
            <img
              src="/brand/vekta-login-wordmark.png"
              alt="Vekta"
              className="h-10 w-auto object-contain"
              width={149}
              height={69}
            />
          </Link>
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-600">
            Access request
          </span>
        </header>

        <section className="flex flex-1 items-center justify-center py-14 sm:py-20">
          <div className="w-full max-w-2xl border border-zinc-800 bg-[#0c0c0d] p-7 shadow-2xl shadow-black sm:p-10">
            <div className="relative mb-8 flex size-14 items-center justify-center text-emerald-300">
              <Pulse className="absolute inset-0 size-14" aria-hidden="true" />
              <span className="flex size-10 items-center justify-center rounded-full bg-emerald-950/70">
                <Check className="size-5" aria-hidden />
              </span>
            </div>

            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
              Request received
            </p>
            <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              You’re on the Vekta waitlist.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-zinc-400">
              Our team will review your request. If approved, we’ll send access instructions
              {email ? ` to ${email}` : " to the email you provided"}.
            </p>

            <div className="mt-9 grid gap-px border border-zinc-800 bg-zinc-800 sm:grid-cols-2">
              <div className="bg-[#111112] p-5">
                <Mail className="mb-4 h-5 w-5 text-zinc-400" aria-hidden />
                <p className="text-sm font-medium text-zinc-100">
                  {state.confirmationEmailSent ? "Confirmation sent" : "Request confirmed"}
                </p>
                <p className="mt-1 text-sm leading-6 text-zinc-500">
                  {state.confirmationEmailSent
                    ? `Check ${email || "your inbox"} for your confirmation email.`
                    : "Your request has been saved for review."}
                </p>
              </div>
              <div className="bg-[#111112] p-5">
                <Clock3 className="mb-4 h-5 w-5 text-zinc-400" aria-hidden />
                <p className="text-sm font-medium text-zinc-100">Manual review</p>
                <p className="mt-1 text-sm leading-6 text-zinc-500">
                  You’ll hear from us when your access is approved.
                </p>
              </div>
            </div>

            {referralLink && (
              <div className="mt-6 border border-zinc-800 bg-[#111112] p-5">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      Your unique referral code
                    </p>
                    <p className="mt-2 font-mono text-lg tracking-[0.14em] text-white">
                      {referralCode}
                    </p>
                    <p className="mt-2 break-all text-xs leading-5 text-zinc-600">{referralLink}</p>
                  </div>
                  <button
                    type="button"
                    onClick={shareWithNetwork}
                    className="inline-flex h-12 shrink-0 items-center justify-center gap-2 bg-white px-5 text-xs font-semibold uppercase tracking-[0.12em] text-black transition hover:bg-zinc-100"
                  >
                    {copied || shared ? <Check className="h-4 w-4" aria-hidden /> : <Share2 className="h-4 w-4" aria-hidden />}
                    {copied ? "Link copied" : shared ? "Shared" : "Share with your network"}
                  </button>
                </div>
                {copyFailed && (
                  <p className="mt-3 text-xs text-red-400" role="alert">
                    We couldn’t copy the link. Select the referral URL above and copy it manually.
                  </p>
                )}
              </div>
            )}

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href="https://tryvekta.com"
                className="inline-flex h-12 items-center justify-center bg-white px-6 text-xs font-semibold uppercase tracking-[0.14em] text-black transition hover:bg-zinc-100"
              >
                Back
              </a>
              <Link
                to="/login"
                className="inline-flex h-12 items-center justify-center border border-zinc-700 px-6 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-200 transition hover:border-zinc-500 hover:text-white"
              >
                Already approved? Sign in
              </Link>
            </div>
          </div>
        </section>

        <footer className="border-t border-zinc-900 pt-6 text-center text-[10px] text-zinc-700">
          © 2026 Kova Ventures. All rights reserved.
        </footer>
      </div>
    </main>
  );
}
