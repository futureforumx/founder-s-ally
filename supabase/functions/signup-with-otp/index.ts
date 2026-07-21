import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SignupOtpRequest {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  redirectTo?: string;
  resend?: boolean;
  token?: string;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 6;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const body: SignupOtpRequest = await req.json();
    const email = body.email?.trim().toLowerCase() ?? "";
    if (!emailPattern.test(email)) {
      return jsonResponse({ error: "Enter a valid email address." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!supabaseUrl || !serviceRoleKey || !resendKey) {
      console.error("[signup-with-otp] Missing required server credentials");
      return jsonResponse({ error: "Account confirmation is not configured." }, 503);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (body.token !== undefined) {
      return verifyCode(admin, email, body.token, serviceRoleKey, body.redirectTo);
    }

    return createAndSendCode(admin, email, body, serviceRoleKey, resendKey);
  } catch (error) {
    console.error("[signup-with-otp] Unexpected error", error);
    return jsonResponse({ error: "Internal server error." }, 500);
  }
});

async function createAndSendCode(
  admin: ReturnType<typeof createClient>,
  email: string,
  body: SignupOtpRequest,
  serviceRoleKey: string,
  resendKey: string,
) {
  const password = body.password ?? "";
  const firstName = body.firstName?.trim() ?? "";
  const lastName = body.lastName?.trim() ?? "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  if (!body.resend && password.length < 8) {
    return jsonResponse({ error: "Password must be at least 8 characters." }, 400);
  }

  let userId: string | undefined;
  if (!body.resend) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
        name: fullName,
      },
    });

    if (!error) userId = data.user?.id;
    else if (!isExistingUserError(error)) {
      console.error("[signup-with-otp] Failed to create user", error);
      return jsonResponse({ error: "We couldn't create your account." }, 400);
    }
  }

  if (!userId) {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: body.redirectTo?.trim() || undefined },
    });
    if (error || !data.user?.id) {
      console.error("[signup-with-otp] Failed to find pending user", error);
      return jsonResponse({ error: "We couldn't create a confirmation code." }, 400);
    }
    userId = data.user.id;
  }

  const code = randomSixDigitCode();
  const codeHash = await hashCode(email, code, serviceRoleKey);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
  const { error: storeError } = await admin.from("signup_confirmation_codes").upsert({
    email,
    user_id: userId,
    code_hash: codeHash,
    expires_at: expiresAt,
    attempts: 0,
    created_at: new Date().toISOString(),
  });

  if (storeError) {
    console.error("[signup-with-otp] Failed to store challenge", storeError);
    return jsonResponse({ error: "We couldn't create a confirmation code." }, 500);
  }

  const fromEmail =
    Deno.env.get("RESEND_FROM_EMAIL")?.trim() ||
    Deno.env.get("RESEND_FROM")?.trim() ||
    "Vekta <hello@tryvekta.com>";
  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromEmail,
      to: [email],
      subject: "Your Vekta confirmation code",
      html: buildConfirmationEmail(code),
    }),
  });

  if (!resendResponse.ok) {
    console.error(
      `[signup-with-otp] Resend rejected send ${resendResponse.status}:`,
      await resendResponse.text(),
    );
    return jsonResponse({ error: "Failed to send the confirmation code." }, 502);
  }

  return jsonResponse({ success: true }, 200);
}

async function verifyCode(
  admin: ReturnType<typeof createClient>,
  email: string,
  rawToken: string,
  serviceRoleKey: string,
  redirectTo?: string,
) {
  const token = rawToken.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(token)) {
    return jsonResponse({ error: "Enter the six-digit code from your email." }, 400);
  }

  const { data: challenge, error } = await admin
    .from("signup_confirmation_codes")
    .select("user_id, code_hash, expires_at, attempts")
    .eq("email", email)
    .maybeSingle();

  if (error || !challenge) {
    return jsonResponse({ error: "Request a new confirmation code." }, 400);
  }
  if (challenge.attempts >= MAX_ATTEMPTS || Date.parse(challenge.expires_at) < Date.now()) {
    await admin.from("signup_confirmation_codes").delete().eq("email", email);
    return jsonResponse({ error: "That code has expired. Request a new one." }, 400);
  }

  const candidateHash = await hashCode(email, token, serviceRoleKey);
  if (!constantTimeEqual(candidateHash, challenge.code_hash)) {
    await admin
      .from("signup_confirmation_codes")
      .update({ attempts: challenge.attempts + 1 })
      .eq("email", email);
    return jsonResponse({ error: "That code is incorrect." }, 400);
  }

  const { error: confirmError } = await admin.auth.admin.updateUserById(challenge.user_id, {
    email_confirm: true,
  });
  if (confirmError) {
    console.error("[signup-with-otp] Failed to confirm user", confirmError);
    return jsonResponse({ error: "We couldn't confirm your account." }, 500);
  }

  await admin.from("signup_confirmation_codes").delete().eq("email", email);

  // Create a session without exposing a second code to the user. Confirmation
  // has already succeeded even if session creation is unavailable.
  const { data: linkData } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: redirectTo?.trim() || undefined },
  });
  if (linkData?.properties?.hashed_token) {
    const { data: sessionData } = await admin.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "magiclink",
    });
    if (sessionData.session) {
      return jsonResponse({
        success: true,
        accessToken: sessionData.session.access_token,
        refreshToken: sessionData.session.refresh_token,
      }, 200);
    }
  }

  return jsonResponse({ success: true, confirmed: true }, 200);
}

function randomSixDigitCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % 1_000_000).padStart(6, "0");
}

async function hashCode(email: string, code: string, pepper: string) {
  const bytes = new TextEncoder().encode(`${email}:${code}:${pepper}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function isExistingUserError(error: { code?: string; message?: string }) {
  return (
    error.code === "email_exists" ||
    error.code === "user_already_exists" ||
    /already (?:been )?registered|already exists/i.test(error.message ?? "")
  );
}

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildConfirmationEmail(code: string) {
  return `
<!DOCTYPE html>
<html lang="en">
  <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Your Vekta confirmation code</title></head>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:Inter,Segoe UI,Arial,sans-serif;color:#18181b;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#f4f4f5;"><tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e4e7;border-radius:20px;overflow:hidden;">
        <tr><td style="padding:32px 32px 12px;"><p style="margin:0 0 8px;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:#71717a;">Vekta</p><h1 style="margin:0;font-size:28px;line-height:1.15;color:#09090b;">Confirm your account</h1></td></tr>
        <tr><td style="padding:0 32px 32px;"><p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#52525b;">Enter this code in Vekta to confirm your email address. It expires in 10 minutes and can only be used once.</p><div style="margin:0 0 24px;padding:18px 20px;border:1px solid #d4d4d8;border-radius:16px;background:#fafafa;text-align:center;"><span style="display:inline-block;font-size:34px;line-height:1;letter-spacing:0.34em;font-weight:700;color:#09090b;">${code}</span></div><p style="margin:0;font-size:13px;line-height:1.7;color:#71717a;">If you did not create a Vekta account, you can safely ignore this email.</p></td></tr>
      </table>
    </td></tr></table>
  </body>
</html>`;
}
