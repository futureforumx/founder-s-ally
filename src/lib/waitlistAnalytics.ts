import { trackMixpanelEvent } from "@/lib/mixpanel";

/** Mixpanel when configured; DEV console always (marketing funnel visibility without Mixpanel token). */
export function trackWaitlistAnalytics(event: string, props?: Record<string, unknown>): void {
  trackMixpanelEvent(event, props);
  if (import.meta.env.DEV) {
    console.debug(`[analytics] ${event}`, props ?? {});
  }
}
