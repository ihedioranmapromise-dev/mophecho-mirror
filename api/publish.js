// /api/publish.js
// Admin: create / update / delete teachings + polls + analytics
// NOTE: Email is handled by /api/send-email — publish returns instantly.

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

async function createTeaching(body, supabaseUrl, serviceKey, res) {
  const {
    title, content, cover_image, video_file, video_url,
    tags, pinned, featured, poll,
    is_question, is_anonymous, cross_question_id
  } = body;

  const hasMedia = !!(cover_image || video_file || video_url);
  const hasContent = content && content.trim() && content.replace(/<[^>]*>/g, '').trim().length > 0;
  if (!hasContent && !hasMedia) {
    return res.status(400).json({ error: 'Add content or media before publishing' });
  }

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
    content: hasContent ? content : '',
    cover_image: finalCoverUrl,
    video_url: finalVideoUrl,
    tags: tags || [],
    pinned: pinned || false,
    featured_date: featured ? new Date().toISOString().split('T')[0] : null,
    is_question: !!is_question,
    is_anonymous: !!is_anonymous,
    cross_question_id: cross_question_id || null
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

  if (poll && poll.question && poll.options && poll.options.filter(o => o.trim()).length >= 2) {
    await createPoll(teaching.id, poll, supabaseUrl, serviceKey);
  }

  return res.status(200).json({ success: true, teaching });
}

async function updateTeaching(body, supabaseUrl, serviceKey, res) {
  const {
    id, title, content, cover_image, video_file, video_url, tags, pinned, featured, poll,
    is_question, is_anonymous, cross_question_id
  } = body;

  if (!id) return res.status(400).json({ error: 'Missing id' });

  const hasMedia = !!(cover_image || video_file || video_url);
  const hasContent = content && content.trim() && content.replace(/<[^>]*>/g, '').trim().length > 0;
  if (!hasContent && !hasMedia) {
    return res.status(400).json({ error: 'Add content or media before saving' });
  }

  const update = {
    title: title || null,
    content: hasContent ? content : '',
    tags: tags || [],
    pinned: pinned || false,
    is_question: !!is_question,
    is_anonymous: !!is_anonymous,
    cross_question_id: cross_question_id || null
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

  if (poll !== undefined) {
    await fetch(`${supabaseUrl}/rest/v1/teaching_polls?teaching_id=eq.${id}`, {
      method: 'DELETE',
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }
    });
    if (poll && poll.question && poll.options && poll.options.filter(o => o.trim()).length >= 2) {
      await createPoll(id, poll, supabaseUrl, serviceKey);
    }
  }

  return res.status(200).json({ success: true, teaching: updated[0] });
}

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

async function getAnalytics(body, supabaseUrl, serviceKey, res) {
  try {
    const [tRes, readRes, cRes, rRes, pRes, vRes] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/teachings?select=id,title,created_at,is_question,pinned&order=created_at.desc&limit=200`,
        { headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` } }),
      fetch(`${supabaseUrl}/rest/v1/teachings_read?select=teaching_id`,
        { headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` } }),
      fetch(`${supabaseUrl}/rest/v1/teaching_comments?select=teaching_id`,
        { headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` } }),
      fetch(`${supabaseUrl}/rest/v1/teaching_reactions?select=teaching_id`,
        { headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` } }),
      fetch(`${supabaseUrl}/rest/v1/teaching_polls?select=id,teaching_id`,
        { headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` } }),
      fetch(`${supabaseUrl}/rest/v1/poll_votes?select=poll_id`,
        { headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` } })
    ]);
    const teachings = await tRes.json();
    const reads = await readRes.json();
    const comments = await cRes.json();
    const reactions = await rRes.json();
    const polls = await pRes.json();
    const votes = await vRes.json();

    const readsBy = {}; (reads || []).forEach(r => { readsBy[r.teaching_id] = (readsBy[r.teaching_id] || 0) + 1; });
    const commentsBy = {}; (comments || []).forEach(c => { commentsBy[c.teaching_id] = (commentsBy[c.teaching_id] || 0) + 1; });
    const reactionsBy = {}; (reactions || []).forEach(r => { reactionsBy[r.teaching_id] = (reactionsBy[r.teaching_id] || 0) + 1; });
    const pollByT = {}; (polls || []).forEach(p => { pollByT[p.teaching_id] = p.id; });
    const votesByPoll = {}; (votes || []).forEach(v => { votesByPoll[v.poll_id] = (votesByPoll[v.poll_id] || 0) + 1; });

    const result = (teachings || []).map(t => ({
      id: t.id,
      title: t.title || 'Untitled',
      created_at: t.created_at,
      is_question: !!t.is_question,
      pinned: !!t.pinned,
      reads: readsBy[t.id] || 0,
      comments: commentsBy[t.id] || 0,
      reactions: reactionsBy[t.id] || 0,
      votes: pollByT[t.id] ? (votesByPoll[pollByT[t.id]] || 0) : 0,
      hasPoll: !!pollByT[t.id]
    }));

    return res.status(200).json({ success: true, analytics: result });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function createPoll(teachingId, poll, supabaseUrl, serviceKey) {
  const opts = poll.options.map(o => o.trim()).filter(Boolean).slice(0, 4);
  const r = await fetch(`${supabaseUrl}/rest/v1/teaching_polls`, {
    method: 'POST',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      teaching_id: teachingId,
      question: poll.question,
      options: opts
    })
  });
  if (!r.ok) {
    const err = await r.text();
    console.error('createPoll failed', err);
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
