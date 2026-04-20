import { useCallback, useMemo, useState } from "react";
import { getMailtoInviteHref, getTwitterIntentTweetUrl } from "@/lib/shareNavigate";
import { trackWaitlistAnalytics } from "@/lib/waitlistAnalytics";

/** Copy + share URLs for referral invite (X / email use real `<a href>` in UI — avoids popup blockers). */
export function useReferralShareActions(referralLink: string) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const referralShareText = useMemo(() => {
    if (!referralLink) return "";
    return `I just joined the waitlist. Skip ahead here: ${referralLink}`;
  }, [referralLink]);

  /** Tweet compose URL — render as `<a href={xIntentHref} target="_blank">`. */
  const xIntentHref = useMemo(() => {
    if (!referralShareText) return null;
    return getTwitterIntentTweetUrl(referralShareText);
  }, [referralShareText]);

  /** Mailto — render as `<a href={mailtoHref}>`. */
  const mailtoHref = useMemo(() => {
    if (!referralShareText) return null;
    return getMailtoInviteHref(referralShareText);
  }, [referralShareText]);

  const copyReferralLink = useCallback(async () => {
    if (!referralLink) return;
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      trackWaitlistAnalytics("referral_link_copied", { channel: "clipboard" });
    } catch {
      setCopyFailed(true);
    }
  }, [referralLink]);

  return { copied, copyFailed, copyReferralLink, xIntentHref, mailtoHref };
}
