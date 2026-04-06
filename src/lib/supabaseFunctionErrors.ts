import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";

/** Read `{ error: string }`, plain text, or HTTP status from a failed edge function response. */
export async function readFunctionsHttpErrorMessage(error: unknown): Promise<string | null> {
  if (!(error instanceof FunctionsHttpError)) return null;
  try {
    const text = await error.context.text();
    if (!text?.trim()) {
      return `HTTP ${error.context.status}`;
    }
    try {
      const j = JSON.parse(text) as { error?: unknown };
      if (typeof j.error === "string") return j.error;
    } catch {
      /* not JSON */
    }
    return text.trim().slice(0, 500);
  } catch {
    return `HTTP ${error.context.status}`;
  }
}

export function isFunctionsHttpError(error: unknown): error is FunctionsHttpError {
  return error instanceof FunctionsHttpError;
}

function fetchFailureDetail(err: FunctionsFetchError): string {
  const c = err.context;
  if (c instanceof Error && c.message) return c.message;
  if (c != null && typeof c === "object" && "message" in c && typeof (c as { message: unknown }).message === "string") {
    return (c as { message: string }).message;
  }
  return "";
}

/**
 * User-visible message for `supabase.functions.invoke` errors (transport, relay, HTTP body, or generic).
 */
export async function formatEdgeFunctionInvokeError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    return (await readFunctionsHttpErrorMessage(error)) ?? error.message;
  }
  if (error instanceof FunctionsFetchError) {
    const d = fetchFailureDetail(error);
    const hint =
      /failed to fetch|networkerror|load failed|refused|blocked|aborted/i.test(d)
        ? " Often caused by browser extensions, strict CSP (connect-src), VPN/firewall, or an ad blocker blocking the request to your Supabase project."
        : "";
    return d ? `${error.message} (${d}).${hint}` : `${error.message}.${hint}`;
  }
  if (error instanceof FunctionsRelayError) {
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
