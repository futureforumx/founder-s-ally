import { useCallback, useMemo, useState } from "react";
import { buildXTweetIntentUrl, getMailtoInviteHref } from "@/lib/shareNavigate";
import { trackWaitlistAnalytics } from "@/lib/waitlistAnalytics";

/** Copy + share URLs for referral invite (X / email use real `<a href>` in UI — avoids popup blockers). */
export function useReferralShareActions(referralLink: string) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const referralShareText = useMemo(() => {
    if (!referralLink) return "";
    return `I just joined the waitlist. Skip ahead here: ${referralLink}`;
  }, [referralLink]);

  /** Tweet compose URL — host + inline URL in `text` for widest client compatibility. */
  const xIntentHref = useMemo(() => {
    if (!referralLink.trim()) return null;
    return buildXTweetIntentUrl({
      text: "I just joined the waitlist - skip ahead:",
      url: referralLink.trim(),
    });
  }, [referralLink]);

  /** Mailto — render as `<a href={mailtoHref}>`. */
  const mailtoHref = useMemo(() => {
    if (!referralShareText) return null;
    return getMailtoInviteHref(referralShareText);
  }, [referralShareText]);

  const copyReferralLink = useCallback(async (): Promise<boolean> => {
    if (!referralLink) return false;
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      trackWaitlistAnalytics("referral_link_copied", { channel: "clipboard" });
      return true;
    } catch {
      setCopyFailed(true);
      return false;
    }
  }, [referralLink]);

  return { copied, copyFailed, copyReferralLink, xIntentHref, mailtoHref };
}
