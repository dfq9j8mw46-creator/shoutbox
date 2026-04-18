import { ChatRoom } from './chat-room.js';
import { HTML } from './html.js';
import { PAIR_HTML } from './pair-html.js';
import VERSION from './version.json';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import qrcode from 'qrcode-generator';

export { ChatRoom };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function setCookie(name, value, maxAge, { secure = true } = {}) {
  const flags = ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (secure) flags.push('Secure');
  return `${name}=${encodeURIComponent(value)}; ${flags.join('; ')}`;
}

function challengeCookie(cid, maxAge, { secure = true } = {}) {
  return setCookie('cid', cid, maxAge, { secure });
}

function isSecureRequest(request, env) {
  // Production runs behind HTTPS (custom domain + BASE_URL starts with https://).
  // For local `wrangler dev` over http://localhost we allow non-Secure cookies.
  if (env.BASE_URL && env.BASE_URL.startsWith('https://')) return true;
  const proto = request.headers.get('X-Forwarded-Proto') || new URL(request.url).protocol;
  return proto === 'https:' || proto === 'https';
}

const SESSION_TTL = 60 * 60 * 24 * 7;
const ACCOUNT_OWNER_PREFIX = 'acct:';

function isSyntheticOwnerId(ownerId) {
  return ownerId.startsWith('pk:') || ownerId.startsWith(ACCOUNT_OWNER_PREFIX);
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Generate a default username from email
const ADJECTIVES = [
  'Swift','Quiet','Bold','Clever','Brave','Gentle','Witty','Keen',
  'Lucky','Calm','Daring','Bright','Sly','Merry','Noble','Rapid',
  'Snug','Vivid','Warm','Zesty','Agile','Cool','Eager','Fancy',
  'Grand','Happy','Jolly','Kind','Lofty','Neat','Proud','Royal',
];
const ANIMALS = [
  'Panda','Fox','Owl','Wolf','Bear','Hawk','Lynx','Deer',
  'Otter','Raven','Crane','Shark','Tiger','Eagle','Viper','Bison',
  'Koala','Heron','Moose','Finch','Cobra','Whale','Newt','Crow',
  'Ibis','Lemur','Mole','Seal','Toad','Wren','Yak','Zebu',
];

async function defaultUsername(email, secret) {
  const h = await hmac(secret, email.toLowerCase().trim());
  const a = parseInt(h.slice(0, 2), 16) % ADJECTIVES.length;
  const b = parseInt(h.slice(2, 4), 16) % ANIMALS.length;
  const n = (parseInt(h.slice(4, 6), 16) % 90) + 10;
  return `${ADJECTIVES[a]}${ANIMALS[b]}${n}`;
}

// --- Color contrast (WCAG) ----------------------------------------------
const BG_HEX = '#0f0f0f';
const MIN_CONTRAST = 3.0;

function hexToRgb(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '');
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
}
function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}
function relLuminance([r, g, b]) {
  const chan = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}
function contrastRatio(hex1, hex2) {
  const a = relLuminance(hexToRgb(hex1));
  const b = relLuminance(hexToRgb(hex2));
  const [lo, hi] = a > b ? [b, a] : [a, b];
  return (hi + 0.05) / (lo + 0.05);
}
function hasEnoughContrast(hex) {
  return hexToRgb(hex) ? contrastRatio(hex, BG_HEX) >= MIN_CONTRAST : false;
}

async function defaultColor(seed, secret) {
  const h = await hmac(secret, seed);
  const hue = parseInt(h.slice(0, 4), 16) % 360;
  // Pure blues have low luminance contribution, so just bumping saturation
  // isn't enough; iterate lightness until we clear MIN_CONTRAST.
  for (const lightness of [60, 65, 70, 75, 80, 85]) {
    const hex = rgbToHex(...hslToRgb(hue, 70, lightness));
    if (hasEnoughContrast(hex)) return hex;
  }
  return '#dddddd';
}

// Cap per-user session fan-out so `usessions:${email}` stays small and
// profile updates don't devolve into an unbounded read/write loop.
const MAX_SESSIONS_PER_USER = 20;

async function addSessionIndex(env, email, sid) {
  const key = `usessions:${email}`;
  const cur = await env.KV.get(key);
  const list = cur ? JSON.parse(cur) : [];
  if (list.includes(sid)) return;
  list.push(sid);
  const evicted = list.length > MAX_SESSIONS_PER_USER
    ? list.splice(0, list.length - MAX_SESSIONS_PER_USER)
    : [];
  await env.KV.put(key, JSON.stringify(list));
  if (evicted.length) {
    await Promise.all(evicted.map((s) => env.KV.delete(`session:${s}`)));
  }
}

async function removeSessionIndex(env, email, sid) {
  const key = `usessions:${email}`;
  const cur = await env.KV.get(key);
  if (!cur) return;
  const list = JSON.parse(cur).filter((s) => s !== sid);
  if (list.length === 0) await env.KV.delete(key);
  else await env.KV.put(key, JSON.stringify(list));
}

async function deleteAllSessions(env, email) {
  const key = `usessions:${email}`;
  const cur = await env.KV.get(key);
  if (!cur) return;
  const list = JSON.parse(cur);
  await Promise.all(list.map((sid) => env.KV.delete(`session:${sid}`)));
  await env.KV.delete(key);
}

async function deleteOtherSessions(env, email, keepSid) {
  const key = `usessions:${email}`;
  const cur = await env.KV.get(key);
  if (!cur) return 0;
  const list = JSON.parse(cur);
  const others = list.filter((sid) => sid !== keepSid);
  await Promise.all(others.map((sid) => env.KV.delete(`session:${sid}`)));
  const next = list.includes(keepSid) ? [keepSid] : [];
  if (next.length === 0) await env.KV.delete(key);
  else await env.KV.put(key, JSON.stringify(next));
  return others.length;
}

// Sliding-window rate limit keyed by an arbitrary KV key.
// Uses a 1-hour TTL and a linear counter + first-attempt timestamp.
async function rateLimit(env, key, max, windowSec) {
  const now = Date.now();
  const raw = await env.KV.get(key);
  let record = raw ? JSON.parse(raw) : { count: 0, windowStart: now };
  if (now - record.windowStart > windowSec * 1000) {
    record = { count: 0, windowStart: now };
  }
  record.count += 1;
  const ok = record.count <= max;
  await env.KV.put(key, JSON.stringify(record), { expirationTtl: windowSec + 60 });
  return { ok, retryAfterSec: ok ? 0 : Math.ceil((record.windowStart + windowSec * 1000 - now) / 1000) };
}

async function hashIpForRateLimit(ip, secret) {
  if (!ip) return 'anon';
  // Rotate daily so the hash isn't a long-term identifier.
  const day = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  const h = await hmac(secret, `rl:${day}:${ip}`);
  return h.slice(0, 16);
}

// Detect Windows desktop browsers. Passkey UX on Windows is rough enough
// that we route those users through a phone-pair flow by default; everyone
// else (mobile + Mac/Linux desktop) gets the direct passkey path.
function isWindowsDesktop(ua) {
  if (!ua) return false;
  if (/Mobile|Android|iPhone|iPad|iPod/i.test(ua)) return false;
  return /Windows/i.test(ua);
}

const QR_TTL = 300;

function renderPairQrSvg(text) {
  // typeNumber=0 lets the lib pick the smallest type that fits the URL.
  // 'M' error-correction (~15%) is the sweet spot for phone cameras vs.
  // glare/angle without inflating the module count.
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  // cellSize=8, margin=16 → crisp at roughly 256-320px. scalable=true
  // drops the fixed width/height so CSS sizing takes over.
  return qr.createSvgTag({ cellSize: 8, margin: 16, scalable: true });
}

async function createSession(env, email, secret) {
  email = await maybeMigrateChangedLegacyOwnerId(env, secret, email);
  const sid = crypto.randomUUID();
  const profile = await loadOrCreateProfile(env, email, secret);
  const session = JSON.stringify({
    email,
    username: profile.username,
    color: profile.color,
    fingerprint: profile.fingerprint,
  });
  await env.KV.put(`session:${sid}`, session, { expirationTtl: SESSION_TTL });
  await addSessionIndex(env, email, sid);
  return sid;
}

async function fingerprint(secret, email) {
  const h = await hmac(secret, 'fp:' + email.toLowerCase().trim());
  return h.slice(0, 6);
}

async function reserveUsername(env, base, email) {
  let name = base;
  for (let i = 0; i < 50; i++) {
    const owner = await env.KV.get(`username:${name}`);
    if (!owner || owner === email) {
      await env.KV.put(`username:${name}`, email);
      return name;
    }
    name = base + (i + 2);
  }
  return base + Math.floor(Math.random() * 9999);
}

// Email-key helpers.
//
// Every KV key that used to embed a plaintext email now embeds an HMAC
// of the email instead. That kills the "grep the KV dump for
// emailIndex:alice@example.com" attack: without SECRET you can't map a
// known email to its key, and you can't reverse a hashed key to an email.
// The email still lives in the VALUE of emailIndex entries so the scan
// still works for listOwnedEmails, but it's not patterned, so an
// attacker can't find a specific user's entry without scanning every
// emailIndex record.
//
// Lazy migration: wherever we'd formerly read emailIndex:<email>, we now
// read the hashed key, fall back to the legacy plaintext key, and on a
// hit, rewrite to the hashed form and delete the plaintext entry. So
// old data gets cleaned up the first time each email is looked up after
// deploy, with zero downtime.
async function hashEmailKey(secret, email) {
  return (await hmac(secret, 'email:' + email.toLowerCase())).slice(0, 32);
}

function parseEmailIndexValue(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.owner) return parsed;
  } catch {}
  return { owner: raw, email: null };
}

// Reverse index: ownerEmails:${ownerId} → JSON array of the emails this owner
// claims. Maintained in lockstep with emailIndex:* by put/delete below so the
// common "what does this account own?" question is an O(1) KV read instead of
// a full emailIndex scan.
async function getOwnerEmailsCached(env, ownerId) {
  const raw = await env.KV.get(`ownerEmails:${ownerId}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function addOwnerEmail(env, ownerId, email) {
  email = email.toLowerCase();
  const current = (await getOwnerEmailsCached(env, ownerId)) || [];
  if (current.includes(email)) return;
  current.push(email);
  await env.KV.put(`ownerEmails:${ownerId}`, JSON.stringify(current));
}

async function removeOwnerEmail(env, ownerId, email) {
  email = email.toLowerCase();
  const current = await getOwnerEmailsCached(env, ownerId);
  if (!current) return;
  const next = current.filter((e) => e !== email);
  if (next.length === current.length) return;
  if (next.length === 0) await env.KV.delete(`ownerEmails:${ownerId}`);
  else await env.KV.put(`ownerEmails:${ownerId}`, JSON.stringify(next));
}

async function getOwnerByEmail(env, secret, email) {
  email = email.toLowerCase();
  const hashed = await hashEmailKey(secret, email);
  const hashedRaw = await env.KV.get(`emailIndex:${hashed}`);
  if (hashedRaw) {
    const parsed = parseEmailIndexValue(hashedRaw);
    return parsed ? parsed.owner : null;
  }
  const legacy = await env.KV.get(`emailIndex:${email}`);
  if (legacy) {
    await env.KV.put(`emailIndex:${hashed}`, JSON.stringify({ owner: legacy, email }));
    await env.KV.delete(`emailIndex:${email}`);
    await addOwnerEmail(env, legacy, email);
    return legacy;
  }
  return null;
}

async function putEmailIndex(env, secret, email, ownerId) {
  email = email.toLowerCase();
  const hashed = await hashEmailKey(secret, email);
  // Detect ownership transfer so we can drop the reverse-index pointer on
  // the prior owner instead of stranding it.
  const priorParsed = parseEmailIndexValue(await env.KV.get(`emailIndex:${hashed}`));
  const priorOwner = priorParsed ? priorParsed.owner : null;
  await env.KV.put(`emailIndex:${hashed}`, JSON.stringify({ owner: ownerId, email }));
  await env.KV.delete(`emailIndex:${email}`);
  if (priorOwner && priorOwner !== ownerId) {
    await removeOwnerEmail(env, priorOwner, email);
  }
  await addOwnerEmail(env, ownerId, email);
}

async function deleteEmailIndexByEmail(env, secret, email) {
  email = email.toLowerCase();
  const hashed = await hashEmailKey(secret, email);
  const existing = parseEmailIndexValue(await env.KV.get(`emailIndex:${hashed}`))
    || parseEmailIndexValue(await env.KV.get(`emailIndex:${email}`));
  await env.KV.delete(`emailIndex:${hashed}`);
  await env.KV.delete(`emailIndex:${email}`);
  if (existing && existing.owner) {
    await removeOwnerEmail(env, existing.owner, email);
  }
}

async function listOwnedEmails(env, ownerId) {
  const cached = await getOwnerEmailsCached(env, ownerId);
  if (cached) return cached;
  // No reverse-index entry yet (legacy data or a passkey-only account):
  // scan forward index once and backfill so subsequent calls are O(1).
  const prefix = 'emailIndex:';
  let cursor = undefined;
  const emails = [];
  do {
    const page = await env.KV.list({ prefix, cursor, limit: 1000 });
    const matches = await Promise.all(page.keys.map(async ({ name }) => {
      const raw = await env.KV.get(name);
      if (!raw) return null;
      // New hashed format: value is JSON { owner, email }.
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.owner) {
          return parsed.owner === ownerId ? parsed.email : null;
        }
      } catch {}
      // Legacy plaintext format: value is ownerId, email is the key suffix.
      return raw === ownerId ? name.slice(prefix.length) : null;
    }));
    for (const email of matches) {
      if (email) emails.push(email);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  const unique = [...new Set(emails)];
  if (unique.length) {
    await env.KV.put(`ownerEmails:${ownerId}`, JSON.stringify(unique));
  }
  return unique;
}

async function rewriteOwnedEmailIndexes(env, secret, ownerId, keepEmails = [], nextOwnerId = ownerId) {
  const keep = new Set(keepEmails.filter(Boolean).map((email) => email.toLowerCase()));
  const owned = await listOwnedEmails(env, ownerId);
  await Promise.all(owned.map(async (email) => {
    if (keep.has(email)) {
      await putEmailIndex(env, secret, email, nextOwnerId);
    } else {
      await deleteEmailIndexByEmail(env, secret, email);
    }
  }));
  await Promise.all([...keep].map((email) => putEmailIndex(env, secret, email, nextOwnerId)));
}

async function migrateLegacyOwnerId(env, secret, ownerId, profile, keepEmails = []) {
  if (!ownerId || isSyntheticOwnerId(ownerId)) return ownerId;

  const latestProfileRaw = await env.KV.get(`profile:${ownerId}`);
  if (!latestProfileRaw) {
    const keep = keepEmails.find(Boolean);
    return keep ? ((await getOwnerByEmail(env, secret, keep)) || ownerId) : ownerId;
  }
  const latestProfile = profile || JSON.parse(latestProfileRaw);
  const newOwnerId = ACCOUNT_OWNER_PREFIX + crypto.randomUUID();

  await env.KV.put(`profile:${newOwnerId}`, JSON.stringify(latestProfile));
  await env.KV.delete(`profile:${ownerId}`);

  if (latestProfile.username) {
    const usernameKey = `username:${latestProfile.username}`;
    const mappedOwner = await env.KV.get(usernameKey);
    if (mappedOwner === ownerId) {
      await env.KV.put(usernameKey, newOwnerId);
    }
  }

  const credEntries = await listCredentialEntries(env, ownerId);
  if (credEntries.length) {
    await env.KV.put(`userCreds:${newOwnerId}`, JSON.stringify(credEntries));
  }
  await env.KV.delete(`userCreds:${ownerId}`);
  await Promise.all(credEntries.map(async ({ id }) => {
    const raw = await env.KV.get(`credential:${id}`);
    if (!raw) return;
    const cred = JSON.parse(raw);
    if (cred.ownerId !== ownerId) return;
    cred.ownerId = newOwnerId;
    await env.KV.put(`credential:${id}`, JSON.stringify(cred));
  }));

  const recoveryRaw = await env.KV.get(`recovery:${ownerId}`);
  if (recoveryRaw) {
    await env.KV.put(`recovery:${newOwnerId}`, recoveryRaw);
  }
  await env.KV.delete(`recovery:${ownerId}`);

  const sessionIndexRaw = await env.KV.get(`usessions:${ownerId}`);
  if (sessionIndexRaw) {
    const sessionIds = JSON.parse(sessionIndexRaw);
    const alive = (await Promise.all(sessionIds.map(async (sid) => {
      const raw = await env.KV.get(`session:${sid}`);
      if (!raw) return null;
      const session = JSON.parse(raw);
      session.email = newOwnerId;
      await saveSession(env, sid, session);
      return sid;
    }))).filter((sid) => sid !== null);
    if (alive.length) {
      await env.KV.put(`usessions:${newOwnerId}`, JSON.stringify(alive));
    }
  }
  await env.KV.delete(`usessions:${ownerId}`);

  await rewriteOwnedEmailIndexes(env, secret, ownerId, keepEmails, newOwnerId);
  return newOwnerId;
}

// Force-migrate any legacy-format ownerId (where ownerId == plaintext
// email) to a synthetic UUID. Previously this only fired when the email
// had *changed*; running unconditionally pulls plaintext email out of
// every KV key suffix (profile:, usessions:, userCreds:, recovery:,
// credentials) for legacy accounts on their next login. Idempotent:
// synthetic ownerIds short-circuit immediately.
async function maybeMigrateChangedLegacyOwnerId(env, secret, ownerId) {
  if (!ownerId || isSyntheticOwnerId(ownerId)) return ownerId;
  const raw = await env.KV.get(`profile:${ownerId}`);
  if (!raw) return ownerId;
  const profile = JSON.parse(raw);
  const currentEmail = (profile.email || '').trim().toLowerCase();
  return migrateLegacyOwnerId(env, secret, ownerId, profile, currentEmail ? [currentEmail] : []);
}

// `ownerId` here is the stable account identifier. Older magic-link accounts
// start as the signup email; passkey-first accounts and migrated legacy
// accounts use synthetic ids. The *current* email (which may differ from the
// original) lives in profile.email and is indexed separately via emailIndex.
async function loadOrCreateProfile(env, ownerId, secret) {
  const key = `profile:${ownerId}`;
  const isEmailOwner = !isSyntheticOwnerId(ownerId);
  const raw = await env.KV.get(key);
  if (raw) {
    const p = JSON.parse(raw);
    let dirty = false;
    if (!p.fingerprint) { p.fingerprint = await fingerprint(secret, ownerId); dirty = true; }
    if (!p.created_at)  { p.created_at = new Date().toISOString(); dirty = true; }
    // Backfill profile.email for legacy accounts created before email was a
    // first-class field (when ownerId was the email).
    if (isEmailOwner && !p.email) { p.email = ownerId; dirty = true; }
    // Repair passkey/synthetic-owner accounts corrupted by older profile saves
    // that dropped the current linked email.
    if (!isEmailOwner && !p.email) {
      const aliases = await listOwnedEmails(env, ownerId);
      if (aliases.length === 1) { p.email = aliases[0]; dirty = true; }
    }
    if (p.username && !(await env.KV.get(`username:${p.username}`))) {
      await env.KV.put(`username:${p.username}`, ownerId);
    }
    if (dirty) await env.KV.put(key, JSON.stringify(p));
    return p;
  }
  const base = await defaultUsername(ownerId, secret);
  const username = await reserveUsername(env, base, ownerId);
  const profile = {
    username,
    color: await defaultColor(ownerId, secret),
    fingerprint: await fingerprint(secret, ownerId),
    created_at: new Date().toISOString(),
  };
  if (isEmailOwner) profile.email = ownerId;
  await env.KV.put(key, JSON.stringify(profile));
  return profile;
}

async function saveSession(env, sid, session) {
  await env.KV.put(`session:${sid}`, JSON.stringify(session), { expirationTtl: SESSION_TTL });
}

// Session is authoritative for username/color/fingerprint because profile
// writes fan out via updateAllSessions. Auth hot paths (every /auth/me, /ws,
// etc.) read only the session record here; the profile record is loaded
// explicitly at the one write endpoint that needs it.
async function loadSession(env, secret, sid) {
  const raw = await env.KV.get(`session:${sid}`);
  if (!raw) return null;
  const session = JSON.parse(raw);
  const nextOwnerId = await maybeMigrateChangedLegacyOwnerId(env, secret, session.email);
  if (nextOwnerId === session.email) return session;
  const migratedRaw = await env.KV.get(`session:${sid}`);
  if (!migratedRaw) return null;
  return JSON.parse(migratedRaw);
}

async function updateAllSessions(env, email, patch) {
  const key = `usessions:${email}`;
  const cur = await env.KV.get(key);
  if (!cur) return;

  const list = JSON.parse(cur);
  const aliveSids = (await Promise.all(list.map(async (sid) => {
    const raw = await env.KV.get(`session:${sid}`);
    if (!raw) return null;
    const session = JSON.parse(raw);
    Object.assign(session, patch);
    await saveSession(env, sid, session);
    return sid;
  }))).filter((s) => s !== null);

  if (aliveSids.length === 0) await env.KV.delete(key);
  else if (aliveSids.length !== list.length) await env.KV.put(key, JSON.stringify(aliveSids));
}

async function deleteUsernameIfOwned(env, username, email) {
  if (!username) return;
  const owner = await env.KV.get(`username:${username}`);
  if (owner === email) {
    await env.KV.delete(`username:${username}`);
  }
}

async function syncChatProfile(env, profile) {
  if (!profile.fingerprint) return;

  try {
    const roomId = env.CHAT_ROOM.idFromName('main');
    const room = env.CHAT_ROOM.get(roomId);
    await room.fetch(new Request('https://do.internal/admin/update-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fingerprint: profile.fingerprint,
        username: profile.username,
        color: profile.color,
      }),
    }));
  } catch {}
}

// ---------------------------------------------------------------------------
// Passkey helpers
// ---------------------------------------------------------------------------
const CHALLENGE_TTL = 300;

function b64urlFromBytes(bytes) {
  let bin = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

const RECOVERY_KDF_ITERS = 100000; // Workers WebCrypto caps PBKDF2 at 100k
const RECOVERY_SALT_BYTES = 16;
const RECOVERY_MAX_ATTEMPTS = 5;
const RECOVERY_LOCK_SECONDS = 60 * 60; // 1h cooldown after repeated failures
const RECOVERY_CODE_LEN = 12;
const RECOVERY_CODES_PER_USER = 10;
const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
const RECOVERY_VERSION = 2;
const DUMMY_SALT = new Uint8Array(RECOVERY_SALT_BYTES); // all zeros, used to normalize timing

async function pbkdf2(password, salt) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: RECOVERY_KDF_ITERS, hash: 'SHA-256' },
    key,
    256,
  );
  return new Uint8Array(bits);
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function generateRecoveryCode() {
  const bytes = new Uint8Array(RECOVERY_CODE_LEN);
  crypto.getRandomValues(bytes);
  let s = '';
  for (let i = 0; i < RECOVERY_CODE_LEN; i++) s += RECOVERY_ALPHABET[bytes[i] % RECOVERY_ALPHABET.length];
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8, 12);
}

function normalizeRecoveryInput(raw) {
  return (raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function createRecoveryCodes(env, ownerId) {
  const plain = [];
  const codes = [];
  for (let i = 0; i < RECOVERY_CODES_PER_USER; i++) {
    const code = generateRecoveryCode();
    plain.push(code);
    const salt = crypto.getRandomValues(new Uint8Array(RECOVERY_SALT_BYTES));
    const hash = await pbkdf2(normalizeRecoveryInput(code), salt);
    codes.push({
      salt: b64urlFromBytes(salt),
      hash: b64urlFromBytes(hash),
      used: false,
    });
  }
  await env.KV.put(
    `recovery:${ownerId}`,
    JSON.stringify({ version: RECOVERY_VERSION, codes, attempts: 0, lockedUntil: 0 }),
  );
  return plain;
}

// userCreds index stores {id, createdAt} per passkey so the /auth/passkeys
// endpoint can answer without fanning out to a KV read per credential.
// Legacy records (array of id strings) are migrated lazily on first read.
async function listCredentialEntries(env, ownerId) {
  const raw = await env.KV.get(`userCreds:${ownerId}`);
  if (!raw) return [];
  const arr = JSON.parse(raw);
  if (arr.length === 0 || typeof arr[0] !== 'string') return arr;
  const entries = await Promise.all(arr.map(async (id) => {
    const credRaw = await env.KV.get(`credential:${id}`);
    return { id, createdAt: credRaw ? (JSON.parse(credRaw).createdAt || null) : null };
  }));
  await env.KV.put(`userCreds:${ownerId}`, JSON.stringify(entries));
  return entries;
}

async function listCredentialIds(env, ownerId) {
  return (await listCredentialEntries(env, ownerId)).map((e) => e.id);
}

async function addCredentialId(env, ownerId, credId, createdAt) {
  const entries = await listCredentialEntries(env, ownerId);
  if (entries.some((e) => e.id === credId)) return;
  entries.push({ id: credId, createdAt: createdAt || null });
  await env.KV.put(`userCreds:${ownerId}`, JSON.stringify(entries));
}

async function removeCredentialId(env, ownerId, credId) {
  const entries = (await listCredentialEntries(env, ownerId)).filter((e) => e.id !== credId);
  if (entries.length === 0) await env.KV.delete(`userCreds:${ownerId}`);
  else await env.KV.put(`userCreds:${ownerId}`, JSON.stringify(entries));
}

async function deleteAllCredentials(env, ownerId) {
  const ids = await listCredentialIds(env, ownerId);
  await Promise.all(ids.map((id) => env.KV.delete(`credential:${id}`)));
  await env.KV.delete(`userCreds:${ownerId}`);
  await env.KV.delete(`recovery:${ownerId}`);
}

async function createPasskeyProfile(env, ownerId, username, secret) {
  const profile = {
    username,
    color: await defaultColor(ownerId, secret),
    fingerprint: (await hmac(secret, 'fp:' + ownerId)).slice(0, 6),
    created_at: new Date().toISOString(),
  };
  await env.KV.put(`profile:${ownerId}`, JSON.stringify(profile));
  await env.KV.put(`username:${username}`, ownerId);
  return profile;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
const USERNAME_RE = /^[a-zA-Z0-9_\-]{1,20}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const RECOVERY_RE = /^[A-HJ-NP-Z2-9]{12}$/;

// ---------------------------------------------------------------------------
// Main fetch handler
// ---------------------------------------------------------------------------
export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (e) {
      // Surface uncaught errors as JSON so the client shows a real message
      // instead of Cloudflare's HTML error page. Observability is disabled
      // for privacy, so this is the only place errors become visible.
      return json({ error: (e && e.message) || 'Unhandled error' }, 500);
    }
  },
};

async function handleRequest(request, env) {
    const url = new URL(request.url);
    if (!env.SECRET) {
      // Fail loud instead of silently using a constant key for HMAC,
      // fingerprinting, rate-limit hashes, and defaults.
      return json({ error: 'Server misconfigured: SECRET is not set' }, 500);
    }
    const secret = env.SECRET;
    const secure = isSecureRequest(request, env);

    // ---- Passkey (WebAuthn) ------------------------------------------------
    if (url.pathname === '/auth/webauthn/register/start' && request.method === 'POST') {
      const ipHash = await hashIpForRateLimit(request.headers.get('CF-Connecting-IP') || '', secret);
      const rl = await rateLimit(env, `reg_start_rl:${ipHash}`, 20, 60 * 60);
      if (!rl.ok) return json({ error: 'Too many requests' }, 429);

      const body = await request.json().catch(() => ({}));
      const rpID = url.hostname;
      const sid = getCookie(request, 'sid');
      const session = sid ? await loadSession(env, secret, sid) : null;

      let ownerId, userName, isNew = false;
      let excludeIds = [];

      if (session) {
        ownerId = session.email;
        userName = session.username;
        excludeIds = await listCredentialIds(env, ownerId);
      } else {
        const dn = (body.displayName || '').trim().slice(0, 20);
        if (!USERNAME_RE.test(dn)) {
          return json({ error: 'Username: 1-20 chars, letters/numbers/_/-' }, 400);
        }
        const taken = await env.KV.get(`username:${dn}`);
        if (taken) return json({ error: 'Username taken' }, 409);
        ownerId = 'pk:' + crypto.randomUUID();
        userName = dn;
        isNew = true;
      }

      const options = await generateRegistrationOptions({
        rpName: 'Shoutbox',
        rpID,
        userID: new TextEncoder().encode(ownerId),
        userName,
        userDisplayName: userName,
        attestationType: 'none',
        excludeCredentials: excludeIds.map((id) => ({ id })),
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: 'required',
        },
      });

      const cid = crypto.randomUUID();
      await env.KV.put(
        `challenge:${cid}`,
        JSON.stringify({ kind: 'reg', challenge: options.challenge, ownerId, userName, isNew }),
        { expirationTtl: CHALLENGE_TTL },
      );

      return json({ options }, 200, {
        'Set-Cookie': challengeCookie(cid, CHALLENGE_TTL, { secure }),
      });
    }

    if (url.pathname === '/auth/webauthn/register/finish' && request.method === 'POST') {
      const ipHash = await hashIpForRateLimit(request.headers.get('CF-Connecting-IP') || '', secret);
      const rl = await rateLimit(env, `reg_finish_rl:${ipHash}`, 20, 60 * 60);
      if (!rl.ok) return json({ error: 'Too many requests' }, 429);

      const body = await request.json().catch(() => ({}));
      const cid = getCookie(request, 'cid');
      if (!cid) return json({ error: 'No challenge' }, 400);
      const challengeRaw = await env.KV.get(`challenge:${cid}`);
      if (!challengeRaw) return json({ error: 'Challenge expired' }, 400);
      const ch = JSON.parse(challengeRaw);
      await env.KV.delete(`challenge:${cid}`);
      if (ch.kind !== 'reg') return json({ error: 'Bad challenge' }, 400);

      const rpID = url.hostname;
      const expectedOrigin = env.BASE_URL || url.origin;

      let verification;
      try {
        verification = await verifyRegistrationResponse({
          response: body.response,
          expectedChallenge: ch.challenge,
          expectedOrigin,
          expectedRPID: rpID,
          requireUserVerification: true,
        });
      } catch (e) {
        return json({ error: e.message || 'Verification failed' }, 400);
      }
      if (!verification.verified || !verification.registrationInfo) {
        return json({ error: 'Not verified' }, 400);
      }

      const { credential } = verification.registrationInfo;
      const credId = credential.id;
      const publicKey = b64urlFromBytes(credential.publicKey);

      if (ch.isNew) {
        // Race: make sure no one else grabbed the username while we were verifying
        const taken = await env.KV.get(`username:${ch.userName}`);
        if (taken && taken !== ch.ownerId) {
          return json({ error: 'Username taken' }, 409);
        }
        await createPasskeyProfile(env, ch.ownerId, ch.userName, secret);
      }

      let recoveryCodes = null;
      const credCreatedAt = new Date().toISOString();
      try {
        await env.KV.put(
          `credential:${credId}`,
          JSON.stringify({
            ownerId: ch.ownerId,
            publicKey,
            counter: credential.counter || 0,
            transports: (body.response && body.response.response && body.response.response.transports) || [],
            createdAt: credCreatedAt,
          }),
        );
        await addCredentialId(env, ch.ownerId, credId, credCreatedAt);
        if (ch.isNew) {
          recoveryCodes = await createRecoveryCodes(env, ch.ownerId);
        }
      } catch (e) {
        // Best-effort rollback so a half-finished signup doesn't strand the
        // username reservation (blocking re-registration).
        if (ch.isNew) {
          try { await env.KV.delete(`profile:${ch.ownerId}`); } catch {}
          try { await deleteUsernameIfOwned(env, ch.userName, ch.ownerId); } catch {}
          try { await env.KV.delete(`recovery:${ch.ownerId}`); } catch {}
        }
        try { await env.KV.delete(`credential:${credId}`); } catch {}
        try { await removeCredentialId(env, ch.ownerId, credId); } catch {}
        throw e;
      }

      // Only issue a session if this was a fresh signup; signed-in users already have one.
      const headers = new Headers({ 'Content-Type': 'application/json' });
      headers.append('Set-Cookie', challengeCookie('', 0, { secure }));
      if (ch.isNew) {
        const newSid = await createSession(env, ch.ownerId, secret);
        headers.append('Set-Cookie', setCookie('sid', newSid, SESSION_TTL, { secure }));
      }

      return new Response(JSON.stringify({ ok: true, recoveryCodes }), { status: 200, headers });
    }

    if (url.pathname === '/auth/webauthn/auth/start' && request.method === 'POST') {
      // 120 challenge creations per hour per client. Active development
      // and back-and-forth testing burn challenges quickly. Conditional
      // WebAuthn (one per page visit) plus every explicit Continue click
      // (one per attempt). The limit is generous for humans but still
      // bounds an attacker hammering the endpoint.
      const ipHash = await hashIpForRateLimit(request.headers.get('CF-Connecting-IP') || '', secret);
      const rl = await rateLimit(env, `webauthn_rl:${ipHash}`, 120, 60 * 60);
      if (!rl.ok) return json({ error: 'Too many requests' }, 429);

      const rpID = url.hostname;
      const options = await generateAuthenticationOptions({
        rpID,
        userVerification: 'required',
      });
      const cid = crypto.randomUUID();
      await env.KV.put(
        `challenge:${cid}`,
        JSON.stringify({ kind: 'auth', challenge: options.challenge }),
        { expirationTtl: CHALLENGE_TTL },
      );
      return json({ options }, 200, {
        'Set-Cookie': challengeCookie(cid, CHALLENGE_TTL, { secure }),
      });
    }

    if (url.pathname === '/auth/webauthn/auth/finish' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const cid = getCookie(request, 'cid');
      if (!cid) return json({ error: 'No challenge' }, 400);
      const challengeRaw = await env.KV.get(`challenge:${cid}`);
      if (!challengeRaw) return json({ error: 'Challenge expired' }, 400);
      const ch = JSON.parse(challengeRaw);
      await env.KV.delete(`challenge:${cid}`);
      if (ch.kind !== 'auth') return json({ error: 'Bad challenge' }, 400);

      const assertion = body.response;
      if (!assertion || !assertion.id) return json({ error: 'Bad assertion' }, 400);
      const credRaw = await env.KV.get(`credential:${assertion.id}`);
      if (!credRaw) return json({ error: 'Unknown passkey' }, 401);
      const cred = JSON.parse(credRaw);

      const rpID = url.hostname;
      const expectedOrigin = env.BASE_URL || url.origin;

      let verification;
      try {
        verification = await verifyAuthenticationResponse({
          response: assertion,
          expectedChallenge: ch.challenge,
          expectedOrigin,
          expectedRPID: rpID,
          credential: {
            id: assertion.id,
            publicKey: b64urlToBytes(cred.publicKey),
            counter: cred.counter,
            transports: cred.transports,
          },
          requireUserVerification: true,
        });
      } catch (e) {
        return json({ error: e.message || 'Verification failed' }, 400);
      }
      if (!verification.verified) return json({ error: 'Not verified' }, 401);

      cred.counter = verification.authenticationInfo.newCounter;
      await env.KV.put(`credential:${assertion.id}`, JSON.stringify(cred));

      const newSid = await createSession(env, cred.ownerId, secret);
      const headers = new Headers({ 'Content-Type': 'application/json' });
      headers.append('Set-Cookie', setCookie('sid', newSid, SESSION_TTL, { secure }));
      headers.append('Set-Cookie', challengeCookie('', 0, { secure }));
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    }

    if (url.pathname === '/auth/passkeys' && request.method === 'GET') {
      const sid = getCookie(request, 'sid');
      if (!sid) return json({ error: 'Not signed in' }, 401);
      const session = await loadSession(env, secret, sid);
      if (!session) return json({ error: 'Not signed in' }, 401);
      const entries = await listCredentialEntries(env, session.email);
      return json({ passkeys: entries.map(({ id, createdAt }) => ({ id, createdAt })) });
    }

    if (url.pathname === '/auth/passkeys/delete' && request.method === 'POST') {
      const sid = getCookie(request, 'sid');
      if (!sid) return json({ error: 'Not signed in' }, 401);
      const session = await loadSession(env, secret, sid);
      if (!session) return json({ error: 'Not signed in' }, 401);
      const body = await request.json().catch(() => ({}));
      const credId = (body.id || '').trim();
      const raw = await env.KV.get(`credential:${credId}`);
      if (!raw) return json({ error: 'Not found' }, 404);
      const cred = JSON.parse(raw);
      if (cred.ownerId !== session.email) return json({ error: 'Not yours' }, 403);
      await env.KV.delete(`credential:${credId}`);
      await removeCredentialId(env, cred.ownerId, credId);
      return json({ ok: true });
    }

    if (url.pathname === '/auth/sessions/revoke-others' && request.method === 'POST') {
      const sid = getCookie(request, 'sid');
      if (!sid) return json({ error: 'Not signed in' }, 401);
      const session = await loadSession(env, secret, sid);
      if (!session) return json({ error: 'Not signed in' }, 401);
      const revoked = await deleteOtherSessions(env, session.email, sid);
      return json({ ok: true, revoked });
    }

    if (url.pathname === '/auth/recovery' && request.method === 'POST') {
      // Per-user lockout protects a single account; this IP limit stops a
      // brute-forcer from rotating usernames to burn server CPU (PBKDF2 runs
      // once per attempt regardless of outcome).
      const recIpHash = await hashIpForRateLimit(request.headers.get('CF-Connecting-IP') || '', secret);
      const recIpRl = await rateLimit(env, `recovery_ip_rl:${recIpHash}`, 10, 60 * 60);
      if (!recIpRl.ok) return json({ error: 'Too many requests' }, 429);

      const body = await request.json().catch(() => ({}));
      const uname = (body.username || '').trim();
      const code = normalizeRecoveryInput(body.code);
      if (!USERNAME_RE.test(uname) || !RECOVERY_RE.test(code)) {
        return json({ error: 'Invalid' }, 400);
      }

      const ownerId = await env.KV.get(`username:${uname}`);
      const recRaw = ownerId ? await env.KV.get(`recovery:${ownerId}`) : null;
      let rec = null;
      if (recRaw) {
        try {
          const parsed = JSON.parse(recRaw);
          // Only accept the new versioned format; legacy SHA-256 records are ignored.
          if (parsed && parsed.version === RECOVERY_VERSION && Array.isArray(parsed.codes)) {
            rec = parsed;
          }
        } catch {}
      }

      // Always run PBKDF2 once so response time doesn't leak whether the user exists
      // or whether they have (valid) codes.
      let matchedIndex = -1;
      const now = Date.now();
      const locked = rec && rec.lockedUntil && rec.lockedUntil > now;
      const entries = rec && !locked ? rec.codes : [];

      // Probe one entry at a time. Always do at least one PBKDF2 pass on a dummy
      // salt if there's nothing to check.
      let didKdf = false;
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (e.used || !e.salt || !e.hash) continue;
        didKdf = true;
        const derived = await pbkdf2(code, b64urlToBytes(e.salt));
        const stored = b64urlToBytes(e.hash);
        if (matchedIndex === -1 && constantTimeEqual(derived, stored)) {
          matchedIndex = i;
        }
      }
      if (!didKdf) {
        await pbkdf2(code, DUMMY_SALT);
      }

      if (matchedIndex === -1) {
        if (rec && !locked) {
          // Note: KV has no atomic increment, so parallel wrong guesses can
          // all write attempts=N+1 and a few extra tries slip through before
          // lockout. The IP rate limit + PBKDF2 CPU cost + 31^12 code space
          // make this harmless in practice.
          rec.attempts = (rec.attempts || 0) + 1;
          if (rec.attempts >= RECOVERY_MAX_ATTEMPTS) {
            rec.lockedUntil = now + RECOVERY_LOCK_SECONDS * 1000;
            rec.attempts = 0;
          }
          await env.KV.put(`recovery:${ownerId}`, JSON.stringify(rec));
        }
        return json({ error: 'Invalid' }, 401);
      }

      rec.codes[matchedIndex].used = true;
      rec.attempts = 0;
      rec.lockedUntil = 0;
      await env.KV.put(`recovery:${ownerId}`, JSON.stringify(rec));
      const newSid = await createSession(env, ownerId, secret);
      return json({ ok: true }, 200, { 'Set-Cookie': setCookie('sid', newSid, SESSION_TTL, { secure }) });
    }

    if (url.pathname === '/auth/recovery/regenerate' && request.method === 'POST') {
      const sid = getCookie(request, 'sid');
      if (!sid) return json({ error: 'Not signed in' }, 401);
      const session = await loadSession(env, secret, sid);
      if (!session) return json({ error: 'Not signed in' }, 401);
      // Each call runs 10 PBKDF2 rounds near the Worker CPU cap. Cap to 3/hour.
      const rl = await rateLimit(env, `regen_rl:${session.email}`, 3, 60 * 60);
      if (!rl.ok) {
        return json({ error: `Try again in ${Math.ceil(rl.retryAfterSec / 60)} min` }, 429);
      }
      const codes = await createRecoveryCodes(env, session.email);
      return json({ ok: true, recoveryCodes: codes });
    }

    if (url.pathname === '/auth/me' && request.method === 'GET') {
      const sid = getCookie(request, 'sid');
      if (!sid) return json({ error: 'Not signed in' }, 401);
      const session = await loadSession(env, secret, sid);
      if (!session) return json({ error: 'Not signed in' }, 401);
      // Profile (for created_at) and credential list are independent KV
      // reads. Fan them out so the boot-path /auth/me call doesn't serialize
      // two round-trips.
      const [profile, credIds] = await Promise.all([
        loadOrCreateProfile(env, session.email, secret),
        listCredentialIds(env, session.email),
      ]);
      return json({
        username: session.username,
        color: session.color,
        fingerprint: session.fingerprint,
        passkeyCount: credIds.length,
        created_at: profile.created_at || null,
      });
    }

    if (url.pathname.startsWith('/user/') && request.method === 'GET') {
      // Generous per-IP limit to deter bulk scraping of public profiles.
      const userIpHash = await hashIpForRateLimit(request.headers.get('CF-Connecting-IP') || '', secret);
      const userRl = await rateLimit(env, `user_ip_rl:${userIpHash}`, 60, 60);
      if (!userRl.ok) return json({ error: 'Too many requests' }, 429);

      const name = decodeURIComponent(url.pathname.slice(6));
      if (!USERNAME_RE.test(name)) return json({ error: 'Not found' }, 404);
      const ownerEmail = await env.KV.get(`username:${name}`);
      if (!ownerEmail) return json({ error: 'Not found' }, 404);
      const praw = await env.KV.get(`profile:${ownerEmail}`);
      if (!praw) return json({ error: 'Not found' }, 404);
      const p = JSON.parse(praw);
      // Intentionally no fingerprint here: peers shouldn't be able to
      // pull a user's stable 24-bit HMAC via a lookup endpoint any more
      // than they should see it over the WebSocket. The user's own
      // fingerprint is still returned by /auth/me.
      return json({
        username: p.username,
        color: p.color,
        created_at: p.created_at,
      });
    }

    if (url.pathname === '/auth/profile' && request.method === 'POST') {
      const sid = getCookie(request, 'sid');
      if (!sid) return json({ error: 'Not signed in' }, 401);
      const session = await loadSession(env, secret, sid);
      if (!session) return json({ error: 'Not signed in' }, 401);
      // Profile read is needed here to preserve created_at on write; other
      // auth endpoints skip it to keep the hot path at one KV read.
      const currentProfile = await loadOrCreateProfile(env, session.email, secret);
      const body = await request.json().catch(() => ({}));

      let changed = false;

      if (body.username !== undefined) {
        const u = (body.username || '').trim().slice(0, 20);
        if (!USERNAME_RE.test(u)) {
          return json({ error: 'Username: 1-20 chars, letters/numbers/_/-' }, 400);
        }
        if (u !== session.username) {
          // KV has no compare-and-swap, so two signups racing for the same
          // name can both succeed here; last writer wins. At <100 users this
          // is vanishingly rare; if it ever matters, move username claims
          // into a Durable Object with transactional storage.
          const owner = await env.KV.get(`username:${u}`);
          if (owner && owner !== session.email) {
            return json({ error: 'Username taken' }, 409);
          }
          await env.KV.put(`username:${u}`, session.email);
          await deleteUsernameIfOwned(env, currentProfile.username || session.username, session.email);
          session.username = u;
          changed = true;
        }
      }
      if (body.color !== undefined) {
        const c = (body.color || '').trim();
        if (!COLOR_RE.test(c)) {
          return json({ error: 'Color must be #RRGGBB hex' }, 400);
        }
        // Only enforce contrast when the user actually changed the color, so
        // pre-existing low-contrast accounts aren't blocked from unrelated
        // profile saves.
        if (c.toLowerCase() !== String(session.color || '').toLowerCase()) {
          if (!hasEnoughContrast(c)) {
            return json({ error: 'Color is too close to the background - pick something lighter' }, 400);
          }
          session.color = c;
          changed = true;
        }
      }

      // No-op save: skip the profile write, session fan-out, and DO sync so
      // repeated Save clicks (or stale client retries) don't churn KV.
      if (!changed) {
        return json({
          username: session.username,
          color: session.color,
          fingerprint: session.fingerprint,
        });
      }

      const nextProfile = {
        ...currentProfile,
        username: session.username,
        color: session.color,
        fingerprint: session.fingerprint || currentProfile.fingerprint || (await fingerprint(secret, session.email)),
        created_at: currentProfile.created_at || new Date().toISOString(),
      };
      session.fingerprint = nextProfile.fingerprint;

      await env.KV.put(`profile:${session.email}`, JSON.stringify(nextProfile));
      await updateAllSessions(env, session.email, {
        username: nextProfile.username,
        color: nextProfile.color,
        fingerprint: nextProfile.fingerprint,
      });
      await syncChatProfile(env, nextProfile);

      return json({
        username: nextProfile.username,
        color: nextProfile.color,
        fingerprint: nextProfile.fingerprint,
      });
    }

    // ---- QR cross-device pairing ------------------------------------------
    //
    // Windows desktop: passkey UX is rough on Windows, so we route those
    // users through the phone instead. Desktop calls /auth/qr/start, gets
    // a single-use token + an inline SVG QR for /p?t=TOKEN, and polls
    // /auth/qr/status. The phone scans the QR, lands on /p, signs in (or
    // signs up) with a passkey, and POSTs /auth/qr/claim to bind the token
    // to that account. The desktop's next poll consumes the token, mints
    // a fresh sid, and switches into chat.
    if (url.pathname === '/auth/qr/start' && request.method === 'POST') {
      const ipHash = await hashIpForRateLimit(request.headers.get('CF-Connecting-IP') || '', secret);
      const rl = await rateLimit(env, `qr_start_rl:${ipHash}`, 30, 60 * 60);
      if (!rl.ok) return json({ error: 'Too many requests' }, 429);

      const token = crypto.randomUUID() + crypto.randomUUID();
      const tokenHash = (await hmac(secret, 'pair:' + token)).slice(0, 32);
      await env.KV.put(
        `pair:${tokenHash}`,
        JSON.stringify({ status: 'pending', createdAt: Date.now() }),
        { expirationTtl: QR_TTL },
      );
      const base = env.BASE_URL || url.origin;
      const link = `${base}/p?t=${token}`;
      return json({ token, url: link, qrSvg: renderPairQrSvg(link), expiresInSec: QR_TTL });
    }

    if (url.pathname === '/auth/qr/status' && request.method === 'GET') {
      // Generous limit: desktop polls roughly once per second for up to
      // 5 minutes per attempt, so a real user lands well below this.
      const ipHash = await hashIpForRateLimit(request.headers.get('CF-Connecting-IP') || '', secret);
      const rl = await rateLimit(env, `qr_status_rl:${ipHash}`, 600, 60 * 60);
      if (!rl.ok) return json({ error: 'Too many requests' }, 429);

      const token = url.searchParams.get('t');
      if (!token) return json({ error: 'Missing token' }, 400);
      const tokenHash = (await hmac(secret, 'pair:' + token)).slice(0, 32);
      const raw = await env.KV.get(`pair:${tokenHash}`);
      if (!raw) return json({ status: 'expired' });
      const rec = JSON.parse(raw);
      if (rec.status !== 'authed' || !rec.ownerId) return json({ status: 'pending' });
      // Single-use: consume the record before minting the session so a
      // replay can't issue a second sid against the same token.
      await env.KV.delete(`pair:${tokenHash}`);
      const newSid = await createSession(env, rec.ownerId, secret);
      return json({ status: 'authed' }, 200, {
        'Set-Cookie': setCookie('sid', newSid, SESSION_TTL, { secure }),
      });
    }

    if (url.pathname === '/auth/qr/claim' && request.method === 'POST') {
      // Mobile (already authed via passkey on this device) binds the token
      // to its ownerId. The desktop's next status poll picks it up.
      const sid = getCookie(request, 'sid');
      if (!sid) return json({ error: 'Not signed in' }, 401);
      const session = await loadSession(env, secret, sid);
      if (!session) return json({ error: 'Not signed in' }, 401);

      const ipHash = await hashIpForRateLimit(request.headers.get('CF-Connecting-IP') || '', secret);
      const rl = await rateLimit(env, `qr_claim_rl:${ipHash}`, 30, 60 * 60);
      if (!rl.ok) return json({ error: 'Too many requests' }, 429);

      const body = await request.json().catch(() => ({}));
      const token = (body.token || '').trim();
      if (!token) return json({ error: 'Missing token' }, 400);
      const tokenHash = (await hmac(secret, 'pair:' + token)).slice(0, 32);
      const raw = await env.KV.get(`pair:${tokenHash}`);
      if (!raw) return json({ error: 'Pairing expired' }, 410);
      const rec = JSON.parse(raw);
      if (rec.status === 'authed') return json({ error: 'Already used' }, 409);
      rec.status = 'authed';
      rec.ownerId = session.email;
      // KV doesn't expose remaining TTL, so recompute from createdAt instead
      // of letting a fresh put() silently extend the original 5-minute window.
      const remaining = Math.max(
        30,
        QR_TTL - Math.floor((Date.now() - (rec.createdAt || Date.now())) / 1000),
      );
      await env.KV.put(`pair:${tokenHash}`, JSON.stringify(rec), { expirationTtl: remaining });
      return json({ ok: true });
    }

    if (url.pathname === '/p' && request.method === 'GET') {
      return new Response(PAIR_HTML, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "connect-src 'self'",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
          ].join('; '),
          'X-Frame-Options': 'DENY',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer',
          'Cache-Control': 'no-store',
        },
      });
    }

    if (url.pathname === '/auth/logout' && request.method === 'POST') {
      const sid = getCookie(request, 'sid');
      if (sid) {
        const raw = await env.KV.get(`session:${sid}`);
        await env.KV.delete(`session:${sid}`);
        if (raw) {
          try { await removeSessionIndex(env, JSON.parse(raw).email, sid); } catch {}
        }
      }
      return json({ ok: true }, 200, { 'Set-Cookie': setCookie('sid', '', 0, { secure }) });
    }

    if (url.pathname === '/auth/delete' && request.method === 'POST') {
      const sid = getCookie(request, 'sid');
      if (!sid) return json({ error: 'Not signed in' }, 401);
      const session = await loadSession(env, secret, sid);
      if (!session) return json({ error: 'Not signed in' }, 401);

      // Ask the chat room to wipe this user's messages and close sockets
      try {
        const roomId = env.CHAT_ROOM.idFromName('main');
        const room = env.CHAT_ROOM.get(roomId);
        await room.fetch(new Request('https://do.internal/admin/delete-user', {
          method: 'POST',
          headers: { 'X-Chat-Fingerprint': session.fingerprint || '' },
        }));
      } catch {}

      await deleteUsernameIfOwned(env, session.username, session.email);
      await rewriteOwnedEmailIndexes(env, secret, session.email, []);
      await env.KV.delete(`profile:${session.email}`);
      await deleteAllCredentials(env, session.email);
      await deleteAllSessions(env, session.email);

      return json({ ok: true }, 200, { 'Set-Cookie': setCookie('sid', '', 0, { secure }) });
    }

    // ---- WebSocket upgrade → Durable Object --------------------------------
    if (url.pathname === '/ws') {
      const sid = getCookie(request, 'sid');
      if (!sid) return json({ error: 'Not signed in' }, 401);
      const session = await loadSession(env, secret, sid);
      if (!session) return json({ error: 'Not signed in' }, 401);
      const roomId = env.CHAT_ROOM.idFromName('main');
      const room = env.CHAT_ROOM.get(roomId);

      // Forward with session info as headers. WebSocket upgrade is a GET
      // with no body, so don't carry one through (passing a body on GET
      // can throw in some runtimes).
      const newHeaders = new Headers(request.headers);
      newHeaders.set('X-Chat-Username', session.username);
      newHeaders.set('X-Chat-Color', session.color);
      if (session.fingerprint) newHeaders.set('X-Chat-Fingerprint', session.fingerprint);
      const newReq = new Request(request.url, { headers: newHeaders, method: request.method });

      return room.fetch(newReq);
    }

    // ---- Build provenance --------------------------------------------------
    if (url.pathname === '/version.json') {
      return json({
        ...VERSION,
        repo: 'https://github.com/dfq9j8mw46-creator/shoutbox',
      }, 200, { 'Cache-Control': 'no-store' });
    }

    // ---- Favicon -----------------------------------------------------------
    // A simple chat-bubble glyph in the app's accent blue. Served inline
    // as SVG so there's no binary asset to ship alongside the worker.
    if (url.pathname === '/favicon.svg' || url.pathname === '/favicon.ico') {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
        + '<path fill="#5b8def" d="M8 4Q4 4 4 8L4 18Q4 22 8 22L11 22L7 28L15 22L24 22Q28 22 28 18L28 8Q28 4 24 4Z"/>'
        + '</svg>';
      return new Response(svg, {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }

    // ---- Serve the SPA -----------------------------------------------------
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(HTML, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "connect-src 'self'",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
          ].join('; '),
          'X-Frame-Options': 'DENY',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer',
          'Permissions-Policy': 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
        },
      });
    }

    return new Response('Not found', { status: 404 });
}
