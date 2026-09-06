import { describe, expect, it, vi } from "vitest";
import {
  isBenignAuthExchangeError,
  resolveAuthCallbackUser,
  type AuthCallbackClient,
} from "@/lib/completeAuthCallback";

function mockClient(options: {
  exchangeError?: string | null;
  users?: Array<{ id: string } | null>;
}): AuthCallbackClient {
  const remaining = [...(options.users ?? [])];
  return {
    auth: {
      exchangeCodeForSession: vi.fn(async () => ({
        error: options.exchangeError ? { message: options.exchangeError } : null,
      })),
      getSession: vi.fn(async () => ({ data: { session: null } })),
      getUser: vi.fn(async () => {
        const user = remaining.length > 0 ? remaining.shift() ?? null : null;
        return {
          data: { user },
          error: user ? null : { message: "Auth session missing!" },
        };
      }),
    },
  };
}

describe("completeAuthCallback", () => {
  it("treats already-consumed OAuth codes as recoverable", () => {
    expect(isBenignAuthExchangeError("invalid request: both auth code and code verifier should be non-empty")).toBe(
      true,
    );
    expect(isBenignAuthExchangeError("code already used")).toBe(true);
    expect(isBenignAuthExchangeError("oauth provider rejected the request")).toBe(false);
  });

  it("returns a user after detectSessionInUrl wins the race", async () => {
    const client = mockClient({
      exchangeError: "invalid request: both auth code and code verifier should be non-empty",
      users: [null, { id: "user-1" }],
    });

    const user = await resolveAuthCallbackUser(client, "?code=abc", {
      timeoutMs: 1_000,
      intervalMs: 1,
      sleep: async () => {},
    });

    expect(user.id).toBe("user-1");
    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
  });

  it("throws when the provider reports a real exchange failure", async () => {
    const client = mockClient({
      exchangeError: "oauth provider rejected the request",
      users: [{ id: "user-1" }],
    });

    await expect(resolveAuthCallbackUser(client, "?code=abc", { timeoutMs: 10, intervalMs: 1 })).rejects.toThrow(
      /oauth provider rejected/,
    );
  });
});
