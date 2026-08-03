import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  DEFAULT_FOUNDER_WORKFLOW,
  normalizeWorkflow,
  type OnboardingWorkflowDef,
} from "@/config/onboardingWorkflow";

const WORKFLOW_ID = "founder";
const CACHE_KEY = "onboarding-workflow-founder";
const CHANGED_EVENT = "vekta:onboarding-workflow-changed";

function readCache(): OnboardingWorkflowDef {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return normalizeWorkflow(JSON.parse(raw));
  } catch {
    // ignore unavailable / malformed local storage
  }
  return DEFAULT_FOUNDER_WORKFLOW;
}

function writeCache(def: OnboardingWorkflowDef) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(def));
  } catch {
    // best-effort cache; remote is the source of truth
  }
}

/**
 * Loads the onboarding workflow definition. Paints instantly from a localStorage
 * cache (or code defaults), then syncs from Supabase. `save` upserts the row and
 * broadcasts so any mounted wizard/preview refreshes.
 */
export function useOnboardingWorkflow() {
  const { user } = useAuth();
  const [definition, setDefinition] = useState<OnboardingWorkflowDef>(() => readCache());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Table is newer than the generated Supabase types — cast per the codebase pattern.
      const { data, error: err } = await (supabase as any)
        .from("onboarding_workflow")
        .select("definition")
        .eq("id", WORKFLOW_ID)
        .maybeSingle();

      if (!mounted.current) return;
      if (err) {
        // Fall back to cache/defaults; surface nothing fatal to the wizard.
        setError(err.message);
        setLoading(false);
        return;
      }
      const remote = (data as { definition?: unknown } | null)?.definition;
      const next = remote ? normalizeWorkflow(remote) : DEFAULT_FOUNDER_WORKFLOW;
      setDefinition(next);
      writeCache(next);
      setError(null);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "Failed to load workflow");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep multiple consumers (wizard + admin preview) in sync.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<OnboardingWorkflowDef>).detail;
      if (detail) {
        setDefinition(normalizeWorkflow(detail));
      } else {
        void load();
      }
    };
    window.addEventListener(CHANGED_EVENT, handler);
    return () => window.removeEventListener(CHANGED_EVENT, handler);
  }, [load]);

  const save = useCallback(
    async (next: OnboardingWorkflowDef): Promise<{ ok: true } | { ok: false; error: string }> => {
      setSaving(true);
      setError(null);
      const normalized = normalizeWorkflow({ ...next, version: (next.version || 0) + 1 });
      try {
        const { error: err } = await (supabase as any)
          .from("onboarding_workflow")
          .upsert(
            {
              id: WORKFLOW_ID,
              definition: normalized as unknown as Record<string, unknown>,
              updated_at: new Date().toISOString(),
              updated_by: user?.id ?? null,
            },
            { onConflict: "id" },
          );

        if (err) {
          setError(err.message);
          return { ok: false, error: err.message };
        }

        setDefinition(normalized);
        writeCache(normalized);
        window.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: normalized }));
        return { ok: true };
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to save workflow";
        setError(message);
        return { ok: false, error: message };
      } finally {
        setSaving(false);
      }
    },
    [user?.id],
  );

  return { definition, loading, saving, error, reload: load, save };
}
