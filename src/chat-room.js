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

export class ChatRoom {
  constructor(state) {
    this.state = state;
    this.sessions = [];   // { ws, username, color }
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

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.state.acceptWebSocket(server);
    server.serializeAttachment({ username, color, fingerprint });

    // Send history to the new client
    server.send(JSON.stringify({ type: 'history', messages: this.messages }));

    this.sessions = this.getActiveSessions();
    this.broadcastOnline();

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, rawMsg) {
    let data;
    try { data = JSON.parse(rawMsg); } catch { return; }

    const attachment = ws.deserializeAttachment();

    if (data.type === 'msg' && typeof data.text === 'string') {
      const text = data.text.trim().slice(0, 500);
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

    // Allow live profile updates over the socket
    if (data.type === 'profile') {
      let changed = false;
      if (typeof data.username === 'string' && /^[a-zA-Z0-9_\-]{1,20}$/.test(data.username)) {
        attachment.username = data.username;
        changed = true;
      }
      if (typeof data.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(data.color)) {
        attachment.color = data.color;
        changed = true;
      }
      if (changed) {
        ws.serializeAttachment(attachment);
        this.broadcastOnline();
      }
    }
  }

  async webSocketClose(ws) {
    this.sessions = this.getActiveSessions();
    this.broadcastOnline();
  }

  async webSocketError(ws) {
    this.sessions = this.getActiveSessions();
    this.broadcastOnline();
  }

  // --- Internal helpers ----------------------------------------------------

  getActiveSessions() {
    return this.state.getWebSockets();
  }

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
      const key = a.fingerprint || a.username || 'anon';
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
