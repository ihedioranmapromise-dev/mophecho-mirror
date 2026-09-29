/* ============================================================
   app.js — Moph Echo Mirror
   v2.5 — Delivery 1
   ============================================================ */

import {
  generateReflection,
  formatResponse,
  sanitizeRich,
  escapeHtml,
  TRAIT_REWARDS
} from './engine.js';

/* ============================================================
   NETWORK
   ============================================================ */

function showNetworkBanner(msg) {
  document.getElementById('networkBannerText').textContent = msg || 'The signal is lost. Restore your connection.';
  document.getElementById('networkBanner').classList.add('show');
}
function hideNetworkBanner() { document.getElementById('networkBanner').classList.remove('show'); }
function isOnline() { return navigator.onLine !== false; }

function describeError(e) {
  if (!navigator.onLine) return 'You are offline. Turn on data or Wi-Fi, then try again.';
  const msg = (e && e.message) || String(e || '');
  const lower = msg.toLowerCase();
  if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('load failed') || lower.includes('network request failed')) {
    return 'Cannot reach the mirror. Check your connection and try again.';
  }
  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('aborted')) {
    return 'The mirror is taking too long. Try again in a moment.';
  }
  if (lower.includes('jwt') || lower.includes('token') || lower.includes('session')) {
    return 'Your session expired. Please sign in again.';
  }
  if (lower.includes('duplicate') || lower.includes('unique')) return 'That has already been done.';
  if (msg && msg.length < 200 && !lower.includes('json')) return msg;
  return 'Something went wrong. Try again.';
}

window.addEventListener('online', () => { hideNetworkBanner(); });
window.addEventListener('offline', () => { showNetworkBanner('You are offline. Turn on data or Wi-Fi.'); });

async function safeFetch(url, options) {
  if (!isOnline()) { showNetworkBanner('You are offline. Turn on data or Wi-Fi.'); throw new Error('offline'); }
  try { return await fetch(url, options); }
  catch (e) { showNetworkBanner('Cannot reach the mirror. Check your connection.'); throw e; }
}

function retryConnection() {
  if (!isOnline()) { showNetworkBanner('Still offline. Check your network.'); return; }
  hideNetworkBanner();
  location.reload();
}

/* ============================================================
   PWA
   ============================================================ */

let deferredPrompt = null;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (!isStandalone && !localStorage.getItem('moph_install_dismissed')) {
    setTimeout(() => document.getElementById('installBanner').classList.remove('hidden'), 4000);
  }
});

window.addEventListener('load', () => {
  if (isStandalone || localStorage.getItem('moph_install_dismissed')) return;
  if (isIOS) {
    setTimeout(() => {
      document.getElementById('installText').textContent = 'Install Moph Echo Mirror';
      document.getElementById('installSub').textContent = 'Tap Share then "Add to Home Screen"';
      document.getElementById('installBtn').textContent = 'Got it';
      document.getElementById('installBtn').onclick = dismissInstall;
      document.getElementById('installBanner').classList.remove('hidden');
    }, 4000);
  }
});

function handleInstall() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(c => {
      if (c.outcome === 'accepted') dismissInstall();
      deferredPrompt = null;
    });
  } else dismissInstall();
}
function dismissInstall() {
  document.getElementById('installBanner').classList.add('hidden');
  localStorage.setItem('moph_install_dismissed', 'true');
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      reg.update().catch(() => {});
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            if (window.__moph_reloading) return;
            window.__moph_reloading = true;
            nw.postMessage({ type: 'SKIP_WAITING' });
            setTimeout(() => location.reload(), 300);
          }
        });
      });
    }).catch(() => {});
  });
}

/* ============================================================
   STATE
   ============================================================ */

let sb = null;
let signupMode = false;
let pendingEmail = '';
let notifPoll = null;

const state = {
  user: null,
  messages: [],
  profile: {
    element: null, stage: null, wound: null, gift: null,
    avatar_url: null, username: null, bio: null, website: null,
    social_x: null, social_instagram: null, social_youtube: null,
    social_tiktok: null, social_whatsapp: null, social_linkedin: null,
    privacy_element: true, privacy_stage: true, privacy_wound: true,
    privacy_gift: true, privacy_followers: true, privacy_following: true,
    theme: 'amethyst', joined_at: null, streak_count: 0,
    longest_streak: 0, last_active_date: null
  },
  goldenStars: [],
  teachings: [],
  profileCache: {},
  notifications: [],
  usedResponses: [],
  activeTag: null,
  myPosts: [],
  myReplies: [],
  mySavedRows: [],
  myBookmarks: [],
  myBookmarkedIds: new Set(),
  myBookmarkFolders: {},
  myFollowing: new Set(),
  myFollowers: new Set(),
  myMutes: new Set(),
  selectedTheme: 'amethyst',
  viewingUserId: null,
  featuredTeaching: null,
  activeSubTab: 'all',
  myPostsSearch: '',
  activeSort: 'latest',
  activeSavedFolder: '__all__',
  expandedCommentTeachingIds: new Set(),
  expandedReplies: new Set(),
  expandedProfileReplies: new Set(),
  openReplyCommentId: null,
  quoteTarget: null,
  teachingViewerId: null,
  teachingsLoaded: false,
  readTeachingIds: new Set(),
  viewerOpenedAt: 0,
  expandedCards: new Set(),
  teachingsLoading: false,
  editingCommentId: null,
  editingCommentTeachingId: null,
  quotingTeachingId: null,
  pendingBookmarkTeachingId: null,
  pendingDeleteCommentId: null,
  pendingDeleteTeachingId: null
};

const EMOJIS = ['👍','❤️','😂','😮','😢','🙏'];

const SOCIAL_ICONS = {
  social_x: { name: 'X', svg: '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>' },
  social_instagram: { name: 'Instagram', svg: '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>' },
  social_youtube: { name: 'YouTube', svg: '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>' },
  social_tiktok: { name: 'TikTok', svg: '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>' },
  social_whatsapp: { name: 'WhatsApp', svg: '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>' },
  social_linkedin: { name: 'LinkedIn', svg: '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>' }
};

/* ============================================================
   ONBOARDING
   ============================================================ */

let obStep = 0;
const obSlides = [
  { title: 'Welcome to the Mirror', body: 'It reflects what you already know but have not yet seen.' },
  { title: 'Speak. Observe. Become.', body: 'Type what you are feeling. Golden moments mark your deepest realizations.' },
  { title: 'Teachings', body: 'Reflections from the Architect. React, comment, reply, mention, ask.' }
];

function nextOnboarding() {
  obStep++;
  if (obStep >= obSlides.length) { finishOnboarding(); return; }
  document.getElementById('obTitle').textContent = obSlides[obStep].title;
  document.getElementById('obBody').textContent = obSlides[obStep].body;
  const dots = document.getElementById('obDots').children;
  for (let i = 0; i < dots.length; i++) {
    dots[i].className = 'w-2 h-2 rounded-full ' + (i <= obStep ? 'bg-amethyst-500' : 'bg-void-600');
  }
  if (obStep === obSlides.length - 1) document.getElementById('obBtn').textContent = 'Enter the Mirror';
}
function skipOnboarding() { finishOnboarding(); }
function finishOnboarding() { localStorage.setItem('moph_onboarded', 'true'); document.getElementById('onboarding').classList.add('hidden'); }
function maybeShowOnboarding() { if (localStorage.getItem('moph_onboarded') !== 'true') document.getElementById('onboarding').classList.remove('hidden'); }

/* ============================================================
   THEME
   ============================================================ */

function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme || 'amethyst');
  state.selectedTheme = theme || 'amethyst';
}
function selectTheme(theme) {
  applyTheme(theme);
  document.querySelectorAll('.theme-swatch').forEach(s => s.classList.toggle('active', s.dataset.theme === theme));
}

function readingTime(content) {
  const words = (content || '').replace(/<[^>]*>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function relativeTime(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd';
  if (diff < 2592000) return Math.floor(diff / 604800) + 'w';
  return new Date(dateStr).toLocaleDateString();
}

/* ============================================================
   AUTH
   ============================================================ */

const customStorage = {
  getItem: (key) => localStorage.getItem(key) || sessionStorage.getItem(key),
  setItem: (key, value) => {
    const r = localStorage.getItem('moph_remember') === 'true';
    if (r) { localStorage.setItem(key, value); sessionStorage.removeItem(key); }
    else { sessionStorage.setItem(key, value); localStorage.removeItem(key); }
  },
  removeItem: (key) => { localStorage.removeItem(key); sessionStorage.removeItem(key); }
};

function togglePass(id, btn) {
  const input = document.getElementById(id);
  const eo = btn.querySelector('.eye-open');
  const ec = btn.querySelector('.eye-closed');
  if (input.type === 'password') { input.type = 'text'; eo.classList.add('hidden'); ec.classList.remove('hidden'); }
  else { input.type = 'password'; eo.classList.remove('hidden'); ec.classList.add('hidden'); }
}

function toggleSignupMode() {
  signupMode = !signupMode;
  const wrap = document.getElementById('confirmPassWrap');
  const btn = document.getElementById('signInText');
  const tgl = document.getElementById('toggleBtn');
  if (signupMode) {
    wrap.classList.remove('hidden');
    btn.textContent = 'Create Account';
    tgl.textContent = 'Already have an account? Sign in';
  } else {
    wrap.classList.add('hidden');
    btn.textContent = 'Enter the Mirror';
    tgl.textContent = 'New here? Create an account';
  }
  document.getElementById('authError').classList.add('hidden');
  document.getElementById('authSuccess').classList.add('hidden');
}

function showError(m) {
  const e = document.getElementById('authError');
  const s = document.getElementById('authSuccess');
  e.textContent = m;
  e.classList.remove('hidden');
  s.classList.add('hidden');
}
function showSuccess(m) {
  const e = document.getElementById('authError');
  const s = document.getElementById('authSuccess');
  s.textContent = m;
  s.classList.remove('hidden');
  e.classList.add('hidden');
}

async function initConfig() {
  if (localStorage.getItem('moph_remember') === null) localStorage.setItem('moph_remember', 'true');
  if (!isOnline()) {
    document.getElementById('loadingMsg').textContent = 'Waiting for network...';
    document.getElementById('fatalError').classList.remove('hidden');
    document.getElementById('loadingScreen').classList.add('hidden');
    document.getElementById('fatalErrorMsg').textContent = 'You are offline. Turn on data or Wi-Fi, then tap Retry.';
    return;
  }
  try {
    const res = await safeFetch('/api/config');
    const cfg = await res.json();
    if (!cfg.supabaseUrl) throw new Error('Config missing');
    sb = supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { storage: customStorage, persistSession: true, autoRefreshToken: true }
    });
    await checkSession();
  } catch (e) {
    document.getElementById('loadingScreen').classList.add('hidden');
    document.getElementById('fatalError').classList.remove('hidden');
    document.getElementById('fatalErrorMsg').textContent = isOnline()
      ? 'Cannot reach the mirror. Check your connection and tap Retry.'
      : 'You are offline. Turn on data or Wi-Fi, then tap Retry.';
  }
}

async function checkSession() {
  const { data: { session } } = await sb.auth.getSession();
  document.getElementById('loadingScreen').classList.add('hidden');
  if (session?.user) {
    if (!session.user.email_confirmed_at) {
      pendingEmail = session.user.email;
      document.getElementById('otpEmail').textContent = pendingEmail;
      document.getElementById('otpScreen').classList.remove('hidden');
      return;
    }
    await enterApp(session.user);
  } else {
    document.getElementById('authScreen').classList.remove('hidden');
    maybeShowOnboarding();
  }
}

async function signIn() {
  const email = document.getElementById('authEmail').value.trim();
  const pass = document.getElementById('authPassword').value.trim();
  if (!isOnline()) { showError('You are offline. Turn on data or Wi-Fi, then try again.'); return; }
  if (!email || !pass) { showError('Enter email and password.'); return; }

  if (signupMode) {
    const confirm = document.getElementById('authConfirmPassword').value.trim();
    if (pass !== confirm) { showError('Passwords do not match.'); return; }
    if (pass.length < 6) { showError('Password must be at least 6 characters.'); return; }
    try {
      const { data, error } = await sb.auth.signUp({ email, password: pass });
      if (error) { showError(describeError(error)); return; }
      if (data.user) {
        pendingEmail = email;
        document.getElementById('otpEmail').textContent = email;
        document.getElementById('authScreen').classList.add('hidden');
        document.getElementById('otpScreen').classList.remove('hidden');
        document.getElementById('otpInput').focus();
      }
    } catch (e) { showError(describeError(e)); }
  } else {
    try {
      const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
      if (error) {
        if (error.message.toLowerCase().includes('email not confirmed')) {
          pendingEmail = email;
          document.getElementById('otpEmail').textContent = email;
          document.getElementById('authScreen').classList.add('hidden');
          document.getElementById('otpScreen').classList.remove('hidden');
          return;
        }
        showError(describeError(error));
        return;
      }
      if (data.user) await enterApp(data.user);
    } catch (e) { showError(describeError(e)); }
  }
}

async function verifyOtp() {
  const token = document.getElementById('otpInput').value.trim();
  const err = document.getElementById('otpError');
  err.classList.add('hidden');
  if (!token || token.length !== 6) { err.textContent = 'Enter the 6-digit code.'; err.classList.remove('hidden'); return; }
  const btn = document.getElementById('otpBtnText');
  btn.textContent = 'Verifying...';

  try {
    const { data, error } = await sb.auth.verifyOtp({ email: pendingEmail, token, type: 'signup' });
    if (error) {
      const { data: d2, error: e2 } = await sb.auth.verifyOtp({ email: pendingEmail, token, type: 'email' });
      if (e2) { err.textContent = describeError(error); err.classList.remove('hidden'); btn.textContent = 'Verify & Enter'; return; }
      if (d2.user) { document.getElementById('otpScreen').classList.add('hidden'); await enterApp(d2.user); return; }
    }
    if (data?.user) { document.getElementById('otpScreen').classList.add('hidden'); await enterApp(data.user); }
    else { err.textContent = 'That code did not work. Try again.'; err.classList.remove('hidden'); btn.textContent = 'Verify & Enter'; }
  } catch (e) {
    err.textContent = describeError(e); err.classList.remove('hidden'); btn.textContent = 'Verify & Enter';
  }
}

async function resendOtp() {
  try {
    const { error } = await sb.auth.resend({ type: 'signup', email: pendingEmail });
    const err = document.getElementById('otpError');
    if (error) { err.textContent = describeError(error); err.classList.remove('hidden'); }
    else { err.textContent = 'Code resent.'; err.classList.remove('hidden', 'text-red-400'); err.classList.add('text-green-400'); }
  } catch (e) {
    const err = document.getElementById('otpError');
    err.textContent = describeError(e); err.classList.remove('hidden');
  }
}
function backToAuth() {
  document.getElementById('otpScreen').classList.add('hidden');
  document.getElementById('authScreen').classList.remove('hidden');
  document.getElementById('otpInput').value = '';
}

function confirmSignOut() {
  const ok = window.confirm('Sign out of the Mirror? You will need your email to return.');
  if (ok) performSignOut();
}
async function performSignOut() {
  if (notifPoll) { clearInterval(notifPoll); notifPoll = null; }
  await sb.auth.signOut();
  location.reload();
}

/* ============================================================
   ENTER APP
   ============================================================ */

async function enterApp(user) {
  state.user = user;
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('otpScreen').classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');
  document.getElementById('userEmail').textContent = user.email;
  showTeachingsSkeleton();

  await loadProfile();
  applyTheme(state.profile.theme || 'amethyst');
  updateStreakUI();
  renderProfile();
  await loadMessages();
  renderChat();
  document.getElementById('userInput').focus();
  maybeShowOnboarding();
  logActivity('app_open');

  Promise.all([
    loadGoldenStars(),
    loadTeachings(),
    loadNotifications(),
    loadFollowing(),
    loadBookmarks(),
    loadFollowers(),
    loadReadState(),
    loadMutes()
  ]).then(() => {
    renderProfile(); renderTeachings(); renderNotifications();
    const savedTab = localStorage.getItem('moph_active_tab');
    if (savedTab && ['chat','teachings','profile'].includes(savedTab) && savedTab !== 'chat') switchTab(savedTab);
    const savedSub = localStorage.getItem('moph_active_subtab');
    if (savedSub && ['all','following','qa','polls'].includes(savedSub)) switchSubTab(savedSub);
  }).catch(err => console.error('Load error:', err));

  updateStreak();
  if (notifPoll) clearInterval(notifPoll);
  notifPoll = setInterval(() => {
    if (document.visibilityState === 'visible' && state.user) loadNotifications();
  }, 30000);

  attachPullToRefresh();
}

/* ============================================================
   PULL TO REFRESH
   ============================================================ */

function attachPullToRefresh() {
  const app = document.getElementById('mainApp');
  if (!app) return;

  let startY = 0, pulling = false, indicator = null;
  let currentPanel = null;

  function getActiveScrollContainer() {
    if (!document.getElementById('panelChat').classList.contains('hidden')) {
      return { panel: 'chat', el: document.getElementById('chatContainer') };
    }
    if (!document.getElementById('panelTeachings').classList.contains('hidden')) {
      return { panel: 'teachings', el: document.getElementById('panelTeachings') };
    }
    if (!document.getElementById('panelProfile').classList.contains('hidden')) {
      return { panel: 'profile', el: document.getElementById('panelProfile') };
    }
    return null;
  }

  async function doRefresh(panel) {
    try {
      if (panel === 'chat') { state.messages = []; await loadMessages(); renderChat(); }
      else if (panel === 'teachings') { await loadTeachings(true); await loadReadState(); renderTeachings(); }
      else if (panel === 'profile') { await Promise.all([loadFollowing(), loadFollowers(), loadBookmarks(), loadMyPosts(), loadMyReplies(), loadGoldenStars()]); renderProfile(); }
    } catch (e) { console.error('refresh error', e); }
  }

  app.addEventListener('touchstart', (e) => {
    if (e.target.closest('input, textarea, [contenteditable="true"]')) return;
    const active = getActiveScrollContainer();
    if (!active) return;
    if (active.el.scrollTop <= 0) {
      startY = e.touches[0].clientY;
      pulling = true;
      currentPanel = active.panel;
    }
  }, { passive: true });

  app.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0) {
      pulling = false;
      if (indicator) { indicator.remove(); indicator = null; }
      return;
    }
    if (dy > 20 && !indicator) {
      indicator = document.createElement('div');
      indicator.style.cssText = 'position:fixed;top:130px;left:50%;transform:translateX(-50%);z-index:50;padding:10px 16px;border-radius:20px;background:rgba(16,16,28,0.95);border:1px solid rgba(var(--accent-rgb),0.5);color:#fff;font-size:12px;font-weight:500;display:flex;align-items:center;gap:8px;pointer-events:none;box-shadow:0 8px 24px rgba(0,0,0,0.5);min-width:150px;justify-content:center;';
      indicator.innerHTML = '<div class="spinner" style="width:12px;height:12px;"></div><span>Release to refresh</span>';
      document.body.appendChild(indicator);
    }
    if (indicator) indicator.style.opacity = Math.max(0.75, Math.min(1, dy / 80));
  }, { passive: true });

  app.addEventListener('touchend', async () => {
    if (!pulling) return;
    pulling = false;
    if (indicator && currentPanel) {
      indicator.innerHTML = '<div class="spinner" style="width:12px;height:12px;"></div><span>Refreshing…</span>';
      await doRefresh(currentPanel);
      setTimeout(() => {
        if (indicator) { indicator.remove(); indicator = null; }
      }, 600);
    } else if (indicator) {
      indicator.remove();
      indicator = null;
    }
    currentPanel = null;
  });
}

/* ============================================================
   ACTIVITY
   ============================================================ */

async function logActivity(kind) {
  try {
    if (!state.user) return;
    await sb.from('activity_log').insert({
      user_id: state.user.id,
      kind,
      day: new Date().toISOString().split('T')[0]
    });
  } catch (e) { /* silent */ }
}

async function loadActivityCalendar() {
  try {
    const since = new Date(Date.now() - 29 * 86400000).toISOString().split('T')[0];
    const { data, error } = await sb.from('activity_log').select('kind, day').eq('user_id', state.user.id).gte('day', since);
    if (error) return;
    const rows = data || [];
    const grid = document.getElementById('activityGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const today = new Date().toISOString().split('T')[0];
    const counts = {};
    rows.forEach(r => { counts[r.day] = (counts[r.day] || 0) + 1; });
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
      const n = counts[d] || 0;
      const cell = document.createElement('div');
      cell.className = 'activity-cell';
      if (n === 1) cell.classList.add('a1');
      else if (n === 2) cell.classList.add('a2');
      else if (n >= 3) cell.classList.add('a3');
      if (d === today) cell.classList.add('today');
      cell.title = `${d}: ${n} action${n === 1 ? '' : 's'}`;
      grid.appendChild(cell);
    }
    const by = k => rows.filter(r => r.kind === k).length;
    const so = document.getElementById('statOpens'); if (so) so.textContent = by('app_open');
    const sc = document.getElementById('statComments'); if (sc) sc.textContent = by('comment');
    const sbk = document.getElementById('statBookmarks'); if (sbk) sbk.textContent = by('bookmark');
    const sqa = document.getElementById('statQA'); if (sqa) sqa.textContent = by('qa_answer');
    const sv = document.getElementById('statVotes'); if (sv) sv.textContent = by('poll_vote');
  } catch (e) { /* silent */ }
}

/* ============================================================
   READ STATE
   ============================================================ */

async function loadReadState() {
  if (!state.user) return;
  try {
    const { data, error } = await sb.from('teachings_read').select('teaching_id').eq('user_id', state.user.id);
    if (error) return;
    state.readTeachingIds = new Set((data || []).map(r => r.teaching_id));
  } catch (e) { /* silent */ }
}

async function markTeachingRead(teachingId) {
  if (!state.user) return;
  if (state.readTeachingIds.has(teachingId)) return;
  state.readTeachingIds.add(teachingId);
  try {
    await sb.from('teachings_read').insert({ user_id: state.user.id, teaching_id: teachingId });
  } catch (e) { /* silent */ }
}

/* ============================================================
   MUTES
   ============================================================ */

async function loadMutes() {
  if (!state.user) return;
  try {
    const { data, error } = await sb.from('mutes').select('muted_user_id').eq('user_id', state.user.id);
    if (error) return;
    state.myMutes = new Set((data || []).map(m => m.muted_user_id));
  } catch (e) { /* silent */ }
}

async function muteUser(userId) {
  if (userId === state.user.id) return;
  try {
    await sb.from('mutes').insert({ user_id: state.user.id, muted_user_id: userId });
    state.myMutes.add(userId);
    return true;
  } catch (e) { alert(describeError(e)); return false; }
}

async function unmuteUser(userId) {
  try {
    await sb.from('mutes').delete().eq('user_id', state.user.id).eq('muted_user_id', userId);
    state.myMutes.delete(userId);
    return true;
  } catch (e) { alert(describeError(e)); return false; }
}

async function toggleMuteUser(userId, btn) {
  if (userId === state.user.id) return;
  const isMuted = state.myMutes.has(userId);
  if (isMuted) {
    await unmuteUser(userId);
    if (btn) { btn.textContent = 'Mute'; btn.className = 'text-[11px] text-gray-400 hover:text-red-400 transition'; }
  } else {
    await muteUser(userId);
    if (btn) { btn.textContent = 'Unmute'; btn.className = 'text-[11px] text-red-400 hover:text-red-300 transition'; }
  }
  renderTeachings();
}

/* ============================================================
   PUSH
   ============================================================ */

function enablePush() {
  const btn = document.getElementById('pushEnableBtn');
  if (!('Notification' in window)) { alert('Notifications are not supported on this device.'); return; }
  if (Notification.permission === 'granted') { btn.classList.add('enabled'); btn.textContent = 'Notifications enabled'; btn.disabled = true; return; }
  Notification.requestPermission().then(perm => {
    if (perm === 'granted') {
      btn.classList.add('enabled');
      btn.textContent = 'Notifications enabled';
      btn.disabled = true;
      try { new Notification('Moph Echo Mirror', { body: 'The mirror will signal you when someone speaks.' }); } catch (e) {}
    } else {
      btn.textContent = 'Permission denied — try again';
    }
  });
}
function refreshPushButton() {
  const btn = document.getElementById('pushEnableBtn');
  if (!btn) return;
  if ('Notification' in window && Notification.permission === 'granted') {
    btn.classList.add('enabled');
    btn.textContent = 'Notifications enabled';
    btn.disabled = true;
  }
}

/* ============================================================
   STREAK
   ============================================================ */

async function updateStreak() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const last = state.profile.last_active_date;
    if (last === today) return;
    let newStreak = 1;
    if (last) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      if (last === yesterday) newStreak = (state.profile.streak_count || 0) + 1;
      else newStreak = 1;
    }
    const longest = Math.max(state.profile.longest_streak || 0, newStreak);
    await sb.from('profiles').update({ streak_count: newStreak, longest_streak: longest, last_active_date: today }).eq('id', state.user.id);
    state.profile.streak_count = newStreak;
    state.profile.longest_streak = longest;
    state.profile.last_active_date = today;
    updateStreakUI();
  } catch (e) { console.error(e); }
}

function updateStreakUI() {
  const c = state.profile.streak_count || 0;
  const hb = document.getElementById('streakBadge'), hc = document.getElementById('streakCount');
  const pb = document.getElementById('streakBadgeProfile'), pc = document.getElementById('streakCountProfile');
  if (c >= 2) { hb.classList.remove('hidden'); hc.textContent = c; pb.classList.remove('hidden'); pc.textContent = c; }
  else { hb.classList.add('hidden'); pb.classList.add('hidden'); }
  const ps = document.getElementById('pStreak'), pl = document.getElementById('pLongestStreak');
  if (ps) ps.textContent = c + (c === 1 ? ' day' : ' days');
  if (pl) pl.textContent = (state.profile.longest_streak || 0) + ' days';
}

function showTeachingsSkeleton() {
  const el = document.getElementById('teachingsFeed');
  el.innerHTML = Array(3).fill(0).map(() => `<div class="glass card border border-void-600 p-4 space-y-3"><div class="skeleton h-4 w-3/4"></div><div class="skeleton h-3 w-full"></div><div class="skeleton h-3 w-5/6"></div></div>`).join('');
}

/* ============================================================
   PROFILE DATA
   ============================================================ */

async function loadProfile() {
  const { data, error } = await sb.from('profiles').select('*').eq('id', state.user.id).single();
  if (error || !data) {
    const emailPrefix = (state.user.email || 'architect').split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
    let base = emailPrefix.length >= 3 ? emailPrefix : 'architect';
    let username = base, counter = 0;
    while (true) {
      const { data: ex } = await sb.from('profiles').select('id').ilike('username', username).limit(1);
      if (!ex || ex.length === 0) break;
      counter++;
      username = base + '_' + counter;
    }
    await sb.from('profiles').insert({ id: state.user.id, username });
    return loadProfile();
  }
  state.profile = { ...state.profile, ...data };
  state.profileCache[state.user.id] = { username: state.profile.username, avatar_url: state.profile.avatar_url };
  if (state.profile.avatar_url) {
    document.getElementById('avatarUpload').innerHTML = `<img src="${state.profile.avatar_url}" class="w-full h-full object-cover"><input type="file" id="avatarInput" accept="image/*" class="hidden">`;
    document.getElementById('avatarInput').addEventListener('change', handleAvatarUpload);
  }
  document.getElementById('displayUsername').textContent = '@' + (state.profile.username || 'architect');
}

async function saveProfile() {
  await sb.from('profiles').update({
    element: state.profile.element,
    stage: state.profile.stage,
    wound: state.profile.wound,
    gift: state.profile.gift,
    updated_at: new Date().toISOString()
  }).eq('id', state.user.id);
}

async function loadMessages() {
  const { data } = await sb.from('journal_entries').select('role, content, created_at').eq('user_id', state.user.id).order('created_at', { ascending: true }).limit(200);
  if (data) state.messages = data.map(m => ({ role: m.role, text: m.content }));
}
async function saveMessage(role, text) {
  await sb.from('journal_entries').insert({ user_id: state.user.id, role, content: text });
}

async function loadGoldenStars() {
  const { data } = await sb.from('golden_moments').select('*').eq('user_id', state.user.id).order('created_at', { ascending: false });
  if (data) state.goldenStars = data.map(g => ({
    text: g.content,
    trait_type: g.trait_type || null,
    trait_value: g.trait_value || null,
    date: new Date(g.created_at).toLocaleString()
  }));
}
async function saveGoldenStar(text, trait_type, trait_value) {
  await sb.from('golden_moments').insert({ user_id: state.user.id, content: text, trait_type, trait_value });
  state.goldenStars.unshift({ text, trait_type, trait_value, date: new Date().toLocaleString() });
}

/* ============================================================
   FOLLOWS / BOOKMARKS / FOLDERS
   ============================================================ */

async function loadFollowing() {
  const { data } = await sb.from('follows').select('to_user').eq('from_user', state.user.id);
  state.myFollowing = new Set((data || []).map(f => f.to_user));
}
async function loadFollowers() {
  const { data } = await sb.from('follows').select('from_user').eq('to_user', state.user.id);
  state.myFollowers = new Set((data || []).map(f => f.from_user));
  document.getElementById('followersCount').textContent = state.myFollowers.size;
  document.getElementById('followingCount').textContent = state.myFollowing.size;
}
async function followUser(toUserId, btn) {
  if (toUserId === state.user.id) return;
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  try {
    await sb.from('follows').insert({ from_user: state.user.id, to_user: toUserId });
    state.myFollowing.add(toUserId);
    if (btn) { btn.className = 'follow-btn following'; btn.textContent = 'Following'; btn.disabled = false; }
    await sb.from('notifications').insert({
      user_id: toUserId, type: 'follow',
      actor_id: state.user.id, actor_username: state.profile.username,
      message: '@' + state.profile.username + ' started following you'
    });
  } catch (e) { if (btn) { btn.disabled = false; btn.textContent = 'Follow'; } }
}
async function unfollowUser(toUserId, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  try {
    await sb.from('follows').delete().eq('from_user', state.user.id).eq('to_user', toUserId);
    state.myFollowing.delete(toUserId);
    if (btn) { btn.className = 'follow-btn not-following'; btn.textContent = 'Follow'; btn.disabled = false; }
  } catch (e) { if (btn) { btn.disabled = false; btn.textContent = 'Following'; } }
}
function toggleFollow(toUserId, btn) {
  if (state.myFollowing.has(toUserId)) unfollowUser(toUserId, btn);
  else followUser(toUserId, btn);
}

async function loadBookmarks() {
  const { data } = await sb.from('bookmarks').select('teaching_id, folder').eq('user_id', state.user.id);
  state.myBookmarkedIds = new Set((data || []).map(b => b.teaching_id));
  state.myBookmarkFolders = {};
  (data || []).forEach(b => { state.myBookmarkFolders[b.teaching_id] = b.folder || null; });
  state.mySavedRows = data || [];
}

async function toggleBookmark(teachingId, btn) {
  const isBookmarked = state.myBookmarkedIds.has(teachingId);
  if (isBookmarked) {
    await sb.from('bookmarks').delete().eq('user_id', state.user.id).eq('teaching_id', teachingId);
    state.myBookmarkedIds.delete(teachingId);
    delete state.myBookmarkFolders[teachingId];
    if (btn) btn.classList.remove('active');
    renderSavedFolderChips();
  } else {
    await sb.from('bookmarks').insert({ user_id: state.user.id, teaching_id: teachingId });
    state.myBookmarkedIds.add(teachingId);
    state.myBookmarkFolders[teachingId] = null;
    if (btn) btn.classList.add('active');
    logActivity('bookmark');
  }
  document.querySelectorAll(`[data-bookmark-btn="${teachingId}"]`).forEach(b => {
    b.classList.toggle('active', state.myBookmarkedIds.has(teachingId));
    b.querySelector('svg')?.setAttribute('fill', state.myBookmarkedIds.has(teachingId) ? 'currentColor' : 'none');
  });
  if (!document.getElementById('profileSaved').classList.contains('hidden')) loadMySaved();
}

async function setBookmarkFolder(teachingId, folder) {
  try {
    await sb.from('bookmarks').update({ folder: folder || null }).eq('user_id', state.user.id).eq('teaching_id', teachingId);
    state.myBookmarkFolders[teachingId] = folder || null;
    renderSavedFolderChips();
    renderMySavedList();
  } catch (e) { alert(describeError(e)); }
}

function filterSavedFolder(folder) {
  state.activeSavedFolder = folder;
  document.querySelectorAll('.folder-chip').forEach(c => c.classList.toggle('active', c.dataset.folder === folder));
  renderMySavedList();
}

function renderSavedFolderChips() {
  const wrap = document.getElementById('folderChips');
  if (!wrap) return;
  const folders = new Set();
  Object.values(state.myBookmarkFolders).forEach(f => { if (f) folders.add(f); });
  const sorted = [...folders].sort();
  wrap.innerHTML = `
    <button class="folder-chip ${state.activeSavedFolder === '__all__' ? 'active' : ''}" data-folder="__all__" onclick="filterSavedFolder('__all__')">All</button>
    <button class="folder-chip ${state.activeSavedFolder === '__none__' ? 'active' : ''}" data-folder="__none__" onclick="filterSavedFolder('__none__')">Unfiled</button>
    ${sorted.map(f => `<button class="folder-chip ${state.activeSavedFolder === f ? 'active' : ''}" data-folder="${escapeHtml(f)}" onclick="filterSavedFolder('${escapeHtml(f)}')">${escapeHtml(f)}</button>`).join('')}
  `;
}

async function loadMySaved() {
  const el = document.getElementById('mySavedList');
  el.innerHTML = '<p class="text-xs text-gray-600 text-center py-6">Loading...</p>';
  await loadBookmarks();
  renderSavedFolderChips();
  renderMySavedList();
}

function renderMySavedList() {
  const el = document.getElementById('mySavedList');
  const filter = state.activeSavedFolder;
  const ids = [...state.myBookmarkedIds].filter(id => {
    const f = state.myBookmarkFolders[id] || null;
    if (filter === '__all__') return true;
    if (filter === '__none__') return !f;
    return f === filter;
  });
  if (ids.length === 0) {
    el.innerHTML = '<div class="glass card p-6 border border-void-600 text-center"><p class="text-xs text-gray-600">Nothing saved here yet.</p></div>';
    return;
  }
  const saved = state.teachings.filter(t => ids.includes(t.id));
  if (saved.length === 0) {
    el.innerHTML = '<div class="glass card p-6 border border-void-600 text-center"><p class="text-xs text-gray-600">Nothing saved yet.</p></div>';
    return;
  }
  el.innerHTML = saved.map(t => {
    const f = state.myBookmarkFolders[t.id] || null;
    return `<div class="post-card cursor-pointer min-w-0" onclick="openTeachingViewer(${t.id})">
      <h4 class="text-sm font-semibold text-gray-200 mb-1.5 break-words">${escapeHtml(t.title || 'Untitled')}</h4>
      <p class="text-xs text-gray-500 line-clamp-2">${escapeHtml((t.content || '').replace(/<[^>]*>/g,'').substring(0, 120))}...</p>
      <div class="flex items-center justify-between mt-2">
        <p class="text-[10px] text-gray-600">${readingTime(t.content)} min read</p>
        <button onclick="event.stopPropagation(); moveToFolder(${t.id})" class="text-[10px] text-amethyst-400 hover:text-amethyst-300">${f ? '📁 ' + escapeHtml(f) : '📁 Move to folder'}</button>
      </div>
    </div>`;
  }).join('');
}

function moveToFolder(teachingId) {
  const current = state.myBookmarkFolders[teachingId] || '';
  const name = window.prompt('Move to folder (leave empty to unfile):', current);
  if (name === null) return;
  setBookmarkFolder(teachingId, name.trim() || null);
}

function closeFolderPicker() {
  const modal = document.getElementById('folderPickerModal');
  if (modal) modal.classList.add('hidden');
  document.body.style.overflow = '';
  state.pendingBookmarkTeachingId = null;
}

function createNewFolder() {
  const name = document.getElementById('newFolderName').value.trim();
  if (!name) { alert('Enter a folder name.'); return; }
  if (state.pendingBookmarkTeachingId) {
    setBookmarkFolder(state.pendingBookmarkTeachingId, name);
  }
  closeFolderPicker();
  renderSavedFolderChips();
  renderMySavedList();
}

/* ============================================================
   TEACHINGS LOADING
   ============================================================ */

async function loadTeachings(force = false) {
  if (state.teachingsLoaded && !force) return;
  state.teachingsLoading = true;
  renderTeachings();
  try {
    const { data: teachings, error } = await sb.from('teachings').select('*').order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(50);
    if (error || !teachings) { state.teachings = []; return; }
    const ids = teachings.map(t => t.id);
    if (ids.length === 0) { state.teachings = []; state.teachingsLoaded = true; return; }

    const { data: allComments } = await sb.from('teaching_comments').select('*').in('teaching_id', ids);
    const cids = (allComments || []).map(c => c.id);
    const { data: tReactions } = await sb.from('teaching_reactions').select('*').in('teaching_id', ids);
    const { data: cReactions } = cids.length > 0 ? await sb.from('comment_reactions').select('*').in('comment_id', cids) : { data: [] };

    let polls = [], votes = [];
    try {
      const { data: p } = await sb.from('teaching_polls').select('*').in('teaching_id', ids);
      polls = p || [];
      const pollIds = polls.map(x => x.id);
      if (pollIds.length) {
        const { data: v } = await sb.from('poll_votes').select('*').in('poll_id', pollIds);
        votes = v || [];
      }
    } catch (e) { /* polls missing */ }

    const userIds = new Set();
    (allComments || []).forEach(c => userIds.add(c.user_id));
    if (userIds.size > 0) {
      const { data: profiles } = await sb.from('profiles').select('id, username, avatar_url').in('id', [...userIds]);
      (profiles || []).forEach(p => { state.profileCache[p.id] = { username: p.username || 'architect', avatar_url: p.avatar_url }; });
      [...userIds].forEach(id => { if (!state.profileCache[id]) state.profileCache[id] = { username: 'architect', avatar_url: null }; });
    }

    const trByT = {};
    (tReactions || []).forEach(r => { if (!trByT[r.teaching_id]) trByT[r.teaching_id] = []; trByT[r.teaching_id].push(r); });
    const crByC = {};
    (cReactions || []).forEach(r => { if (!crByC[r.comment_id]) crByC[r.comment_id] = []; crByC[r.comment_id].push(r); });
    const cByT = {};
    (allComments || []).forEach(c => {
      if (!cByT[c.teaching_id]) cByT[c.teaching_id] = [];
      cByT[c.teaching_id].push({ ...c, reactions: crByC[c.id] || [] });
    });

    const pollByT = {};
    polls.forEach(p => { pollByT[p.teaching_id] = p; });
    const votesByPoll = {};
    votes.forEach(v => { if (!votesByPoll[v.poll_id]) votesByPoll[v.poll_id] = []; votesByPoll[v.poll_id].push(v); });

    state.teachings = teachings.map(t => {
      const poll = pollByT[t.id] || null;
      const pollVotes = poll ? (votesByPoll[poll.id] || []) : [];
      return { ...t, reactions: trByT[t.id] || [], comments: cByT[t.id] || [], poll, pollVotes };
    });

    state.teachingsLoaded = true;

    const today = new Date().toISOString().split('T')[0];
    state.featuredTeaching = state.teachings.find(t => t.featured_date === today) || null;
    renderTagFilters();
    renderFeaturedBanner();
  } catch (e) { state.teachings = []; }
  finally {
    state.teachingsLoading = false;
    renderTeachings();
  }
}

function renderFeaturedBanner() {
  const el = document.getElementById('featuredBanner');
  if (!state.featuredTeaching) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.innerHTML = `<div style="background:linear-gradient(135deg, rgba(var(--accent-rgb),0.2), rgba(var(--accent-rgb),0.08)); border:1px solid rgba(var(--accent-rgb),0.4); border-radius:1.25rem; padding:14px 18px;">
    <span class="text-[10px] px-2 py-0.5 rounded-full bg-gold-400/20 text-gold-300 border border-gold-400/40 font-semibold tracking-wider">TODAY'S TEACHING</span>
    <h3 class="text-base font-semibold text-gray-100 mt-2 mb-1 break-words">${escapeHtml(state.featuredTeaching.title || 'Untitled')}</h3>
    <button onclick="openTeachingViewer(${state.featuredTeaching.id})" class="mt-2 text-[10px] text-amethyst-400 hover:text-amethyst-300 font-semibold">Open →</button>
  </div>`;
}

function renderTagFilters() {
  const el = document.getElementById('tagFilters');
  if (state.activeSubTab !== 'all') {
    el.innerHTML = '';
    el.classList.add('hidden');
    return;
  }
  el.classList.remove('hidden');
  const allTags = new Set();
  state.teachings.forEach(t => (t.tags || []).forEach(tag => allTags.add(tag)));
  if (allTags.size === 0) { el.innerHTML = ''; return; }
  el.innerHTML = `<button onclick="setTag(null)" class="text-[10px] px-3 py-1.5 rounded-full transition max-w-[180px] truncate ${!state.activeTag ? 'bg-amethyst-600/40 text-amethyst-200 border border-amethyst-500/40' : 'bg-void-800 text-gray-400 border border-void-600'}">All</button>` +
    [...allTags].map(tag => `<button onclick="setTag('${escapeHtml(tag)}')" class="text-[10px] px-3 py-1.5 rounded-full transition max-w-[180px] truncate ${state.activeTag === tag ? 'bg-amethyst-600/40 text-amethyst-200 border border-amethyst-500/40' : 'bg-void-800 text-gray-400 border border-void-600'}" title="${escapeHtml(tag)}">#${escapeHtml(tag)}</button>`).join('');
}
function setTag(tag) { state.activeTag = tag; renderTagFilters(); filterTeachings(); }

function setSort(sort) {
  state.activeSort = sort;
  document.querySelectorAll('.sort-pill').forEach(p => p.classList.toggle('active', p.dataset.sort === sort));
  filterTeachings();
}

function switchSubTab(tab) {
  state.activeSubTab = tab;
  localStorage.setItem('moph_active_subtab', tab);
  document.getElementById('subTabAll').classList.toggle('active', tab === 'all');
  document.getElementById('subTabFollowing').classList.toggle('active', tab === 'following');
  document.getElementById('subTabQA').classList.toggle('active', tab === 'qa');
  document.getElementById('subTabPolls').classList.toggle('active', tab === 'polls');
  const searchWrap = document.getElementById('searchWrap');
  if (searchWrap) searchWrap.classList.toggle('hidden', tab !== 'all');
  const sortWrap = document.getElementById('sortWrap');
  if (sortWrap) sortWrap.classList.toggle('hidden', tab !== 'all');
  renderTagFilters();
  renderTeachings();
}

function computeReactionCount(t) {
  return (t.reactions || []).length;
}

function sortTeachings(list) {
  const now = Date.now();
  const sorted = [...list];
  if (state.activeSort === 'latest') {
    sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } else if (state.activeSort === 'top-week') {
    const weekAgo = now - 7 * 86400000;
    sorted.sort((a, b) => {
      const aIn = new Date(a.created_at).getTime() >= weekAgo ? 1 : 0;
      const bIn = new Date(b.created_at).getTime() >= weekAgo ? 1 : 0;
      if (aIn !== bIn) return bIn - aIn;
      return computeReactionCount(b) - computeReactionCount(a);
    });
  } else if (state.activeSort === 'top-all') {
    sorted.sort((a, b) => computeReactionCount(b) - computeReactionCount(a));
  }
  return sorted;
}

function filterTeachings() {
  const el = document.getElementById('teachingsFeed');
  if (state.teachingsLoading) {
    el.innerHTML = '<div class="glass card p-8 border border-void-600 text-center"><div class="spinner mx-auto mb-3"></div><p class="text-xs text-gray-500">Loading teachings…</p></div>';
    return;
  }
  if (state.activeSubTab === 'following') { renderFollowingFeed(); return; }
  if (state.activeSubTab === 'qa') { renderQaFeed(); return; }
  if (state.activeSubTab === 'polls') { renderPollsFeed(); return; }

  const q = (document.getElementById('searchInput').value || '').toLowerCase().trim();
  let filtered = state.teachings;
  if (state.activeTag) filtered = filtered.filter(t => (t.tags || []).includes(state.activeTag));
  if (q) filtered = filtered.filter(t => ((t.title || '') + ' ' + (t.content || '')).toLowerCase().includes(q));
  filtered = sortTeachings(filtered);
  if (filtered.length === 0) {
    el.innerHTML = `<div class="glass card p-6 border border-void-600 text-center"><p class="text-xs text-gray-600">Nothing matches.</p></div>`;
    return;
  }
  el.innerHTML = filtered.map(t => renderTeachingPost(t)).join('');
}

function renderFollowingFeed() {
  const el = document.getElementById('teachingsFeed');
  const followedIds = [...state.myFollowing];
  if (followedIds.length === 0) {
    el.innerHTML = '<div class="glass card p-6 border border-void-600 text-center"><p class="text-xs text-gray-600">You are not following anyone yet. Tap a @username in any comment to view their profile and follow.</p></div>';
    return;
  }
  const posts = [];
  state.teachings.forEach(t => {
    t.comments.forEach(c => {
      if (followedIds.includes(c.user_id) && !state.myMutes.has(c.user_id)) posts.push({ comment: c, teaching: t });
    });
  });
  posts.sort((a, b) => new Date(b.comment.created_at) - new Date(a.comment.created_at));
  if (posts.length === 0) {
    el.innerHTML = '<div class="glass card p-6 border border-void-600 text-center"><p class="text-xs text-gray-600">No recent activity from the people you follow.</p></div>';
    return;
  }
  el.innerHTML = posts.slice(0, 40).map(p => renderFollowPost(p.comment, p.teaching)).join('');
}

function renderFollowPost(c, t) {
  const info = state.profileCache[c.user_id] || { username: 'architect', avatar_url: null };
  return `<article class="post-card fade-in">
    <div class="flex items-center gap-2 mb-3 text-xs text-gray-500 min-w-0">
      <button onclick="openPublicProfile('${c.user_id}')">${avatarHtml(c.user_id, 'xs')}</button>
      <button onclick="openPublicProfile('${c.user_id}')" class="text-amethyst-300 font-medium hover:underline truncate max-w-[120px]">@${escapeHtml(info.username)}</button>
      <span>·</span><span class="flex-shrink-0">${relativeTime(c.created_at)}</span>
    </div>
    <button onclick="openTeachingViewer(${t.id}, {scrollToComments: true})" class="text-[10px] px-3 py-1.5 rounded-full bg-void-800 border border-void-600 text-gray-400 hover:border-amethyst-500/40 hover:text-amethyst-400 transition mb-2 inline-flex items-center gap-1.5 max-w-full">
      <span class="truncate">Replying on: ${escapeHtml(t.title || 'Untitled')}</span>
    </button>
    ${c.content ? `<p class="text-sm text-gray-200 prose-content clamp-4">${escapeHtml(c.content)}</p>` : ''}
    ${c.image_url ? `<img src="${escapeHtml(c.image_url)}" class="rounded-2xl mt-3 max-h-64 object-cover cursor-pointer" loading="lazy" onclick="openImageViewer('${escapeHtml(c.image_url)}')">` : ''}
    <div class="mt-3" onclick="event.stopPropagation()">${reactionTriggerHtml(c, 'comment')}</div>
    <div class="flex items-center justify-between mt-3.5 pt-3 border-t border-void-600/50">
      <button onclick="openTeachingViewer(${t.id})" class="text-[10px] text-gray-500 hover:text-amethyst-400 transition">Read full teaching</button>
      <button onclick="openTeachingViewer(${t.id}, {scrollToComments: true})" class="text-[10px] text-gray-500 hover:text-amethyst-400 transition">Show comments (${t.comments.length})</button>
    </div>
  </article>`;
}

/* ============================================================
   UNIFIED Q&A FEED
   ============================================================ */

function renderQaFeed() {
  const el = document.getElementById('teachingsFeed');
  const items = [];
  state.teachings.forEach(t => {
    if (t.is_question === true) items.push({ type: 'teaching', date: t.created_at, payload: t });
  });
  state.teachings.forEach(t => {
    t.comments.forEach(c => {
      if (c.is_question === true && !state.myMutes.has(c.user_id)) items.push({ type: 'comment', date: c.created_at, payload: { comment: c, teaching: t } });
    });
  });
  if (items.length === 0) {
    el.innerHTML = '<div class="glass card p-6 border border-void-600 text-center"><p class="text-xs text-gray-600">No questions have been asked yet.</p></div>';
    return;
  }
  items.sort((a, b) => new Date(b.date) - new Date(a.date));
  el.innerHTML = items.map(item => {
    if (item.type === 'teaching') return renderTeachingPost(item.payload);
    return renderQaCommentCard(item.payload.comment, item.payload.teaching);
  }).join('');
}

function renderQaCommentCard(c, t) {
  const info = state.profileCache[c.user_id] || { username: 'architect', avatar_url: null };
  const isAnon = c.is_anonymous === true;
  const isAccepted = c.accepted_answer_id;
  const kids = t.comments.filter(x => x.parent_id === c.id);
  const acceptedReply = isAccepted ? t.comments.find(x => x.id === isAccepted) : null;

  return `<article class="glass card-lg border border-void-600 overflow-hidden fade-in">
    <div class="p-4">
      <div class="flex items-center gap-2 mb-2 flex-wrap">
        <span class="q-badge">Q&amp;A</span>
        <button onclick="openPublicProfile('${c.user_id}')" class="text-xs font-medium text-amethyst-300 hover:underline truncate max-w-[140px]">@${escapeHtml(isAnon ? 'anonymous' : info.username)}</button>
        <span class="text-[10px] text-gray-600 flex-shrink-0">${relativeTime(c.created_at)}</span>
      </div>
      <div class="text-sm text-gray-300 prose-content break-words clamp-4">${escapeHtml(c.content || '')}</div>
      <button onclick="openTeachingViewer(${t.id}, {scrollToComments: true})" class="mt-3 text-[10px] px-3 py-1.5 rounded-full bg-void-800 border border-void-600 text-gray-400 hover:border-amethyst-500/40 hover:text-amethyst-400 transition inline-flex items-center gap-1.5 max-w-full">
        <span class="truncate">On: ${escapeHtml(t.title || 'Untitled')}</span>
      </button>
      ${acceptedReply ? `<div class="mt-3 accepted-comment-body" style="padding:10px 12px; border-radius:12px;">
        <div class="flex items-center gap-2 mb-1">
          <span class="accepted-badge">✓ Accepted</span>
          <span class="text-xs text-amethyst-300">@${escapeHtml(state.profileCache[acceptedReply.user_id]?.username || 'seeker')}</span>
        </div>
        <p class="text-sm text-gray-300 prose-content break-words">${escapeHtml(acceptedReply.content || '')}</p>
      </div>` : ''}
      <div class="flex items-center gap-4 mt-3.5 flex-wrap">
        <span class="text-[10px] text-gray-500">${kids.length} ${kids.length === 1 ? 'answer' : 'answers'}</span>
        <button onclick="openTeachingViewer(${t.id}, {scrollToComments: true, focusCommentId: ${c.id}})" class="text-[10px] text-amethyst-400 hover:text-amethyst-300 transition font-medium">View answers →</button>
      </div>
    </div>
  </article>`;
}

/* ============================================================
   POLLS FEED
   ============================================================ */

function renderPollsFeed() {
  const el = document.getElementById('teachingsFeed');
  const withPolls = state.teachings.filter(t => t.poll);
  if (withPolls.length === 0) {
    el.innerHTML = '<div class="glass card p-6 border border-void-600 text-center"><p class="text-xs text-gray-600">No polls have been posted yet.</p></div>';
    return;
  }
  el.innerHTML = withPolls.map(t => renderTeachingPost(t)).join('');
}

function renderTeachings() { filterTeachings(); renderFeaturedBanner(); }

/* ============================================================
   REACTION TRIGGER
   ============================================================ */

function reactionTriggerHtml(c, type) {
  const myReaction = (c.reactions || []).find(r => r.user_id === state.user.id);
  const totalCount = (c.reactions || []).length;
  const display = myReaction ? myReaction.emoji : '🙂';
  const hasReaction = !!myReaction;
  return `<div class="relative inline-block">
    <button class="reaction-trigger ${hasReaction ? 'has-reaction' : ''}" data-react-btn="${type}-${c.id}" onclick="toggleReactionPicker(event, '${type}', ${c.id})">
      <span data-react-emoji>${display}</span>
      <span data-react-count>${totalCount > 0 ? totalCount : ''}</span>
    </button>
  </div>`;
}

function updateReactionButton(type, id, reactions) {
  const btn = document.querySelector(`[data-react-btn="${type}-${id}"]`);
  if (!btn) return;
  const myReaction = (reactions || []).find(r => r.user_id === state.user.id);
  const totalCount = (reactions || []).length;
  const emojiSpan = btn.querySelector('[data-react-emoji]');
  const countSpan = btn.querySelector('[data-react-count]');
  if (emojiSpan) emojiSpan.textContent = myReaction ? myReaction.emoji : '🙂';
  if (countSpan) countSpan.textContent = totalCount > 0 ? totalCount : '';
  btn.classList.toggle('has-reaction', !!myReaction);
}

function toggleReactionPicker(event, type, id) {
  event.stopPropagation();
  const btn = event.currentTarget;
  const wrap = btn.parentElement;
  const existing = wrap.querySelector('.reaction-picker');
  if (existing) { existing.remove(); return; }

  document.querySelectorAll('.reaction-picker').forEach(p => p.remove());

  const picker = document.createElement('div');
  picker.className = 'reaction-picker';
  const reactions = type === 'teaching'
    ? (state.teachings.find(t => t.id === id)?.reactions || [])
    : (() => { for (const t of state.teachings) { const c = t.comments.find(x => x.id === id); if (c) return c.reactions || []; } return []; })();
  const myReaction = reactions.find(r => r.user_id === state.user.id);
  picker.innerHTML = EMOJIS.map(e => `<button class="${myReaction && myReaction.emoji === e ? 'is-selected' : ''}" onclick="selectReaction(event, '${type}', ${id}, '${e}')">${e}</button>`).join('');
  wrap.appendChild(picker);

  requestAnimationFrame(() => {
    const rect = picker.getBoundingClientRect();
    picker.style.left = '';
    picker.style.right = '';
    if (rect.left < 8) {
      picker.style.left = 'auto';
      picker.style.right = '0';
    } else if (rect.right > window.innerWidth - 8) {
      picker.style.left = 'auto';
      picker.style.right = '0';
    } else {
      picker.style.left = '0';
      picker.style.right = 'auto';
    }
  });

  setTimeout(() => {
    const closer = (ev) => { if (!picker.contains(ev.target) && ev.target !== btn) { picker.remove(); document.removeEventListener('click', closer); } };
    document.addEventListener('click', closer);
  }, 0);
}

async function selectReaction(event, type, id, emoji) {
  event.stopPropagation();
  document.querySelectorAll('.reaction-picker').forEach(p => p.remove());
  if (type === 'teaching') await toggleTeachingReaction(id, emoji);
  else await toggleCommentReaction(id, emoji);
}

/* ============================================================
   POLLS
   ============================================================ */

function renderPollHtml(t) {
  if (!t.poll) return '';
  const poll = t.poll;
  let opts = poll.options;
  if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch (e) { opts = []; } }
  if (!Array.isArray(opts)) opts = [];
  const votes = t.pollVotes || [];
  const myVote = votes.find(v => v.user_id === state.user.id);
  const total = votes.length || 1;
  const showResults = !!myVote;
  return `<div class="poll-wrap" data-poll-id="${poll.id}" onclick="event.stopPropagation()">
    ${poll.question ? `<p class="poll-question break-words">${escapeHtml(poll.question)}</p>` : ''}
    ${opts.map((opt, i) => {
      const count = votes.filter(v => v.option_index === i).length;
      const pct = Math.round((count / total) * 100);
      const mine = myVote && myVote.option_index === i;
      return `<button class="poll-option ${mine ? 'mine' : ''} ${showResults ? 'voted' : ''}" onclick="event.stopPropagation(); votePoll(${poll.id}, ${i}, ${t.id})" ${myVote ? 'disabled' : ''}>
        ${showResults ? `<div class="poll-fill" style="width:${pct}%"></div>` : ''}
        <div class="poll-content"><span class="truncate">${mine ? '◉' : '○'} ${escapeHtml(opt)}</span>${showResults ? `<span class="poll-pct flex-shrink-0">${pct}%</span>` : ''}</div>
      </button>`;
    }).join('')}
    <p class="poll-meta">${showResults ? `${votes.length} vote${votes.length === 1 ? '' : 's'}` : 'Vote to see results'}</p>
  </div>`;
}

async function votePoll(pollId, optionIndex, teachingId) {
  try {
    const { error } = await sb.from('poll_votes').insert({ poll_id: pollId, user_id: state.user.id, option_index: optionIndex });
    if (error) { alert(describeError(error)); return; }
    logActivity('poll_vote');
    await loadTeachings(true);
    renderTeachings();
    if (state.teachingViewerId === teachingId) openTeachingViewer(teachingId, { keepScroll: true });
  } catch (e) { alert(describeError(e)); }
}

/* ============================================================
   SMART TOGGLES
   ============================================================ */

function looksLikeQuestion(text) {
  const t = (text || '').trim();
  if (!t) return false;
  if (t.endsWith('?')) return true;
  if (/^(what|why|how|when|where|who|which|whose|whom)\b/i.test(t)) return true;
  if (/^(is|are|was|were|do|does|did|can|could|will|would|should|may|might|shall|have|has|had)\b/i.test(t)) return true;
  if (/^(help me|tell me|explain|teach me|show me|guide me|i need to know|i want to know)\b/i.test(t)) return true;
  return false;
}

function updateSmartToggles(uid) {
  const ta = document.getElementById(uid + '-text');
  if (!ta) return;
  const isTopLevel = !uid.startsWith('reply-');
  const show = isTopLevel || looksLikeQuestion(ta.value);
  const qa = document.getElementById(uid + '-qa');
  if (qa) qa.style.display = show ? 'inline-flex' : 'none';
  if (!show && qa) { const i = qa.querySelector('input'); if (i) i.checked = false; qa.classList.remove('active'); }
}

function toggleSmartFlag(el) {
  const cb = el.querySelector('input');
  if (!cb) return;
  cb.checked = !cb.checked;
  el.classList.toggle('active', cb.checked);
}

/* ============================================================
   QUOTE
   ============================================================ */

function setQuote(teachingId, comment) {
  state.quoteTarget = {
    teachingId,
    commentId: comment.id,
    username: comment.user_id === state.user.id ? (state.profile.username || 'you') : (state.profileCache[comment.user_id]?.username || 'seeker'),
    excerpt: (comment.content || '[image]').slice(0, 120)
  };
  state.expandedCommentTeachingIds.add(teachingId);
  state.openReplyCommentId = null;
  if (state.teachingViewerId === teachingId) openTeachingViewer(teachingId, { keepScroll: true });
  else renderTeachings();
}
function clearQuote() {
  state.quoteTarget = null;
  if (state.teachingViewerId) openTeachingViewer(state.teachingViewerId, { keepScroll: true });
  else renderTeachings();
}

function openQuoteTeachingModal(teachingId) {
  const t = state.teachings.find(x => x.id === teachingId);
  if (!t) return;
  state.quotingTeachingId = teachingId;
  document.getElementById('quoteTeachingCaption').value = '';
  const preview = document.getElementById('quoteTeachingPreview');
  preview.innerHTML = `
    <div class="quoted-teaching">
      <div class="text-[10px] text-amethyst-400 font-semibold mb-1">QUOTING TEACHING</div>
      ${t.title ? `<div class="text-sm font-semibold text-gray-200 break-words">${escapeHtml(t.title)}</div>` : ''}
      <div class="text-xs text-gray-400 mt-1 line-clamp-2">${escapeHtml((t.content || '').replace(/<[^>]*>/g, ' ').trim().slice(0, 140))}</div>
    </div>
  `;
  document.getElementById('quoteTeachingModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closeQuoteTeachingModal() {
  document.getElementById('quoteTeachingModal').classList.add('hidden');
  document.body.style.overflow = '';
  state.quotingTeachingId = null;
}
async function submitQuoteTeaching() {
  const teachingId = state.quotingTeachingId;
  if (!teachingId) return;
  const t = state.teachings.find(x => x.id === teachingId);
  if (!t) return;
  const caption = document.getElementById('quoteTeachingCaption').value.trim();
  const btn = document.getElementById('quoteTeachingBtn');
  btn.disabled = true;
  btn.textContent = 'Posting...';
  try {
    const { error } = await sb.from('teaching_comments').insert({
      teaching_id: teachingId,
      user_id: state.user.id,
      content: caption || null,
      quoted_teaching_id: teachingId,
      parent_id: null
    });
    if (error) throw error;
    logActivity('comment');
    closeQuoteTeachingModal();
    await loadTeachings(true);
    renderTeachings();
    renderProfile();
  } catch (e) {
    alert(describeError(e));
  }
  btn.disabled = false;
  btn.textContent = 'Post to profile';
}

/* ============================================================
   CARD EXPAND
   ============================================================ */

function toggleCardExpand(teachingId) {
  if (state.expandedCards.has(teachingId)) state.expandedCards.delete(teachingId);
  else state.expandedCards.add(teachingId);
  renderTeachings();
}

/* ============================================================
   TEACHING CARD
   ============================================================ */

function renderQuotedTeaching(t) {
  return `<div class="quoted-teaching" onclick="event.stopPropagation(); openTeachingViewer(${t.id})">
    <div class="text-[10px] text-amethyst-400 font-semibold mb-1">QUOTED TEACHING</div>
    ${t.title ? `<div class="text-sm font-semibold text-gray-200 break-words">${escapeHtml(t.title)}</div>` : ''}
    <div class="text-xs text-gray-400 mt-1 line-clamp-2">${escapeHtml((t.content || '').replace(/<[^>]*>/g, ' ').trim().slice(0, 160))}</div>
    <div class="text-[10px] text-amethyst-400 mt-2">Open teaching →</div>
  </div>`;
}

function renderTeachingPost(t) {
  const tagHtml = (t.tags || []).slice(0, 3).map(tag => `<span class="text-[9px] px-2 py-0.5 rounded-full bg-void-800 border border-void-600 text-gray-400 max-w-[100px] truncate">#${escapeHtml(tag)}</span>`).join('');
  const pinnedHtml = t.pinned ? `<span class="text-[9px] px-2 py-0.5 rounded-full bg-gold-400/20 border border-gold-400/40 text-gold-300">📌</span>` : '';
  const featuredHtml = (state.featuredTeaching && state.featuredTeaching.id === t.id) ? `<span class="text-[9px] px-2 py-0.5 rounded-full bg-amethyst-600/30 border border-amethyst-500/40 text-amethyst-300">⭐</span>` : '';
  const qBadge = t.is_question ? `<span class="q-badge">Q&amp;A</span>` : '';
  const pollBadge = t.poll ? `<span class="q-badge" style="background:rgba(34,197,94,0.15); border-color:rgba(34,197,94,0.45); color:#4ade80;">POLL</span>` : '';
  const isBookmarked = state.myBookmarkedIds.has(t.id);
  const isRead = state.readTeachingIds.has(t.id);
  const isExpanded = state.expandedCards.has(t.id);
  const hasContent = t.content && t.content.replace(/<[^>]*>/g, '').trim().length > 0;
  const hasQuotedTeaching = t.quoted_teaching_id && state.teachings.some(x => x.id === t.quoted_teaching_id);

  const plainText = (t.content || '').replace(/<[^>]*>/g, ' ').trim();
  const contentIsLong = plainText.length > 220;

  let mediaHtml = '';
  if (t.video_url && !t.video_url.includes('teaching-media')) {
    mediaHtml = `<div class="rounded-xl overflow-hidden mt-2.5 bg-void-800 p-3 text-center cursor-pointer" onclick="event.stopPropagation(); window.open('${escapeHtml(t.video_url)}', '_blank')"><p class="text-[11px] text-amethyst-400">🎬 Watch video</p></div>`;
  } else if (t.video_url) {
    mediaHtml = `<div class="rounded-xl overflow-hidden mt-2.5 cursor-pointer" onclick="event.stopPropagation(); openVideoViewer('${escapeHtml(t.video_url)}')"><video src="${escapeHtml(t.video_url)}" class="w-full rounded-xl max-h-[180px] object-cover" muted playsinline preload="metadata"></video></div>`;
  } else if (t.cover_image) {
    mediaHtml = `<div class="mt-2.5"><img src="${escapeHtml(t.cover_image)}" class="w-full rounded-xl object-cover cursor-pointer ${isExpanded ? 'max-h-[420px]' : 'max-h-[140px]'}" loading="lazy" onclick="event.stopPropagation(); openImageViewer('${escapeHtml(t.cover_image)}')"></div>`;
  }

  const contentClass = isExpanded ? '' : 'clamp-4';
  const titleClass = isExpanded ? '' : 'clamp-1';

  const showMoreLink = contentIsLong
    ? (isExpanded
        ? `<button onclick="event.stopPropagation(); toggleCardExpand(${t.id})" class="text-[11px] text-amethyst-400 hover:text-amethyst-300 font-medium mt-1.5">Show less</button>`
        : `<button onclick="event.stopPropagation(); toggleCardExpand(${t.id})" class="text-[11px] text-amethyst-400 hover:text-amethyst-300 font-medium mt-1.5">Show more</button>`)
    : '';

  return `<article class="glass card-lg border border-void-600 overflow-hidden fade-in cursor-pointer" data-teaching-id="${t.id}" onclick="openTeachingViewer(${t.id})">
    <div class="p-4">
      <div class="flex items-start justify-between gap-2 mb-2">
        <div class="flex flex-wrap gap-1 flex-1 items-center min-w-0">
          ${featuredHtml}${pinnedHtml}${qBadge}${pollBadge}${tagHtml}
        </div>
        <button data-bookmark-btn="${t.id}" onclick="event.stopPropagation(); toggleBookmark(${t.id}, this)" class="bookmark-btn ${isBookmarked ? 'active' : ''} flex-shrink-0">
          <svg class="w-4 h-4" fill="${isBookmarked ? 'currentColor' : 'none'}" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>
        </button>
      </div>
      ${t.title ? `<h3 class="text-[15px] font-semibold mb-1.5 break-words ${titleClass}">${escapeHtml(t.title)}</h3>` : ''}
      ${hasContent ? `<div class="text-sm text-gray-300 prose-content ${contentClass}">${sanitizeRich(t.content)}</div>` : ''}
      ${showMoreLink}
      ${mediaHtml}
      ${hasQuotedTeaching ? renderQuotedTeaching(state.teachings.find(x => x.id === t.quoted_teaching_id)) : ''}
      ${renderPollHtml(t)}
      <div class="flex items-center justify-between mt-3 pt-2.5 border-t border-void-600/60">
        <div class="flex items-center gap-2" onclick="event.stopPropagation()">
          ${reactionTriggerHtml(t, 'teaching')}
          <button onclick="openTeachingViewer(${t.id}, {scrollToComments: true})" class="text-[11px] text-gray-500 hover:text-amethyst-400 transition flex items-center gap-1">
            💬 ${t.comments.length}
          </button>
          <button onclick="openQuoteTeachingModal(${t.id})" class="text-[11px] text-gray-500 hover:text-amethyst-400 transition">↻ Quote</button>
          <button onclick="shareTeaching(${t.id})" class="text-[11px] text-gray-500 hover:text-amethyst-400 transition">↗</button>
        </div>
        <div class="flex items-center gap-2 text-[10px] text-gray-600">
          <span>${relativeTime(t.created_at)}</span>
          ${isRead ? `<span class="read-badge">✓</span>` : `<span class="unread-dot" title="Unread"></span>`}
        </div>
      </div>
    </div>
  </article>`;
}

/* ============================================================
   FOCUSED TEACHING VIEWER
   ============================================================ */

function ensureTeachingViewer() {
  let modal = document.getElementById('teachingViewerModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'teachingViewerModal';
  modal.className = 'hidden fixed inset-0 z-[76] bg-void-900 overflow-y-auto';
  modal.innerHTML = `
    <div class="reading-progress" id="viewerProgressWrap"><div class="reading-progress-fill" id="viewerProgressFill"></div></div>
    <div class="max-w-2xl mx-auto p-4 safe-top">
      <div class="flex items-center justify-between mb-4">
        <button onclick="closeTeachingViewer()" class="btn p-2 text-gray-400 hover:text-white rounded-xl transition">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <h2 class="text-base font-semibold">Teaching</h2>
        <div class="w-9"></div>
      </div>
      <div id="teachingViewerContent" class="pb-8"></div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('scroll', () => {
    const fill = document.getElementById('viewerProgressFill');
    if (!fill) return;
    const max = modal.scrollHeight - modal.clientHeight;
    const pct = max > 0 ? Math.min(100, Math.max(0, (modal.scrollTop / max) * 100)) : 0;
    fill.style.width = pct + '%';
  });
  return modal;
}

function openTeachingViewer(id, opts = {}) {
  const t = state.teachings.find(x => x.id === id);
  if (!t) return;
  const wasOpen = state.teachingViewerId === id;
  state.teachingViewerId = id;
  state.viewerOpenedAt = Date.now();

  const modal = ensureTeachingViewer();
  const content = document.getElementById('teachingViewerContent');
  const prevScroll = (opts.keepScroll || wasOpen) ? modal.scrollTop : 0;
  const isBookmarked = state.myBookmarkedIds.has(t.id);
  const isRead = state.readTeachingIds.has(t.id);
  const hasContent = t.content && t.content.replace(/<[^>]*>/g, '').trim().length > 0;
  const hasQuotedTeaching = t.quoted_teaching_id && state.teachings.some(x => x.id === t.quoted_teaching_id);

  let mediaHtml = '';
  if (t.video_url) {
    const isExternal = !t.video_url.includes('teaching-media') && !t.video_url.match(/\.(mp4|webm|mov)$/i);
    if (isExternal) mediaHtml = `<div class="rounded-2xl overflow-hidden mb-3.5 bg-void-800 p-4 text-center cursor-pointer" onclick="window.open('${escapeHtml(t.video_url)}', '_blank')"><p class="text-xs text-amethyst-400">🎬 Watch video on external site</p></div>`;
    else mediaHtml = `<video src="${escapeHtml(t.video_url)}" controls class="rounded-2xl mb-3.5 w-full"></video>`;
  }
  if (t.cover_image) mediaHtml += `<img src="${escapeHtml(t.cover_image)}" class="w-full rounded-2xl mb-3.5 cursor-pointer" onclick="openImageViewer('${escapeHtml(t.cover_image)}')">`;

  const tagHtml = (t.tags || []).slice(0, 6).map(tag => `<span class="text-[10px] px-2.5 py-1 rounded-full bg-void-800 border border-void-600 text-gray-400 max-w-[140px] truncate">#${escapeHtml(tag)}</span>`).join('');
  const qBadge = t.is_question ? `<span class="q-badge">Q&amp;A</span>` : '';

  content.innerHTML = `
    <div class="glass card p-5 border border-void-600">
      <div class="flex items-start justify-between gap-2 mb-2.5">
        <div class="flex flex-wrap gap-1.5 flex-1 items-center min-w-0">${qBadge}${tagHtml}</div>
        <button data-bookmark-btn="${t.id}" onclick="toggleBookmark(${t.id}, this)" class="bookmark-btn ${isBookmarked ? 'active' : ''} flex-shrink-0">
          <svg class="w-4 h-4" fill="${isBookmarked ? 'currentColor' : 'none'}" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>
        </button>
      </div>
      ${t.title ? `<h3 class="text-lg font-semibold mb-3 break-words">${escapeHtml(t.title)}</h3>` : ''}
      ${mediaHtml}
      ${hasContent ? `<div class="text-sm text-gray-300 prose-content">${sanitizeRich(t.content)}</div>` : ''}
      ${hasQuotedTeaching ? renderQuotedTeaching(state.teachings.find(x => x.id === t.quoted_teaching_id)) : ''}
      ${renderPollHtml(t)}
      <div class="flex items-center gap-3 mt-3.5 text-[10px] text-gray-600">
        <span>${relativeTime(t.created_at)}</span><span>·</span>
        ${isRead ? `<span class="read-badge">✓ Read · ${readingTime(t.content)} min</span>` : ''}
      </div>
      <div class="mt-3.5">${reactionTriggerHtml(t, 'teaching')}</div>
      <div class="flex items-center justify-between mt-3.5 pt-3.5 border-t border-void-600">
        <button id="viewer-comments-toggle-${t.id}" onclick="toggleViewerComments(${t.id})" class="text-xs text-gray-400 hover:text-amethyst-400 transition">
          ${state.expandedCommentTeachingIds.has(t.id) ? 'Hide comments' : `${t.comments.length} ${t.comments.length === 1 ? 'comment' : 'comments'}`}
        </button>
        <div class="flex items-center gap-3">
          <button onclick="openQuoteTeachingModal(${t.id})" class="text-xs text-gray-400 hover:text-amethyst-400 transition">Quote</button>
          <button onclick="shareTeaching(${t.id})" class="text-xs text-gray-400 hover:text-amethyst-400 transition">Share</button>
        </div>
      </div>
    </div>
    <div class="mt-3" id="viewer-comments-wrap-${t.id}" ${state.expandedCommentTeachingIds.has(t.id) ? '' : 'style="display:none"'}>
      <div class="glass card p-4 border border-void-600">
        ${renderComposer(t.id, null)}
      </div>
      <div class="mt-3 space-y-2" id="viewer-comments-${t.id}">
        ${renderCommentsFor(t) || '<p class="text-xs text-gray-600 text-center py-4">No one has spoken yet.</p>'}
      </div>
    </div>
  `;

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  const fill = document.getElementById('viewerProgressFill');
  if (fill) fill.style.width = '0%';

  requestAnimationFrame(() => {
    if (opts.scrollToComments) {
      state.expandedCommentTeachingIds.add(t.id);
      openTeachingViewer(id, { keepScroll: false, scrollToComments: false, _secondPass: true });
      requestAnimationFrame(() => {
        const cw = document.getElementById('viewer-comments-wrap-' + t.id);
        if (cw) cw.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } else if (opts.focusCommentId) {
      requestAnimationFrame(() => {
        const el = document.getElementById('comment-' + opts.focusCommentId);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } else if (opts.keepScroll || wasOpen) {
      modal.scrollTop = prevScroll;
    }
  });

  setTimeout(() => {
    if (state.teachingViewerId === id && Date.now() - state.viewerOpenedAt >= 2900) {
      markTeachingRead(id);
    }
  }, 3000);
}

function closeTeachingViewer() {
  const modal = document.getElementById('teachingViewerModal');
  if (modal) modal.classList.add('hidden');
  document.body.style.overflow = '';
  state.teachingViewerId = null;
}

function toggleViewerComments(teachingId) {
  if (state.expandedCommentTeachingIds.has(teachingId)) {
    state.expandedCommentTeachingIds.delete(teachingId);
  } else {
    state.expandedCommentTeachingIds.add(teachingId);
  }
  openTeachingViewer(teachingId, { keepScroll: true });
}

/* ============================================================
   COMMENT TREE
   ============================================================ */

function renderCommentsFor(t) {
  const acceptedId = t.accepted_answer_id;
  const visible = t.comments.filter(c => !state.myMutes.has(c.user_id));
  const sorted = [...visible].sort((a, b) => {
    if (a.id === acceptedId) return -1;
    if (b.id === acceptedId) return 1;
    return new Date(a.created_at) - new Date(b.created_at);
  });
  const tree = buildCommentTree(sorted);
  return tree.map(c => renderCommentNode(c, t, 0)).join('');
}

function buildCommentTree(comments) {
  const byParent = {};
  comments.forEach(c => {
    const p = c.parent_id || 'root';
    if (!byParent[p]) byParent[p] = [];
    byParent[p].push(c);
  });
  const attach = (node) => {
    const kids = byParent[node.id] || [];
    return { ...node, _children: kids.map(attach) };
  };
  return (byParent['root'] || []).map(attach);
}

function renderCommentNode(c, teaching, depth) {
  const info = state.profileCache[c.user_id] || { username: 'architect', avatar_url: null };
  const isOwner = c.user_id === state.user.id;
  const isAnon = c.is_anonymous === true;
  const isQuestion = c.is_question === true;
  const isAccepted = teaching && teaching.accepted_answer_id === c.id;
  const isTeachingAuthor = teaching && teaching.user_id === state.user.id;
  const canAccept = teaching && teaching.is_question && isTeachingAuthor && !isAccepted && c.user_id !== state.user.id;
  const depthClass = depth > 0 ? 'comment-thread' : '';
  const edited = c.updated_at && c.updated_at !== c.created_at;
  const pendingClass = c._pending ? 'pending-opacity' : '';
  const displayName = isAnon ? 'anonymous' : info.username;
  const contentWithMentions = (c.content || '').replace(/@([a-z0-9_]+)/gi, '<button onclick="openPublicProfileByUsername(\'$1\')" class="text-amethyst-300 font-medium hover:underline">@$1</button>');

  let quotedHtml = '';
  if (c.quoted_comment_id) {
    const allComments = teaching ? teaching.comments : [];
    const q = allComments.find(x => x.id === c.quoted_comment_id);
    if (q) {
      const qUser = q.is_anonymous ? 'anonymous' : (state.profileCache[q.user_id]?.username || 'seeker');
      const qExcerpt = (q.content || '[image]').slice(0, 120);
      quotedHtml = `<div class="quoted-inline break-words"><span class="qi-user">@${escapeHtml(qUser)}</span> · ${escapeHtml(qExcerpt)}</div>`;
    }
  }

  const quotedTeaching = c.quoted_teaching_id ? state.teachings.find(x => x.id === c.quoted_teaching_id) : null;

  const acceptedBadge = isAccepted ? `<span class="accepted-badge">✓ Accepted</span>` : '';
  const qBadge = isQuestion ? `<span class="q-badge">Q&amp;A</span>` : '';
  const anonBadge = isAnon ? `<span class="anon-badge">anon</span>` : '';
  const bodyClass = isAccepted ? 'accepted-comment-body' : '';

  const kids = c._children || [];
  const hasKids = kids.length > 0;
  const repliesExpanded = state.expandedReplies.has(c.id);

  let repliesHtml = '';
  if (hasKids) {
    if (repliesExpanded) {
      repliesHtml = `<div class="mt-1.5">${kids.map(k => renderCommentNode(k, teaching, depth + 1)).join('')}</div>`;
    } else {
      repliesHtml = `<button onclick="toggleReplies(${c.id})" class="mt-2 text-[11px] text-amethyst-400 hover:text-amethyst-300 transition font-medium">${kids.length} ${kids.length === 1 ? 'reply' : 'replies'}</button>`;
    }
  }

  const expandCollapseBtn = (hasKids && repliesExpanded)
    ? `<button onclick="toggleReplies(${c.id})" class="text-[10px] text-gray-500 hover:text-amethyst-400 transition">Hide replies</button>`
    : '';

  return `<div class="mb-3 ${pendingClass} ${depthClass} min-w-0" id="comment-${c.id}">
    <div class="flex gap-2.5 min-w-0">
      ${isAnon ? `<div>${avatarHtml('__anon__', 'sm')}</div>` : `<button onclick="openPublicProfile('${c.user_id}')" class="flex-shrink-0">${avatarHtml(c.user_id, 'sm')}</button>`}
      <div class="flex-1 min-w-0">
        <div class="${bodyClass}" style="${bodyClass ? 'padding:10px 12px; border-radius:12px;' : ''}">
          <div class="flex items-center gap-2 flex-wrap min-w-0">
            ${isAnon ? `<span class="text-xs font-medium text-gray-500">@anonymous</span>` : `<button onclick="openPublicProfile('${c.user_id}')" class="text-xs font-medium text-amethyst-300 hover:underline truncate max-w-[120px]">@${escapeHtml(displayName)}</button>`}
            ${qBadge}${acceptedBadge}${anonBadge}
            <span class="text-[10px] text-gray-600 flex-shrink-0">${relativeTime(c.created_at)}</span>
            ${edited ? `<span class="text-[10px] text-gray-700 flex-shrink-0">· edited</span>` : ''}
            ${!isOwner && !isAnon ? `<button onclick="sendPoke('${c.user_id}', this)" class="poke-btn flex-shrink-0" title="Wave">👋</button>` : ''}
            <button onclick="openCommentMenu(${c.id}, ${teaching.id})" class="ml-auto p-1 text-gray-600 hover:text-gray-300 transition flex-shrink-0"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"/></svg></button>
          </div>
          ${quotedHtml}
          ${contentWithMentions ? `<p class="text-sm text-gray-300 prose-content mt-1.5 break-words">${contentWithMentions}</p>` : ''}
          ${c.image_url ? `<img src="${escapeHtml(c.image_url)}" class="rounded-2xl mt-2.5 max-h-64 object-cover cursor-pointer" loading="lazy" onclick="openImageViewer('${escapeHtml(c.image_url)}')">` : ''}
          ${quotedTeaching ? renderQuotedTeaching(quotedTeaching) : ''}
        </div>
        <div class="mt-2.5 flex items-center gap-4 flex-wrap">
          ${reactionTriggerHtml(c, 'comment')}
          <button onclick="showReplyBox(${c.id}, ${teaching.id})" class="text-[10px] text-gray-500 hover:text-amethyst-400 transition">Reply</button>
          ${canAccept ? `<button onclick="acceptAnswer(${c.id}, ${teaching.id})" class="text-[10px] text-green-400 hover:text-green-300 transition">Accept as answer</button>` : ''}
          ${expandCollapseBtn}
        </div>
        <div id="reply-box-${c.id}" class="hidden mt-2.5"></div>
        ${repliesHtml}
      </div>
    </div>
  </div>`;
}

function toggleReplies(commentId) {
  if (state.expandedReplies.has(commentId)) state.expandedReplies.delete(commentId);
  else state.expandedReplies.add(commentId);
  if (state.teachingViewerId) openTeachingViewer(state.teachingViewerId, { keepScroll: true });
}

/* ============================================================
   COMPOSER
   ============================================================ */

function renderComposer(teachingId, parentId) {
  const uid = parentId ? `reply-${parentId}` : `comment-${teachingId}`;
  const isTopLevel = !parentId;
  const placeholder = 'Post your reply';
  const quoteBlock = (state.quoteTarget && state.quoteTarget.teachingId === teachingId && !parentId) ? `
    <div class="quote-preview">
      <div class="qp-body">
        <div class="qp-user truncate">@${escapeHtml(state.quoteTarget.username)}</div>
        <div class="break-words">${escapeHtml(state.quoteTarget.excerpt)}</div>
      </div>
      <button class="qp-x" onclick="clearQuote()" title="Remove quote">×</button>
    </div>` : '';
  const qaDisplay = isTopLevel ? 'inline-flex' : 'none';
  const compact = !isTopLevel ? ' compact' : '';

  return `<div class="composer${compact}">
    <div class="flex gap-2.5 min-w-0">
      ${avatarHtml(state.user.id, 'sm')}
      <div class="flex-1 min-w-0">
        ${quoteBlock}
        <textarea id="${uid}-text" rows="1" placeholder="${placeholder}" class="composer-textarea" oninput="autoGrow(this); handleMention(this, ${teachingId}, ${parentId || 'null'}); updateSmartToggles('${uid}')"></textarea>
        <div id="${uid}-preview" class="hidden mt-2"></div>
        <div class="composer-actions">
          <div class="composer-tools">
            <label class="composer-tool" title="Image">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              <input type="file" id="${uid}-file" accept="image/*" class="hidden" onchange="previewCommentImage(${teachingId}, ${parentId || 'null'}, '${uid}')">
            </label>
            <label class="composer-tool" title="Camera">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              <input type="file" id="${uid}-camera" accept="image/*" capture="environment" class="hidden" onchange="previewCommentImage(${teachingId}, ${parentId || 'null'}, '${uid}')">
            </label>
            <label class="smart-toggle qa" id="${uid}-qa" style="display:${qaDisplay};" onclick="event.preventDefault(); toggleSmartFlag(this);">
              <input type="checkbox"><span>Q&amp;A</span>
            </label>
            ${parentId ? `<button onclick="cancelReply(${parentId})" class="text-[11px] text-gray-500 hover:text-gray-300 px-2 py-1 transition flex-shrink-0">Cancel</button>` : ''}
          </div>
          <button id="${uid}-submit" onclick="submitComment(${teachingId}, ${parentId || 'null'}, '${uid}')" class="composer-submit" disabled>Reply</button>
        </div>
      </div>
    </div>
    <div class="mention-dropdown hidden" id="mention-dropdown-${teachingId}-${parentId || 'null'}"></div>
  </div>`;
}

function autoGrowChat(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 200) + 'px'; }

function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  let uid;
  if (el.id.startsWith('comment-')) uid = 'comment-' + el.id.split('-')[1];
  else if (el.id.startsWith('reply-')) uid = 'reply-' + el.id.split('-')[1];
  if (uid) {
    const btn = document.getElementById(uid + '-submit');
    const preview = document.getElementById(uid + '-preview');
    if (btn) {
      const hasImg = preview && !preview.classList.contains('hidden') && preview.querySelector('img');
      btn.disabled = !el.value.trim() && !hasImg;
    }
    updateSmartToggles(uid);
  }
}

function previewCommentImage(teachingId, parentId, uid) {
  let file = null;
  const f1 = document.getElementById(uid + '-file');
  const f2 = document.getElementById(uid + '-camera');
  if (f1 && f1.files[0]) file = f1.files[0];
  else if (f2 && f2.files[0]) file = f2.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const target = document.getElementById(uid + '-preview');
    if (!target) return;
    target.innerHTML = `<div class="relative inline-block"><img src="${reader.result}" class="rounded-2xl max-h-40"><button onclick="removeCommentImage('${uid}')" class="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs shadow-lg">✕</button></div>`;
    target.classList.remove('hidden');
    const btn = document.getElementById(uid + '-submit');
    if (btn) btn.disabled = false;
  };
  reader.readAsDataURL(file);
}

function removeCommentImage(uid) {
  const target = document.getElementById(uid + '-preview');
  if (target) { target.innerHTML = ''; target.classList.add('hidden'); }
  const f1 = document.getElementById(uid + '-file');
  const f2 = document.getElementById(uid + '-camera');
  if (f1) f1.value = '';
  if (f2) f2.value = '';
  const btn = document.getElementById(uid + '-submit');
  const txt = document.getElementById(uid + '-text');
  if (btn) btn.disabled = !txt.value.trim();
}

function showReplyBox(commentId, teachingId) {
  const box = document.getElementById('reply-box-' + commentId);
  if (!box) return;
  if (state.openReplyCommentId && state.openReplyCommentId !== commentId) {
    const prev = document.getElementById('reply-box-' + state.openReplyCommentId);
    if (prev) { prev.classList.add('hidden'); prev.innerHTML = ''; }
  }
  if (box.innerHTML.trim() === '') box.innerHTML = renderComposer(teachingId, commentId);
  const willOpen = box.classList.contains('hidden');
  if (willOpen) {
    box.classList.remove('hidden');
    state.openReplyCommentId = commentId;
    const t = document.getElementById(`reply-${commentId}-text`);
    if (t) t.focus();
  } else {
    box.classList.add('hidden');
    state.openReplyCommentId = null;
  }
}
function cancelReply(commentId) {
  const box = document.getElementById('reply-box-' + commentId);
  if (box) { box.classList.add('hidden'); box.innerHTML = ''; }
  if (state.openReplyCommentId === commentId) state.openReplyCommentId = null;
}

/* ============================================================
   AVATAR
   ============================================================ */

function avatarHtml(userId, size) {
  const cls = size === 'xs' ? 'avatar-xs' : size === 'lg' ? 'avatar-lg' : 'avatar-sm';
  if (userId === '__anon__') return `<div class="${cls}">?</div>`;
  const info = state.profileCache[userId] || {};
  if (info.avatar_url) return `<img src="${info.avatar_url}" class="${cls}" alt="">`;
  const initial = (info.username || '?')[0].toUpperCase();
  return `<div class="${cls}">${initial}</div>`;
}

/* ============================================================
   ACCEPT / POKE / COMMENT MENU / PIN
   ============================================================ */

async function acceptAnswer(commentId, teachingId) {
  try {
    const t = state.teachings.find(x => x.id === teachingId);
    if (!t) return;
    const targetComment = t.comments.find(c => c.id === commentId);
    if (!targetComment) return;

    if (targetComment.parent_id) {
      await sb.from('teaching_comments').update({ accepted_answer_id: commentId }).eq('id', targetComment.parent_id);
      const parent = t.comments.find(c => c.id === targetComment.parent_id);
      if (parent) parent.accepted_answer_id = commentId;
    } else {
      await sb.from('teachings').update({ accepted_answer_id: commentId }).eq('id', teachingId);
      t.accepted_answer_id = commentId;
    }

    if (targetComment.user_id !== state.user.id) {
      await sb.from('notifications').insert({
        user_id: targetComment.user_id, type: 'accepted',
        actor_id: state.user.id, actor_username: state.profile.username,
        teaching_id: teachingId, message: 'Your answer was accepted.'
      });
    }
    if (state.teachingViewerId === teachingId) openTeachingViewer(teachingId, { keepScroll: true });
    else renderTeachings();
  } catch (e) { alert(describeError(e)); }
}

async function sendPoke(toUserId, btn) {
  if (toUserId === state.user.id) return;
  if (btn.disabled) return;
  btn.disabled = true; btn.textContent = '⏳';
  try {
    const since = new Date(Date.now() - 86400000).toISOString();
    const { data: ex } = await sb.from('pokes').select('id').eq('from_user', state.user.id).eq('to_user', toUserId).gte('created_at', since).limit(1);
    if (ex && ex.length > 0) { btn.textContent = '✓'; setTimeout(() => { btn.disabled = false; btn.textContent = '👋'; }, 1500); return; }
    await sb.from('pokes').insert({ from_user: state.user.id, to_user: toUserId });
    await sb.from('notifications').insert({
      user_id: toUserId, type: 'poke',
      actor_id: state.user.id, actor_username: state.profile.username,
      message: '👋 @' + state.profile.username + ' waved at you'
    });
    btn.textContent = '✓';
    setTimeout(() => { btn.disabled = false; btn.textContent = '👋'; }, 1500);
  } catch (e) { btn.disabled = false; btn.textContent = '👋'; }
}

function openCommentMenu(commentId, teachingId) {
  let comment = null;
  for (const t of state.teachings) { const c = t.comments.find(x => x.id === commentId); if (c) { comment = c; break; } }
  if (!comment) return;
  const isOwner = comment.user_id === state.user.id;
  const isPinned = comment.pinned === true;
  const menu = document.createElement('div');
  menu.className = 'fixed inset-0 z-[78] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4';
  menu.innerHTML = `<div class="glass card w-full max-w-sm border border-void-600 overflow-hidden">
    ${isOwner ? `<button onclick="this.closest('.fixed').remove(); openEditCommentModal(${commentId}, ${teachingId})" class="btn w-full py-4 text-left px-5 text-sm text-gray-200 hover:bg-void-800 transition border-b border-void-600">Edit comment</button>` : ''}
    ${isOwner ? `<button onclick="this.closest('.fixed').remove(); pinComment(${commentId}, ${!isPinned})" class="btn w-full py-4 text-left px-5 text-sm text-gray-200 hover:bg-void-800 transition border-b border-void-600">${isPinned ? 'Unpin from profile' : 'Pin to profile'}</button>` : ''}
    <button onclick="this.closest('.fixed').remove(); quoteComment(${teachingId}, ${commentId})" class="btn w-full py-4 text-left px-5 text-sm text-gray-200 hover:bg-void-800 transition border-b border-void-600">Quote this comment</button>
    <button onclick="this.closest('.fixed').remove(); shareComment(${commentId}, ${teachingId})" class="btn w-full py-4 text-left px-5 text-sm text-gray-200 hover:bg-void-800 transition border-b border-void-600">Share as post</button>
    ${isOwner ? `<button onclick="this.closest('.fixed').remove(); askDeleteComment(${commentId}, ${teachingId})" class="btn w-full py-4 text-left px-5 text-sm text-red-400 hover:bg-void-800 transition border-b border-void-600">Delete comment</button>` : ''}
    <button onclick="this.closest('.fixed').remove()" class="btn w-full py-4 text-center px-5 text-sm text-gray-400 hover:bg-void-800 transition">Cancel</button>
  </div>`;
  menu.addEventListener('click', (e) => { if (e.target === menu) menu.remove(); });
  document.body.appendChild(menu);
}

async function pinComment(commentId, shouldPin) {
  try {
    if (shouldPin) {
      await sb.from('teaching_comments').update({ pinned: false }).eq('user_id', state.user.id).eq('pinned', true);
    }
    await sb.from('teaching_comments').update({ pinned: shouldPin }).eq('id', commentId);
    for (const t of state.teachings) {
      t.comments.forEach(c => {
        if (c.user_id === state.user.id) {
          if (shouldPin && c.id === commentId) c.pinned = true;
          else if (shouldPin) c.pinned = false;
          else if (c.id === commentId) c.pinned = false;
        }
      });
    }
    await loadMyPosts();
    await loadMyReplies();
    renderMyPosts();
    renderMyReplies();
  } catch (e) { alert(describeError(e)); }
}

/* ============================================================
   EDIT COMMENT MODAL
   ============================================================ */

function openEditCommentModal(commentId, teachingId) {
  let comment = null;
  for (const t of state.teachings) { const c = t.comments.find(x => x.id === commentId); if (c) { comment = c; break; } }
  if (!comment) return;
  state.editingCommentId = commentId;
  state.editingCommentTeachingId = teachingId;
  const modal = document.getElementById('editCommentModal');
  const ta = document.getElementById('editCommentText');
  ta.value = comment.content || '';
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  setTimeout(() => ta.focus(), 100);
}
function closeEditCommentModal() {
  document.getElementById('editCommentModal').classList.add('hidden');
  document.body.style.overflow = '';
  state.editingCommentId = null;
  state.editingCommentTeachingId = null;
}
async function saveEditedComment() {
  const commentId = state.editingCommentId;
  const teachingId = state.editingCommentTeachingId;
  if (!commentId) return;
  const newText = document.getElementById('editCommentText').value.trim();
  if (!newText) { alert('Comment cannot be empty.'); return; }
  const btn = document.getElementById('saveEditBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  try {
    await sb.from('teaching_comments').update({ content: newText, updated_at: new Date().toISOString() }).eq('id', commentId);
    for (const t of state.teachings) {
      const c = t.comments.find(x => x.id === commentId);
      if (c) { c.content = newText; c.updated_at = new Date().toISOString(); break; }
    }
    closeEditCommentModal();
    await loadTeachings(true);
    if (state.teachingViewerId === teachingId) openTeachingViewer(teachingId, { keepScroll: true });
    else renderTeachings();
    renderProfile();
  } catch (e) { alert(describeError(e)); }
  btn.disabled = false;
  btn.textContent = 'Save';
}

function quoteComment(teachingId, commentId) {
  const t = state.teachings.find(x => x.id === teachingId);
  if (!t) return;
  const c = t.comments.find(x => x.id === commentId);
  if (!c) return;
  setQuote(teachingId, c);
}

function shareComment(commentId, teachingId) {
  let comment = null;
  for (const t of state.teachings) { const c = t.comments.find(x => x.id === commentId); if (c) { comment = c; break; } }
  if (!comment) return;
  const info = state.profileCache[comment.user_id] || { username: 'someone' };
  const text = `"${comment.content || '[image]'}"\n\n— @${info.username} on Moph Echo\n\nhttps://mophecho-mirror.vercel.app`;
  if (navigator.share) navigator.share({ title: 'A reflection from Moph Echo', text }).catch(() => {});
  else navigator.clipboard.writeText(text).then(() => alert('Copied.')).catch(() => {});
}

let pendingDeletes = {};
function askDeleteComment(commentId, teachingId) {
  const el = document.getElementById('comment-' + commentId);
  if (el) el.style.display = 'none';
  const toast = document.createElement('div');
  toast.className = 'undo-toast';
  toast.id = 'undo-' + commentId;
  toast.innerHTML = `<span class="text-xs text-gray-300">Comment deleted</span><button onclick="undoDelete(${commentId})" class="text-xs text-amethyst-400 hover:text-amethyst-300 font-semibold transition">Undo</button>`;
  document.body.appendChild(toast);
  pendingDeletes[commentId] = setTimeout(async () => {
    await sb.from('teaching_comments').delete().eq('id', commentId);
    const t = document.getElementById('undo-' + commentId);
    if (t) t.remove();
    delete pendingDeletes[commentId];
    await loadTeachings(true);
    if (state.teachingViewerId === teachingId) openTeachingViewer(teachingId, { keepScroll: true });
    else renderTeachings();
    renderProfile();
  }, 5000);
}
function undoDelete(commentId) {
  if (pendingDeletes[commentId]) { clearTimeout(pendingDeletes[commentId]); delete pendingDeletes[commentId]; }
  const el = document.getElementById('comment-' + commentId);
  if (el) el.style.display = '';
  const t = document.getElementById('undo-' + commentId);
  if (t) t.remove();
}

/* ============================================================
   MENTIONS
   ============================================================ */

let mentionTargets = {};
function handleMention(textarea, teachingId, parentId) {
  const val = textarea.value;
  const pos = textarea.selectionStart;
  const before = val.substring(0, pos);
  const atMatch = before.match(/@([a-z0-9_]*)$/i);
  const dropdownId = `mention-dropdown-${teachingId}-${parentId === null ? 'null' : parentId}`;
  const dd = document.getElementById(dropdownId);
  if (!dd) return;
  if (!atMatch) { dd.classList.add('hidden'); return; }
  const q = atMatch[1].toLowerCase();
  const allUsers = Object.values(state.profileCache).filter(p => p.username);
  const matches = allUsers.filter(u => u.username.toLowerCase().startsWith(q) && u.username.toLowerCase() !== (state.profile.username || '').toLowerCase()).slice(0, 6);
  if (matches.length === 0) { dd.classList.add('hidden'); return; }
  dd.innerHTML = matches.map((u, i) => `<div class="mention-item ${i === 0 ? 'active' : ''} truncate" onclick="insertMention('${textarea.id}', '${u.username}', '${dropdownId}')">@${escapeHtml(u.username)}</div>`).join('');
  dd.classList.remove('hidden');
  mentionTargets[dropdownId] = { textareaId: textarea.id, users: matches };
}

function insertMention(textareaId, username, dropdownId) {
  const ta = document.getElementById(textareaId);
  const val = ta.value;
  const pos = ta.selectionStart;
  const before = val.substring(0, pos);
  const after = val.substring(pos);
  const newBefore = before.replace(/@([a-z0-9_]*)$/i, '@' + username + ' ');
  ta.value = newBefore + after;
  ta.focus();
  ta.selectionStart = ta.selectionEnd = newBefore.length;
  const dd = document.getElementById(dropdownId);
  if (dd) dd.classList.add('hidden');
}

function extractMentions(text) {
  const m = (text || '').match(/@([a-z0-9_]+)/gi) || [];
  return m.map(x => x.substring(1).toLowerCase());
}

/* ============================================================
   SUBMIT COMMENT
   ============================================================ */

function findRootComment(comments, comment) {
  let current = comment;
  const seen = new Set();
  while (current && current.parent_id && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = comments.find(c => c.id === current.parent_id);
    if (!parent) break;
    current = parent;
  }
  return current;
}

async function submitComment(teachingId, parentId, uid) {
  const textEl = document.getElementById(uid + '-text');
  const previewEl = document.getElementById(uid + '-preview');
  const btn = document.getElementById(uid + '-submit');
  const text = textEl.value.trim();
  const f1 = document.getElementById(uid + '-file');
  const f2 = document.getElementById(uid + '-camera');
  const file = (f1 && f1.files[0]) || (f2 && f2.files[0]);
  if (!text && !file) return;

  const qaEl = document.getElementById(uid + '-qa');
  const isQuestion = qaEl && qaEl.querySelector('input') && qaEl.querySelector('input').checked;
  const quotedId = (!parentId && state.quoteTarget && state.quoteTarget.teachingId === teachingId) ? state.quoteTarget.commentId : null;

  const tempId = 'temp-' + Date.now();
  const hasPreview = previewEl && !previewEl.classList.contains('hidden');
  const previewImgSrc = hasPreview ? previewEl.querySelector('img')?.src : null;
  const optimistic = {
    id: tempId, teaching_id: teachingId, user_id: state.user.id,
    content: text || null, image_url: previewImgSrc,
    parent_id: parentId || null, created_at: new Date().toISOString(),
    reactions: [], is_question: isQuestion, is_anonymous: false,
    quoted_comment_id: quotedId, _pending: true
  };
  const t = state.teachings.find(x => x.id === teachingId);
  if (t) {
    t.comments.push(optimistic);
    if (state.teachingViewerId === teachingId) openTeachingViewer(teachingId, { keepScroll: true });
    else renderTeachings();
    if (parentId) { const rb = document.getElementById('reply-box-' + parentId); if (rb) rb.classList.add('hidden'); }
  }
  textEl.value = '';
  if (f1) f1.value = '';
  if (f2) f2.value = '';
  if (previewEl) { previewEl.innerHTML = ''; previewEl.classList.add('hidden'); }
  if (btn) btn.disabled = true;

  try {
    let image_url = null;
    if (file) {
      const path = `${state.user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const { error } = await sb.storage.from('comment-images').upload(path, file);
      if (!error) {
        const { data } = sb.storage.from('comment-images').getPublicUrl(path);
        image_url = data.publicUrl;
      }
    }
    const payload = {
      teaching_id: teachingId,
      user_id: state.user.id,
      content: text || null,
      image_url,
      parent_id: parentId || null
    };
    if (isQuestion) payload.is_question = true;
    if (quotedId) payload.quoted_comment_id = quotedId;

    const { data: inserted, error } = await sb.from('teaching_comments').insert(payload).select().single();
    if (error) throw error;
    if (t) {
      const idx = t.comments.findIndex(c => c.id === tempId);
      if (idx >= 0) t.comments[idx] = { ...inserted, reactions: [] };
    }
    if (parentId) state.expandedReplies.add(parentId);

    if (parentId && t) {
      const parent = t.comments.find(c => c.id === parentId);
      if (parent && parent.user_id !== state.user.id) {
        await sb.from('notifications').insert({
          user_id: parent.user_id, type: 'reply',
          actor_id: state.user.id, actor_username: state.profile.username,
          teaching_id: teachingId, comment_id: parentId,
          message: '@' + state.profile.username + ' replied to your comment'
        });
      }
      if (parent && parent.parent_id) {
        const root = findRootComment(t.comments, parent);
        if (root && root.user_id !== state.user.id && root.id !== (parent ? parent.id : null)) {
          const since = new Date(Date.now() - 86400000).toISOString();
          const { data: existing } = await sb.from('notifications')
            .select('id')
            .eq('user_id', root.user_id)
            .eq('teaching_id', teachingId)
            .eq('comment_id', root.id)
            .eq('type', 'nested_reply')
            .gte('created_at', since)
            .limit(1);
          if (!existing || existing.length === 0) {
            await sb.from('notifications').insert({
              user_id: root.user_id, type: 'nested_reply',
              actor_id: state.user.id, actor_username: state.profile.username,
              teaching_id: teachingId, comment_id: root.id,
              message: '@' + state.profile.username + ' replied in a thread you started'
            });
          }
        }
      }
    }
    if (t && t.user_id && t.user_id !== state.user.id) {
      await sb.from('notifications').insert({
        user_id: t.user_id, type: 'comment',
        actor_id: state.user.id, actor_username: state.profile.username,
        teaching_id: teachingId, comment_id: inserted.id,
        message: '@' + state.profile.username + ' commented on your teaching'
      });
    }
    for (const mu of extractMentions(text)) {
      const { data: u } = await sb.from('profiles').select('id').ilike('username', mu).limit(1).maybeSingle();
      if (u && u.id !== state.user.id) {
        await sb.from('notifications').insert({
          user_id: u.id, type: 'mention',
          actor_id: state.user.id, actor_username: state.profile.username,
          teaching_id: teachingId, comment_id: inserted.id,
          message: '@' + state.profile.username + ' mentioned you'
        });
      }
    }

    logActivity(isQuestion && parentId ? 'qa_answer' : 'comment');
    if (quotedId) state.quoteTarget = null;
    state.openReplyCommentId = null;

    if (state.teachingViewerId === teachingId) openTeachingViewer(teachingId, { keepScroll: true });
    else renderTeachings();
    renderProfile();
  } catch (e) {
    console.error(e);
    alert(describeError(e));
    if (t) {
      const idx = t.comments.findIndex(c => c.id === tempId);
      if (idx >= 0) t.comments[idx]._error = true;
      if (state.teachingViewerId === teachingId) openTeachingViewer(teachingId, { keepScroll: true });
      else renderTeachings();
    }
  }
}

/* ============================================================
   REACTIONS
   ============================================================ */

async function toggleTeachingReaction(teachingId, emoji) {
  const t = state.teachings.find(x => x.id === teachingId);
  if (!t) return;
  const ex = t.reactions.find(r => r.user_id === state.user.id && r.emoji === emoji);
  if (ex) t.reactions = t.reactions.filter(r => r.id !== ex.id);
  else t.reactions = t.reactions.filter(r => r.user_id !== state.user.id).concat([{ id: 'temp-' + Date.now(), teaching_id: teachingId, user_id: state.user.id, emoji, _pending: true }]);

  updateReactionButton('teaching', teachingId, t.reactions);

  try {
    if (ex) {
      await sb.from('teaching_reactions').delete().eq('id', ex.id);
    } else {
      await sb.from('teaching_reactions').delete().eq('teaching_id', teachingId).eq('user_id', state.user.id);
      const { error } = await sb.from('teaching_reactions').insert({ teaching_id: teachingId, user_id: state.user.id, emoji });
      if (error) { console.error(error); await loadTeachings(true); renderTeachings(); }
    }
  } catch (e) { console.error(describeError(e)); }
}

async function toggleCommentReaction(commentId, emoji) {
  let comment = null, teachingId = null;
  for (const t of state.teachings) {
    const c = t.comments.find(x => x.id === commentId);
    if (c) { comment = c; teachingId = t.id; break; }
  }
  if (!comment) return;
  const ex = (comment.reactions || []).find(r => r.user_id === state.user.id && r.emoji === emoji);
  if (ex) comment.reactions = comment.reactions.filter(r => r.id !== ex.id);
  else comment.reactions = (comment.reactions || []).filter(r => r.user_id !== state.user.id).concat([{ id: 'temp-' + Date.now(), comment_id: commentId, user_id: state.user.id, emoji, _pending: true }]);

  updateReactionButton('comment', commentId, comment.reactions);

  try {
    if (ex) {
      await sb.from('comment_reactions').delete().eq('id', ex.id);
    } else {
      await sb.from('comment_reactions').delete().eq('comment_id', commentId).eq('user_id', state.user.id);
      const { error } = await sb.from('comment_reactions').insert({ comment_id: commentId, user_id: state.user.id, emoji });
      if (error) { console.error(error); await loadTeachings(true); renderTeachings(); return; }
      if (comment.user_id !== state.user.id) {
        await sb.from('notifications').insert({
          user_id: comment.user_id, type: 'reaction',
          actor_id: state.user.id, actor_username: state.profile.username,
          teaching_id: teachingId, comment_id: commentId,
          message: '@' + state.profile.username + ' reacted ' + emoji + ' to your comment'
        });
      }
    }
  } catch (e) { console.error(describeError(e)); }
}

/* ============================================================
   SHARE
   ============================================================ */

function shareTeaching(teachingId) {
  const t = state.teachings.find(x => x.id === teachingId);
  if (!t) return;
  const text = (t.title ? t.title + '\n\n' : '') + (t.content || '').replace(/<[^>]*>/g,'').substring(0, 200) + '...\n\nRead on Moph Echo: https://mophecho-mirror.vercel.app';
  if (navigator.share) navigator.share({ title: t.title || 'Moph Echo', text, url: 'https://mophecho-mirror.vercel.app' }).catch(() => {});
  else navigator.clipboard.writeText(text).then(() => alert('Copied.')).catch(() => {});
}

/* ============================================================
   IMAGE / VIDEO VIEWERS
   ============================================================ */

function openImageViewer(src) {
  document.getElementById('imageViewerSrc').src = src;
  document.getElementById('imageViewer').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closeImageViewer() {
  document.getElementById('imageViewer').classList.add('hidden');
  document.getElementById('imageViewerSrc').src = '';
  document.body.style.overflow = '';
}
function openVideoViewer(src) {
  const v = document.getElementById('videoViewerSrc');
  v.src = src;
  document.getElementById('videoViewer').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  v.play().catch(() => {});
}
function closeVideoViewer() {
  const v = document.getElementById('videoViewerSrc');
  v.pause();
  v.src = '';
  document.getElementById('videoViewer').classList.add('hidden');
  document.body.style.overflow = '';
}

/* ============================================================
   NOTIFICATIONS
   ============================================================ */

async function loadNotifications() {
  const { data } = await sb.from('notifications').select('*').eq('user_id', state.user.id).order('created_at', { ascending: false }).limit(50);
  state.notifications = data || [];
  const unread = state.notifications.filter(n => !n.is_read).length;
  const badge = document.getElementById('notifBadge');
  if (unread > 0) { badge.textContent = unread > 9 ? '9+' : unread; badge.classList.remove('hidden'); }
  else badge.classList.add('hidden');
  if (!document.getElementById('notifPanel').classList.contains('hidden')) renderNotifications();
}

function renderNotifications() {
  const el = document.getElementById('notifList');
  if (state.notifications.length === 0) {
    el.innerHTML = '<p class="text-xs text-gray-600 text-center py-8">The mirror is quiet. Nothing has arrived yet.</p>';
    return;
  }
  el.innerHTML = state.notifications.map(n => `<div class="bg-void-800/50 card p-3.5 border ${n.is_read ? 'border-void-600' : 'border-amethyst-500/30'} cursor-pointer transition hover:border-amethyst-500/40 min-w-0" onclick="openNotification(${n.id}, ${n.teaching_id || 'null'})"><p class="text-xs text-gray-300 break-words">${escapeHtml(n.message || 'New notification')}</p><p class="text-[10px] text-gray-600 mt-1.5">${relativeTime(n.created_at)}</p></div>`).join('');
}

function showNotifications() { document.getElementById('notifPanel').classList.remove('hidden'); renderNotifications(); }
function closeNotifications() { document.getElementById('notifPanel').classList.add('hidden'); }
async function markAllRead() {
  await sb.from('notifications').update({ is_read: true }).eq('user_id', state.user.id).eq('is_read', false);
  await loadNotifications();
  renderNotifications();
}
async function openNotification(notifId, teachingId) {
  await sb.from('notifications').update({ is_read: true }).eq('id', notifId);
  await loadNotifications();
  closeNotifications();
  if (teachingId) {
    switchTab('teachings');
    openTeachingViewer(teachingId, { scrollToComments: true });
  }
}

/* ============================================================
   SETTINGS
   ============================================================ */

function openSettings() {
  document.getElementById('setUsername').value = state.profile.username || '';
  document.getElementById('setBio').value = state.profile.bio || '';
  document.getElementById('bioCount').textContent = (state.profile.bio || '').length;
  document.getElementById('setWebsite').value = state.profile.website || '';
  document.getElementById('setSocialX').value = state.profile.social_x || '';
  document.getElementById('setSocialInstagram').value = state.profile.social_instagram || '';
  document.getElementById('setSocialYoutube').value = state.profile.social_youtube || '';
  document.getElementById('setSocialTiktok').value = state.profile.social_tiktok || '';
  document.getElementById('setSocialWhatsapp').value = state.profile.social_whatsapp || '';
  document.getElementById('setSocialLinkedin').value = state.profile.social_linkedin || '';
  document.getElementById('privElement').checked = state.profile.privacy_element !== false;
  document.getElementById('privStage').checked = state.profile.privacy_stage !== false;
  document.getElementById('privWound').checked = state.profile.privacy_wound !== false;
  document.getElementById('privGift').checked = state.profile.privacy_gift !== false;
  document.getElementById('privFollowers').checked = state.profile.privacy_followers !== false;
  document.getElementById('privFollowing').checked = state.profile.privacy_following !== false;
  document.getElementById('setUsernameErr').classList.add('hidden');
  selectTheme(state.profile.theme || 'amethyst');
  document.getElementById('settingsModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closeSettings() {
  document.getElementById('settingsModal').classList.add('hidden');
  document.body.style.overflow = '';
  applyTheme(state.profile.theme || 'amethyst');
}

async function saveSettings() {
  const btn = document.getElementById('saveSettingsBtn');
  const err = document.getElementById('setUsernameErr');
  err.classList.add('hidden');
  btn.textContent = 'Saving...';
  btn.disabled = true;
  const newUsername = document.getElementById('setUsername').value.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,30}$/.test(newUsername)) {
    err.textContent = 'Lowercase letters, numbers, underscores. 3–30 characters.';
    err.classList.remove('hidden');
    btn.textContent = 'Save';
    btn.disabled = false;
    return;
  }
  if (newUsername !== state.profile.username) {
    const { data: ex } = await sb.from('profiles').select('id').ilike('username', newUsername).neq('id', state.user.id).limit(1);
    if (ex && ex.length > 0) {
      err.textContent = 'That username is already taken.';
      err.classList.remove('hidden');
      btn.textContent = 'Save';
      btn.disabled = false;
      return;
    }
  }
  const updates = {
    username: newUsername,
    bio: document.getElementById('setBio').value.trim() || null,
    website: document.getElementById('setWebsite').value.trim() || null,
    social_x: document.getElementById('setSocialX').value.trim() || null,
    social_instagram: document.getElementById('setSocialInstagram').value.trim() || null,
    social_youtube: document.getElementById('setSocialYoutube').value.trim() || null,
    social_tiktok: document.getElementById('setSocialTiktok').value.trim() || null,
    social_whatsapp: document.getElementById('setSocialWhatsapp').value.trim() || null,
    social_linkedin: document.getElementById('setSocialLinkedin').value.trim() || null,
    privacy_element: document.getElementById('privElement').checked,
    privacy_stage: document.getElementById('privStage').checked,
    privacy_wound: document.getElementById('privWound').checked,
    privacy_gift: document.getElementById('privGift').checked,
    privacy_followers: document.getElementById('privFollowers').checked,
    privacy_following: document.getElementById('privFollowing').checked,
    theme: state.selectedTheme
  };
  const { error } = await sb.from('profiles').update(updates).eq('id', state.user.id);
  btn.textContent = 'Save';
  btn.disabled = false;
  if (error) { err.textContent = describeError(error); err.classList.remove('hidden'); return; }
  Object.assign(state.profile, updates);
  state.profileCache[state.user.id] = { username: newUsername, avatar_url: state.profile.avatar_url };
  applyTheme(state.selectedTheme);
  renderProfile();
  closeSettings();
}

function switchProfileTab(tab) {
  ['posts','replies','saved','about'].forEach(t => {
    document.getElementById('pTab' + t.charAt(0).toUpperCase() + t.slice(1)).classList.toggle('active', t === tab);
    document.getElementById('profile' + t.charAt(0).toUpperCase() + t.slice(1)).classList.toggle('hidden', t !== tab);
  });
  if (tab === 'posts') loadMyPosts();
  if (tab === 'replies') loadMyReplies();
  if (tab === 'saved') loadMySaved();
  if (tab === 'about') { loadActivityCalendar(); refreshPushButton(); }
}

/* ============================================================
   PUBLIC PROFILE
   ============================================================ */

async function openPublicProfile(userId) {
  if (userId === state.user.id) { switchTab('profile'); return; }
  const { data } = await sb.from('profiles').select('*').eq('id', userId).single();
  if (!data) { alert('Profile not found.'); return; }
  state.viewingUserId = userId;
  const { data: followers } = await sb.from('follows').select('from_user').eq('to_user', userId);
  const { data: following } = await sb.from('follows').select('to_user').eq('from_user', userId);
  renderPublicProfile(data, followers?.length || 0, following?.length || 0);
  document.getElementById('publicProfileModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

async function openPublicProfileByUsername(username) {
  const { data } = await sb.from('profiles').select('id').ilike('username', username).limit(1).maybeSingle();
  if (data) openPublicProfile(data.id);
}

function closePublicProfile() {
  document.getElementById('publicProfileModal').classList.add('hidden');
  document.body.style.overflow = '';
  state.viewingUserId = null;
}

function renderPublicProfile(p, followersCount, followingCount) {
  const socials = ['social_x', 'social_instagram', 'social_youtube', 'social_tiktok', 'social_whatsapp', 'social_linkedin']
    .filter(k => p[k])
    .map(k => `<a href="${escapeHtml(p[k])}" target="_blank" rel="noopener" class="social-icon">${SOCIAL_ICONS[k].svg}</a>`)
    .join('');
  const websiteHtml = p.website ? `<a href="${escapeHtml(p.website)}" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 text-xs text-amethyst-400 hover:underline mt-2 break-all">${escapeHtml(p.website)}</a>` : '';
  const priv = `<p class="private-badge">Private</p>`;
  const e = p.privacy_element !== false ? `<p class="text-sm font-medium ${p.element ? 'text-amethyst-400' : 'text-gray-400'}">${p.element || '—'}</p>` : priv;
  const s = p.privacy_stage !== false ? `<p class="text-sm font-medium ${p.stage ? 'text-amethyst-400' : 'text-gray-400'}">${p.stage || '—'}</p>` : priv;
  const w = p.privacy_wound !== false ? `<p class="text-sm font-medium ${p.wound ? 'text-amethyst-400' : 'text-gray-400'}">${p.wound || '—'}</p>` : priv;
  const g = p.privacy_gift !== false ? `<p class="text-sm font-medium ${p.gift ? 'text-amethyst-400' : 'text-gray-400'}">${p.gift || '—'}</p>` : priv;
  const avatar = p.avatar_url ? `<img src="${escapeHtml(p.avatar_url)}" class="avatar-lg mx-auto">` : `<div class="avatar-lg mx-auto">${(p.username || '?')[0].toUpperCase()}</div>`;
  const isFollowing = state.myFollowing.has(p.id);
  const isMuted = state.myMutes.has(p.id);
  const streakHtml = (p.streak_count || 0) >= 2 ? `<div class="streak-badge mx-auto mt-3" style="display:inline-flex;"><span>🔥</span><span>${p.streak_count}</span></div>` : '';
  const followersPublic = p.privacy_followers !== false;
  const followingPublic = p.privacy_following !== false;

  document.getElementById('publicProfileContent').innerHTML = `
    <div class="glass card p-6 border border-void-600 mb-3 text-center">
      ${avatar}
      <h2 class="text-lg font-semibold mt-4 break-words">@${escapeHtml(p.username || 'architect')}</h2>
      ${streakHtml ? `<div class="mt-3">${streakHtml}</div>` : ''}
      ${p.bio ? `<p class="text-sm text-gray-400 mt-3 break-words">${escapeHtml(p.bio)}</p>` : ''}
      ${websiteHtml}
      ${socials ? `<div class="flex flex-wrap justify-center gap-2 mt-4">${socials}</div>` : ''}
      <button onclick="toggleFollow('${p.id}', this)" class="follow-btn ${isFollowing ? 'following' : 'not-following'} mt-5">${isFollowing ? 'Following' : 'Follow'}</button>
      <div class="mt-3">
        <button onclick="toggleMuteUser('${p.id}', this)" class="text-[11px] ${isMuted ? 'text-red-400 hover:text-red-300' : 'text-gray-400 hover:text-red-400'} transition">${isMuted ? 'Unmute' : 'Mute'}</button>
      </div>
      <div class="flex justify-center gap-6 mt-4">
        ${followersPublic ? `<div class="text-xs"><span class="font-semibold text-gray-200">${followersCount}</span> <span class="text-gray-500">Followers</span></div>` : `<div class="text-xs text-gray-600 italic">Followers hidden</div>`}
        ${followingPublic ? `<div class="text-xs"><span class="font-semibold text-gray-200">${followingCount}</span> <span class="text-gray-500">Following</span></div>` : `<div class="text-xs text-gray-600 italic">Following hidden</div>`}
      </div>
    </div>
    <div class="glass card p-5 border border-void-600">
      <h3 class="text-sm font-semibold mb-3">Spiritual Stats</h3>
      <div class="grid grid-cols-2 gap-3">
        <div class="bg-void-800/80 rounded-2xl p-3.5 border border-void-600"><p class="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Element</p>${e}</div>
        <div class="bg-void-800/80 rounded-2xl p-3.5 border border-void-600"><p class="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Stage</p>${s}</div>
        <div class="bg-void-800/80 rounded-2xl p-3.5 border border-void-600"><p class="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Core Wound</p>${w}</div>
        <div class="bg-void-800/80 rounded-2xl p-3.5 border border-void-600"><p class="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Core Gift</p>${g}</div>
      </div>
    </div>
  `;
}

/* ============================================================
   OWN PROFILE
   ============================================================ */

function renderProfile() {
  document.getElementById('displayUsername').textContent = '@' + (state.profile.username || 'architect');
  document.getElementById('profileBio').textContent = state.profile.bio || 'Tap the settings icon to add a bio...';
  document.getElementById('profileBio').className = state.profile.bio ? 'text-sm text-gray-400 mt-2 line-clamp-3' : 'text-sm text-gray-600 mt-2 italic';
  if (state.profile.joined_at) {
    document.getElementById('profileJoined').textContent = 'Joined ' + new Date(state.profile.joined_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  } else {
    document.getElementById('profileJoined').textContent = '';
  }
  document.getElementById('followersCount').textContent = state.myFollowers.size;
  document.getElementById('followingCount').textContent = state.myFollowing.size;
  const socials = ['social_x', 'social_instagram', 'social_youtube', 'social_tiktok', 'social_whatsapp', 'social_linkedin']
    .filter(k => state.profile[k])
    .map(k => `<a href="${escapeHtml(state.profile[k])}" target="_blank" rel="noopener" class="social-icon" title="${SOCIAL_ICONS[k].name}">${SOCIAL_ICONS[k].svg}</a>`)
    .join('');
  const webBtn = state.profile.website ? `<a href="${escapeHtml(state.profile.website)}" target="_blank" rel="noopener" class="social-icon" title="Website"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg></a>` : '';
  document.getElementById('profileSocials').innerHTML = webBtn + socials;

  document.getElementById('pElement').textContent = state.profile.element || '—';
  document.getElementById('pElement').className = state.profile.element ? 'text-sm font-medium text-amethyst-400' : 'text-sm font-medium text-gray-400';
  document.getElementById('pStage').textContent = state.profile.stage || '—';
  document.getElementById('pStage').className = state.profile.stage ? 'text-sm font-medium text-amethyst-400' : 'text-sm font-medium text-gray-400';
  document.getElementById('pWound').textContent = state.profile.wound || '—';
  document.getElementById('pWound').className = state.profile.wound ? 'text-sm font-medium text-amethyst-400' : 'text-sm font-medium text-gray-400';
  document.getElementById('pGift').textContent = state.profile.gift || '—';
  document.getElementById('pGift').className = state.profile.gift ? 'text-sm font-medium text-amethyst-400' : 'text-sm font-medium text-gray-400';

  const gl = document.getElementById('goldenList');
  if (state.goldenStars.length === 0) gl.innerHTML = '<p class="text-xs text-gray-600">Your first golden moment is still unwritten.</p>';
  else gl.innerHTML = state.goldenStars.map(s => `<div class="bg-gold-400/5 border border-gold-400/20 card p-3.5"><p class="text-xs text-gold-200 prose-content break-words">${formatResponse(s.text)}</p><p class="text-[10px] text-gray-600 mt-2">${s.date}</p></div>`).join('');

  updateStreakUI();
  loadMyPosts();
  loadMyReplies();
}

async function loadMyPosts() {
  const el = document.getElementById('myPostsList');
  el.innerHTML = '<p class="text-xs text-gray-600 text-center py-6">Loading your posts...</p>';
  const { data, error } = await sb.from('teaching_comments')
    .select('id, content, image_url, teaching_id, created_at, is_question, is_anonymous, pinned, quoted_teaching_id, parent_id')
    .eq('user_id', state.user.id)
    .is('parent_id', null)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    console.error('loadMyPosts error:', error);
    el.innerHTML = '<div class="glass card p-6 border border-void-600 text-center"><p class="text-xs text-gray-600">Could not load your posts. Pull down to refresh.</p></div>';
    return;
  }
  state.myPosts = data || [];
  renderMyPosts();
}

function renderMyPosts() {
  const el = document.getElementById('myPostsList');
  const q = (state.myPostsSearch || '').toLowerCase();
  let filtered = q ? state.myPosts.filter(c => (c.content || '').toLowerCase().includes(q)) : state.myPosts;
  filtered = [...filtered].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  if (!filtered || filtered.length === 0) {
    el.innerHTML = '<div class="glass card p-6 border border-void-600 text-center"><p class="text-xs text-gray-600">' + (q ? 'Nothing matches.' : 'Nothing posted yet.') + '</p></div>';
    return;
  }
  el.innerHTML = filtered.map(c => renderProfilePostCard(c)).join('');
}

function renderProfilePostCard(c) {
  const t = state.teachings.find(x => x.id === c.teaching_id);
  const title = t ? (t.title || 'Untitled teaching') : 'Teaching';
  const qBadge = c.is_question ? '<span class="q-badge">Q&amp;A</span>' : '';
  const anonBadge = c.is_anonymous ? '<span class="anon-badge">anon</span>' : '';
  const pinBadge = c.pinned ? '<span class="pin-badge">📌 Pinned</span>' : '';
  const quotedTeaching = c.quoted_teaching_id ? state.teachings.find(x => x.id === c.quoted_teaching_id) : null;
  const replies = t ? t.comments.filter(x => x.parent_id === c.id && !state.myMutes.has(x.user_id)) : [];
  const repliesExpanded = state.expandedProfileReplies.has(c.id);

  let repliesHtml = '';
  if (replies.length > 0) {
    const toggleBtn = `<div class="replies-toggle" onclick="toggleProfileReplies(${c.id})">💬 ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'} ${repliesExpanded ? '▲' : '▼'}</div>`;
    const listHtml = repliesExpanded ? `<div class="mt-2 space-y-2 border-l-2 border-void-600 pl-3">
      ${replies.slice(0, 5).map(r => {
        const rInfo = state.profileCache[r.user_id] || { username: 'architect', avatar_url: null };
        return `<div class="text-xs">
          <div class="flex items-center gap-2 mb-1">
            ${avatarHtml(r.user_id, 'xs')}
            <button onclick="event.stopPropagation(); openPublicProfile('${r.user_id}')" class="text-amethyst-300 font-medium hover:underline">@${escapeHtml(rInfo.username)}</button>
            <span class="text-gray-600">·</span>
            <span class="text-gray-600">${relativeTime(r.created_at)}</span>
          </div>
          <p class="text-gray-300 break-words">${escapeHtml(r.content || '')}</p>
        </div>`;
      }).join('')}
      ${replies.length > 5 ? `<button onclick="openTeachingViewer(${c.teaching_id}, {scrollToComments: true, focusCommentId: ${c.id}})" class="text-[10px] text-amethyst-400 hover:text-amethyst-300">View all ${replies.length} replies →</button>` : ''}
    </div>` : '';
    repliesHtml = toggleBtn + listHtml;
  }

  return `<div class="post-card min-w-0" data-comment-id="${c.id}">
    <div class="flex items-center gap-2 mb-3 text-xs text-gray-500 min-w-0 flex-wrap">
      ${pinBadge}
      <span class="text-amethyst-400 flex-shrink-0">Replying to</span>
      <span class="text-gray-400 truncate">${escapeHtml(title)}</span>
      ${qBadge}${anonBadge}
      <button onclick="openCommentMenuFromProfile(${c.id}, ${c.teaching_id})" class="ml-auto p-1 text-gray-600 hover:text-gray-300 transition">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"/></svg>
      </button>
    </div>
    ${c.content ? `<p class="text-sm text-gray-200 prose-content break-words">${escapeHtml(c.content)}</p>` : ''}
    ${c.image_url ? `<img src="${escapeHtml(c.image_url)}" class="rounded-2xl mt-3 max-h-64 object-cover cursor-pointer" onclick="event.stopPropagation(); openImageViewer('${escapeHtml(c.image_url)}')">` : ''}
    ${quotedTeaching ? renderQuotedTeaching(quotedTeaching) : ''}
    ${repliesHtml}
    <div class="flex items-center justify-between mt-3.5 pt-3 border-t border-void-600/50">
      <span class="text-[10px] text-gray-600">${relativeTime(c.created_at)}</span>
      <div class="flex items-center gap-3">
        <button onclick="openTeachingViewer(${c.teaching_id}, {scrollToComments: true, focusCommentId: ${c.id}})" class="text-[10px] text-gray-500 hover:text-amethyst-400 transition">View thread</button>
        <button onclick="shareComment(${c.id}, ${c.teaching_id})" class="text-[10px] text-gray-500 hover:text-amethyst-400 transition">Share</button>
      </div>
    </div>
  </div>`;
}

function toggleProfileReplies(commentId) {
  if (state.expandedProfileReplies.has(commentId)) state.expandedProfileReplies.delete(commentId);
  else state.expandedProfileReplies.add(commentId);
  renderMyPosts();
}

function openCommentMenuFromProfile(commentId, teachingId) {
  openCommentMenu(commentId, teachingId);
}

async function loadMyReplies() {
  const el = document.getElementById('myRepliesList');
  if (!el) return;
  el.innerHTML = '<p class="text-xs text-gray-600 text-center py-6">Loading your replies...</p>';
  const { data, error } = await sb.from('teaching_comments')
    .select('id, content, image_url, teaching_id, created_at, is_question, is_anonymous, parent_id, quoted_comment_id, quoted_teaching_id')
    .eq('user_id', state.user.id)
    .not('parent_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    console.error('loadMyReplies error:', error);
    el.innerHTML = '<div class="glass card p-6 border border-void-600 text-center"><p class="text-xs text-gray-600">Could not load your replies.</p></div>';
    return;
  }
  state.myReplies = data || [];
  renderMyReplies();
}

function renderMyReplies() {
  const el = document.getElementById('myRepliesList');
  if (!el) return;
  if (!state.myReplies || state.myReplies.length === 0) {
    el.innerHTML = '<div class="glass card p-6 border border-void-600 text-center"><p class="text-xs text-gray-600">You have not replied to any comment yet.</p></div>';
    return;
  }
  el.innerHTML = state.myReplies.map(r => {
    const t = state.teachings.find(x => x.id === r.teaching_id);
    const parent = t ? t.comments.find(x => x.id === r.parent_id) : null;
    const parentUser = parent ? (state.profileCache[parent.user_id]?.username || 'someone') : 'someone';
    const parentExcerpt = parent ? (parent.content || '[image]').slice(0, 100) : '';
    const title = t ? (t.title || 'Untitled teaching') : 'Teaching';
    return `<div class="post-card min-w-0">
      <div class="flex items-center gap-2 mb-2 text-xs text-gray-500 min-w-0">
        <span class="text-gray-500">Replying to</span>
        <button onclick="openPublicProfile('${parent ? parent.user_id : ''}')" class="text-amethyst-300 font-medium hover:underline">@${escapeHtml(parentUser)}</button>
        <span>·</span>
        <span class="text-gray-600">${relativeTime(r.created_at)}</span>
      </div>
      ${parentExcerpt ? `<div class="text-xs text-gray-500 border-l-2 border-void-600 pl-2 mb-2 italic break-words">${escapeHtml(parentExcerpt)}${parent && (parent.content || '').length > 100 ? '…' : ''}</div>` : ''}
      ${r.content ? `<p class="text-sm text-gray-200 prose-content break-words">${escapeHtml(r.content)}</p>` : ''}
      ${r.image_url ? `<img src="${escapeHtml(r.image_url)}" class="rounded-2xl mt-3 max-h-64 object-cover cursor-pointer" onclick="openImageViewer('${escapeHtml(r.image_url)}')">` : ''}
      <div class="flex items-center justify-between mt-3 pt-3 border-t border-void-600/50">
        <span class="text-[10px] text-gray-600 truncate">On: ${escapeHtml(title)}</span>
        <button onclick="openTeachingViewer(${r.teaching_id}, {scrollToComments: true, focusCommentId: ${r.id}})" class="text-[10px] text-gray-500 hover:text-amethyst-400 transition">View thread</button>
      </div>
    </div>`;
  }).join('');
}

function filterMyPosts() {
  state.myPostsSearch = document.getElementById('searchMyPosts').value.trim();
  renderMyPosts();
}

async function handleAvatarUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  document.getElementById('avatarLoading').classList.remove('hidden');
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${state.user.id}/avatar-${Date.now()}.${ext}`;
  const { error } = await sb.storage.from('avatars').upload(path, file, { upsert: true });
  if (error) {
    document.getElementById('avatarLoading').classList.add('hidden');
    alert(describeError(error));
    return;
  }
  const { data } = sb.storage.from('avatars').getPublicUrl(path);
  const url = data.publicUrl + '?t=' + Date.now();
  await sb.from('profiles').update({ avatar_url: url }).eq('id', state.user.id);
  state.profile.avatar_url = url;
  state.profileCache[state.user.id] = { username: state.profile.username, avatar_url: url };
  document.getElementById('avatarUpload').innerHTML = `<img src="${url}" class="w-full h-full object-cover"><input type="file" id="avatarInput" accept="image/*" class="hidden">`;
  document.getElementById('avatarLoading').classList.add('hidden');
  document.getElementById('avatarInput').addEventListener('change', handleAvatarUpload);
}

/* ============================================================
   TAB SWITCHING
   ============================================================ */

function switchTab(tab) {
  ['chat','teachings','profile'].forEach(t => {
    const panel = document.getElementById('panel' + t.charAt(0).toUpperCase() + t.slice(1));
    if (panel) panel.classList.add('hidden');
    const btn = document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1));
    if (btn) btn.className = 'flex-1 py-2 text-[11px] font-medium rounded-xl text-gray-500 hover:text-gray-300 flex items-center justify-center gap-1.5 transition';
  });
  document.getElementById('panel' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.remove('hidden');
  document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1)).className = 'flex-1 py-2 text-[11px] font-medium rounded-xl bg-amethyst-600/25 text-amethyst-300 border border-amethyst-500/25 flex items-center justify-center gap-1.5 transition';
  localStorage.setItem('moph_active_tab', tab);
  if (tab === 'profile') renderProfile();
  if (tab === 'teachings') renderTeachings();
}

/* ============================================================
   CHAT
   ============================================================ */

function renderChat() {
  const c = document.getElementById('chatContainer');
  if (state.messages.length === 0) {
    c.innerHTML = `<div class="glass card p-5 border border-void-600 fade-in"><p class="text-sm text-gray-300">Welcome. I am the mirror.</p><p class="text-xs text-gray-500 mt-1">Speak your truth.</p></div>`;
    return;
  }
  c.innerHTML = state.messages.map(m => {
    if (m.role === 'user') return `<div class="flex justify-end fade-in"><div class="bg-amethyst-600/20 border border-amethyst-500/20 rounded-3xl rounded-br-lg px-4 py-3 max-w-[85%]"><p class="text-sm text-gray-200 break-words">${escapeHtml(m.text)}</p></div></div>`;
    if (m.role === 'surprise') return `<div class="flex justify-start fade-in"><div class="bg-gold-400/10 border border-gold-400/30 rounded-3xl rounded-bl-lg px-4 py-3 max-w-[90%]"><p class="text-sm text-gold-200 break-words">${formatResponse(m.text)}</p></div></div>`;
    return `<div class="flex justify-start fade-in"><div class="glass rounded-3xl rounded-bl-lg px-4 py-3 max-w-[90%] border border-void-600"><p class="text-sm text-gray-300 break-words">${m.text}</p></div></div>`;
  }).join('');
  c.scrollTop = c.scrollHeight;
}

async function processEntry() {
  const input = document.getElementById('userInput');
  const text = input.value.trim();
  if (!text || !state.user) return;

  state.messages.push({ role: 'user', text });
  await saveMessage('user', text);
  input.value = '';
  input.style.height = 'auto';
  renderChat();

  await new Promise(r => setTimeout(r, 400));

  const lastMsg = state.messages.length > 1 ? state.messages[state.messages.length - 2]?.text : '';
  const { response } = generateReflection(text, state.usedResponses, lastMsg);
  state.usedResponses.push(response);
  if (state.usedResponses.length > 100) state.usedResponses = state.usedResponses.slice(-100);

  state.messages.push({ role: 'mirror', text: response });
  await saveMessage('mirror', response);

  identifyProfile(text);
  const ns = generateGoldenStar(text);
  if (ns) {
    setTimeout(async () => {
      state.messages.push({ role: 'surprise', text: ns.text });
      await saveMessage('surprise', ns.text);
      await saveGoldenStar(ns.text, ns.trait_type, ns.trait_value);
      renderChat();
      renderProfile();
    }, 1500);
  }
  renderChat();
  renderProfile();
  checkGrounding(text);
  input.focus();
}

function identifyProfile(text) {
  const l = text.toLowerCase();
  let changed = false;
  if (!state.profile.element) {
    if (l.includes('anger')||l.includes('passion')||l.includes('burn')||l.includes('fire')) { state.profile.element='Fire'; changed=true; }
    else if (l.includes('sad')||l.includes('cry')||l.includes('deep')||l.includes('void')||l.includes('empty')) { state.profile.element='Water'; changed=true; }
    else if (l.includes('heavy')||l.includes('grounded')||l.includes('money')||l.includes('debt')) { state.profile.element='Earth'; changed=true; }
    else if (l.includes('think')||l.includes('curious')||l.includes('mind')||l.includes('question')) { state.profile.element='Air'; changed=true; }
  }
  if (!state.profile.wound) {
    if (l.includes('alone')||l.includes('lonely')||l.includes('abandoned')) { state.profile.wound='Abandonment'; changed=true; }
    else if (l.includes('betray')||l.includes('trust')||l.includes('liar')) { state.profile.wound='Betrayal'; changed=true; }
    else if (l.includes('worthless')||l.includes('not enough')||l.includes('failure')) { state.profile.wound='Worthlessness'; changed=true; }
    else if (l.includes('powerless')||l.includes('control')||l.includes('weak')) { state.profile.wound='Powerlessness'; changed=true; }
    else if (l.includes('invisible')||l.includes('ignore')) { state.profile.wound='Invisibility'; changed=true; }
  }
  if (!state.profile.gift) {
    if (l.includes('intuitive')||l.includes('know without knowing')) { state.profile.gift='Intuition'; changed=true; }
    else if (l.includes('heal')||l.includes('comfort')||l.includes('nurture')) { state.profile.gift='Healing'; changed=true; }
    else if (l.includes('teach')||l.includes('explain')||l.includes('guide')) { state.profile.gift='Teaching'; changed=true; }
    else if (l.includes('create')||l.includes('build')||l.includes('design')) { state.profile.gift='Creation'; changed=true; }
    else if (l.includes('protect')||l.includes('shield')||l.includes('guard')) { state.profile.gift='Protection'; changed=true; }
  }
  if (changed) saveProfile();
}

function generateGoldenStar() {
  if (state.profile.element && !state.goldenStars.some(s => s.trait_type === 'element')) {
    const r = TRAIT_REWARDS.element[state.profile.element];
    if (r) return { text: r, trait_type: 'element', trait_value: state.profile.element };
  }
  if (state.profile.wound && !state.goldenStars.some(s => s.trait_type === 'wound')) {
    const r = TRAIT_REWARDS.wound[state.profile.wound];
    if (r) return { text: r, trait_type: 'wound', trait_value: state.profile.wound };
  }
  if (state.profile.gift && !state.goldenStars.some(s => s.trait_type === 'gift')) {
    const r = TRAIT_REWARDS.gift[state.profile.gift];
    if (r) return { text: r, trait_type: 'gift', trait_value: state.profile.gift };
  }
  return null;
}

function checkGrounding(text) {
  const l = text.toLowerCase();
  const a = document.getElementById('groundingAlert');
  if (l.includes('hungry')||l.includes('floating')||l.includes('eat')) a.classList.remove('hidden');
  else a.classList.add('hidden');
}

/* ============================================================
   DOWNLOAD
   ============================================================ */

function openDownloadModal() {
  if (state.messages.length === 0) { alert('Nothing to download yet.'); return; }
  document.getElementById('downloadModal').classList.remove('hidden');
}
function closeDownloadModal() { document.getElementById('downloadModal').classList.add('hidden'); }

function downloadAs(format) {
  const filename = (document.getElementById('downloadFilename').value.trim() || 'moph-echo-journey').replace(/[^a-z0-9-_]/gi, '_');
  let log = 'MOPH ECHO MIRROR — REFLECTION LOG\n' + `Exported: ${new Date().toLocaleString()}\n${'='.repeat(50)}\n\n`;
  state.messages.forEach(m => {
    const r = m.role === 'user' ? 'YOU' : m.role === 'surprise' ? 'GOLDEN' : 'MIRROR';
    log += `[${r}] ${String(m.text).replace(/<[^>]*>/g, '')}\n${'-'.repeat(30)}\n`;
  });
  if (format === 'txt') {
    const blob = new Blob([log], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename + '.txt';
    a.click();
    URL.revokeObjectURL(a.href);
    closeDownloadModal();
    return;
  }
  const hms = state.messages.map(m => {
    if (m.role === 'user') return `<div class="msg user"><div class="bubble user">${escapeHtml(m.text)}</div></div>`;
    if (m.role === 'surprise') return `<div class="msg mirror"><div class="bubble gold">${escapeHtml(String(m.text).replace(/<[^>]*>/g, ''))}</div></div>`;
    return `<div class="msg mirror"><div class="bubble mirror">${String(m.text).replace(/<[^>]*>/g, '')}</div></div>`;
  }).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(filename)}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Inter',Arial,sans-serif;background:#fff;color:#111;padding:40px;max-width:700px;margin:0 auto;}h1{font-size:22px;color:#7c3aed;margin-bottom:4px;}.meta{font-size:12px;color:#666;margin-bottom:32px;border-bottom:1px solid #eee;padding-bottom:16px;}.msg{margin-bottom:16px;display:flex;}.msg.user{justify-content:flex-end;}.bubble{padding:10px 14px;border-radius:14px;max-width:80%;font-size:13px;line-height:1.6;white-space:pre-wrap;}.bubble.user{background:#f3e8ff;border:1px solid #e9d5ff;}.bubble.mirror{background:#f9fafb;border:1px solid #e5e7eb;}.bubble.gold{background:#fefce8;border:1px solid #fde68a;color:#854d0e;}@media print{body{padding:0;}.msg{page-break-inside:avoid;}}</style></head><body><h1>⚡ Moph Echo Mirror</h1><div class="meta">Reflection log · ${new Date().toLocaleString()}</div>${hms}<script>window.onload = () => { setTimeout(() => window.print(), 300); }<\/script></body></html>`;
  const win = window.open('', '_blank');
  if (!win) { alert('Allow popups.'); return; }
  win.document.write(html);
  win.document.close();
  closeDownloadModal();
}

/* ============================================================
   EXPOSE TO WINDOW
   ============================================================ */

Object.assign(window, {
  retryConnection, handleInstall, dismissInstall,
  togglePass, toggleSignupMode, signIn, verifyOtp, resendOtp, backToAuth,
  confirmSignOut,
  nextOnboarding, skipOnboarding, selectTheme,
  openDownloadModal, closeDownloadModal, downloadAs,
  showNotifications, closeNotifications, markAllRead, openNotification,
  openSettings, closeSettings, saveSettings, switchProfileTab,
  openPublicProfile, openPublicProfileByUsername, closePublicProfile,
  toggleMuteUser,
  switchTab, switchSubTab, setSort,
  openImageViewer, closeImageViewer, openVideoViewer, closeVideoViewer,
  processEntry, enablePush, handleAvatarUpload,
  toggleFollow, toggleBookmark,
  filterTeachings, filterMyPosts, setTag, renderTeachings,
  filterSavedFolder, moveToFolder,
  toggleReactionPicker, selectReaction, votePoll,
  openCommentMenu, quoteComment, shareComment, askDeleteComment, undoDelete,
  openEditCommentModal, closeEditCommentModal, saveEditedComment,
  openQuoteTeachingModal, closeQuoteTeachingModal, submitQuoteTeaching,
  insertMention, submitComment, previewCommentImage, removeCommentImage, autoGrow, autoGrowChat,
  handleMention, showReplyBox, cancelReply, sendPoke, acceptAnswer, pinComment,
  setQuote, clearQuote, toggleSmartFlag, updateSmartToggles,
  openTeachingViewer, closeTeachingViewer, toggleReplies, toggleViewerComments, shareTeaching,
  toggleCardExpand, toggleProfileReplies, openCommentMenuFromProfile,
  closeFolderPicker, createNewFolder
});

/* ============================================================
   BOOT
   ============================================================ */

document.getElementById('rememberMe').addEventListener('change', (e) => localStorage.setItem('moph_remember', e.target.checked ? 'true' : 'false'));
document.getElementById('rememberMe').checked = localStorage.getItem('moph_remember') !== 'false';
document.getElementById('setBio').addEventListener('input', (e) => { document.getElementById('bioCount').textContent = e.target.value.length; });
document.getElementById('avatarUpload').addEventListener('click', () => document.getElementById('avatarInput').click());
document.getElementById('avatarInput').addEventListener('change', handleAvatarUpload);
document.getElementById('userInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); processEntry(); }
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('textarea')) document.querySelectorAll('.mention-dropdown').forEach(d => d.classList.add('hidden'));
});

initConfig();
