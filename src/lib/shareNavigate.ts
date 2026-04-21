/**
 * Tweet web intent — `twitter.com` host (redirects to x.com; avoids broken universal-link / in-app handling with x.com-only URLs).
 * Share body is a single `text` query param (includes optional link inline). Some clients mishandle separate `text` + `url` params.
 * @see https://developer.x.com/en/docs/x-for-websites/tweet-button/guides/web-intent
 */
export function buildXTweetIntentUrl(params: { text: string; url?: string }): string {
  const sp = new URLSearchParams();
  const trimmedUrl = params.url?.trim();
  const body = trimmedUrl ? `${params.text.trim()} ${trimmedUrl}`.trim() : params.text.trim();
  sp.set("text", body);
  return `https://twitter.com/intent/tweet?${sp.toString()}`;
}

/** Legacy: single blob of text (extracts trailing http(s) URL into `url` when present). */
export function getTwitterIntentTweetUrl(shareBodyText: string): string {
  const trimmed = shareBodyText.trim();
  const m = trimmed.match(/\b(https?:\/\/\S+)\s*$/);
  if (m) {
    const url = m[1];
    const text = trimmed.slice(0, trimmed.length - url.length).trim().replace(/[\s.:–\-—]+$/u, "");
    return buildXTweetIntentUrl({
      text: text || "Join me on the waitlist:",
      url,
    });
  }
  return buildXTweetIntentUrl({ text: trimmed });
}

export function getMailtoInviteHref(
  shareBodyText: string,
  subjectLine = "Join the Vekta waitlist",
): string {
  return `mailto:?subject=${encodeURIComponent(subjectLine)}&body=${encodeURIComponent(shareBodyText)}`;
}
