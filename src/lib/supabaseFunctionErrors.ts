import { FunctionsHttpError } from "@supabase/supabase-js";

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
