import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SendLoginOtpRequest {
  email?: string;
  redirectTo?: string;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, redirectTo }: SendLoginOtpRequest = await req.json();
    const normalizedEmail = email?.trim().toLowerCase() ?? "";

    if (!emailPattern.test(normalizedEmail)) {
      return jsonResponse({ error: "Enter a valid email address." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail =
      Deno.env.get("RESEND_FROM_EMAIL")?.trim() || "Vekta <onboarding@resend.dev>";

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("[send-login-otp] Missing Supabase admin credentials");
      return jsonResponse({ error: "OTP service is not configured." }, 503);
    }

    if (!resendKey) {
      console.error("[send-login-otp] Missing RESEND_API_KEY");
      return jsonResponse({ error: "Resend is not configured." }, 503);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: normalizedEmail,
      options: {
        redirectTo: redirectTo?.trim() || undefined,
      },
    });

    if (error || !data?.properties?.email_otp) {
      console.error("[send-login-otp] Failed to generate OTP", error);
      return jsonResponse(
        { error: "We couldn't send a sign-in code for that email." },
        400
      );
    }

    const otpCode = data.properties.email_otp;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [normalizedEmail],
        subject: "Your Vekta sign-in code",
        html: buildOtpEmail(otpCode),
      }),
    });

    const resendBody = await resendResponse.text();
    if (!resendResponse.ok) {
      console.error(
        `[send-login-otp] Resend rejected send ${resendResponse.status}:`,
        resendBody
      );
      return jsonResponse({ error: "Failed to send sign-in code." }, 502);
    }

    return jsonResponse({ success: true }, 200);
  } catch (error) {
    console.error("[send-login-otp] Unexpected error", error);
    return jsonResponse({ error: "Internal server error." }, 500);
  }
});

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildOtpEmail(code: string) {
  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Your Vekta sign-in code</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:Inter,Segoe UI,Arial,sans-serif;color:#18181b;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#f4f4f5;">
      <tr>
        <td align="center">
          <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e4e7;border-radius:20px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 12px;">
                <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:#71717a;">Vekta</p>
                <h1 style="margin:0;font-size:28px;line-height:1.15;color:#09090b;">Your sign-in code</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px;">
                <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#52525b;">
                  Use this 6-digit code to sign in to your Vekta workspace. It expires shortly and can only be used once.
                </p>
                <div style="margin:0 0 24px;padding:18px 20px;border:1px solid #d4d4d8;border-radius:16px;background:#fafafa;text-align:center;">
                  <span style="display:inline-block;font-size:34px;line-height:1;letter-spacing:0.34em;font-weight:700;color:#09090b;">${code}</span>
                </div>
                <p style="margin:0;font-size:13px;line-height:1.7;color:#71717a;">
                  If you did not request this code, you can safely ignore this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
