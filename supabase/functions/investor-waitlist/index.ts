import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Fresh Capital / fundraising page — NOTIFY ME subscriptions (Loops mailing list ID). */
const LOOPS_FUNDRAISING_NOTIFY_LIST_ID = "cmoth451907f70i3f3exm618d";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { firstName, lastName, firm, email, signupContext } = body;
    const cleanEmail = String(email ?? "").trim().toLowerCase();
    const cleanFirstName = String(firstName ?? "").trim();
    const cleanLastName = String(lastName ?? "").trim();
    const cleanFirm = String(firm ?? "").trim();

    if (!cleanFirstName || !cleanLastName || !cleanFirm || !cleanEmail) {
      return new Response(
        JSON.stringify({ error: "All fields are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(cleanEmail)) {
      return new Response(
        JSON.stringify({ error: "A valid email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOOPS_API_KEY = Deno.env.get("LOOPS_API_KEY");
    if (!LOOPS_API_KEY) {
      throw new Error("LOOPS_API_KEY is not configured");
    }

    const loopsHeaders = {
      Authorization: `Bearer ${LOOPS_API_KEY}`,
      "Content-Type": "application/json",
    };

    const ctxRaw = typeof signupContext === "string" ? signupContext.trim() : "";
    const isFundraisingPage = ctxRaw === "fundraising_page";

    const payload =
      isFundraisingPage ?
        ({
          email: cleanEmail,
          firstName: cleanFirstName,
          lastName: cleanLastName,
          subscribed: true,
          firm: cleanFirm,
          source: "FUNDRAISING PAGE",
          mailingLists: {
            [LOOPS_FUNDRAISING_NOTIFY_LIST_ID]: true,
          },
          // Omit `userGroup` so onboarding’s investor cohort is never applied from this funnel.
        } as Record<string, unknown>)
      : ({
          email: cleanEmail,
          firstName: cleanFirstName,
          lastName: cleanLastName,
          subscribed: true,
          userGroup: "investor_waitlist",
          firm: cleanFirm,
          source: "onboarding_waitlist",
          // Onboarding funnel: do not add the fundraising NOTIFY ME list unless we pass this context intentionally.
        } as Record<string, unknown>);

    const createRes = await fetch("https://app.loops.so/api/v1/contacts/create", {
      method: "POST",
      headers: loopsHeaders,
      body: JSON.stringify(payload),
    });

    if (!createRes.ok) {
      const createBodyText = await createRes.text();

      // Existing contact is normal for waitlist forms; update in place.
      if (createRes.status === 409) {
        const updateRes = await fetch("https://app.loops.so/api/v1/contacts/update", {
          method: "PUT",
          headers: loopsHeaders,
          body: JSON.stringify(payload),
        });

        if (!updateRes.ok) {
          const updateBodyText = await updateRes.text();
          throw new Error(`Loops update failed (${updateRes.status}): ${updateBodyText}`);
        }
      } else {
        throw new Error(`Loops create failed (${createRes.status}): ${createBodyText}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, provider: "loops" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Investor waitlist error:", error);
    const message = (error as Error).message || "Internal error";
    const isAuthIssue = /401|403|api key/i.test(message);
    const isConfigIssue = /LOOPS_API_KEY is not configured/.test(message);

    return new Response(
      JSON.stringify({
        error: isConfigIssue
          ? "Investor waitlist is not configured yet (missing LOOPS_API_KEY)."
          : isAuthIssue
            ? "Loops authentication failed. Check LOOPS_API_KEY."
            : message,
      }),
      {
        status: isConfigIssue ? 503 : isAuthIssue ? 502 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
