export default async function handler(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Missing config' });
  }

  try {
    // This forces Supabase to do a real database query
    const response = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id&limit=1`, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`
      }
    });

    if (!response.ok) throw new Error('Query failed');
    
    return res.status(200).json({ status: 'awake', time: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
