// /api/publish.js
// Admin: publish a teaching + email all users

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { adminKey, title, content, cover_image, sendEmail, tags, pinned } = req.body || {};

  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Content is required' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server not configured' });

  // 1. Insert teaching into Supabase
  const insertRes = await fetch(`${supabaseUrl}/rest/v1/teachings`, {
    method: 'POST',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      title: title || null,
      content,
      cover_image: cover_image || null,
      tags: tags || [],
      pinned: pinned || false
    })
  });

  if (!insertRes.ok) {
    const err = await insertRes.text();
    return res.status(500).json({ error: 'Insert failed', detail: err });
  }

  const inserted = await insertRes.json();
  const teaching = inserted[0];

  // 2. Send email if requested
  let emailResult = { sent: false, method: 'none' };

  if (sendEmail) {
    const resendKey = process.env.RESEND_API_KEY;
    const segmentId = process.env.RESEND_SEGMENT_ID;

    if (!resendKey) {
      emailResult.error = 'RESEND_API_KEY not set';
    } else if (segmentId) {
      // FAST PATH: use broadcasts with segment ID
      try {
        const html = buildEmailHtml(title, content, cover_image);
        const subject = title ? `New Teaching: ${title}` : 'New Teaching from Moph Echo';

        const createRes = await fetch('https://api.resend.com/broadcasts', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            audience_id: segmentId,
            from: 'Moph Echo <onboarding@resend.dev>',
            subject: subject,
            html: html
          })
        });

        const broadcast = await createRes.json();

        if (!createRes.ok) {
          emailResult.error = broadcast.message || 'Broadcast create failed';
          emailResult.detail = broadcast;
        } else {
          const sendRes = await fetch(`https://api.resend.com/broadcasts/${broadcast.id}/send`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${resendKey}` }
          });
          if (sendRes.ok) {
            emailResult.sent = true;
            emailResult.method = 'broadcast';
            emailResult.broadcastId = broadcast.id;
          } else {
            const err = await sendRes.json();
            emailResult.error = err.message || 'Broadcast send failed';
          }
        }
      } catch (e) {
        emailResult.error = 'Broadcast exception: ' + e.message;
      }
    } else {
      // FALLBACK: send one-by-one from Supabase users
      try {
        const usersRes = await fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=1000`, {
          headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }
        });
        if (!usersRes.ok) {
          emailResult.error = 'Could not fetch users';
        } else {
          const usersData = await usersRes.json();
          const users = (usersData.users || []).filter(u => u.email);
          emailResult.total = users.length;

          const html = buildEmailHtml(title, content, cover_image);
          const subject = title ? `New Teaching: ${title}` : 'New Teaching from Moph Echo';
          let sent = 0, failed = 0;

          for (const user of users) {
            try {
              const sendRes = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${resendKey}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  from: 'Moph Echo <onboarding@resend.dev>',
                  to: user.email,
                  subject: subject,
                  html: html
                })
              });
              if (sendRes.ok) sent++; else failed++;
            } catch (e) { failed++; }
            if (users.length > 1) await new Promise(r => setTimeout(r, 1100));
          }
          emailResult.sent = sent > 0;
          emailResult.method = 'direct';
          emailResult.sentCount = sent;
          emailResult.failedCount = failed;
        }
      } catch (e) {
        emailResult.error = 'Direct email exception: ' + e.message;
      }
    }
  }

  return res.status(200).json({ success: true, teaching, emailResult });
}

function buildEmailHtml(title, content, coverImage) {
  const safeTitle = (title || '').replace(/</g, '&lt;');
  const safeContent = content.replace(/</g, '&lt;').replace(/\n\n/g, '</p><p style="margin:0 0 14px 0;">').replace(/\n/g, '<br>');
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#06060a;font-family:-apple-system,BlinkMacSystemFont,'Inter',Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:32px 20px;">
  <div style="text-align:center;margin-bottom:28px;">
    <div style="display:inline-block;width:56px;height:56px;background:linear-gradient(135deg,#7c3aed,#6d28d9);border-radius:16px;line-height:56px;font-size:26px;">⚡</div>
    <h1 style="color:#a78bfa;font-size:20px;font-weight:600;letter-spacing:2px;margin:14px 0 4px 0;">MOPH ECHO</h1>
    <p style="color:#6a6a8a;font-size:12px;margin:0;font-style:italic;">The Reasoning Mirror</p>
  </div>
  <div style="background:#10101c;border-radius:18px;padding:28px 24px;border:1px solid #2a2a3a;">
    ${safeTitle ? `<h2 style="color:#d0d0e8;font-size:20px;font-weight:600;margin:0 0 16px 0;">${safeTitle}</h2>` : ''}
    ${coverImage ? `<img src="${coverImage}" style="width:100%;border-radius:12px;margin-bottom:20px;">` : ''}
    <div style="color:#c0c0d8;font-size:15px;line-height:1.7;"><p style="margin:0 0 14px 0;">${safeContent}</p></div>
    <div style="margin-top:28px;padding-top:20px;border-top:1px solid #2a2a3a;">
      <a href="https://mophecho-mirror.vercel.app" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;">Open the Mirror</a>
    </div>
  </div>
  <p style="color:#4a4a5a;font-size:11px;text-align:center;margin-top:24px;">Moph Echo Support Team · mophecho-mirror.vercel.app</p>
</div>
</body></html>`;
}
