export const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Shoutbox</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0f0f0f;
    --surface: #1a1a1a;
    --border: #2a2a2a;
    --text: #e0e0e0;
    --text-muted: #777;
    --accent: #5b8def;
  }

  body {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
    background: var(--bg);
    color: var(--text);
    height: 100dvh;
    display: flex;
    flex-direction: column;
  }
  pre, code, kbd, samp, #color-hex, #vm-recipe, #verify-box dd {
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  }

  /* --- Header bar -------------------------------------------------------- */
  #header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    gap: 8px;
  }
  #header .left { display: flex; align-items: center; gap: 10px; }
  #header h1 { font-size: 15px; font-weight: 600; letter-spacing: .5px; }
  #online-badge {
    font-size: 11px;
    color: var(--text-muted);
    background: var(--bg);
    padding: 2px 8px;
    border-radius: 10px;
  }
  #header .right { display: flex; align-items: center; gap: 6px; }

  /* --- Chat body + users panel ------------------------------------------ */
  #chat-body {
    flex: 1;
    display: flex;
    min-height: 0;
  }
  #main-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  #users-panel {
    width: 180px;
    border-left: 1px solid var(--border);
    background: var(--surface);
    display: flex;
    flex-direction: column;
    transition: width .15s ease;
    flex-shrink: 0;
    overflow: hidden;
  }
  #users-panel.collapsed { width: 32px; }
  #users-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    font-size: 11px;
    letter-spacing: .5px;
    text-transform: uppercase;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  #users-panel.collapsed #users-header { padding: 8px 6px; justify-content: center; }
  #users-panel.collapsed #users-header .label,
  #users-panel.collapsed #users-list { display: none; }
  #users-toggle {
    background: none; border: none; cursor: pointer;
    color: var(--text-muted);
    padding: 2px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }
  #users-toggle:hover { color: var(--text); }
  #users-toggle svg { transition: transform .15s ease; }
  #users-panel.collapsed #users-toggle svg { transform: rotate(180deg); }
  #users-list {
    list-style: none;
    overflow-y: auto;
    padding: 6px 0;
    margin: 0;
    flex: 1;
  }
  #users-list li {
    padding: 4px 12px;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* --- Icon buttons ------------------------------------------------------ */
  .icon-btn {
    padding: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 0;
  }
  .icon-btn svg { display: block; }

  /* --- Mobile: prevent iOS auto-zoom on input focus --------------------- */
  @media (max-width: 640px) {
    input, select, textarea { font-size: 16px !important; }
  }

  /* --- Small buttons ----------------------------------------------------- */
  .btn {
    background: var(--border);
    border: none;
    color: var(--text);
    padding: 5px 10px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
  }
  .btn:hover { background: #333; }
  .btn-primary { background: var(--accent); color: #fff; }
  .btn-primary:hover { background: #4a7de0; }

  /* --- Messages area ----------------------------------------------------- */
  #messages {
    flex: 1;
    overflow-y: auto;
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    scroll-behavior: smooth;
  }
  .msg {
    font-size: 13px;
    line-height: 1.45;
    padding: 2px 0;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  .msg .ts {
    color: var(--text-muted);
    font-size: 11px;
    margin-right: 4px;
    user-select: none;
  }
  .msg .name {
    font-weight: 600;
    margin-right: 4px;
    cursor: default;
  }
  .msg .text { color: var(--text); }

  /* --- Input bar --------------------------------------------------------- */
  #input-bar {
    display: flex;
    padding: 8px 12px;
    gap: 8px;
    background: var(--surface);
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }
  #msg-input {
    flex: 1;
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 8px 10px;
    border-radius: 4px;
    font-size: 14px;
    outline: none;
  }
  #msg-input:focus { border-color: var(--accent); }
  #msg-input::placeholder { color: var(--text-muted); }

  /* --- Auth screen ------------------------------------------------------- */
  #auth-screen {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100dvh;
    flex-direction: column;
    gap: 16px;
  }
  #auth-screen h2 { font-size: 20px; font-weight: 600; }
  #auth-screen p { color: var(--text-muted); font-size: 13px; max-width: 300px; text-align: center; }
  #auth-form { display: flex; gap: 8px; }
  #auth-form input {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 14px;
    width: 240px;
    outline: none;
  }
  #auth-form input:focus { border-color: var(--accent); }
  #auth-status { color: var(--text-muted); font-size: 12px; min-height: 18px; }
  #dev-link { margin-top: 8px; }
  #dev-link a { color: var(--accent); font-size: 12px; }

  /* --- Profile modal ----------------------------------------------------- */
  #profile-modal {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,.6);
    align-items: center;
    justify-content: center;
    z-index: 100;
  }
  #profile-modal.open { display: flex; }
  #profile-box {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px;
    width: 300px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  #profile-box h3 { font-size: 15px; font-weight: 600; }
  #profile-box label { font-size: 12px; color: var(--text-muted); }
  #profile-box input[type="text"] {
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 6px 8px;
    border-radius: 4px;
    font-size: 14px;
    width: 100%;
    outline: none;
  }
  .color-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  #color-input {
    width: 40px;
    height: 32px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    background: none;
    padding: 0;
  }
  #color-hex {
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 6px 8px;
    border-radius: 4px;
    font-size: 13px;
    font-family: monospace;
    width: 90px;
    outline: none;
  }
  #color-preview {
    font-weight: 600;
    font-size: 14px;
  }
  #profile-box .actions { display: flex; gap: 8px; justify-content: flex-end; }

  /* --- Build badge + verify modal --------------------------------------- */
  #build-badge {
    display: none;
    font-size: 11px;
    color: var(--text-muted);
    text-decoration: none;
    font-family: monospace;
    padding: 2px 8px;
    border: 1px solid var(--border);
    border-radius: 10px;
    cursor: pointer;
  }
  #build-badge:hover { color: var(--text); border-color: var(--text-muted); }
  #verify-modal {
    display: none; position: fixed; inset: 0;
    background: rgba(0,0,0,.6);
    align-items: center; justify-content: center;
    z-index: 100;
  }
  #verify-modal.open { display: flex; }
  #verify-box {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px;
    width: 580px;
    max-width: calc(100vw - 32px);
    display: flex; flex-direction: column; gap: 10px;
    font-size: 13px;
  }
  #verify-box h3 { font-size: 15px; font-weight: 600; margin: 0; }
  #verify-box dl { display: grid; grid-template-columns: 100px 1fr; gap: 4px 10px; margin: 0; }
  #verify-box dt { color: var(--text-muted); }
  #verify-box dd { margin: 0; font-family: monospace; word-break: break-all; }
  #verify-box a { color: var(--accent); }
  #verify-box p { color: var(--text-muted); margin: 4px 0 0; }
  #verify-box pre {
    background: var(--bg); border: 1px solid var(--border);
    padding: 8px; border-radius: 4px;
    font-size: 11px; overflow-x: auto;
    white-space: pre; margin: 0;
  }
  #verify-box .actions { display: flex; justify-content: flex-end; }

  /* --- User fingerprint + clickable names + profile modal --------------- */
  .clickable-name { cursor: pointer; }
  .clickable-name:hover { text-decoration: underline; }
  .fp {
    color: var(--text-muted);
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    font-size: 10px;
    margin-right: 6px;
    user-select: all;
  }
  #users-list li .fp { margin-left: 6px; margin-right: 0; float: right; }
  #user-modal {
    display: none; position: fixed; inset: 0;
    background: rgba(0,0,0,.6);
    align-items: center; justify-content: center;
    z-index: 100;
  }
  #user-modal.open { display: flex; }
  #user-box {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px;
    width: 320px;
    max-width: calc(100vw - 32px);
    display: flex; flex-direction: column; gap: 10px;
    font-size: 13px;
  }
  #user-box h3 { font-size: 17px; font-weight: 600; margin: 0; display: flex; align-items: baseline; gap: 8px; }
  #user-box h3 .fp { font-size: 11px; }
  #user-box dl { display: grid; grid-template-columns: 90px 1fr; gap: 4px 10px; margin: 0; }
  #user-box dt { color: var(--text-muted); }
  #user-box dd { margin: 0; }
  #user-box .actions { display: flex; justify-content: flex-end; }

  /* --- Connection status ------------------------------------------------- */
  #conn-status {
    font-size: 11px;
    padding: 4px 12px;
    text-align: center;
    background: #2a1a1a;
    color: #e88;
    display: none;
  }
  #conn-status.show { display: block; }
</style>
</head>
<body>

<!-- Auth screen -->
<div id="auth-screen">
  <h1>Shoutbox</h1>
  <p>Sign in with your email to join the chat. You'll get a magic link — no password needed.</p>
  <form id="auth-form">
    <input type="email" id="email-input" placeholder="you@example.com" required autocomplete="email">
    <button type="submit" class="btn btn-primary">Send link</button>
  </form>
  <div id="auth-status"></div>
  <div id="dev-link"></div>
</div>

<!-- Chat screen (hidden until authed) -->
<div id="chat-screen" style="display:none; flex-direction:column; height:100dvh;">
  <div id="header">
    <div class="left">
      <h1>Shoutbox</h1>
      <span id="online-badge">0 online</span>
      <a id="build-badge" href="#" title="Click to verify this build"></a>
    </div>
    <div class="right">
      <button class="btn icon-btn" id="profile-btn" title="Profile" aria-label="Profile">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      </button>
      <button class="btn icon-btn" id="logout-btn" title="Logout" aria-label="Logout">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      </button>
    </div>
  </div>
  <div id="chat-body">
    <div id="main-col">
      <div id="conn-status">Reconnecting...</div>
      <div id="messages"></div>
      <div id="input-bar">
        <input type="text" id="msg-input" placeholder="Type a message..." maxlength="500" autocomplete="off">
        <button class="btn btn-primary" id="send-btn">Send</button>
      </div>
    </div>
    <aside id="users-panel">
      <div id="users-header">
        <span class="label">Online</span>
        <button id="users-toggle" aria-label="Toggle user list">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
      <ul id="users-list"></ul>
    </aside>
  </div>
</div>

<!-- Verify modal -->
<div id="verify-modal">
  <div id="verify-box">
    <h3>Build provenance</h3>
    <dl>
      <dt>Commit</dt><dd><a id="vm-commit-link" target="_blank" rel="noopener"></a></dd>
      <dt>Built at</dt><dd id="vm-built-at"></dd>
      <dt>Workflow</dt><dd><a id="vm-run-link" target="_blank" rel="noopener">view run</a></dd>
      <dt>Repo</dt><dd><a id="vm-repo-link" target="_blank" rel="noopener"></a></dd>
    </dl>
    <p>This build is signed by GitHub Actions via Sigstore. Verify locally:</p>
    <pre id="vm-recipe"></pre>
    <p>CI also fetches the deployed bundle from Cloudflare after each deploy and fails the run if its hash differs from the signed bundle.</p>
    <div class="actions">
      <button class="btn" id="verify-close">Close</button>
    </div>
  </div>
</div>

<!-- User info modal -->
<div id="user-modal">
  <div id="user-box">
    <h3>
      <span id="um-name"></span>
      <span id="um-fp" class="fp"></span>
    </h3>
    <dl>
      <dt>Joined</dt><dd id="um-joined"></dd>
    </dl>
    <div class="actions">
      <button class="btn" id="user-close">Close</button>
    </div>
  </div>
</div>

<!-- Profile modal -->
<div id="profile-modal">
  <div id="profile-box">
    <h3>Edit Profile</h3>
    <div>
      <label for="username-input">Username (1-20 chars)</label>
      <input type="text" id="username-input" maxlength="20" pattern="[a-zA-Z0-9_\\-]+">
    </div>
    <div>
      <label>Name color</label>
      <div class="color-row">
        <input type="color" id="color-input">
        <input type="text" id="color-hex" maxlength="7" placeholder="#5b8def">
        <span id="color-preview">Preview</span>
      </div>
    </div>
    <div class="actions">
      <button class="btn" id="profile-cancel">Cancel</button>
      <button class="btn btn-primary" id="profile-save">Save</button>
    </div>
  </div>
</div>

<script>
(function() {
  // --- Elements ---
  const authScreen  = document.getElementById('auth-screen');
  const chatScreen  = document.getElementById('chat-screen');
  const authForm    = document.getElementById('auth-form');
  const emailInput  = document.getElementById('email-input');
  const authStatus  = document.getElementById('auth-status');
  const devLink     = document.getElementById('dev-link');
  const messagesDiv = document.getElementById('messages');
  const msgInput    = document.getElementById('msg-input');
  const sendBtn     = document.getElementById('send-btn');
  const onlineBadge = document.getElementById('online-badge');
  const usersList   = document.getElementById('users-list');
  const usersPanel  = document.getElementById('users-panel');
  const usersToggle = document.getElementById('users-toggle');
  const logoutBtn   = document.getElementById('logout-btn');
  const profileBtn  = document.getElementById('profile-btn');
  const profileModal = document.getElementById('profile-modal');
  const usernameInput = document.getElementById('username-input');
  const colorInput  = document.getElementById('color-input');
  const colorHex    = document.getElementById('color-hex');
  const colorPreview = document.getElementById('color-preview');
  const profileSave = document.getElementById('profile-save');
  const profileCancel = document.getElementById('profile-cancel');
  const connStatus  = document.getElementById('conn-status');

  let ws = null;
  let myUsername = '';
  let myColor = '';
  let reconnectTimer = null;
  let reconnectDelay = 1000;

  // --- Auth check ---
  async function checkAuth() {
    try {
      const res = await fetch('/auth/me');
      if (res.ok) {
        const data = await res.json();
        myUsername = data.username;
        myColor = data.color;
        showChat();
        return;
      }
    } catch {}
    showAuth();
  }

  function showAuth() {
    authScreen.style.display = '';
    chatScreen.style.display = 'none';
  }

  function showChat() {
    authScreen.style.display = 'none';
    chatScreen.style.display = 'flex';
    connectWS();
  }

  // --- Auth form ---
  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    if (!email) return;
    authStatus.textContent = 'Sending...';
    devLink.innerHTML = '';
    try {
      const res = await fetch('/auth/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok) {
        authStatus.textContent = 'Check your email for the login link!';
        if (data.dev_link) {
          devLink.innerHTML = '<a href="' + data.dev_link + '" target="_blank">Dev: click here to sign in</a>';
        }
      } else {
        authStatus.textContent = data.error || 'Something went wrong';
      }
    } catch {
      authStatus.textContent = 'Network error';
    }
  });

  // --- WebSocket ---
  function connectWS() {
    if (ws) { try { ws.close(); } catch {} }
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(proto + '//' + location.host + '/ws');

    ws.addEventListener('open', () => {
      connStatus.classList.remove('show');
      reconnectDelay = 1000;
    });

    ws.addEventListener('message', (e) => {
      const data = JSON.parse(e.data);

      if (data.type === 'history') {
        messagesDiv.innerHTML = '';
        data.messages.forEach((m) => appendMsg(m));
        scrollBottom();
      }

      if (data.type === 'msg') {
        appendMsg(data);
        scrollBottom();
      }

      if (data.type === 'online') {
        onlineBadge.textContent = data.count + ' online';
        renderUsers(data.users || []);
      }
    });

    ws.addEventListener('close', () => {
      connStatus.classList.add('show');
      scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      connStatus.classList.add('show');
    });
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      reconnectDelay = Math.min(reconnectDelay * 1.5, 10000);
      connectWS();
    }, reconnectDelay);
  }

  // --- Messages ---
  function appendMsg(m) {
    const div = document.createElement('div');
    div.className = 'msg';

    const ts = document.createElement('span');
    ts.className = 'ts';
    const d = new Date(m.ts);
    ts.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const name = document.createElement('span');
    name.className = 'name clickable-name';
    name.style.color = m.color;
    name.textContent = m.username;
    name.dataset.username = m.username;

    const fp = document.createElement('span');
    fp.className = 'fp';
    fp.textContent = m.fingerprint ? '#' + m.fingerprint : '';

    const text = document.createElement('span');
    text.className = 'text';
    text.textContent = m.text;

    div.appendChild(ts);
    div.appendChild(name);
    if (m.fingerprint) div.appendChild(fp);
    div.appendChild(text);
    messagesDiv.appendChild(div);

    // Keep DOM limited
    while (messagesDiv.children.length > 100) {
      messagesDiv.removeChild(messagesDiv.firstChild);
    }
  }

  function scrollBottom() {
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  // --- Send message ---
  function sendMsg() {
    const text = msgInput.value.trim();
    if (!text || !ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ type: 'msg', text }));
    msgInput.value = '';
    msgInput.focus();
  }

  sendBtn.addEventListener('click', sendMsg);
  msgInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMsg();
    }
  });

  // --- Profile modal ---
  profileBtn.addEventListener('click', () => {
    usernameInput.value = myUsername;
    colorInput.value = myColor.startsWith('#') ? myColor : '#5b8def';
    colorHex.value = colorInput.value;
    colorPreview.style.color = colorInput.value;
    colorPreview.textContent = myUsername || 'Preview';
    profileModal.classList.add('open');
  });

  profileCancel.addEventListener('click', () => profileModal.classList.remove('open'));
  profileModal.addEventListener('click', (e) => {
    if (e.target === profileModal) profileModal.classList.remove('open');
  });

  colorInput.addEventListener('input', () => {
    colorHex.value = colorInput.value;
    colorPreview.style.color = colorInput.value;
  });

  colorHex.addEventListener('input', () => {
    const v = colorHex.value;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      colorInput.value = v;
      colorPreview.style.color = v;
    }
  });

  usernameInput.addEventListener('input', () => {
    colorPreview.textContent = usernameInput.value || 'Preview';
  });

  profileSave.addEventListener('click', async () => {
    const username = usernameInput.value.trim();
    const color = colorHex.value.trim();
    if (!username || !/^[a-zA-Z0-9_\\-]{1,20}$/.test(username)) {
      alert('Username: 1-20 chars, letters/numbers/_/-');
      return;
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
      alert('Color must be #RRGGBB');
      return;
    }

    try {
      const res = await fetch('/auth/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, color }),
      });
      if (res.ok) {
        const data = await res.json();
        myUsername = data.username;
        myColor = data.color;
        // Notify the Durable Object of the profile change
        if (ws && ws.readyState === 1) {
          ws.send(JSON.stringify({ type: 'profile', username: myUsername, color: myColor }));
        }
        profileModal.classList.remove('open');
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to save');
      }
    } catch {
      alert('Network error');
    }
  });

  // --- Logout ---
  logoutBtn.addEventListener('click', async () => {
    await fetch('/auth/logout', { method: 'POST' });
    if (ws) ws.close();
    showAuth();
  });

  // --- Build provenance badge ---
  const buildBadge   = document.getElementById('build-badge');
  const verifyModal  = document.getElementById('verify-modal');
  const vmCommitLink = document.getElementById('vm-commit-link');
  const vmBuiltAt    = document.getElementById('vm-built-at');
  const vmRunLink    = document.getElementById('vm-run-link');
  const vmRepoLink   = document.getElementById('vm-repo-link');
  const vmRecipe     = document.getElementById('vm-recipe');
  const verifyClose  = document.getElementById('verify-close');
  let versionInfo = null;

  async function loadVersion() {
    try {
      const res = await fetch('/version.json');
      if (!res.ok) return;
      versionInfo = await res.json();
      const sha = versionInfo.commit || 'unknown';
      const short = sha === 'dev' ? 'dev' : sha.slice(0, 7);
      buildBadge.textContent = 'build ' + short;
      buildBadge.style.display = 'inline-block';
    } catch {}
  }

  buildBadge.addEventListener('click', (e) => {
    e.preventDefault();
    if (!versionInfo) return;
    const sha  = versionInfo.commit || '';
    const repo = versionInfo.repo || '';
    const slug = repo.replace('https://github.com/', '');
    const owner = slug.split('/')[0] || '';
    const short = sha.slice(0, 12);
    vmCommitLink.textContent = sha;
    vmCommitLink.href = repo && sha !== 'dev' ? repo + '/commit/' + sha : '#';
    vmBuiltAt.textContent = versionInfo.built_at || '—';
    vmRunLink.href = versionInfo.workflow_run || '#';
    vmRepoLink.textContent = slug;
    vmRepoLink.href = repo;
    vmRecipe.textContent = [
      'gh release download build-' + short + ' --repo ' + slug,
      'gh attestation verify index.js       --owner ' + owner,
      'gh attestation verify live-script.js --owner ' + owner,
    ].join(String.fromCharCode(10));
    verifyModal.classList.add('open');
  });
  verifyClose.addEventListener('click', () => verifyModal.classList.remove('open'));
  verifyModal.addEventListener('click', (e) => {
    if (e.target === verifyModal) verifyModal.classList.remove('open');
  });

  // --- User info modal ---
  const userModal = document.getElementById('user-modal');
  const umName    = document.getElementById('um-name');
  const umFp      = document.getElementById('um-fp');
  const umJoined  = document.getElementById('um-joined');
  const userClose = document.getElementById('user-close');

  async function showUser(username) {
    umName.textContent = username;
    umName.style.color = '';
    umFp.textContent = '';
    umJoined.textContent = 'Loading...';
    userModal.classList.add('open');
    try {
      const res = await fetch('/user/' + encodeURIComponent(username));
      if (!res.ok) { umJoined.textContent = 'Unknown user'; return; }
      const u = await res.json();
      umName.style.color = u.color || '';
      umFp.textContent = u.fingerprint ? '#' + u.fingerprint : '';
      if (u.created_at) {
        const d = new Date(u.created_at);
        umJoined.textContent = d.toLocaleString();
      } else {
        umJoined.textContent = '—';
      }
    } catch {
      umJoined.textContent = 'Network error';
    }
  }
  userClose.addEventListener('click', () => userModal.classList.remove('open'));
  userModal.addEventListener('click', (e) => {
    if (e.target === userModal) userModal.classList.remove('open');
  });
  document.addEventListener('click', (e) => {
    const el = e.target.closest('.clickable-name');
    if (el && el.dataset.username) showUser(el.dataset.username);
  });

  // --- Online users panel ---
  function renderUsers(users) {
    usersList.innerHTML = '';
    const sorted = users.slice().sort((a, b) => a.username.localeCompare(b.username));
    for (const u of sorted) {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'clickable-name';
      name.style.color = u.color;
      name.textContent = u.username;
      name.dataset.username = u.username;
      li.appendChild(name);
      if (u.fingerprint) {
        const fp = document.createElement('span');
        fp.className = 'fp';
        fp.textContent = '#' + u.fingerprint;
        li.appendChild(fp);
      }
      usersList.appendChild(li);
    }
  }
  if (localStorage.getItem('users-collapsed') === '1') {
    usersPanel.classList.add('collapsed');
  }
  usersToggle.addEventListener('click', () => {
    usersPanel.classList.toggle('collapsed');
    localStorage.setItem('users-collapsed', usersPanel.classList.contains('collapsed') ? '1' : '0');
  });

  // --- Boot ---
  loadVersion();
  checkAuth();
})();
</script>
</body>
</html>`;
