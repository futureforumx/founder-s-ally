import mixpanel from "mixpanel-browser";

/** Public project token (client-safe). Set `VITE_MIXPANEL_TOKEN` to override (e.g. another env). */
const DEFAULT_MIXPANEL_TOKEN = "08f242110c432c7dc31a062b7bc86c76";

const token = (import.meta.env.VITE_MIXPANEL_TOKEN ?? "").trim() || DEFAULT_MIXPANEL_TOKEN;

let initialized = false;

export function initMixpanel(): void {
  if (initialized || !token) return;
  initialized = true;
  mixpanel.init(token, {
    debug: import.meta.env.DEV,
    track_pageview: false,
    persistence: "localStorage",
    autocapture: true,
    record_sessions_percent: 100,
  });
}

export function isMixpanelEnabled(): boolean {
  return Boolean(token);
}

export function mixpanelIdentify(
  userId: string,
  peopleProps?: { $email?: string; $name?: string; [key: string]: unknown }
): void {
  if (!token) return;
  mixpanel.identify(userId);
  if (peopleProps && Object.keys(peopleProps).length > 0) {
    mixpanel.people.set(peopleProps);
  }
}

export function mixpanelReset(): void {
  if (!token) return;
  mixpanel.reset();
}

export function trackMixpanelEvent(name: string, props?: Record<string, unknown>): void {
  if (!token) return;
  mixpanel.track(name, props);
}
