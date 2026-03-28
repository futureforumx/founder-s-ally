import mixpanel from "mixpanel-browser";

/** Public project token (client-safe). Set `VITE_MIXPANEL_TOKEN` to override (e.g. another env). */
const DEFAULT_MIXPANEL_TOKEN = "08f242110c432c7dc31a062b7bc86c76";

const token = (import.meta.env.VITE_MIXPANEL_TOKEN ?? "").trim() || DEFAULT_MIXPANEL_TOKEN;

let initialized = false;
/** Stop retrying init after repeated failures (e.g. blocked localStorage). */
let disabled = false;
let initFailureCount = 0;

type MixpanelWithHooks = typeof mixpanel & { hooks?: unknown };

/**
 * mixpanel-browser's track/identify call _run_hook('before_track', …) which does
 * `this.hooks[hookName]`. If `hooks` was never set (partial init, race with autocapture, bundler edge cases),
 * the app throws: Cannot read properties of undefined (reading 'before_track').
 */
function repairHooks(mp: MixpanelWithHooks): void {
  if (mp.hooks == null || typeof mp.hooks !== "object") {
    mp.hooks = {};
  }
}

function doInit(): boolean {
  if (disabled) return false;
  if (initialized || !token) return initialized;
  try {
    mixpanel.init(token, {
      debug: import.meta.env.DEV,
      track_pageview: false,
      persistence: "localStorage",
      // Autocapture fires track() on its own timing; it has caused races where `hooks` is still unset.
      autocapture: false,
    });
    repairHooks(mixpanel as MixpanelWithHooks);
    if (typeof mixpanel.track !== "function") {
      throw new Error("mixpanel.init did not yield a track() function");
    }
    initialized = true;
  } catch (e) {
    initFailureCount += 1;
    if (initFailureCount >= 3) {
      disabled = true;
    }
    if (import.meta.env.DEV) {
      console.warn("[mixpanel] init failed", e);
    }
  }
  return initialized;
}

/** Call once at app startup; safe if init throws (will retry on first track unless disabled). */
export function initMixpanel(): void {
  doInit();
}

function ensureReady(): boolean {
  const ok = doInit();
  if (ok) {
    repairHooks(mixpanel as MixpanelWithHooks);
  }
  return ok;
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
    repairHooks(mixpanel as MixpanelWithHooks);
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
    repairHooks(mixpanel as MixpanelWithHooks);
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
    repairHooks(mixpanel as MixpanelWithHooks);
    // Bypass before_track / hook machinery (still sends the event).
    mixpanel.track(name, props ?? {}, { skip_hooks: true });
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn("[mixpanel] track failed", e);
    }
  }
}
