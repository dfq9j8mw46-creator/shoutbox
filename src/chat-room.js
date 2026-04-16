// ---------------------------------------------------------------------------
// ChatRoom Durable Object
//
// Manages WebSocket connections and the last 100 messages in memory + storage.
// ---------------------------------------------------------------------------

const MAX_MESSAGES = 100;

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

    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const username = request.headers.get('X-Chat-Username') || 'Anon';
    const color = request.headers.get('X-Chat-Color') || '#888888';

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.state.acceptWebSocket(server);
    server.serializeAttachment({ username, color });

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

      const msg = {
        username: attachment.username,
        color: attachment.color,
        text,
        ts: Date.now(),
      };

      this.messages.push(msg);
      if (this.messages.length > MAX_MESSAGES) {
        this.messages = this.messages.slice(-MAX_MESSAGES);
      }

      // Persist (non-blocking — Durable Object guarantees ordering)
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
    const users = sockets.map((ws) => {
      const a = ws.deserializeAttachment() || {};
      return { username: a.username || 'Anon', color: a.color || '#888888' };
    });
    this.broadcast({ type: 'online', count: sockets.length, users });
  }
}
