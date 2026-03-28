import mixpanel from "mixpanel-browser";

/** Public project token (client-safe). Set `VITE_MIXPANEL_TOKEN` to override (e.g. another env). */
const DEFAULT_MIXPANEL_TOKEN = "08f242110c432c7dc31a062b7bc86c76";

const token = (import.meta.env.VITE_MIXPANEL_TOKEN ?? "").trim() || DEFAULT_MIXPANEL_TOKEN;

let initialized = false;

function doInit(): boolean {
  if (initialized || !token) return initialized;
  try {
    mixpanel.init(token, {
      debug: import.meta.env.DEV,
      track_pageview: false,
      persistence: "localStorage",
      autocapture: true,
      // Session replay loads extra code; failures during init left `hooks` unset and broke `track` (before_track).
    });
    initialized = true;
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn("[mixpanel] init failed", e);
    }
  }
  return initialized;
}

/** Call once at app startup; safe if init throws (will retry on first track). */
export function initMixpanel(): void {
  doInit();
}

function ensureReady(): boolean {
  return doInit();
}

export function isMixpanelEnabled(): boolean {
  return Boolean(token);
}

export function mixpanelIdentify(
  userId: string,
  peopleProps?: { $email?: string; $name?: string; [key: string]: unknown }
): void {
  if (!token || !ensureReady()) return;
  try {
    mixpanel.identify(userId);
    if (peopleProps && Object.keys(peopleProps).length > 0) {
      mixpanel.people.set(peopleProps);
    }
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn("[mixpanel] identify failed", e);
    }
  }
}

export function mixpanelReset(): void {
  if (!token || !ensureReady()) return;
  try {
    mixpanel.reset();
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn("[mixpanel] reset failed", e);
    }
  }
}

export function trackMixpanelEvent(name: string, props?: Record<string, unknown>): void {
  if (!token || !ensureReady()) return;
  try {
    mixpanel.track(name, props);
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn("[mixpanel] track failed", e);
    }
  }
}
