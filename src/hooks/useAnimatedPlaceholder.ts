import { useState, useEffect, useRef, useCallback } from "react";

type Phase = "typing" | "pause" | "deleting" | "between";

export type UseAnimatedPlaceholderOptions = {
  typingMs?: number;
  deletingMs?: number;
  pauseAfterFullMs?: number;
  pauseBetweenPhrasesMs?: number;
  startDelayMs?: number;
};

const DEFAULTS = {
  typingMs: 42,
  deletingMs: 26,
  pauseAfterFullMs: 2400,
  pauseBetweenPhrasesMs: 450,
  startDelayMs: 520,
} as const;

/**
 * Cycles through `phrases` with a typewriter + delete loop while `active` is true.
 * Clears and stops all timers when `active` becomes false or on unmount.
 */
export function useAnimatedPlaceholder(
  phrases: string[],
  active: boolean,
  options?: UseAnimatedPlaceholderOptions,
): string {
  const [text, setText] = useState("");
  const phrasesRef = useRef(phrases);
  phrasesRef.current = phrases;

  const opts = useRef({ ...DEFAULTS, ...options });
  opts.current = { ...DEFAULTS, ...options };

  const phraseIndexRef = useRef(0);
  const charIndexRef = useRef(0);
  const phaseRef = useRef<Phase>("typing");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current != null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const phraseKey = phrases.join("\u0001");

  useEffect(() => {
    if (!active || phrases.length === 0) {
      clearTimer();
      setText("");
      return;
    }

    phraseIndexRef.current = 0;
    charIndexRef.current = 0;
    phaseRef.current = "typing";
    setText("");

    const schedule = (fn: () => void, delay: number) => {
      clearTimer();
      timeoutRef.current = setTimeout(fn, delay);
    };

    const tick = () => {
      const list = phrasesRef.current;
      if (list.length === 0) return;

      const { typingMs, deletingMs, pauseAfterFullMs, pauseBetweenPhrasesMs } = opts.current;
      const pi = phraseIndexRef.current % list.length;
      const phrase = list[pi]!;
      const phase = phaseRef.current;

      if (phase === "typing") {
        if (charIndexRef.current < phrase.length) {
          charIndexRef.current += 1;
          setText(phrase.slice(0, charIndexRef.current));
          schedule(tick, typingMs);
        } else {
          phaseRef.current = "pause";
          schedule(tick, pauseAfterFullMs);
        }
      } else if (phase === "pause") {
        phaseRef.current = "deleting";
        schedule(tick, 0);
      } else if (phase === "deleting") {
        if (charIndexRef.current > 0) {
          charIndexRef.current -= 1;
          setText(phrase.slice(0, charIndexRef.current));
          schedule(tick, deletingMs);
        } else {
          phraseIndexRef.current = (phraseIndexRef.current + 1) % list.length;
          phaseRef.current = "between";
          schedule(() => {
            phaseRef.current = "typing";
            tick();
          }, pauseBetweenPhrasesMs);
        }
      }
    };

    schedule(tick, opts.current.startDelayMs);

    return clearTimer;
  }, [active, phraseKey, phrases.length, clearTimer]);

  return text;
}
