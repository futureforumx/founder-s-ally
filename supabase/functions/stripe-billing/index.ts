import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import {
  createAdminClient,
  stripe,
  syncStripeSubscription,
  upsertStripeCustomer,
} from "../_shared/stripe-billing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type BillingCycle = "monthly" | "annually";
type PaidPlan = "premium" | "elite";

type BillingRequest = {
  action?: "create_checkout" | "customer_portal" | "get_catalog" | "get_subscription" | "sync_checkout";
  plan?: PaidPlan;
  billing_cycle?: BillingCycle;
  session_id?: string;
};

const productIds = {
  basic: Deno.env.get("STRIPE_BASIC_PRODUCT_ID") || "prod_UDOE8xN0c0nLJ9",
  premium: Deno.env.get("STRIPE_PREMIUM_PRODUCT_ID") || "prod_UDOEvx0txmJqg4",
  elite: Deno.env.get("STRIPE_ELITE_PRODUCT_ID") || "prod_V6Tlx8ZSJTA9Q8",
} as const;

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: corsHeaders,
  });
}

function appUrl(req: Request): string {
  const configured = Deno.env.get("STRIPE_APP_URL")?.replace(/\/+$/, "");
  if (configured) return configured;

  const origin = req.headers.get("origin")?.replace(/\/+$/, "");
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
    return origin;
  }

  throw new Error("STRIPE_APP_URL is not configured.");
}

async function priceForPlan(plan: PaidPlan, cycle: BillingCycle) {
  const prices = await stripe.prices.list({
    product: productIds[plan],
    active: true,
    type: "recurring",
    limit: 100,
  });
  const interval = cycle === "annually" ? "year" : "month";
  const price = prices.data.find(
    (candidate) =>
      candidate.recurring?.interval === interval &&
      candidate.recurring.interval_count === 1,
  );
  if (!price) {
    throw new Error(
      `${plan} does not have an active ${cycle === "annually" ? "annual" : "monthly"} recurring Stripe Price.`,
    );
  }
  return price;
}

function planForProduct(productId?: string | null): PaidPlan | null {
  if (productId === productIds.premium) return "premium";
  if (productId === productIds.elite) return "elite";
  return null;
}

async function authenticatedUser(req: Request) {
  const authorization = req.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!authorization || !supabaseUrl || !anonKey) return null;

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await client.auth.getUser();
  if (error) {
    console.warn("Stripe billing auth failed:", error.message);
    return null;
  }
  return data.user;
}

async function getOrCreateCustomer(
  userId: string,
  email: string,
) {
  const db = createAdminClient();
  const { data: mapping, error } = await db
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;

  if (mapping?.stripe_customer_id) {
    try {
      const existing = await stripe.customers.retrieve(mapping.stripe_customer_id);
      if (!existing.deleted) return existing;
    } catch (error) {
      if (
        !error ||
        typeof error !== "object" ||
        !("code" in error) ||
        error.code !== "resource_missing"
      ) {
        throw error;
      }
      console.warn(
        `Stored Stripe customer ${mapping.stripe_customer_id} could not be retrieved:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  const matches = await stripe.customers.list({ email, limit: 10 });
  const matchingCustomer = matches.data.find(
    (customer) => customer.metadata.supabase_user_id === userId,
  );
  const customer =
    matchingCustomer ??
    (await stripe.customers.create({
      email,
      metadata: { supabase_user_id: userId },
    }));

  await upsertStripeCustomer(db, userId, customer);
  return customer;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    if (!Deno.env.get("STRIPE_SECRET_KEY")) {
      return json({ error: "Stripe is not configured." }, 503);
    }

    const user = await authenticatedUser(req);
    if (!user?.email) return json({ error: "Unauthorized." }, 401);

    const body = (await req.json()) as BillingRequest;
    const db = createAdminClient();

    if (body.action === "get_catalog") {
      const [premiumMonthly, premiumAnnual, eliteMonthly, eliteAnnual] =
        await Promise.all([
          priceForPlan("premium", "monthly"),
          priceForPlan("premium", "annually"),
          priceForPlan("elite", "monthly"),
          priceForPlan("elite", "annually"),
        ]);

      const catalogPrice = (price: typeof premiumMonthly) => ({
        id: price.id,
        unit_amount: price.unit_amount,
        currency: price.currency,
      });

      return json({
        basic: { product_id: productIds.basic },
        premium: {
          product_id: productIds.premium,
          monthly: catalogPrice(premiumMonthly),
          annually: catalogPrice(premiumAnnual),
        },
        elite: {
          product_id: productIds.elite,
          monthly: catalogPrice(eliteMonthly),
          annually: catalogPrice(eliteAnnual),
        },
      });
    }

    if (body.action === "get_subscription") {
      const [{ data: subscription, error }, { data: customer, error: customerError }] =
        await Promise.all([
          db
            .from("stripe_subscriptions")
            .select("*")
            .eq("user_id", user.id)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          db
            .from("stripe_customers")
            .select("stripe_customer_id")
            .eq("user_id", user.id)
            .maybeSingle(),
        ]);
      if (error) throw error;
      if (customerError) throw customerError;

      return json({
        has_customer: Boolean(customer),
        subscription: subscription
          ? {
              ...subscription,
              plan: planForProduct(subscription.stripe_product_id),
            }
          : null,
      });
    }

    if (body.action === "create_checkout") {
      if (
        (body.plan !== "premium" && body.plan !== "elite") ||
        (body.billing_cycle !== "monthly" && body.billing_cycle !== "annually")
      ) {
        return json({ error: "A valid paid plan and billing cycle are required." }, 400);
      }

      const { data: current } = await db
        .from("stripe_subscriptions")
        .select("status")
        .eq("user_id", user.id)
        .in("status", ["active", "trialing", "past_due", "unpaid", "paused"])
        .limit(1)
        .maybeSingle();
      if (current) {
        return json(
          { error: "You already have a subscription. Use Manage Billing to change it." },
          409,
        );
      }

      const customer = await getOrCreateCustomer(user.id, user.email);
      const baseUrl = appUrl(req);
      const price = await priceForPlan(body.plan, body.billing_cycle);
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customer.id,
        client_reference_id: user.id,
        line_items: [
          {
            price: price.id,
            quantity: 1,
          },
        ],
        allow_promotion_codes: true,
        success_url:
          `${baseUrl}/?view=settings&tab=subscription&checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/?view=settings&tab=subscription&checkout=cancelled`,
        metadata: { supabase_user_id: user.id },
        subscription_data: {
          metadata: {
            supabase_user_id: user.id,
            vekta_plan: body.plan,
          },
        },
      });

      return json({ url: session.url });
    }

    if (body.action === "sync_checkout") {
      if (!body.session_id) return json({ error: "session_id is required." }, 400);

      const session = await stripe.checkout.sessions.retrieve(body.session_id, {
        expand: ["subscription"],
      });
      const sessionUserId =
        session.client_reference_id || session.metadata?.supabase_user_id;
      if (sessionUserId !== user.id) return json({ error: "Forbidden." }, 403);

      if (session.subscription && typeof session.subscription !== "string") {
        await syncStripeSubscription(db, session.subscription, user.id);
      }
      return json({ status: session.status });
    }

    if (body.action === "customer_portal") {
      const { data: mapping, error } = await db
        .from("stripe_customers")
        .select("stripe_customer_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!mapping?.stripe_customer_id) {
        return json({ error: "No Stripe customer exists for this account." }, 404);
      }

      const portal = await stripe.billingPortal.sessions.create({
        customer: mapping.stripe_customer_id,
        return_url: `${appUrl(req)}/?view=settings&tab=subscription`,
      });
      return json({ url: portal.url });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown billing error.";
    console.error("Stripe billing error:", message);
    return json({ error: message }, 500);
  }
});
