import { useState, useRef, useCallback, useEffect } from "react";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Global autosave state — shared across the app via a simple event emitter.
 */
const listeners = new Set<(status: AutosaveStatus) => void>();
let currentStatus: AutosaveStatus = "idle";

function broadcast(status: AutosaveStatus) {
  currentStatus = status;
  listeners.forEach(fn => fn(status));
}

/**
 * Subscribe to global autosave status changes (for the TopNav indicator).
 */
export function useAutosaveStatus() {
  const [status, setStatus] = useState<AutosaveStatus>(currentStatus);
  useEffect(() => {
    listeners.add(setStatus);
    return () => { listeners.delete(setStatus); };
  }, []);
  return status;
}

/**
 * Debounced autosave for a single field or batch of fields.
 * - Text fields: call `save(updates)` on every keystroke → debounced to `delay`ms.
 * - Toggles/dropdowns: call `saveImmediate(updates)` → fires instantly.
 */
export function useAutosave(
  persistFn: (updates: Record<string, any>) => Promise<void>,
  delay = 800,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Record<string, any>>({});
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    const updates = { ...pendingRef.current };
    pendingRef.current = {};
    if (Object.keys(updates).length === 0) return;

    broadcast("saving");
    try {
      await persistFn(updates);
      broadcast("saved");
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = setTimeout(() => broadcast("idle"), 2000);
    } catch (err) {
      console.error("Autosave failed:", err);
      broadcast("error");
      // Retry after 5 seconds
      setTimeout(() => {
        pendingRef.current = { ...updates, ...pendingRef.current };
        flush();
      }, 5000);
    }
  }, [persistFn]);

  /** Debounced save — accumulates updates, flushes after `delay` ms of inactivity. */
  const save = useCallback((updates: Record<string, any>) => {
    pendingRef.current = { ...pendingRef.current, ...updates };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, delay);
  }, [flush, delay]);

  /** Immediate save — for toggles, dropdowns, combobox selections. */
  const saveImmediate = useCallback(async (updates: Record<string, any>) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    pendingRef.current = { ...pendingRef.current, ...updates };
    await flush();
  }, [flush]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
      // Synchronous cleanup — can't await, but attempt flush
      const remaining = { ...pendingRef.current };
      if (Object.keys(remaining).length > 0) {
        pendingRef.current = {};
        persistFn(remaining).catch(() => {});
      }
    };
  }, [persistFn]);

  return { save, saveImmediate };
}
