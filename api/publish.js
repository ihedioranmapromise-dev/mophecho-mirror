// /api/publish.js
// Admin: publish a teaching + email all users + handle video upload

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    adminKey, title, content, cover_image, video_file, video_url,
    sendEmail, tags, pinned
  } = req.body || {};

  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Content is required' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server not configured' });

  // --- Upload cover image if base64 ---
  let finalCoverUrl = cover_image || null;
  if (cover_image && cover_image.startsWith('data:')) {
    finalCoverUrl = await uploadBase64ToStorage(cover_image, 'covers', supabaseUrl, serviceKey);
    if (!finalCoverUrl) return res.status(500).json({ error: 'Cover image upload failed' });
  }

  // --- Upload video if base64 ---
  let finalVideoUrl = video_url || null;
  if (video_file && video_file.startsWith('data:')) {
    finalVideoUrl = await uploadBase64ToStorage(video_file, 'videos', supabaseUrl, serviceKey);
    if (!finalVideoUrl) return res.status(500).json({ error: 'Video upload failed (maybe too large)' });
  }

  // --- Insert teaching ---
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
      cover_image: finalCoverUrl,
      video_url: finalVideoUrl,
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

  // --- Email (same as before) ---
  let emailResult = { sent: false, method: 'none' };
  if (sendEmail) {
    const resendKey = process.env.RESEND_API_KEY;
    const segmentId = process.env.RESEND_SEGMENT_ID;

    if (!resendKey) {
      emailResult.error = 'RESEND_API_KEY not set';
    } else if (segmentId) {
      try {
        const html = buildEmailHtml(title, content, finalCoverUrl);
        const subject = title ? `New Teaching: ${title}` : 'New Teaching from Moph Echo';

        const createRes = await fetch('https://api.resend.com/broadcasts', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audience_id: segmentId,
            from: 'Moph Echo <onboarding@resend.dev>',
            subject,
            html
          })
        });
        const broadcast = await createRes.json();
        if (!createRes.ok) {
          emailResult.error = broadcast.message || 'Broadcast failed';
        } else {
          const sendRes = await fetch(`https://api.resend.com/broadcasts/${broadcast.id}/send`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${resendKey}` }
          });
          emailResult.sent = sendRes.ok;
          emailResult.method = 'broadcast';
        }
      } catch (e) { emailResult.error = e.message; }
    }
  }

  return res.status(200).json({ success: true, teaching, emailResult });
}

async function uploadBase64ToStorage(dataUrl, folder, supabaseUrl, serviceKey) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1];
  const b64 = match[2];
  const ext = mime.split('/')[1] || 'bin';
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const buffer = Buffer.from(b64, 'base64');

  const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/teaching-media/${path}`, {
    method: 'POST',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': mime,
      'x-upsert': 'true'
    },
    body: buffer
  });

  if (!uploadRes.ok) return null;
  return `${supabaseUrl}/storage/v1/object/public/teaching-media/${path}`;
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
  </div>
  <div style="background:#10101c;border-radius:18px;padding:28px 24px;border:1px solid #2a2a3a;">
    ${safeTitle ? `<h2 style="color:#d0d0e8;font-size:20px;font-weight:600;margin:0 0 16px 0;">${safeTitle}</h2>` : ''}
    ${coverImage ? `<img src="${coverImage}" style="width:100%;border-radius:12px;margin-bottom:20px;">` : ''}
    <div style="color:#c0c0d8;font-size:15px;line-height:1.7;"><p style="margin:0 0 14px 0;">${safeContent}</p></div>
    <div style="margin-top:28px;padding-top:20px;border-top:1px solid #2a2a3a;">
      <a href="https://mophecho-mirror.vercel.app" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;">Open the Mirror</a>
    </div>
  </div>
  <p style="color:#4a4a5a;font-size:11px;text-align:center;margin-top:24px;">Moph Echo Support Team</p>
</div>
</body></html>`;
}
