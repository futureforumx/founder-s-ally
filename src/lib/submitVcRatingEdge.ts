import type { SupabaseClient } from "@supabase/supabase-js";
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js";
import { getEdgeFunctionAuthToken } from "@/lib/edgeFunctionAuth";
import { getClerkSessionToken } from "@/lib/clerkSessionForEdge";
import { isSupabaseConfigured } from "@/integrations/supabase/client";

/**
 * Clerk session JWT only — never the Supabase JWT template (`sub` is often a Supabase UUID).
 * submit-vc-rating checks `body.userId` against JWT claims; template tokens fail that match.
 *
 * Prefer the getter registered from `ClerkAuthProvider` (tracks `isLoaded` / `isSignedIn`) over
 * `window.Clerk`, which can be briefly unavailable right after navigation.
 */
async function getClerkTokenForReviewSubmit(): Promise<string | null> {
  return (await getClerkSessionToken()) || (await getEdgeFunctionAuthToken());
}

function parseFunctionJsonBody(text: string): unknown {
  if (!text?.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text.slice(0, 800) };
  }
}

function errorMessageFromFunctionPayload(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const e = (data as { error?: unknown }).error;
  return typeof e === "string" && e.trim() ? e.trim() : "";
}

function isRelayOrFetchClassError(err: unknown): boolean {
  return err instanceof FunctionsFetchError || err instanceof FunctionsRelayError;
}

/** Bundlers sometimes duplicate `@supabase/functions-js`, breaking `instanceof`. */
function looksLikeRelayOrFetchError(err: unknown): boolean {
  if (isRelayOrFetchClassError(err)) return true;
  if (typeof err === "object" && err !== null) {
    const n = (err as { name?: string }).name;
    if (n === "FunctionsFetchError" || n === "FunctionsRelayError") return true;
  }
  return false;
}

function looksLikeHttpError(err: unknown): err is { context: Response; message?: string } {
  if (err instanceof FunctionsHttpError) return true;
  if (typeof err === "object" && err !== null && "context" in err) {
    const c = (err as { context: unknown }).context;
    return c instanceof Response;
  }
  return false;
}

export type SubmitVcRatingEdgeResult =
  | { ok: true; savedAsRevision: boolean }
  /** PostgREST direct writes need a Supabase-verifiable JWT; Clerk session tokens often fail with PGRST301. */
  | { ok: false; fallbackToDirect: true; cause: "network" }
  | { ok: false; fallbackToDirect: false; cause: "no_token" };

/** True when the edge call failed before an HTTP 4xx/5xx body (unreachable function, CORS, timeout, etc.). */
export function isSubmitReviewNetworkFailure(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof Error && err.name === "AbortError") return true;
  return false;
}

/**
 * Persists a review via Edge Function (service role). Optional PostgREST fallback **only** on network
 * relay failures — never when the function returns 4xx/5xx (those must surface), and not when there
 * is no Clerk token (direct path would hit PGRST301 with a session JWT).
 */
export async function submitVcRatingViaEdge(opts: {
  supabaseClient: SupabaseClient;
  userId: string;
  reviewRecordId: string | null;
  payload: Record<string, unknown>;
}): Promise<SubmitVcRatingEdgeResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, fallbackToDirect: false, cause: "no_token" };
  }

  const edgeToken = await getClerkTokenForReviewSubmit();
  if (!edgeToken) {
    return { ok: false, fallbackToDirect: false, cause: "no_token" };
  }

  let bodyPayload: Record<string, unknown>;
  try {
    bodyPayload = JSON.parse(JSON.stringify(opts.payload)) as Record<string, unknown>;
  } catch {
    bodyPayload = opts.payload;
  }

  const invokeBody = { userId: opts.userId, reviewRecordId: opts.reviewRecordId, payload: bodyPayload };

  const baseUrl = typeof import.meta.env.VITE_SUPABASE_URL === "string" ? import.meta.env.VITE_SUPABASE_URL.trim().replace(/\/$/, "") : "";
  const anonKey =
    typeof import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY === "string" ? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY.trim() : "";

  if (baseUrl && anonKey) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 45_000);
    try {
      const res = await fetch(`${baseUrl}/functions/v1/submit-vc-rating`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${edgeToken}`,
        },
        body: JSON.stringify(invokeBody),
        signal: controller.signal,
      });
      const text = await res.text();
      const data = parseFunctionJsonBody(text);

      if (res.ok && data && typeof data === "object" && (data as { ok?: boolean }).ok === true) {
        return {
          ok: true,
          savedAsRevision: Boolean((data as { savedAsRevision?: boolean }).savedAsRevision),
        };
      }

      const serverMsg = errorMessageFromFunctionPayload(data) || (text?.trim() ? text.trim().slice(0, 800) : "");
      throw new Error(serverMsg || `${res.status} ${res.statusText}`.trim() || "Could not save your review.");
    } catch (e) {
      const isAbort = e instanceof Error && e.name === "AbortError";
      const isNet = e instanceof TypeError || isAbort;
      if (isNet) {
        console.warn("[submitVcRatingViaEdge] fetch to edge failed, falling back to supabase.functions.invoke", e);
      } else {
        throw e instanceof Error ? e : new Error(String(e));
      }
    } finally {
      clearTimeout(tid);
    }
  }

  const { data: fnData, error: fnErr } = await opts.supabaseClient.functions.invoke("submit-vc-rating", {
    body: invokeBody,
    headers: { Authorization: `Bearer ${edgeToken}` },
    timeout: 45_000,
  });

  if (!fnErr && fnData && typeof fnData === "object" && (fnData as { ok?: boolean }).ok === true) {
    return {
      ok: true,
      savedAsRevision: Boolean((fnData as { savedAsRevision?: boolean }).savedAsRevision),
    };
  }

  if (fnErr && looksLikeRelayOrFetchError(fnErr)) {
    console.warn("[submitVcRatingViaEdge] relay/network error, will try direct DB", fnErr);
    return { ok: false, fallbackToDirect: true, cause: "network" };
  }

  if (fnErr && looksLikeHttpError(fnErr)) {
    let serverMsg = errorMessageFromFunctionPayload(fnData);
    if (!serverMsg) {
      try {
        const res = fnErr.context;
        const clone = res.clone();
        const j = await clone.json();
        serverMsg = errorMessageFromFunctionPayload(j);
      } catch {
        try {
          const res = fnErr.context;
          const t = await res.clone().text();
          if (t?.trim()) serverMsg = t.trim().slice(0, 800);
        } catch {
          /* ignore */
        }
      }
    }
    throw new Error(serverMsg || fnErr.message || "Could not save your review.");
  }

  if (fnErr) {
    throw fnErr instanceof Error ? fnErr : new Error(String(fnErr));
  }

  if (fnData && typeof fnData === "object" && "error" in fnData) {
    const e = (fnData as { error?: string }).error;
    if (typeof e === "string" && e.trim()) throw new Error(e.trim());
  }

  throw new Error("Could not save your review (unexpected response from server).");
}
