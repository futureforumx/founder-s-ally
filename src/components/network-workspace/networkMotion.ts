/** Premium product motion — fast in, clean out (Linear-style). */
export const NW_EASE = [0.16, 1, 0.3, 1] as const;

export const NW_DURATION_MS = 180;

export const nwTransition = {
  duration: NW_DURATION_MS / 1000,
  ease: NW_EASE,
} as const;

export const nwTransitionFast = {
  duration: 0.12,
  ease: NW_EASE,
} as const;
