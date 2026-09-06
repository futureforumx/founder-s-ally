import { describe, expect, it, beforeEach } from "vitest";
import {
  createMockAuthSession,
  MOCK_AUTH_SESSION_KEY,
  mockSupabase,
  readMockAuthSession,
  writeMockAuthSession,
} from "@/integrations/supabase/mock-client";

describe("mock auth session", () => {
  beforeEach(() => {
    localStorage.removeItem(MOCK_AUTH_SESSION_KEY);
  });

  it("starts signed out", async () => {
    expect(readMockAuthSession()).toBeNull();
    const { data } = await mockSupabase.auth.getSession();
    expect(data.session).toBeNull();
  });

  it("signs in with a password and signs out", async () => {
    const signedIn = await mockSupabase.auth.signInWithPassword({ email: "founder@vekta.so", password: "password" });
    expect(signedIn.error).toBeNull();
    expect(signedIn.data.session?.user.email).toBe("founder@vekta.so");
    expect(readMockAuthSession()?.user.email).toBe("founder@vekta.so");

    const signedOut = await mockSupabase.auth.signOut();
    expect(signedOut.error).toBeNull();
    expect(readMockAuthSession()).toBeNull();
    const { data } = await mockSupabase.auth.getSession();
    expect(data.session).toBeNull();
  });

  it("notifies listeners on login and logout", async () => {
    const events: string[] = [];
    const { data } = mockSupabase.auth.onAuthStateChange((event: string) => {
      events.push(event);
    });

    await mockSupabase.auth.signInWithPassword({ email: "alex@vekta.so", password: "x" });
    await mockSupabase.auth.signOut();
    data.subscription.unsubscribe();

    expect(events).toEqual(["SIGNED_IN", "SIGNED_OUT"]);
  });

  it("persists a written session for getSession", async () => {
    writeMockAuthSession(createMockAuthSession("persisted@vekta.so"));
    const { data } = await mockSupabase.auth.getSession();
    expect(data.session?.user.email).toBe("persisted@vekta.so");
  });
});
