import { describe, expect, it } from "vitest";
import {
  loginEmailCodeFailureMessage,
  shouldFallbackLoginOtpToSupabase,
} from "@/lib/loginOtpFallback";

describe("shouldFallbackLoginOtpToSupabase", () => {
  it("falls back on custom-function outages so sign-in code can still send", () => {
    expect(shouldFallbackLoginOtpToSupabase(502, "Failed to send sign-in code.")).toBe(true);
    expect(shouldFallbackLoginOtpToSupabase(503, "OTP service is not configured.")).toBe(true);
    expect(shouldFallbackLoginOtpToSupabase(500, "Internal server error.")).toBe(true);
    expect(shouldFallbackLoginOtpToSupabase(401, "Invalid JWT")).toBe(true);
  });

  it("does not fall back on client validation errors", () => {
    expect(shouldFallbackLoginOtpToSupabase(400, "Enter a valid email address.")).toBe(false);
    expect(shouldFallbackLoginOtpToSupabase(400, "We couldn't send a sign-in code for that email.")).toBe(
      false,
    );
  });

  it("rewrites mailer failures into an actionable login message", () => {
    expect(loginEmailCodeFailureMessage(new Error("Error sending confirmation email"))).toBe(
      "Could not send a sign-in code. Use your password or continue with Google.",
    );
    expect(loginEmailCodeFailureMessage(new Error("Enter your email address."))).toBe(
      "Enter your email address.",
    );
  });
});
