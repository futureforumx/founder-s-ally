/** Official tweet intent — use as real `<a href target="_blank">` so opens count as normal navigation (not pop-ups). */
export function getTwitterIntentTweetUrl(shareBodyText: string): string {
  const params = new URLSearchParams({ text: shareBodyText });
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

export function getMailtoInviteHref(
  shareBodyText: string,
  subjectLine = "Join the Vekta waitlist",
): string {
  return `mailto:?subject=${encodeURIComponent(subjectLine)}&body=${encodeURIComponent(shareBodyText)}`;
}
