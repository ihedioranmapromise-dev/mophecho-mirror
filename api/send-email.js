// /api/send-email.js
// Fires the email blast for a teaching. Called separately after publish
// so publish returns instantly instead of waiting on Resend.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { adminKey, teachingId } = req.body || {};
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!teachingId) return res.status(400).json({ error: 'Missing teachingId' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server not configured' });

  try {
    // Fetch the teaching
    const tr = await fetch(`${supabaseUrl}/rest/v1/teachings?id=eq.${teachingId}&select=title,content,cover_image`, {
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }
    });
    const rows = await tr.json();
    const t = rows && rows[0];
    if (!t) return res.status(404).json({ error: 'Teaching not found' });

    const result = await sendEmailBlast(t.title, t.content, t.cover_image);
    return res.status(200).json({ success: true, emailResult: result });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function sendEmailBlast(title, content, coverImage) {
  const resendKey = process.env.RESEND_API_KEY;
  const segmentId = process.env.RESEND_SEGMENT_ID;
  if (!resendKey) return { sent: false, error: 'RESEND_API_KEY not set' };
  if (!segmentId) return { sent: false, error: 'RESEND_SEGMENT_ID not set' };
  try {
    const html = buildEmailHtml(title, content, coverImage);
    const subject = title ? `New Teaching: ${title}` : 'New Teaching from Moph Echo';
    const createRes = await fetch('https://api.resend.com/broadcasts', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ audience_id: segmentId, from: 'Moph Echo <onboarding@resend.dev>', subject, html })
    });
    const broadcast = await createRes.json();
    if (!createRes.ok) return { sent: false, error: broadcast.message || 'Broadcast failed' };
    const sendRes = await fetch(`https://api.resend.com/broadcasts/${broadcast.id}/send`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}` }
    });
    return { sent: sendRes.ok, method: 'broadcast' };
  } catch (e) {
    return { sent: false, error: e.message };
  }
}

function buildEmailHtml(title, content, coverImage) {
  const safeTitle = (title || '').replace(/</g, '&lt;');
  const plainContent = (content || '').replace(/<[^>]*>/g, '').trim();
  const safeContent = plainContent.replace(/\n\n/g, '</p><p style="margin:0 0 14px 0;">').replace(/\n/g, '<br>');
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#06060a;font-family:-apple-system,BlinkMacSystemFont,'Inter',Arial,sans-serif;"><div style="max-width:560px;margin:0 auto;padding:32px 20px;"><div style="text-align:center;margin-bottom:28px;"><div style="display:inline-block;width:56px;height:56px;background:linear-gradient(135deg,#7c3aed,#6d28d9);border-radius:16px;line-height:56px;font-size:26px;">⚡</div><h1 style="color:#a78bfa;font-size:20px;font-weight:600;letter-spacing:2px;margin:14px 0 4px 0;">MOPH ECHO</h1></div><div style="background:#10101c;border-radius:18px;padding:28px 24px;border:1px solid #2a2a3a;">${safeTitle ? `<h2 style="color:#d0d0e8;font-size:20px;font-weight:600;margin:0 0 16px 0;">${safeTitle}</h2>` : ''}${coverImage ? `<img src="${coverImage}" style="width:100%;border-radius:12px;margin-bottom:20px;">` : ''}${safeContent ? `<div style="color:#c0c0d8;font-size:15px;line-height:1.7;"><p style="margin:0 0 14px 0;">${safeContent}</p></div>` : ''}<div style="margin-top:28px;padding-top:20px;border-top:1px solid #2a2a3a;"><a href="https://mophecho-mirror.vercel.app" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;">Open the Mirror</a></div></div><p style="color:#4a4a5a;font-size:11px;text-align:center;margin-top:24px;">Moph Echo Support Team</p></div></body></html>`;
}
