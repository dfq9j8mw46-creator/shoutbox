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

function setCookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
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

async function defaultColor(email, secret) {
  const h = await hmac(secret, email);
  const hue = parseInt(h.slice(0, 4), 16) % 360;
  return `hsl(${hue}, 70%, 45%)`;
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

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function generateRecoveryCode() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let s = '';
  for (let i = 0; i < 10; i++) s += alphabet[bytes[i] % alphabet.length];
  return s.slice(0, 5) + '-' + s.slice(5, 10);
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
const RECOVERY_RE = /^[A-HJ-NP-Z2-9]{5}-?[A-HJ-NP-Z2-9]{5}$/i;

// ---------------------------------------------------------------------------
// Main fetch handler
// ---------------------------------------------------------------------------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const secret = env.SECRET || 'dev-secret-change-me';

    // ---- Auth routes -------------------------------------------------------
    if (url.pathname === '/auth/send' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const email = (body.email || '').trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ error: 'Invalid email' }, 400);
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

        console.log('Dev login code for', email, ':', code);
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

      console.log('Dev magic link:', link);
      return json({ ok: true, mode: 'link', dev_link: link });
    }

    // ---- Passkey (WebAuthn) ------------------------------------------------
    if (url.pathname === '/auth/webauthn/register/start' && request.method === 'POST') {
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
        'Set-Cookie': `cid=${cid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${CHALLENGE_TTL}`,
      });
    }

    if (url.pathname === '/auth/webauthn/register/finish' && request.method === 'POST') {
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
        recoveryCodes = [];
        const records = [];
        for (let i = 0; i < 10; i++) {
          const code = generateRecoveryCode();
          recoveryCodes.push(code);
          records.push({ hash: await sha256Hex(code), used: false });
        }
        await env.KV.put(`recovery:${ch.ownerId}`, JSON.stringify(records));
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
      headers.append('Set-Cookie', `cid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
      if (ch.isNew) {
        const newSid = await createSession(env, ch.ownerId, secret);
        headers.append('Set-Cookie', setCookie('sid', newSid, SESSION_TTL));
      }

      return new Response(JSON.stringify({ ok: true, recoveryCodes }), { status: 200, headers });
    }

    if (url.pathname === '/auth/webauthn/auth/start' && request.method === 'POST') {
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
        'Set-Cookie': `cid=${cid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${CHALLENGE_TTL}`,
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
      headers.append('Set-Cookie', setCookie('sid', newSid, SESSION_TTL));
      headers.append('Set-Cookie', `cid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
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

    if (url.pathname === '/auth/recovery' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const uname = (body.username || '').trim();
      let code = (body.code || '').trim().toUpperCase().replace(/-/g, '');
      if (!USERNAME_RE.test(uname) || !/^[A-HJ-NP-Z2-9]{10}$/.test(code)) {
        return json({ error: 'Invalid input' }, 400);
      }
      const ownerId = await env.KV.get(`username:${uname}`);
      if (!ownerId) return json({ error: 'Invalid' }, 401);
      const codesRaw = await env.KV.get(`recovery:${ownerId}`);
      if (!codesRaw) return json({ error: 'No recovery codes' }, 401);
      const codes = JSON.parse(codesRaw);
      const codeFormatted = code.slice(0, 5) + '-' + code.slice(5, 10);
      const hash = await sha256Hex(codeFormatted);
      const entry = codes.find((c) => !c.used && c.hash === hash);
      if (!entry) return json({ error: 'Invalid code' }, 401);
      entry.used = true;
      await env.KV.put(`recovery:${ownerId}`, JSON.stringify(codes));
      const newSid = await createSession(env, ownerId, secret);
      return json({ ok: true }, 200, { 'Set-Cookie': setCookie('sid', newSid, SESSION_TTL) });
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
      if (!raw) return json({ error: 'Code expired — request a new one' }, 400);
      const record = JSON.parse(raw);
      if (record.attempts >= 5) {
        await env.KV.delete(key);
        return json({ error: 'Too many attempts — request a new code' }, 429);
      }
      if (record.code !== code) {
        record.attempts += 1;
        await env.KV.put(key, JSON.stringify(record), { expirationTtl: 600 });
        return json({ error: 'Wrong code' }, 400);
      }
      await env.KV.delete(key);
      const sid = await createSession(env, email, secret);
      return json({ ok: true }, 200, { 'Set-Cookie': setCookie('sid', sid, 60 * 60 * 24 * 7) });
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
          'Set-Cookie': setCookie('sid', sid, 60 * 60 * 24 * 7),
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
      return json({ ok: true }, 200, { 'Set-Cookie': setCookie('sid', '', 0) });
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

      return json({ ok: true }, 200, { 'Set-Cookie': setCookie('sid', '', 0) });
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
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};
