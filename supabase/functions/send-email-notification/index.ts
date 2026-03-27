const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface NotificationRequest {
  type: "access_request" | "workspace_welcome";
  recipientEmail: string;
  recipientName?: string;
  companyName: string;
  requesterName?: string;
  requesterEmail?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: NotificationRequest = await req.json();
    const { type, recipientEmail, recipientName, companyName, requesterName, requesterEmail } = payload;

    if (!type || !recipientEmail || !companyName) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: type, recipientEmail, companyName" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build email content based on type
    let subject: string;
    let htmlBody: string;

    if (type === "access_request") {
      subject = `New Access Request for ${companyName}`;
      htmlBody = buildAccessRequestEmail(companyName, requesterName || "A user", requesterEmail || "");
    } else if (type === "workspace_welcome") {
      subject = `Welcome to your ${companyName} Workspace`;
      htmlBody = buildWelcomeEmail(companyName, recipientName || "there");
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid notification type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    // Verified domain in Resend, e.g. "Founder Copilot <notifications@yourdomain.com>"
    const fromEmail =
      Deno.env.get("RESEND_FROM_EMAIL")?.trim() || "Founder Copilot <onboarding@resend.dev>";

    if (!resendKey) {
      console.error(
        "[send-email-notification] RESEND_API_KEY missing — set it in Supabase Edge Function secrets"
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: "RESEND_API_KEY is not configured",
          details: { type, recipientEmail, subject },
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [recipientEmail.trim()],
        subject,
        html: htmlBody,
      }),
    });

    const resendBody = await resendRes.text();
    if (!resendRes.ok) {
      console.error(
        `[send-email-notification] Resend failed ${resendRes.status}:`,
        resendBody
      );
      return new Response(
        JSON.stringify({
          error: "Resend rejected the send",
          status: resendRes.status,
          details: resendBody,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let resendId: string | undefined;
    try {
      resendId = JSON.parse(resendBody).id;
    } catch {
      /* ignore */
    }

    console.log(
      `[send-email-notification] sent via Resend type=${type} to=${recipientEmail} id=${resendId ?? "?"}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: "Email sent",
        resendId: resendId ?? null,
        details: { type, recipientEmail, subject },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[send-email-notification] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ── Email Templates ──

function buildAccessRequestEmail(companyName: string, requesterName: string, requesterEmail: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr><td style="background-color:#1e293b;padding:28px 32px;">
          <h1 style="margin:0;color:#f8fafc;font-size:18px;font-weight:600;letter-spacing:-0.3px;">New Access Request</h1>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;">
          <p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:1.6;">
            <strong style="color:#1e293b;">${requesterName}</strong>${requesterEmail ? ` (${requesterEmail})` : ""} has requested access to your <strong style="color:#1e293b;">${companyName}</strong> workspace.
          </p>
          <div style="background-color:#f1f5f9;border-radius:8px;padding:16px 20px;margin:0 0 24px;">
            <p style="margin:0;color:#475569;font-size:13px;line-height:1.5;">
              Review this request in your workspace settings to approve or decline.
            </p>
          </div>
          <table cellpadding="0" cellspacing="0"><tr><td>
            <a href="#" style="display:inline-block;background-color:#3b82f6;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:0.2px;">
              Review Request
            </a>
          </td></tr></table>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 32px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#94a3b8;font-size:12px;">This is an automated notification from your workspace.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildWelcomeEmail(companyName: string, recipientName: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr><td style="background-color:#1e293b;padding:28px 32px;">
          <h1 style="margin:0;color:#f8fafc;font-size:18px;font-weight:600;letter-spacing:-0.3px;">Welcome to ${companyName} 🎉</h1>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;">
          <p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:1.6;">
            Hi <strong style="color:#1e293b;">${recipientName}</strong>, your <strong style="color:#1e293b;">${companyName}</strong> workspace is ready. You're all set as the workspace manager.
          </p>
          <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
            Here's what to do next:
          </p>
          <!-- Action Cards -->
          <div style="margin:0 0 16px;background-color:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:16px 20px;">
            <p style="margin:0 0 4px;color:#0369a1;font-size:13px;font-weight:600;">📋 Complete Your Company Profile</p>
            <p style="margin:0;color:#475569;font-size:13px;line-height:1.5;">Add your pitch deck, sector tags, and growth metrics to unlock investor matching.</p>
          </div>
          <div style="margin:0 0 24px;background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;">
            <p style="margin:0 0 4px;color:#15803d;font-size:13px;font-weight:600;">🎯 Explore Investor Matchmaking</p>
            <p style="margin:0;color:#475569;font-size:13px;line-height:1.5;">Get AI-powered investor recommendations tailored to your sector and stage.</p>
          </div>
          <table cellpadding="0" cellspacing="0"><tr><td>
            <a href="#" style="display:inline-block;background-color:#3b82f6;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:0.2px;">
              Go to Dashboard
            </a>
          </td></tr></table>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 32px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#94a3b8;font-size:12px;">Welcome aboard — The ${companyName} Platform</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
