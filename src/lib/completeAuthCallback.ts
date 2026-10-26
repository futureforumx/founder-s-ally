export type AuthCallbackUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
  app_metadata?: Record<string, unknown> | null;
};

export type AuthCallbackClient = {
  auth: {
    exchangeCodeForSession: (code: string) => Promise<{ error: { message: string } | null }>;
    getSession: () => Promise<unknown>;
    getUser: () => Promise<{
      data: { user: AuthCallbackUser | null };
      error: { message: string } | null;
    }>;
  };
};

/** Errors from a second exchange after detectSessionInUrl already consumed the code. */
export function isBenignAuthExchangeError(message: string): boolean {
  return /already|exchanged|invalid.*(code|request)|pkce|verifier|expired|used/i.test(message);
}

export async function resolveAuthCallbackUser(
  client: AuthCallbackClient,
  search: string,
  options: {
    timeoutMs?: number;
    intervalMs?: number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<AuthCallbackUser> {
  const timeoutMs = options.timeoutMs ?? 8_000;
  const intervalMs = options.intervalMs ?? 150;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const code = params.get("code");

  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error && !isBenignAuthExchangeError(error.message)) {
      throw new Error(error.message);
    }
  } else {
    await client.auth.getSession();
  }

  const deadline = Date.now() + timeoutMs;
  let lastError: Error | null = null;
  while (Date.now() <= deadline) {
    const { data, error } = await client.auth.getUser();
    if (data.user) return data.user;
    if (error && !/session missing|not authenticated|invalid jwt|auth session/i.test(error.message)) {
      throw new Error(error.message);
    }
    lastError = error ? new Error(error.message) : lastError;
    if (Date.now() + intervalMs > deadline) break;
    await sleep(intervalMs);
  }

  throw lastError ?? new Error("No authenticated user returned.");
}
