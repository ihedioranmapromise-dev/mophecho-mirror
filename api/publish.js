// /api/publish.js
// Admin: create / update / delete teachings + polls + email

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const { adminKey, action = 'create' } = body;

  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server not configured' });

  if (action === 'create') return createTeaching(body, supabaseUrl, serviceKey, res);
  if (action === 'update') return updateTeaching(body, supabaseUrl, serviceKey, res);
  if (action === 'delete') return deleteTeaching(body, supabaseUrl, serviceKey, res);
  if (action === 'analytics') return getAnalytics(body, supabaseUrl, serviceKey, res);

  return res.status(400).json({ error: 'Invalid action' });
}

// ============ CREATE ============
async function createTeaching(body, supabaseUrl, serviceKey, res) {
  const { title, content, cover_image, video_file, video_url, sendEmail, tags, pinned, featured, poll } = body;

  if (!content || !content.trim()) return res.status(400).json({ error: 'Content is required' });

  let finalCoverUrl = cover_image || null;
  if (cover_image && cover_image.startsWith('data:')) {
    finalCoverUrl = await uploadBase64ToStorage(cover_image, 'covers', supabaseUrl, serviceKey);
    if (!finalCoverUrl) return res.status(500).json({ error: 'Cover upload failed' });
  }

  let finalVideoUrl = video_url || null;
  if (video_file && video_file.startsWith('data:')) {
    finalVideoUrl = await uploadBase64ToStorage(video_file, 'videos', supabaseUrl, serviceKey);
    if (!finalVideoUrl) return res.status(500).json({ error: 'Video upload failed' });
  }

  if (featured) await clearTodaysFeature(supabaseUrl, serviceKey);

  const insertBody = {
    title: title || null,
    content,
    cover_image: finalCoverUrl,
    video_url: finalVideoUrl,
    tags: tags || [],
    pinned: pinned || false,
    featured_date: featured ? new Date().toISOString().split('T')[0] : null
  };

  const insertRes = await fetch(`${supabaseUrl}/rest/v1/teachings`, {
    method: 'POST',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(insertBody)
  });

  if (!insertRes.ok) {
    const err = await insertRes.text();
    return res.status(500).json({ error: 'Insert failed', detail: err });
  }
  const inserted = await insertRes.json();
  const teaching = inserted[0];

  // Create poll if provided
  if (poll && poll.question && poll.options && poll.options.filter(o => o.trim()).length >= 2) {
    await createPoll(teaching.id, poll, supabaseUrl, serviceKey);
  }

  let emailResult = { sent: false };
  if (sendEmail) emailResult = await sendEmailBlast(title, content, finalCoverUrl);

  return res.status(200).json({ success: true, teaching, emailResult });
}

// ============ UPDATE ============
async function updateTeaching(body, supabaseUrl, serviceKey, res) {
  const { id, title, content, cover_image, video_file, video_url, tags, pinned, featured, poll } = body;

  if (!id) return res.status(400).json({ error: 'Missing id' });
  if (!content || !content.trim()) return res.status(400).json({ error: 'Content is required' });

  const update = {
    title: title || null,
    content,
    tags: tags || [],
    pinned: pinned || false
  };

  if (featured) {
    await clearTodaysFeature(supabaseUrl, serviceKey);
    update.featured_date = new Date().toISOString().split('T')[0];
  } else {
    update.featured_date = null;
  }

  if (cover_image && cover_image.startsWith('data:')) {
    const url = await uploadBase64ToStorage(cover_image, 'covers', supabaseUrl, serviceKey);
    if (url) update.cover_image = url;
  } else if (cover_image === null) {
    update.cover_image = null;
  }

  if (video_file && video_file.startsWith('data:')) {
    const url = await uploadBase64ToStorage(video_file, 'videos', supabaseUrl, serviceKey);
    if (url) update.video_url = url;
  } else if (video_url) {
    update.video_url = video_url;
  } else if (video_url === null) {
    update.video_url = null;
  }

  const r = await fetch(`${supabaseUrl}/rest/v1/teachings?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(update)
  });

  if (!r.ok) {
    const err = await r.text();
    return res.status(500).json({ error: 'Update failed', detail: err });
  }
  const updated = await r.json();

  // Handle poll: if polls were sent, delete old poll and re-create
  if (poll !== undefined) {
    // Delete existing poll (cascade will handle options/votes)
    await fetch(`${supabaseUrl}/rest/v1/polls?teaching_id=eq.${id}`, {
      method: 'DELETE',
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }
    });
    if (poll && poll.question && poll.options && poll.options.filter(o => o.trim()).length >= 2) {
      await createPoll(id, poll, supabaseUrl, serviceKey);
    }
  }

  return res.status(200).json({ success: true, teaching: updated[0] });
}

// ============ DELETE ============
async function deleteTeaching(body, supabaseUrl, serviceKey, res) {
  const { id } = body;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  const r = await fetch(`${supabaseUrl}/rest/v1/teachings?id=eq.${id}`, {
    method: 'DELETE',
    headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }
  });

  if (!r.ok) {
    const err = await r.text();
    return res.status(500).json({ error: 'Delete failed', detail: err });
  }
  return res.status(200).json({ success: true });
}

// ============ ANALYTICS ============
async function getAnalytics(body, supabaseUrl, serviceKey, res) {
  try {
    const [tRes, vRes, cRes, rRes] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/teachings?select=id,title,created_at`, { headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` } }),
      fetch(`${supabaseUrl}/rest/v1/teaching_views?select=teaching_id`, { headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` } }),
      fetch(`${supabaseUrl}/rest/v1/teaching_comments?select=teaching_id`, { headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` } }),
      fetch(`${supabaseUrl}/rest/v1/teaching_reactions?select=teaching_id`, { headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` } })
    ]);
    const teachings = await tRes.json();
    const views = await vRes.json();
    const comments = await cRes.json();
    const reactions = await rRes.json();

    const viewsBy = {}; (views || []).forEach(v => { viewsBy[v.teaching_id] = (viewsBy[v.teaching_id] || 0) + 1; });
    const commentsBy = {}; (comments || []).forEach(c => { commentsBy[c.teaching_id] = (commentsBy[c.teaching_id] || 0) + 1; });
    const reactionsBy = {}; (reactions || []).forEach(r => { reactionsBy[r.teaching_id] = (reactionsBy[r.teaching_id] || 0) + 1; });

    const result = (teachings || []).map(t => ({
      id: t.id,
      title: t.title || 'Untitled',
      created_at: t.created_at,
      views: viewsBy[t.id] || 0,
      comments: commentsBy[t.id] || 0,
      reactions: reactionsBy[t.id] || 0
    }));

    return res.status(200).json({ success: true, analytics: result });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// ============ HELPERS ============
async function createPoll(teachingId, poll, supabaseUrl, serviceKey) {
  const pollRes = await fetch(`${supabaseUrl}/rest/v1/polls`, {
    method: 'POST',
    headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
    body: JSON.stringify({ teaching_id: teachingId, question: poll.question })
  });
  if (!pollRes.ok) return;
  const pollData = await pollRes.json();
  const pollId = pollData[0].id;

  const opts = poll.options.filter(o => o.trim()).slice(0, 4);
  for (let i = 0; i < opts.length; i++) {
    await fetch(`${supabaseUrl}/rest/v1/poll_options`, {
      method: 'POST',
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ poll_id: pollId, option_text: opts[i], position: i })
    });
  }
}

async function clearTodaysFeature(supabaseUrl, serviceKey) {
  const today = new Date().toISOString().split('T')[0];
  await fetch(`${supabaseUrl}/rest/v1/teachings?featured_date=eq.${today}`, {
    method: 'PATCH',
    headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ featured_date: null })
  });
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
    headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': mime, 'x-upsert': 'true' },
    body: buffer
  });
  if (!uploadRes.ok) return null;
  return `${supabaseUrl}/storage/v1/object/public/teaching-media/${path}`;
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
  const safeContent = content.replace(/</g, '&lt;').replace(/\n\n/g, '</p><p style="margin:0 0 14px 0;">').replace(/\n/g, '<br>');
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#06060a;font-family:-apple-system,BlinkMacSystemFont,'Inter',Arial,sans-serif;"><div style="max-width:560px;margin:0 auto;padding:32px 20px;"><div style="text-align:center;margin-bottom:28px;"><div style="display:inline-block;width:56px;height:56px;background:linear-gradient(135deg,#7c3aed,#6d28d9);border-radius:16px;line-height:56px;font-size:26px;">⚡</div><h1 style="color:#a78bfa;font-size:20px;font-weight:600;letter-spacing:2px;margin:14px 0 4px 0;">MOPH ECHO</h1></div><div style="background:#10101c;border-radius:18px;padding:28px 24px;border:1px solid #2a2a3a;">${safeTitle ? `<h2 style="color:#d0d0e8;font-size:20px;font-weight:600;margin:0 0 16px 0;">${safeTitle}</h2>` : ''}${coverImage ? `<img src="${coverImage}" style="width:100%;border-radius:12px;margin-bottom:20px;">` : ''}<div style="color:#c0c0d8;font-size:15px;line-height:1.7;"><p style="margin:0 0 14px 0;">${safeContent}</p></div><div style="margin-top:28px;padding-top:20px;border-top:1px solid #2a2a3a;"><a href="https://mophecho-mirror.vercel.app" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;">Open the Mirror</a></div></div><p style="color:#4a4a5a;font-size:11px;text-align:center;margin-top:24px;">Moph Echo Support Team</p></div></body></html>`;
}
