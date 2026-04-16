import { ChatRoom } from './chat-room.js';
import { HTML } from './html.js';

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

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
const USERNAME_RE = /^[a-zA-Z0-9_\-]{1,20}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

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

      // Create magic token
      const token = crypto.randomUUID() + crypto.randomUUID();
      await env.KV.put(`magic:${token}`, email, { expirationTtl: 600 }); // 10 min

      const base = env.BASE_URL || url.origin;
      const link = `${base}/auth/verify?token=${token}`;

      // Send email via Resend (or skip in dev)
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
        return json({ ok: true });
      }

      // Dev mode: return the link directly
      console.log('Dev magic link:', link);
      return json({ ok: true, dev_link: link });
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

      // Create session
      const sid = crypto.randomUUID();
      const username = await defaultUsername(email, secret);
      const color = await defaultColor(email, secret);
      const session = JSON.stringify({ email, username, color });
      await env.KV.put(`session:${sid}`, session, { expirationTtl: 60 * 60 * 24 * 7 }); // 7 days

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
      const raw = await env.KV.get(`session:${sid}`);
      if (!raw) return json({ error: 'Not signed in' }, 401);
      const session = JSON.parse(raw);
      return json({ username: session.username, color: session.color });
    }

    if (url.pathname === '/auth/profile' && request.method === 'POST') {
      const sid = getCookie(request, 'sid');
      if (!sid) return json({ error: 'Not signed in' }, 401);
      const raw = await env.KV.get(`session:${sid}`);
      if (!raw) return json({ error: 'Not signed in' }, 401);
      const session = JSON.parse(raw);
      const body = await request.json().catch(() => ({}));

      if (body.username !== undefined) {
        const u = (body.username || '').trim().slice(0, 20);
        if (!USERNAME_RE.test(u)) {
          return json({ error: 'Username: 1-20 chars, letters/numbers/_/-' }, 400);
        }
        session.username = u;
      }
      if (body.color !== undefined) {
        const c = (body.color || '').trim();
        if (!COLOR_RE.test(c)) {
          return json({ error: 'Color must be #RRGGBB hex' }, 400);
        }
        session.color = c;
      }

      await env.KV.put(`session:${sid}`, JSON.stringify(session), { expirationTtl: 60 * 60 * 24 * 7 });
      return json({ username: session.username, color: session.color });
    }

    if (url.pathname === '/auth/logout' && request.method === 'POST') {
      const sid = getCookie(request, 'sid');
      if (sid) await env.KV.delete(`session:${sid}`);
      return json({ ok: true }, 200, { 'Set-Cookie': setCookie('sid', '', 0) });
    }

    // ---- WebSocket upgrade → Durable Object --------------------------------
    if (url.pathname === '/ws') {
      const sid = getCookie(request, 'sid');
      if (!sid) return json({ error: 'Not signed in' }, 401);
      const raw = await env.KV.get(`session:${sid}`);
      if (!raw) return json({ error: 'Not signed in' }, 401);

      const session = JSON.parse(raw);
      const roomId = env.CHAT_ROOM.idFromName('main');
      const room = env.CHAT_ROOM.get(roomId);

      // Forward with session info as headers
      const newHeaders = new Headers(request.headers);
      newHeaders.set('X-Chat-Username', session.username);
      newHeaders.set('X-Chat-Color', session.color);
      const newReq = new Request(request.url, { headers: newHeaders, body: request.body, method: request.method });

      return room.fetch(newReq);
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
