// /api/lemon.js
// Moph Echo Mirror — Lemon Squeezy Checkout + Webhook

import crypto from 'crypto';

export const config = {
  api: {
    bodyParser: false
  }
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const url = req.url || '';
    if (url.includes('action=create-checkout')) return createCheckout(req, res);
    if (url.includes('action=verify')) return verifyCheckout(req, res);
    return handleWebhook(req, res);
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

// ------------------------------------------------------------
// CREATE CHECKOUT
// ------------------------------------------------------------
async function createCheckout(req, res) {
  const raw = await getRawBody(req);
  let body = {};
  try { body = JSON.parse(raw.toString()); } catch (e) {}

  const { plan, userId, userEmail } = body;

  if (!plan || !userId || !userEmail) {
    return res.status(400).json({ error: 'Missing plan, userId, or userEmail' });
  }

  const apiKey = process.env.LEMONSQUEEZY_API_KEY;
  const storeId = process.env.LEMONSQUEEZY_STORE_ID;

  const variantMap = {
    partial_monthly: process.env.LEMONSQUEEZY_VARIANT_PARTIAL_MONTHLY,
    full_monthly: process.env.LEMONSQUEEZY_VARIANT_FULL_MONTHLY,
    partial_yearly: process.env.LEMONSQUEEZY_VARIANT_PARTIAL_YEARLY,
    full_yearly: process.env.LEMONSQUEEZY_VARIANT_FULL_YEARLY
  };

  const variantId = variantMap[plan];
  if (!variantId) return res.status(400).json({ error: 'Invalid plan: ' + plan });
  if (!apiKey || !storeId) return res.status(500).json({ error: 'Server not configured' });

  const origin = req.headers.origin || 'https://mophecho-mirror.vercel.app';

  const payload = {
    data: {
      type: 'checkouts',
      attributes: {
        checkout_data: {
          email: userEmail,
          custom: { user_id: userId, plan: plan }
        },
        product_options: {
          redirect_url: `${origin}/?payment=success&plan=${plan}`,
          receipt_button_text: 'Return to Moph Echo',
          receipt_link_url: origin
        },
        checkout_options: {
          button_color: '#7c3aed'
        }
      },
      relationships: {
        store: { data: { type: 'stores', id: String(storeId) } },
        variant: { data: { type: 'variants', id: String(variantId) } }
      }
    }
  };

  try {
    const r = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    const data = await r.json();

    if (!r.ok) {
      console.error('LS checkout error:', data);
      return res.status(500).json({ error: data.errors?.[0]?.detail || 'Checkout failed' });
    }

    return res.status(200).json({ url: data.data.attributes.url });
  } catch (err) {
    console.error('Checkout exception:', err);
    return res.status(500).json({ error: 'Checkout failed' });
  }
}

// ------------------------------------------------------------
// VERIFY CHECKOUT (fallback if webhook delayed)
// ------------------------------------------------------------
async function verifyCheckout(req, res) {
  const raw = await getRawBody(req);
  let body = {};
  try { body = JSON.parse(raw.toString()); } catch (e) {}

  const { userId, plan } = body;
  if (!userId || !plan) return res.status(400).json({ error: 'Missing userId or plan' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server not configured' });

  const tier = plan.startsWith('full') ? 'full' : 'partial';

  const r = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      subscription_tier: tier,
      subscription_status: 'active',
      updated_at: new Date().toISOString()
    })
  });

  if (!r.ok) return res.status(500).json({ error: 'Update failed' });
  return res.status(200).json({ success: true, tier });
}

// ------------------------------------------------------------
// WEBHOOK HANDLER
// ------------------------------------------------------------
async function handleWebhook(req, res) {
  const raw = await getRawBody(req);
  const signature = req.headers['x-signature'];
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;

  if (!secret) return res.status(500).json({ error: 'Webhook secret not set' });

  const hmac = crypto.createHmac('sha256', secret);
  const digest = Buffer.from(hmac.update(raw).digest('hex'), 'utf8');
  const sig = Buffer.from(signature || '', 'utf8');

  if (digest.length !== sig.length || !crypto.timingSafeEqual(digest, sig)) {
    console.error('Invalid webhook signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let payload = {};
  try { payload = JSON.parse(raw.toString()); } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const eventName = payload.meta?.event_name;
  const customData = payload.meta?.custom_data || {};
  const userId = customData.user_id;
  const plan = customData.plan || '';
  const attributes = payload.data?.attributes || {};

  console.log('Webhook event:', eventName, 'user:', userId, 'plan:', plan);

  if (!userId) return res.status(200).json({ received: true, note: 'no user_id' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server not configured' });

  const tier = plan.startsWith('full') ? 'full' : plan.startsWith('partial') ? 'partial' : null;
  const customerId = String(attributes.customer_id || '');
  const status = attributes.status || 'active';

  let update = {};

  if (eventName === 'subscription_created' || eventName === 'subscription_resumed' || eventName === 'order_created') {
    update = {
      subscription_tier: tier || 'partial',
      subscription_status: 'active',
      stripe_customer_id: customerId,
      updated_at: new Date().toISOString()
    };
  } else if (eventName === 'subscription_updated') {
    update = {
      subscription_tier: tier || undefined,
      subscription_status: status,
      stripe_customer_id: customerId,
      updated_at: new Date().toISOString()
    };
  } else if (eventName === 'subscription_cancelled' || eventName === 'subscription_expired') {
    update = {
      subscription_status: 'inactive',
      updated_at: new Date().toISOString()
    };
  } else {
    return res.status(200).json({ received: true, note: 'unhandled event' });
  }

  const r = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(update)
  });

  if (!r.ok) {
    const t = await r.text();
    console.error('Supabase update failed:', t);
    return res.status(500).json({ error: 'DB update failed' });
  }

  return res.status(200).json({ received: true });
}
