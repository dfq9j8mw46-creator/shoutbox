import { ChatRoom } from './chat-room.js';
import { HTML } from './html.js';
import VERSION from './version.json';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

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

async function addSessionIndex(env, email, sid) {
  const key = `usessions:${email}`;
  const cur = await env.KV.get(key);
  const list = cur ? JSON.parse(cur) : [];
  if (!list.includes(sid)) {
    list.push(sid);
    await env.KV.put(key, JSON.stringify(list));
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

function authMode(ua) {
  if (!ua) return 'link';
  if (/iPhone|iPad|iPod|Android|Mobile/i.test(ua)) return 'code';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'code';
  return 'link';
}

function generateCode() {
  const buf = new Uint8Array(4);
  crypto.getRandomValues(buf);
  const n = ((buf[0] << 24 >>> 0) + (buf[1] << 16) + (buf[2] << 8) + buf[3]) % 1000000;
  return n.toString().padStart(6, '0');
}

async function createSession(env, email, secret) {
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

async function loadOrCreateProfile(env, email, secret) {
  const key = `profile:${email}`;
  const raw = await env.KV.get(key);
  if (raw) {
    const p = JSON.parse(raw);
    let dirty = false;
    if (!p.fingerprint) { p.fingerprint = await fingerprint(secret, email); dirty = true; }
    if (!p.created_at)  { p.created_at = new Date().toISOString(); dirty = true; }
    if (p.username && !(await env.KV.get(`username:${p.username}`))) {
      await env.KV.put(`username:${p.username}`, email);
    }
    if (dirty) await env.KV.put(key, JSON.stringify(p));
    return p;
  }
  const base = await defaultUsername(email, secret);
  const username = await reserveUsername(env, base, email);
  const profile = {
    username,
    color: await defaultColor(email, secret),
    fingerprint: await fingerprint(secret, email),
    created_at: new Date().toISOString(),
  };
  await env.KV.put(key, JSON.stringify(profile));
  return profile;
}

async function saveSession(env, sid, session) {
  await env.KV.put(`session:${sid}`, JSON.stringify(session), { expirationTtl: SESSION_TTL });
}

async function syncSessionWithProfile(env, sid, secret) {
  const raw = await env.KV.get(`session:${sid}`);
  if (!raw) return null;

  const session = JSON.parse(raw);
  const profile = await loadOrCreateProfile(env, session.email, secret);
  let dirty = false;

  if (profile.username && session.username !== profile.username) {
    session.username = profile.username;
    dirty = true;
  }
  if (profile.color && session.color !== profile.color) {
    session.color = profile.color;
    dirty = true;
  }
  if (profile.fingerprint && session.fingerprint !== profile.fingerprint) {
    session.fingerprint = profile.fingerprint;
    dirty = true;
  }

  if (dirty) await saveSession(env, sid, session);
  return { session, profile };
}

async function updateAllSessions(env, email, patch) {
  const key = `usessions:${email}`;
  const cur = await env.KV.get(key);
  if (!cur) return;

  const list = JSON.parse(cur);
  const alive = [];
  for (const sid of list) {
    const raw = await env.KV.get(`session:${sid}`);
    if (!raw) continue;

    const session = JSON.parse(raw);
    Object.assign(session, patch);
    await saveSession(env, sid, session);
    alive.push(sid);
  }

  if (alive.length === 0) await env.KV.delete(key);
  else if (alive.length !== list.length) await env.KV.put(key, JSON.stringify(alive));
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

async function listCredentialIds(env, ownerId) {
  const raw = await env.KV.get(`userCreds:${ownerId}`);
  return raw ? JSON.parse(raw) : [];
}

async function addCredentialId(env, ownerId, credId) {
  const ids = await listCredentialIds(env, ownerId);
  if (!ids.includes(credId)) {
    ids.push(credId);
    await env.KV.put(`userCreds:${ownerId}`, JSON.stringify(ids));
  }
}

async function removeCredentialId(env, ownerId, credId) {
  const ids = (await listCredentialIds(env, ownerId)).filter((x) => x !== credId);
  if (ids.length === 0) await env.KV.delete(`userCreds:${ownerId}`);
  else await env.KV.put(`userCreds:${ownerId}`, JSON.stringify(ids));
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

    // ---- Auth routes -------------------------------------------------------
    if (url.pathname === '/auth/send' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const email = (body.email || '').trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ error: 'Invalid email' }, 400);
      }

      // Prevent mailbombing a target: 5 sends per hour per email address.
      const rl = await rateLimit(env, `send_rate:${email}`, 5, 60 * 60);
      if (!rl.ok) {
        return json({ error: `Too many requests - try again in ${Math.ceil(rl.retryAfterSec / 60)} min` }, 429);
      }

      const mode = authMode(request.headers.get('User-Agent') || '');

      if (mode === 'code') {
        const code = generateCode();
        await env.KV.put(
          `magic:code:${email}`,
          JSON.stringify({ code, attempts: 0 }),
          { expirationTtl: 600 },
        );

        if (env.EMAIL_API_KEY) {
          const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${env.EMAIL_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: env.EMAIL_FROM || 'chat@example.com',
              to: [email],
              subject: `Your chat login code: ${code}`,
              html: `<p>Your login code:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${code}</p><p>Expires in 10 minutes.</p>`,
            }),
          });
          if (!emailRes.ok) {
            const err = await emailRes.text();
            console.error('Email API error:', err);
            return json({ error: 'Failed to send email' }, 500);
          }
          return json({ ok: true, mode: 'code' });
        }

        // Dev mode: token is returned to the caller; don't log it so that
        // re-enabling observability later doesn't leak auth secrets.
        return json({ ok: true, mode: 'code', dev_code: code });
      }

      // Link mode
      const token = crypto.randomUUID() + crypto.randomUUID();
      await env.KV.put(`magic:${token}`, email, { expirationTtl: 600 });

      const base = env.BASE_URL || url.origin;
      const link = `${base}/auth/verify?token=${token}`;

      if (env.EMAIL_API_KEY) {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.EMAIL_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: env.EMAIL_FROM || 'chat@example.com',
            to: [email],
            subject: 'Your chat login link',
            html: `<p>Click to sign in:</p><p><a href="${link}">${link}</a></p><p>Expires in 10 minutes.</p>`,
          }),
        });
        if (!emailRes.ok) {
          const err = await emailRes.text();
          console.error('Email API error:', err);
          return json({ error: 'Failed to send email' }, 500);
        }
        return json({ ok: true, mode: 'link' });
      }

      // Dev mode: token is returned to the caller; don't log it so that
      // re-enabling observability later doesn't leak auth secrets.
      return json({ ok: true, mode: 'link', dev_link: link });
    }

    // ---- Passkey (WebAuthn) ------------------------------------------------
    if (url.pathname === '/auth/webauthn/register/start' && request.method === 'POST') {
      const ipHash = await hashIpForRateLimit(request.headers.get('CF-Connecting-IP') || '', secret);
      const rl = await rateLimit(env, `reg_start_rl:${ipHash}`, 20, 60 * 60);
      if (!rl.ok) return json({ error: 'Too many requests' }, 429);

      const body = await request.json().catch(() => ({}));
      const rpID = url.hostname;
      const sid = getCookie(request, 'sid');
      const synced = sid ? await syncSessionWithProfile(env, sid, secret) : null;

      let ownerId, userName, isNew = false;
      let excludeIds = [];

      if (synced) {
        ownerId = synced.session.email;
        userName = synced.session.username;
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
          userVerification: 'preferred',
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
          requireUserVerification: false,
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

      let recoveryCodes = null;
      if (ch.isNew) {
        // Race: make sure no one else grabbed the username while we were verifying
        const taken = await env.KV.get(`username:${ch.userName}`);
        if (taken && taken !== ch.ownerId) {
          return json({ error: 'Username taken' }, 409);
        }
        await createPasskeyProfile(env, ch.ownerId, ch.userName, secret);
        recoveryCodes = await createRecoveryCodes(env, ch.ownerId);
      }

      await env.KV.put(
        `credential:${credId}`,
        JSON.stringify({
          ownerId: ch.ownerId,
          publicKey,
          counter: credential.counter || 0,
          transports: (body.response && body.response.response && body.response.response.transports) || [],
          createdAt: new Date().toISOString(),
        }),
      );
      await addCredentialId(env, ch.ownerId, credId);

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
      // 30 challenge creations per hour per client; hash rotates daily so this
      // isn't a long-term identifier.
      const ipHash = await hashIpForRateLimit(request.headers.get('CF-Connecting-IP') || '', secret);
      const rl = await rateLimit(env, `webauthn_rl:${ipHash}`, 30, 60 * 60);
      if (!rl.ok) return json({ error: 'Too many requests' }, 429);

      const rpID = url.hostname;
      const options = await generateAuthenticationOptions({
        rpID,
        userVerification: 'preferred',
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
          requireUserVerification: false,
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
      const synced = await syncSessionWithProfile(env, sid, secret);
      if (!synced) return json({ error: 'Not signed in' }, 401);
      const ids = await listCredentialIds(env, synced.session.email);
      const items = [];
      for (const id of ids) {
        const raw = await env.KV.get(`credential:${id}`);
        if (!raw) continue;
        const c = JSON.parse(raw);
        items.push({ id, createdAt: c.createdAt });
      }
      return json({ passkeys: items });
    }

    if (url.pathname === '/auth/passkeys/delete' && request.method === 'POST') {
      const sid = getCookie(request, 'sid');
      if (!sid) return json({ error: 'Not signed in' }, 401);
      const synced = await syncSessionWithProfile(env, sid, secret);
      if (!synced) return json({ error: 'Not signed in' }, 401);
      const body = await request.json().catch(() => ({}));
      const credId = (body.id || '').trim();
      const raw = await env.KV.get(`credential:${credId}`);
      if (!raw) return json({ error: 'Not found' }, 404);
      const cred = JSON.parse(raw);
      if (cred.ownerId !== synced.session.email) return json({ error: 'Not yours' }, 403);
      await env.KV.delete(`credential:${credId}`);
      await removeCredentialId(env, cred.ownerId, credId);
      return json({ ok: true });
    }

    if (url.pathname === '/auth/sessions/revoke-others' && request.method === 'POST') {
      const sid = getCookie(request, 'sid');
      if (!sid) return json({ error: 'Not signed in' }, 401);
      const synced = await syncSessionWithProfile(env, sid, secret);
      if (!synced) return json({ error: 'Not signed in' }, 401);
      const revoked = await deleteOtherSessions(env, synced.session.email, sid);
      return json({ ok: true, revoked });
    }

    if (url.pathname === '/auth/recovery' && request.method === 'POST') {
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
      const synced = await syncSessionWithProfile(env, sid, secret);
      if (!synced) return json({ error: 'Not signed in' }, 401);
      // Each call runs 10 PBKDF2 rounds near the Worker CPU cap. Cap to 3/hour.
      const rl = await rateLimit(env, `regen_rl:${synced.session.email}`, 3, 60 * 60);
      if (!rl.ok) {
        return json({ error: `Try again in ${Math.ceil(rl.retryAfterSec / 60)} min` }, 429);
      }
      const codes = await createRecoveryCodes(env, synced.session.email);
      return json({ ok: true, recoveryCodes: codes });
    }

    if (url.pathname === '/auth/verify-code' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const email = (body.email || '').trim().toLowerCase();
      const code = (body.code || '').trim();
      if (!email || !/^\d{6}$/.test(code)) {
        return json({ error: 'Invalid code' }, 400);
      }
      const key = `magic:code:${email}`;
      const raw = await env.KV.get(key);
      if (!raw) return json({ error: 'Code expired - request a new one' }, 400);
      const record = JSON.parse(raw);
      if (record.attempts >= 5) {
        await env.KV.delete(key);
        return json({ error: 'Too many attempts - request a new code' }, 429);
      }
      if (record.code !== code) {
        record.attempts += 1;
        await env.KV.put(key, JSON.stringify(record), { expirationTtl: 600 });
        return json({ error: 'Wrong code' }, 400);
      }
      await env.KV.delete(key);
      const sid = await createSession(env, email, secret);
      return json({ ok: true }, 200, { 'Set-Cookie': setCookie('sid', sid, 60 * 60 * 24 * 7, { secure }) });
    }

    if (url.pathname === '/auth/verify' && request.method === 'GET') {
      const token = url.searchParams.get('token');
      if (!token) return json({ error: 'Missing token' }, 400);

      const email = await env.KV.get(`magic:${token}`);
      if (!email) {
        return new Response('Invalid or expired link. <a href="/">Try again</a>', {
          status: 400,
          headers: { 'Content-Type': 'text/html' },
        });
      }
      await env.KV.delete(`magic:${token}`);

      const sid = await createSession(env, email, secret);

      return new Response(null, {
        status: 302,
        headers: {
          Location: '/',
          'Set-Cookie': setCookie('sid', sid, 60 * 60 * 24 * 7, { secure }),
        },
      });
    }

    if (url.pathname === '/auth/me' && request.method === 'GET') {
      const sid = getCookie(request, 'sid');
      if (!sid) return json({ error: 'Not signed in' }, 401);
      const synced = await syncSessionWithProfile(env, sid, secret);
      if (!synced) return json({ error: 'Not signed in' }, 401);
      const { session } = synced;
      const passkeyCount = (await listCredentialIds(env, session.email)).length;
      const hasEmail = !String(session.email).startsWith('pk:');
      return json({
        username: session.username,
        color: session.color,
        fingerprint: session.fingerprint,
        passkeyCount,
        hasEmail,
      });
    }

    if (url.pathname.startsWith('/user/') && request.method === 'GET') {
      const name = decodeURIComponent(url.pathname.slice(6));
      if (!USERNAME_RE.test(name)) return json({ error: 'Not found' }, 404);
      const ownerEmail = await env.KV.get(`username:${name}`);
      if (!ownerEmail) return json({ error: 'Not found' }, 404);
      const praw = await env.KV.get(`profile:${ownerEmail}`);
      if (!praw) return json({ error: 'Not found' }, 404);
      const p = JSON.parse(praw);
      return json({
        username: p.username,
        color: p.color,
        fingerprint: p.fingerprint,
        created_at: p.created_at,
      });
    }

    if (url.pathname === '/auth/profile' && request.method === 'POST') {
      const sid = getCookie(request, 'sid');
      if (!sid) return json({ error: 'Not signed in' }, 401);
      const synced = await syncSessionWithProfile(env, sid, secret);
      if (!synced) return json({ error: 'Not signed in' }, 401);
      const { session, profile: currentProfile } = synced;
      const body = await request.json().catch(() => ({}));

      if (body.username !== undefined) {
        const u = (body.username || '').trim().slice(0, 20);
        if (!USERNAME_RE.test(u)) {
          return json({ error: 'Username: 1-20 chars, letters/numbers/_/-' }, 400);
        }
        if (u !== session.username) {
          const owner = await env.KV.get(`username:${u}`);
          if (owner && owner !== session.email) {
            return json({ error: 'Username taken' }, 409);
          }
          await env.KV.put(`username:${u}`, session.email);
          await deleteUsernameIfOwned(env, currentProfile.username || session.username, session.email);
          session.username = u;
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
        if (c.toLowerCase() !== String(session.color || '').toLowerCase() && !hasEnoughContrast(c)) {
          return json({ error: 'Color is too close to the background - pick something lighter' }, 400);
        }
        session.color = c;
      }

      const nextProfile = {
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
      const synced = await syncSessionWithProfile(env, sid, secret);
      if (!synced) return json({ error: 'Not signed in' }, 401);
      const { session } = synced;

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
      await env.KV.delete(`profile:${session.email}`);
      await deleteAllCredentials(env, session.email);
      await deleteAllSessions(env, session.email);

      return json({ ok: true }, 200, { 'Set-Cookie': setCookie('sid', '', 0, { secure }) });
    }

    // ---- WebSocket upgrade → Durable Object --------------------------------
    if (url.pathname === '/ws') {
      const sid = getCookie(request, 'sid');
      if (!sid) return json({ error: 'Not signed in' }, 401);
      const synced = await syncSessionWithProfile(env, sid, secret);
      if (!synced) return json({ error: 'Not signed in' }, 401);
      const { session } = synced;
      const roomId = env.CHAT_ROOM.idFromName('main');
      const room = env.CHAT_ROOM.get(roomId);

      // Forward with session info as headers
      const newHeaders = new Headers(request.headers);
      newHeaders.set('X-Chat-Username', session.username);
      newHeaders.set('X-Chat-Color', session.color);
      if (session.fingerprint) newHeaders.set('X-Chat-Fingerprint', session.fingerprint);
      const newReq = new Request(request.url, { headers: newHeaders, body: request.body, method: request.method });

      return room.fetch(newReq);
    }

    // ---- Build provenance --------------------------------------------------
    if (url.pathname === '/version.json') {
      return json({
        ...VERSION,
        repo: 'https://github.com/dfq9j8mw46-creator/shoutbox',
      }, 200, { 'Cache-Control': 'no-store' });
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
