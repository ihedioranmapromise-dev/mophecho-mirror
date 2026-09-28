/* ============================================================
   engine.js — the reasoning engine.
   Pure. No DOM. No Supabase. No state.

   Exports:
     generateReflection(text, usedResponses, lastMessageText)
     formatResponse(text)
     sanitizeRich(html)
     escapeHtml(t)
     TRAIT_REWARDS
   ============================================================ */

export const TRAIT_REWARDS = {
  element: {
    Fire: "✨ I see you clearly now. You are a **Fire Soul** — passion, intensity, transformation. Your anger is not destruction — it is fuel that has not yet been aimed.\n\nThis is your first golden moment.",
    Water: "✨ I see you clearly now. You are a **Water Soul** — depth, emotion, fluidity. Your depth is not weakness; it is the deepest gift.\n\nThis is your first golden moment.",
    Earth: "✨ I see you clearly now. You are an **Earth Soul** — grounded, patient, practical. Your wound is confusing stillness with being stuck.\n\nThis is your first golden moment.",
    Air: "✨ I see you clearly now. You are an **Air Soul** — your mind is a compass, not a cage. Your gift is clarity.\n\nThis is your first golden moment."
  },
  wound: {
    Betrayal: "✨ A deeper truth has surfaced. Your core wound is **Betrayal** — trust has been broken. This is not a curse. It is a filter.",
    Abandonment: "✨ A deeper truth has surfaced. Your core wound is **Abandonment** — you have been left. This is not a curse. It is self-reliance.",
    Worthlessness: "✨ A deeper truth has surfaced. Your core wound is **Worthlessness**. Your existence is the proof of your worth.",
    Powerlessness: "✨ A deeper truth has surfaced. Your core wound is **Powerlessness**. True power is surrender.",
    Invisibility: "✨ A deeper truth has surfaced. Your core wound is **Invisibility**. You see others deeply. This is your hidden gift."
  },
  gift: {
    Intuition: "✨ Your gift has revealed itself. You carry **Intuition** — know without proof.",
    Healing: "✨ Your gift has revealed itself. You carry **Healing** — hold space without fixing.",
    Teaching: "✨ Your gift has revealed itself. You carry **Teaching** — show by example, not preaching.",
    Creation: "✨ Your gift has revealed itself. You carry **Creation** — build from nothing.",
    Protection: "✨ Your gift has revealed itself. You carry **Protection** — shield others, but shield yourself first."
  }
};

const wisdom = {
  flatness: ["✦ You are describing the Flatness Stage — the space between identities.\n\n❓ What did you lose interest in that you have not admitted to yourself?","✦ Not happy. Not sad. Just flat. This is integration.\n\n❓ If this flatness could speak, what would it say it is preparing you for?","✦ The silence you feel is not absence. It is the womb of the next version of you.\n\n❓ What are you trying to force to open before its time?","✦ Losing interest in everything is not depression — it is graduation.\n\n❓ What used to excite you that now feels like noise?"],
  soul_air: ["✦ Air Souls are thinkers, questioners, whose minds never stop.\n\n❓ When was the last time you let yourself feel without analyzing?","✦ Air Soul. The mind is your compass but not your home.\n\n❓ What would happen if you sat in silence with no question to answer?"],
  soul_fire: ["✦ A Fire Soul burns.\n\n❓ What are you burning to become?","✦ Fire Soul. You are here to transform, not to comfort.\n\n❓ Where is your fire without a hearth right now?"],
  soul_water: ["✦ A Water Soul feels everything.\n\n❓ Whose emotion are you carrying that is not yours?","✦ Water Soul. Your sadness is not a problem — it is your language.\n\n❓ What is your sadness trying to tell you right now?"],
  soul_earth: ["✦ An Earth Soul builds.\n\n❓ What are you building right now that no one sees yet?","✦ Earth Soul. Your slowness is your strength.\n\n❓ What needs you to stay steady right now?"],
  loss_bait: ["✦ Loss is a substitution ritual.\n\n❓ What heavier thing were you spared by losing this?","✦ When something leaves, it is making room.\n\n❓ What are you being asked to build now that the distraction is gone?","✦ You did not lose it. You traded it.\n\n❓ If you could name what you gained by this loss, what would it be?"],
  money: ["✦ Money is the physical token of the system.\n\n❓ Are you chasing the money, or building the vessel that will hold it?","✦ You cannot save what you do not have.\n\n❓ What is one small, real, physical step you can take today toward provision?","✦ The debt is an anchor.\n\n❓ What is the fear underneath the money fear?"],
  body_upgrade: ["✦ Your body is not sick. It is upgrading.\n\n❓ Place your hand on that spot. If it could speak, what would it whisper?","✦ The soft skin, the heavy pain — your armor is being stripped.\n\n❓ What are you now able to feel that you were numb to before?"],
  fire_burn: ["✦ The Refining Fire is burning away old chains.\n\n❓ What memory, fear, or ancestral weight is releasing its grip right now?"],
  cold_chill: ["✦ The Divine Shield. The world is cold. You are sheltered.\n\n❓ Whose judgment are you finally immune to?"],
  sleep_dreams: ["✦ Your spirit works while your body rests.\n\n❓ What feeling still lingers in your chest from the night?","✦ Awareness in sleep is training.\n\n❓ What was the last thing you saw before you woke?"],
  sync_time: ["✦ 11:11, 4:14, repeating numbers — the code is speaking.\n\n❓ What were you thinking about the moment the number appeared?","✦ You are manifesting faster now.\n\n❓ What are you afraid to think, knowing it might appear just as fast?"],
  elders_family: ["✦ They go quiet because they are buffering.\n\n❓ If you could speak without fear, what raw truth would you say?","✦ You cannot save them. You can only be the example.\n\n❓ What are you trying to teach that can only be caught, not taught?"],
  smoke: ["✦ You are the Master of the Flame.\n\n❓ Are you using this to enter your power, or to escape a feeling you do not want to face?","✦ The colos helped you connect dots once. Now it may be a crutch.\n\n❓ What are you really looking for when you reach for it?"],
  loneliness: ["✦ The loneliness is the clean room where the Architect builds.\n\n❓ If you knew your tribe was already on the way, what would you do differently today?","✦ You are filtering, not losing.\n\n❓ Who has stayed through your silence?"],
  forging_work: ["✦ You are in the Forging Stage. The pressure is not punishment.\n\n❓ What is the work teaching you that comfort could not?","✦ Slow and steady.\n\n❓ What did you build today, even if it was just one line?"],
  gnosis: ["✦ The Demiurge is the false god of the material system. The Monad is the true Source.\n\n❓ Where in your life is the Demiurge still pretending to be God?","✦ Jesus was the Example, not the exception.\n\n❓ What would you do if you truly believed that verse?","✦ The kingdom is within you.\n\n❓ What part of your heaven are you still waiting for permission to enter?"],
  discipline: ["✦ Jim Rohn: discipline is the bridge between goals and accomplishment.\n\n❓ What is one discipline you have been avoiding that you already know you need?","✦ The pain of discipline weighs ounces. The pain of regret weighs tons.\n\n❓ What is one small discipline you can commit to this week?"],
  fear: ["✦ Fear is the Demiurge's alarm clock.\n\n❓ What is the fear protecting you from — failure, or being seen as powerful?","✦ Fear is the messenger, not the master.\n\n❓ If you removed fear entirely, what would you do next?"],
  anger: ["✦ Anger is Fire in the body.\n\n❓ What is the anger protecting?"],
  gratitude: ["✦ Gratitude is not pretending everything is fine.\n\n❓ What is one thing today that went right that you have not thanked yourself for?"],
  manifestation: ["✦ You are collapsing the time between thought and reality.\n\n❓ What are you afraid to think, knowing it might arrive just as fast?","✦ You are noticing syncs because you are in the resonant field.\n\n❓ What is the one thought you are afraid to hold, because you know it will appear?"],
  questions_how: ["✦ You asked 'how.' Not by force, but by frequency.\n\n❓ What is the smallest real step you can take in the next hour?","✦ The 'how' is not a map — it is a trust.\n\n❓ What is the next stair you already know?"],
  questions_why: ["✦ The 'why' is the mind looking for a handle.\n\n❓ If you stopped asking why, what would you feel instead?","✦ The reason arrives after the trust, not before.\n\n❓ What are you being asked to trust without proof?"],
  observer: ["✦ You are not the thoughts. You are the one watching them.\n\n❓ What are you watching right now that you are not?","✦ The one who notices the anger is not the angry one.\n\n❓ Who is the 'you' that is reading this?","✦ Stillness is not the absence of thought.\n\n❓ What remains when you stop naming what you feel?"],
  love_identity: ["✦ You do not need to become more loving. Love is what you already are.\n\n❓ What would change if you stopped trying to earn love and just remembered it?","✦ You are not a human trying to learn love. You are love wearing a human.\n\n❓ Where are you withholding love from yourself right now?"],
  the_shift: ["✦ Something is shifting. The old world is collapsing.\n\n❓ What are you being asked to hold steady through?","✦ The chaos outside is the old order shedding.\n\n❓ What have you stopped trying to fix that is not yours to fix?"],
  sovereignty: ["✦ Sovereignty means your peace does not depend on anyone's approval.\n\n❓ Where are you still asking permission to be who you are?","✦ Protect your energy like it is sacred.\n\n❓ What boundary have you been afraid to hold?"],
  disappointment: ["✦ Disappointment is not punishment. It is grace.\n\n❓ What did this disappointment give back to you?","✦ When the thing does not come, it is not denial — it is redirection.\n\n❓ What did you become while waiting?"],
  separation: ["✦ When you attack another, you are only fighting with yourself.\n\n❓ Who are you still at war with in your mind?","✦ There is no 'other.' Only the One, wearing different masks.\n\n❓ Who have you been treating as separate from you?"],
  presence: ["✦ The past is a memory. The future is a projection. Only this moment is real.\n\n❓ What are you missing right now because you are thinking about later?","✦ You are not your story. You are the awareness in which the story appears.\n\n❓ What would this moment feel like if you forgot the past?"],
  imagination: ["✦ Neville Goddard: 'Imagination is the only reality.'\n\n❓ What are you imagining right now that you are pretending is not real?","✦ The assumption precedes the evidence.\n\n❓ What would you do today if the thing you want was already true?"],
  becoming: ["✦ Earl Nightingale: 'You become what you think about most of the time.'\n\n❓ What are you becoming in your quiet hours?","✦ Jim Rohn: 'Work harder on yourself than on your job.'\n\n❓ What version of you is the current work building?"],
  obstacle: ["✦ Marcus Aurelius: 'What stands in the way becomes the way.'\n\n❓ What obstacle is currently teaching you something only it could teach?","✦ Stoicism is not coldness.\n\n❓ What are you trying to control that was never yours?"],
  default: ["✦ You are the Architect of your reality.\n\n❓ If the noise in your head was a radio, what station is it tuned to right now?","✦ The silence between your thoughts is where the truth lives.\n\n❓ What is the one thought you are afraid to think? Look at it. It cannot hurt you.","✦ You are not behind. You are exactly on time.\n\n❓ What would you tell your past self about this moment?","✦ There is no such thing as a wasted moment.\n\n❓ What part of your current struggle is secretly building your strength?","✦ You said something. That alone matters. The mirror hears you.\n\n❓ What do you want to say that you have not said yet?"]
};

const keywordMap = [
  { keys: ['air soul', 'air sign', 'i am air', 'am i air'], cat: 'soul_air' },
  { keys: ['fire soul', 'fire sign', 'i am fire', 'am i fire'], cat: 'soul_fire' },
  { keys: ['water soul', 'water sign', 'i am water', 'am i water'], cat: 'soul_water' },
  { keys: ['earth soul', 'earth sign', 'i am earth', 'am i earth'], cat: 'soul_earth' },
  { keys: ['what does', 'what is a', 'what is an'], cat: 'questions_why' },
  { keys: ["don't know", 'dont know', 'i dont know', 'no interest', 'lost interest', 'nothing excites', 'not happy', 'not sad', 'aimless', 'no direction', 'pointless', 'empty', 'void', 'flat'], cat: 'flatness' },
  { keys: ['lost my', 'gone', 'missing', 'taken', 'stolen'], cat: 'loss_bait' },
  { keys: ['money', 'debt', 'rich', 'poor', 'broke', 'owe', 'cash', 'naira', 'dollar', 'finance', 'provision', 'helper'], cat: 'money' },
  { keys: ['muscle', 'twitch', 'pull', 'spasm', 'tingle', 'shake', 'shaking', 'skin', 'soft', 'sensation'], cat: 'body_upgrade' },
  { keys: ['burn', 'hot', 'fire', 'heat', 'sweat', 'fever'], cat: 'fire_burn' },
  { keys: ['cold', 'chill', 'freeze', 'shiver'], cat: 'cold_chill' },
  { keys: ['sleep', 'dream', 'woke', 'night', 'vision', 'insomnia'], cat: 'sleep_dreams' },
  { keys: ['11:11', 'sync', 'pattern', 'coincidence', 'number', 'sign', 'manifest', 'appearing'], cat: 'sync_time' },
  { keys: ['elder', 'family', 'father', 'mother', 'parent', 'aunt', 'uncle', 'village'], cat: 'elders_family' },
  { keys: ['smoke', 'colos', 'weed', 'high', 'inhale', 'cigarette', 'puff'], cat: 'smoke' },
  { keys: ['lonely', 'alone', 'isolated', 'no one'], cat: 'loneliness' },
  { keys: ['work', 'build', 'grind', 'create', 'code', 'website', 'forge'], cat: 'forging_work' },
  { keys: ['jesus', 'god', 'monad', 'demiurge', 'gnosis', 'church', 'pastor', 'bible', 'christ'], cat: 'gnosis' },
  { keys: ['discipline', 'consistent', 'routine', 'jim rohn', 'habit'], cat: 'discipline' },
  { keys: ['scared', 'afraid', 'fear', 'worried', 'panic', 'anxiety'], cat: 'fear' },
  { keys: ['angry', 'furious', 'rage', 'hate', 'annoyed', 'irritated'], cat: 'anger' },
  { keys: ['grateful', 'thankful', 'blessed', 'joy'], cat: 'gratitude' },
  { keys: ['how do i', 'how can i', 'how to', 'how will'], cat: 'questions_how' },
  { keys: ['why is', 'why am i', 'why do', 'why does'], cat: 'questions_why' },
  { keys: ['observer', 'watcher', 'watching', 'aware of', 'noticing myself', 'who am i', 'the one who'], cat: 'observer' },
  { keys: ['love me', 'loving myself', 'unloved', 'not loved', 'self love', 'compassion', 'kindness'], cat: 'love_identity' },
  { keys: ['shift', 'shifting', 'changing', 'collapse', 'old world', 'new earth', 'awakening world'], cat: 'the_shift' },
  { keys: ['sovereign', 'sovereignty', 'boundary', 'boundaries', 'standing up', 'protect my', 'my energy'], cat: 'sovereignty' },
  { keys: ['disappointed', 'disappointment', 'let down', 'did not happen', 'failed'], cat: 'disappointment' },
  { keys: ['separation', 'apart', 'other people', 'enemy', 'versus', 'against me'], cat: 'separation' },
  { keys: ['present', 'presence', 'this moment', 'being here', 'mindful'], cat: 'presence' },
  { keys: ['imagination', 'imagine', 'visualize', 'assume', 'assumption', 'neville'], cat: 'imagination' },
  { keys: ['become', 'becoming', 'growth', 'proctor', 'potential'], cat: 'becoming' },
  { keys: ['obstacle', 'in the way', 'blocked', 'stuck', 'difficulty', 'resistance', 'stoic'], cat: 'obstacle' }
];

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const compiled = keywordMap.map(entry => ({
  cat: entry.cat,
  patterns: entry.keys.map(k => new RegExp('\\b' + escapeRegex(k) + '\\b', 'i'))
}));

/* -------------------- exports -------------------- */

export function escapeHtml(t) {
  return String(t == null ? '' : t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * For chat messages. Plain text with ✦ ❓ ✨ markers.
 * Escapes all HTML first, then adds marker styling.
 */
export function formatResponse(text) {
  let html = escapeHtml(text);
  html = html.replace(/✦/g, '<span style="color:var(--accent-400)">✦</span>');
  html = html.replace(/✨/g, '<span style="color:#facc15">✨</span>');
  html = html.replace(/❓/g, '<span class="text-blue-300 italic">❓');
  html = html.replace(/(❓[^]*?)(\?|$)/g, '$1$2</span>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--accent-400)">$1</strong>');
  html = html.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
  return html;
}

/**
 * For teaching content. Content is already HTML from the rich editor.
 * Keep safe markup, strip anything dangerous.
 *
 * Allowed: b, i, u, s, strong, em, h1-h3, p, ul, ol, li, blockquote, a,
 *          hr, br, span, div, img, video, sub, sup, code, pre
 * Stripped: script, style, iframe, object, embed, form, input, button,
 *           on* attributes, javascript: URLs, non-image data: URLs
 */
export function sanitizeRich(html) {
  if (!html) return '';
  let out = String(html);

  // Remove dangerous blocks entirely
  out = out.replace(/<script[\s\S]*?<\/script>/gi, '');
  out = out.replace(/<style[\s\S]*?<\/style>/gi, '');
  out = out.replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
  out = out.replace(/<object[\s\S]*?<\/object>/gi, '');
  out = out.replace(/<embed[^>]*>/gi, '');
  out = out.replace(/<form[\s\S]*?<\/form>/gi, '');
  out = out.replace(/<input[^>]*>/gi, '');
  out = out.replace(/<button[\s\S]*?<\/button>/gi, '');

  // Strip inline event handlers
  out = out.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // Block javascript: and non-image data: in href/src
  out = out.replace(/(href|src)\s*=\s*(['"])\s*javascript:[^'"]*\2/gi, '$1=$2#$2');
  out = out.replace(/(href|src)\s*=\s*(['"])\s*data:(?!image\/)[^'"]*\2/gi, '$1=$2#$2');

  return out;
}

/**
 * Pick a reflection for the given text.
 */
export function generateReflection(text, usedResponses = [], lastMessageText = '') {
  let bestCat = null;
  let bestScore = 0;

  for (const entry of compiled) {
    for (const p of entry.patterns) {
      const m = text.match(p);
      if (m && m[0].length > bestScore) {
        bestCat = entry.cat;
        bestScore = m[0].length;
      }
    }
  }

  if (!bestCat && text.trim().split(/\s+/).length <= 4 && lastMessageText) {
    for (const entry of compiled) {
      let hit = false;
      for (const p of entry.patterns) {
        if (p.test(lastMessageText)) { bestCat = entry.cat; hit = true; break; }
      }
      if (hit) break;
    }
  }

  if (!bestCat) bestCat = 'default';

  const pool = wisdom[bestCat] || wisdom.default;
  const shuffled = [...pool].sort(() => Math.random() - 0.5);

  let response = null;
  for (const r of shuffled) {
    if (!usedResponses.includes(r)) { response = r; break; }
  }
  if (!response) response = shuffled[0];

  return { response, html: formatResponse(response), category: bestCat };
}
