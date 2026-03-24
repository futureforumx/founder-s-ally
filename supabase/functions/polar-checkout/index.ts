import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const POLAR_ACCESS_TOKEN = Deno.env.get('POLAR_ACCESS_TOKEN');
  if (!POLAR_ACCESS_TOKEN) {
    return new Response(JSON.stringify({ error: 'POLAR_ACCESS_TOKEN is not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { action, product_id, user_id, customer_id, checkout_id } = await req.json();

    if (action === 'create_checkout') {
      if (!product_id || !user_id) {
        return new Response(JSON.stringify({ error: 'product_id and user_id are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const origin = req.headers.get('origin') || 'https://id-preview--6dd0ff5f-5129-48ce-9c76-0f16111b188f.lovable.app';

      const response = await fetch('https://api.polar.sh/v1/checkouts/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${POLAR_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          products: [product_id],
          success_url: `${origin}/?tab=subscription&checkout_id={CHECKOUT_ID}`,
          external_customer_id: user_id,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(`Polar checkout creation failed [${response.status}]: ${JSON.stringify(data)}`);
      }

      return new Response(JSON.stringify({ url: data.url }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'verify_checkout') {
      if (!checkout_id) {
        return new Response(JSON.stringify({ error: 'checkout_id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const response = await fetch(`https://api.polar.sh/v1/checkouts/${checkout_id}`, {
        headers: { 'Authorization': `Bearer ${POLAR_ACCESS_TOKEN}` },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(`Polar checkout verification failed [${response.status}]: ${JSON.stringify(data)}`);
      }

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'customer_portal') {
      if (!customer_id) {
        return new Response(JSON.stringify({ error: 'customer_id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const response = await fetch('https://api.polar.sh/v1/customer-sessions/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${POLAR_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ customer_id }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(`Polar customer portal failed [${response.status}]: ${JSON.stringify(data)}`);
      }

      return new Response(JSON.stringify({ url: data.customer_portal_url }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'get_subscription') {
      if (!user_id) {
        return new Response(JSON.stringify({ error: 'user_id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Look up customer by external_id
      const custResponse = await fetch(`https://api.polar.sh/v1/customers/?external_id=${user_id}`, {
        headers: { 'Authorization': `Bearer ${POLAR_ACCESS_TOKEN}` },
      });

      if (!custResponse.ok) {
        return new Response(JSON.stringify({ subscription: null }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const custData = await custResponse.json();
      const customers = custData.items || [];
      if (customers.length === 0) {
        return new Response(JSON.stringify({ subscription: null }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const customerId = customers[0].id;

      // Get active subscriptions
      const subResponse = await fetch(`https://api.polar.sh/v1/subscriptions/?customer_id=${customerId}&active=true`, {
        headers: { 'Authorization': `Bearer ${POLAR_ACCESS_TOKEN}` },
      });

      const subData = await subResponse.json();
      const subs = subData.items || [];

      return new Response(JSON.stringify({
        subscription: subs.length > 0 ? subs[0] : null,
        customer_id: customerId,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Polar checkout error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
