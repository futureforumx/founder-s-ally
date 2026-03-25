import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { firstName, lastName, firm, email } = await req.json();

    if (!firstName?.trim() || !lastName?.trim() || !firm?.trim() || !email?.trim()) {
      return new Response(
        JSON.stringify({ error: "All fields are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    // Add contact to Resend audience
    const response = await fetch("https://api.resend.com/audiences", {
      method: "GET",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
    });

    let audienceId: string | null = null;

    if (response.ok) {
      const audiences = await response.json();
      const waitlistAudience = audiences.data?.find(
        (a: { name: string }) => a.name === "Investor Waitlist"
      );
      if (waitlistAudience) {
        audienceId = waitlistAudience.id;
      }
    }

    // Create audience if it doesn't exist
    if (!audienceId) {
      const createRes = await fetch("https://api.resend.com/audiences", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Investor Waitlist" }),
      });
      if (createRes.ok) {
        const created = await createRes.json();
        audienceId = created.id;
      } else {
        const err = await createRes.text();
        throw new Error(`Failed to create audience: ${err}`);
      }
    }

    // Add contact to audience
    const contactRes = await fetch(
      `https://api.resend.com/audiences/${audienceId}/contacts`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          unsubscribed: false,
        }),
      }
    );

    if (!contactRes.ok) {
      const err = await contactRes.text();
      throw new Error(`Failed to add contact: ${err}`);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Investor waitlist error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
