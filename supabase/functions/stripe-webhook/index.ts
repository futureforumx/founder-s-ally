import Stripe from "npm:stripe@22.5.0";
import {
  createAdminClient,
  stripe,
  syncStripeSubscription,
  upsertStripeCustomer,
} from "../_shared/stripe-billing.ts";

const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed.", { status: 405 });

  const signature = req.headers.get("Stripe-Signature");
  const signingSecret = Deno.env.get("STRIPE_WEBHOOK_SIGNING_SECRET");
  if (!signature || !signingSecret) {
    return new Response("Stripe webhook is not configured.", { status: 503 });
  }

  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      signingSecret,
      undefined,
      cryptoProvider,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid webhook signature.";
    console.warn("Stripe webhook signature verification failed:", message);
    return new Response(message, { status: 400 });
  }

  try {
    const db = createAdminClient();

    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        const userId =
          session.client_reference_id || session.metadata?.supabase_user_id;
        if (session.customer && userId) {
          const customer =
            typeof session.customer === "string"
              ? await stripe.customers.retrieve(session.customer)
              : session.customer;
          if (!customer.deleted) await upsertStripeCustomer(db, userId, customer);
        }
        if (session.subscription && userId) {
          const subscriptionId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id;
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await syncStripeSubscription(db, subscription, userId);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed":
        await syncStripeSubscription(db, event.data.object);
        break;

      default:
        console.log(`Unhandled Stripe event: ${event.type}`);
    }

    return Response.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed.";
    console.error(`Stripe webhook ${event.id} failed:`, message);
    return new Response(message, { status: 500 });
  }
});
