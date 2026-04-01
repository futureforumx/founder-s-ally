const WIDGETS_SCRIPT_ID = "twitter-wjs";
const WIDGETS_SRC = "https://platform.twitter.com/widgets.js";

type TwttrWidgets = { load: (container?: HTMLElement | null) => void };
type TwttrApi = { widgets: TwttrWidgets; ready: (cb: (t: TwttrApi) => void) => void };

function getTwttr(): TwttrApi | undefined {
  return (window as unknown as { twttr?: TwttrApi }).twttr;
}

/**
 * Injects https://platform.twitter.com/widgets.js once (id `twitter-wjs`).
 * Resolves when the script `load` event fires.
 */
export function ensureTwitterWidgetsScript(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();

  const existing = document.getElementById(WIDGETS_SCRIPT_ID) as HTMLScriptElement | null;

  if (existing?.dataset.loaded === "1") {
    return Promise.resolve();
  }

  if (existing) {
    return new Promise((resolve, reject) => {
      const done = () => resolve();
      if (existing.dataset.loaded === "1") {
        done();
        return;
      }
      existing.addEventListener("load", done, { once: true });
      existing.addEventListener("error", () => reject(new Error("Twitter widgets script failed")), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = WIDGETS_SCRIPT_ID;
    script.src = WIDGETS_SRC;
    script.async = true;
    script.charset = "utf-8";
    script.onload = () => {
      script.dataset.loaded = "1";
      resolve();
    };
    script.onerror = () => reject(new Error("Twitter widgets script failed"));
    document.head.appendChild(script);
  });
}

/**
 * After the script is present, runs `twttr.ready` and asks widgets.js to scan `container`
 * (or the document). Safe to call repeatedly when new markup was mounted.
 */
export async function hydrateTwitterWidgets(container?: HTMLElement | null): Promise<void> {
  await ensureTwitterWidgetsScript();
  const twttr = getTwttr();
  if (!twttr?.widgets?.load) {
    throw new Error("Twitter widgets API unavailable");
  }

  await new Promise<void>((resolve, reject) => {
    const runLoad = (t: TwttrApi) => {
      try {
        t.widgets.load(container ?? undefined);
        resolve();
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };

    if (typeof twttr.ready === "function") {
      twttr.ready(runLoad);
    } else {
      runLoad(twttr);
    }
  });
}
