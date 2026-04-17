// ---------------------------------------------------------------------------
// ChatRoom Durable Object
//
// Manages WebSocket connections and the last 100 messages in memory + storage.
// ---------------------------------------------------------------------------

const MAX_MESSAGES = 100;

// Rate limiting per-socket: at most MSG_BURST messages within MSG_WINDOW_MS.
// Exceeding the burst drops the message and sends a soft warning; sustained
// spamming (KICK_STRIKES warnings) closes the socket.
const MSG_BURST = 5;
const MSG_WINDOW_MS = 3000;
const KICK_STRIKES = 3;

// Cap concurrent WebSocket connections one identity can hold open, so a
// signed-in client can't fan out a broadcast amplifier or pin DO memory.
// Five allows the common case (browser tab + mobile tab + stale reconnect)
// without being user-hostile.
const MAX_SOCKETS_PER_IDENTITY = 5;

// Cap how many distinct @mentions a single message is allowed to carry.
// Prevents a "@everyone"-style notification flood across the whole room.
const MAX_MENTIONS_PER_MSG = 5;

// Sanitize incoming message text against common chat-abuse vectors:
//
//  - Zalgo: cap combining marks (\p{M}) per base character. NFC first
//    collapses canonical equivalents, so café/naïve survive at 0 marks.
//    Two is enough for every real-world language (Vietnamese stacked
//    tones, Thai, etc.); more is Zalgo spam that overflows line height.
//  - Control chars (\p{Cc}): break rendering, can embed NUL/BEL. We keep
//    \n \r \t so multi-line / tabbed content still works, though clients
//    typically collapse them anyway.
//  - Format chars (\p{Cf}): covers bidi overrides (U+202A-E, U+2066-9),
//    zero-widths (U+200B-F, U+FEFF, U+2060), and Unicode tag chars
//    (U+E0000-E007F) used for impersonation, invisible steganography,
//    and flipping surrounding UI text RTL.
// Strip the @ prefix on any mentions beyond the Nth distinct recipient
// in a single message so a sender can't ping the entire room in one
// shot. The name text stays (no data loss), it just no longer renders
// as a mention and doesn't fire a notification.
function capMentions(s) {
  const seen = new Set();
  return s.replace(/@([a-zA-Z0-9_\-]{1,20})/g, (match, name) => {
    const lower = name.toLowerCase();
    if (seen.has(lower)) return match;
    if (seen.size >= MAX_MENTIONS_PER_MSG) return name;
    seen.add(lower);
    return match;
  });
}

const MAX_COMBINING_MARKS = 2;
function sanitizeText(s) {
  s = s.normalize('NFC');
  let out = '';
  let n = 0;
  for (const ch of s) {
    // Drop Cc (except \n \r \t) and all Cf.
    if (/\p{Cf}/u.test(ch)) continue;
    if (/\p{Cc}/u.test(ch) && ch !== '\n' && ch !== '\r' && ch !== '\t') continue;
    if (/\p{M}/u.test(ch)) {
      if (n < MAX_COMBINING_MARKS) { out += ch; n++; }
      continue;
    }
    out += ch;
    n = 0;
  }
  return out;
}

export class ChatRoom {
  constructor(state) {
    this.state = state;
    this.messages = [];    // { username, color, text, ts }

    // Load saved messages on first request
    this.initialized = this.state.blockConcurrencyWhile(async () => {
      this.messages = (await this.state.storage.get('messages')) || [];
    });
  }

  async fetch(request) {
    await this.initialized;

    const url = new URL(request.url);
    if (url.pathname === '/admin/update-user' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const fp = body.fingerprint || '';
      if (!fp) return new Response('missing fingerprint', { status: 400 });

      let changed = false;
      for (const ws of this.state.getWebSockets()) {
        const a = ws.deserializeAttachment() || {};
        if (a.fingerprint !== fp) continue;

        if (typeof body.username === 'string' && /^[a-zA-Z0-9_\-]{1,20}$/.test(body.username)) {
          a.username = body.username;
          changed = true;
        }
        if (typeof body.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.color)) {
          a.color = body.color;
          changed = true;
        }
        ws.serializeAttachment(a);
      }

      if (changed) this.broadcastOnline();
      return new Response('ok');
    }

    if (url.pathname === '/admin/delete-user' && request.method === 'POST') {
      const fp = request.headers.get('X-Chat-Fingerprint') || '';
      if (!fp) return new Response('missing fingerprint', { status: 400 });

      const before = this.messages.length;
      this.messages = this.messages.filter((m) => m.fingerprint !== fp);
      if (this.messages.length !== before) {
        await this.state.storage.put('messages', this.messages);
        this.broadcast({ type: 'history', messages: this.messages });
      }
      for (const ws of this.state.getWebSockets()) {
        const a = ws.deserializeAttachment() || {};
        if (a.fingerprint === fp) {
          try { ws.close(1000, 'account deleted'); } catch {}
        }
      }
      this.broadcastOnline();
      return new Response('ok');
    }

    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const username = request.headers.get('X-Chat-Username') || 'Anon';
    const color = request.headers.get('X-Chat-Color') || '#888888';
    const fingerprint = request.headers.get('X-Chat-Fingerprint') || '';

    // Per-identity concurrent-socket cap. Without this, a signed-in
    // client could open an unbounded fan of WebSockets and both pin DO
    // memory and multiply broadcasts for the whole room.
    if (fingerprint) {
      let existing = 0;
      for (const ws of this.state.getWebSockets()) {
        const a = ws.deserializeAttachment() || {};
        if (a.fingerprint === fingerprint) existing++;
      }
      if (existing >= MAX_SOCKETS_PER_IDENTITY) {
        return new Response('too many connections', { status: 429 });
      }
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.state.acceptWebSocket(server);
    server.serializeAttachment({ username, color, fingerprint });

    // Send history to the new client
    server.send(JSON.stringify({ type: 'history', messages: this.messages }));

    this.broadcastOnline();

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, rawMsg) {
    let data;
    try { data = JSON.parse(rawMsg); } catch { return; }

    const attachment = ws.deserializeAttachment();

    if (data.type === 'msg' && typeof data.text === 'string') {
      const text = capMentions(sanitizeText(data.text.trim())).slice(0, 500);
      if (!text) return;

      const now = Date.now();
      const history = (attachment.sendHistory || []).filter((t) => now - t < MSG_WINDOW_MS);
      if (history.length >= MSG_BURST) {
        attachment.strikes = (attachment.strikes || 0) + 1;
        ws.serializeAttachment(attachment);
        try { ws.send(JSON.stringify({ type: 'rate_limit', retryMs: MSG_WINDOW_MS })); } catch {}
        if (attachment.strikes >= KICK_STRIKES) {
          try { ws.close(1008, 'rate limit'); } catch {}
        }
        return;
      }
      history.push(now);
      attachment.sendHistory = history;
      attachment.strikes = 0;
      ws.serializeAttachment(attachment);

      const msg = {
        username: attachment.username,
        color: attachment.color,
        fingerprint: attachment.fingerprint || '',
        text,
        ts: now,
      };

      this.messages.push(msg);
      if (this.messages.length > MAX_MESSAGES) {
        this.messages = this.messages.slice(-MAX_MESSAGES);
      }

      // Persist (non-blocking - Durable Object guarantees ordering)
      this.state.storage.put('messages', this.messages);

      this.broadcast({ type: 'msg', ...msg });
    }

    // Profile updates are intentionally not accepted over the WebSocket.
    // The Worker route /auth/profile validates changes (username reservation,
    // color contrast, etc.) and pushes the authoritative values via the
    // /admin/update-user admin route. Trusting client-sent { type: 'profile' }
    // here would let a malicious client impersonate any username in live
    // messages and the online list until reconnect.
  }

  async webSocketClose() {
    this.broadcastOnline();
  }

  async webSocketError() {
    this.broadcastOnline();
  }

  // --- Internal helpers ----------------------------------------------------

  broadcast(data) {
    const payload = JSON.stringify(data);
    for (const ws of this.state.getWebSockets()) {
      try { ws.send(payload); } catch {}
    }
  }

  broadcastOnline() {
    const sockets = this.state.getWebSockets();
    const byKey = new Map();
    for (const ws of sockets) {
      const a = ws.deserializeAttachment() || {};
      // Dedup tabs of the same user by fingerprint. Fall back to the
      // socket object itself so unauthenticated/legacy connections stay
      // distinct instead of collapsing to a single "anon" row.
      const key = a.fingerprint || ws;
      if (byKey.has(key)) continue;
      byKey.set(key, {
        username: a.username || 'Anon',
        color: a.color || '#888888',
        fingerprint: a.fingerprint || '',
      });
    }
    const users = [...byKey.values()];
    this.broadcast({ type: 'online', count: users.length, users });
  }
}
