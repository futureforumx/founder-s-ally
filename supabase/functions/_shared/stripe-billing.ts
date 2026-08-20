import Stripe from "npm:stripe@22.5.0";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";

export const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "");

export function createAdminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase admin credentials are not configured.");
  }
  return createClient(url, serviceRoleKey);
}

function stripeId(value: string | { id: string } | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function stripeTimestamp(value?: number | null): string | null {
  return value ? new Date(value * 1000).toISOString() : null;
}

export async function upsertStripeCustomer(
  db: SupabaseClient,
  userId: string,
  customer: Stripe.Customer,
): Promise<void> {
  const { error } = await db.from("stripe_customers").upsert(
    {
      user_id: userId,
      stripe_customer_id: customer.id,
      email: customer.email,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

async function userIdForCustomer(
  db: SupabaseClient,
  customerId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("stripe_customers")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (error) throw error;
  return data?.user_id ?? null;
}

async function syncBillingEntitlement(
  db: SupabaseClient,
  userId: string,
): Promise<void> {
  const [{ data: paidSubscription, error: subscriptionError }, { data: credits, error: creditsError }] =
    await Promise.all([
      db
        .from("stripe_subscriptions")
        .select("stripe_subscription_id")
        .eq("user_id", userId)
        .in("status", ["active", "trialing", "past_due"])
        .limit(1)
        .maybeSingle(),
      db
        .from("user_credits")
        .select("tier")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
  if (subscriptionError) throw subscriptionError;
  if (creditsError) throw creditsError;

  // Billing must never demote an app administrator.
  if (credits?.tier === "admin") return;

  const { error } = await db.from("user_credits").upsert(
    {
      user_id: userId,
      tier: paidSubscription ? "pro" : "free",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

export async function syncStripeSubscription(
  db: SupabaseClient,
  subscription: Stripe.Subscription,
  knownUserId?: string | null,
): Promise<string | null> {
  const customerId = stripeId(subscription.customer);
  if (!customerId) throw new Error(`Subscription ${subscription.id} has no customer.`);

  const userId =
    knownUserId ||
    subscription.metadata.supabase_user_id ||
    (await userIdForCustomer(db, customerId));

  if (!userId) {
    console.warn(`Unable to map Stripe subscription ${subscription.id} to an app user.`);
    return null;
  }

  const item = subscription.items.data[0];
  const price = item?.price;
  const periodEnd =
    (item as (Stripe.SubscriptionItem & { current_period_end?: number }) | undefined)
      ?.current_period_end ?? null;

  const { error } = await db.from("stripe_subscriptions").upsert({
    stripe_subscription_id: subscription.id,
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_price_id: price?.id ?? null,
    stripe_product_id: stripeId(price?.product ?? null),
    status: subscription.status,
    current_period_end: stripeTimestamp(periodEnd),
    cancel_at_period_end: subscription.cancel_at_period_end,
    canceled_at: stripeTimestamp(subscription.canceled_at),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;

  await syncBillingEntitlement(db, userId);
  return userId;
}
