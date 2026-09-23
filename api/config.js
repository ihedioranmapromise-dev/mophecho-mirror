// /api/config.js
// Returns Supabase public config to the frontend.

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    return res.status(500).json({ error: 'Missing Supabase environment variables' });
  }

  return res.status(200).json({
    supabaseUrl: url,
    supabaseAnonKey: key
  });
}
