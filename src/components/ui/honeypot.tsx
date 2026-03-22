/**
 * Honeypot input — hidden from real users, bots auto-fill it.
 * If filled, the form submission should be silently rejected.
 */
import { useRef, useCallback } from "react";

export function useHoneypot() {
  const ref = useRef<HTMLInputElement>(null);

  const isBotSubmission = useCallback(() => {
    return ref.current ? ref.current.value.length > 0 : false;
  }, []);

  return { ref, isBotSubmission };
}

export function HoneypotField() {
  return (
    <input
      type="text"
      name="website_url_confirm"
      autoComplete="off"
      tabIndex={-1}
      aria-hidden="true"
      style={{
        position: "absolute",
        left: "-9999px",
        width: 0,
        height: 0,
        overflow: "hidden",
        opacity: 0,
      }}
    />
  );
}
