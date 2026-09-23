// /api/announce.js
// Send announcement emails to all users via Resend Broadcasts

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { adminKey, subject, htmlBody } = req.body || {};

  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  if (!apiKey || !audienceId) return res.status(500).json({ error: 'Resend not configured' });

  // Create broadcast
  const create = await fetch('https://api.resend.com/broadcasts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      audience_id: audienceId,
      from: 'Moph Echo Support <support@mophecho-mirror.com>',
      subject: subject,
      html: htmlBody
    })
  });

  const broadcast = await create.json();
  if (!create.ok) return res.status(500).json({ error: broadcast.message || 'Broadcast failed' });

  // Send it immediately
  const send = await fetch(`https://api.resend.com/broadcasts/${broadcast.id}/send`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });

  if (!send.ok) return res.status(500).json({ error: 'Send failed' });
  return res.status(200).json({ success: true, broadcastId: broadcast.id });
}
