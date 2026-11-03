import { useSyncExternalStore } from "react";
import { DESIGN_STUDIO_DEFAULTS, validateDesignStudioConfig, type DesignStudioConfig } from "@/components/admin/designStudioConfig";

let publishedConfig: DesignStudioConfig = DESIGN_STUDIO_DEFAULTS;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function hexToHslTriplet(hex: string): string | null {
  const raw = hex.replace("#", "");
  if (!/^(?:[\da-f]{3}|[\da-f]{6})$/i.test(raw)) return null;
  const full = raw.length === 3 ? raw.split("").map((char) => char + char).join("") : raw;
  const [r, g, b] = [0, 2, 4].map((index) => parseInt(full.slice(index, index + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let h = 0;
  if (delta) h = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  h = Math.round(h * 60); if (h < 0) h += 360;
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return `${h} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function apply(config: DesignStudioConfig) {
  const root = document.documentElement;
  const lightTheme = root.classList.contains("light");
  for (const [name, value] of Object.entries(config.foundations.colors)) {
    if (lightTheme) {
      root.style.removeProperty(name);
      continue;
    }
    const triplet = hexToHslTriplet(value);
    if (triplet) root.style.setProperty(name, triplet);
  }
  root.style.setProperty("--radius", config.foundations.radius);
  root.style.setProperty("--vekta-space-base", config.foundations.spacing);
  root.style.setProperty("--font-sans", `'${config.foundations.fontFamily}', 'Inter', ui-sans-serif, system-ui, sans-serif`);
  root.dataset.designDensity = config.foundations.density;
  root.dataset.designMotion = config.motion.intensity;
  const motionScale = config.motion.intensity === "subtle" ? 0.65 : config.motion.intensity === "reduced" ? 0.25 : 1;
  root.style.setProperty("--vekta-motion-duration", `${Math.round(config.motion.durationMs * motionScale)}ms`);
  root.style.setProperty("--vekta-motion-easing", config.motion.easing);
}

function setPublished(config: DesignStudioConfig) {
  if (!validateDesignStudioConfig(config)) return;
  publishedConfig = config;
  apply(config);
  emit();
}

export async function loadPublishedDesignConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return;
  try {
    const response = await fetch(`${url}/functions/v1/admin-design-studio?action=published`, { headers: { apikey: key } });
    if (!response.ok) return;
    const data = await response.json();
    if (validateDesignStudioConfig(data.config)) setPublished(data.config);
  } catch {
    // Keep the source-controlled CSS configuration if published settings are unavailable.
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("vekta:design-config-published", () => void loadPublishedDesignConfig());
  new MutationObserver(() => apply(publishedConfig)).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };
const getSnapshot = () => publishedConfig;
export function usePublishedDesignConfig() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
