import { describe, expect, it } from "vitest";
import { PRODUCTION_AUTH_CALLBACK_URL, loginOtpRedirectTo } from "@/lib/loginOtpRedirect";

describe("loginOtpRedirectTo", () => {
  it("uses the vekta.so callback from local and preview origins", () => {
    expect(loginOtpRedirectTo("http://127.0.0.1:5173")).toBe(PRODUCTION_AUTH_CALLBACK_URL);
    expect(loginOtpRedirectTo("http://localhost:5173")).toBe(PRODUCTION_AUTH_CALLBACK_URL);
    expect(loginOtpRedirectTo("https://founder-s-ally-git-cursor-fix-local-login-86aa-vekta.vercel.app")).toBe(
      PRODUCTION_AUTH_CALLBACK_URL,
    );
  });

  it("uses the vekta.so callback on the live host too", () => {
    expect(loginOtpRedirectTo("https://vekta.so")).toBe(PRODUCTION_AUTH_CALLBACK_URL);
    expect(loginOtpRedirectTo("https://www.vekta.so")).toBe(PRODUCTION_AUTH_CALLBACK_URL);
    expect(loginOtpRedirectTo(undefined)).toBe(PRODUCTION_AUTH_CALLBACK_URL);
  });
});
