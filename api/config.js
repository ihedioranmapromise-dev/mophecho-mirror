// /api/stripe.js
// Moph Echo Mirror — Stripe Checkout & Verification
// This file runs on Vercel's serverless infrastructure.
// It uses STRIPE_SECRET_KEY and SUPABASE_SERVICE_ROLE_KEY from environment variables.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action } = req.body || {};

  if (action === 'create-checkout') return createCheckout(req, res);
  if (action === 'verify-session') return verifySession(req, res);

  return res.status(400).json({ error: 'Invalid action' });
}

// ------------------------------------------------------------
// CREATE CHECKOUT SESSION
// ------------------------------------------------------------
async function createCheckout(req, res) {
  const { plan, userId, userEmail } = req.body;

  if (!plan || !userId || !userEmail) {
    return res.status(400).json({ error: 'Missing plan, userId, or userEmail' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  const priceMap = {
    'partial_monthly': process.env.STRIPE_PRICE_PARTIAL_MONTHLY,
    'full_monthly': process.env.STRIPE_PRICE_FULL_MONTHLY,
    'partial_yearly': process.env.STRIPE_PRICE_PARTIAL_YEARLY,
    'full_yearly': process.env.STRIPE_PRICE_FULL_YEARLY
  };

  const priceId = priceMap[plan];
  if (!priceId) {
    return res.status(400).json({ error: 'Invalid plan: ' + plan });
  }

  // Determine the origin for redirect URLs
  const origin = req.headers.origin || 'https://mophecho-mirror.vercel.app';

  const params = new URLSearchParams({
    'mode': 'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    'success_url': `${origin}/?session_id={CHECKOUT_SESSION_ID}&plan=${plan}`,
    'cancel_url': `${origin}/?cancelled=true`,
    'customer_email': userEmail,
    'client_reference_id': userId,
    'metadata[user_id]': userId,
    'metadata[plan]': plan,
    'allow_promotion_codes': 'true'
  });

  try {
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });

    const session = await response.json();

    if (!response.ok) {
      console.error('Stripe error:', session);
      return res.status(500).json({ error: session.error?.message || 'Stripe error' });
    }

    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Checkout error:', err);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}

// ------------------------------------------------------------
// VERIFY CHECKOUT SESSION & UPGRADE USER
// ------------------------------------------------------------
async function verifySession(req, res) {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'Missing sessionId' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secretKey || !supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server not configured properly' });
  }

  try {
    // 1. Fetch the session from Stripe
    const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
      headers: { 'Authorization': `Bearer ${secretKey}` }
    });

    const session = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: 'Stripe session not found' });
    }

    // 2. Ensure payment is complete
    if (session.payment_status !== 'paid') {
      return res.status(400).json({
        error: 'Payment not completed',
        status: session.payment_status
      });
    }

    const userId = session.metadata?.user_id;
    const plan = session.metadata?.plan || '';
    const customerId = session.customer;

    if (!userId) {
      return res.status(400).json({ error: 'User ID missing from session' });
    }

    // 3. Determine tier
    const tier = plan.startsWith('full') ? 'full' : 'partial';

    // 4. Update the user's profile in Supabase
    const updateRes = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, {
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
        stripe_customer_id: customerId,
        updated_at: new Date().toISOString()
      })
    });

    if (!updateRes.ok) {
      const errorText = await updateRes.text();
      console.error('Supabase update error:', errorText);
      return res.status(500).json({ error: 'Failed to update profile', detail: errorText });
    }

    return res.status(200).json({ success: true, tier, plan });
  } catch (err) {
    console.error('Verify error:', err);
    return res.status(500).json({ error: 'Failed to verify session' });
  }
}
