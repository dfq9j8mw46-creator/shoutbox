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

  /* --- Chat body layout ------------------------------------------------- */
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

  /* Row that sits just above the chat bar: own name pinned first, then
     the rest of the online users, an optional "+N more" chip, and the
     SB build badge on the right. */
  #chat-status {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 6px 12px;
    font-size: 12px;
    color: var(--text-muted);
    flex-shrink: 0;
  }
  /* Horizontal strip of online users. Collapsed state clips overflow and
     the JS counts the hidden rows into the "+N more" button. Expanded
     state lets the list wrap to multiple lines. */
  #users-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: row;
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }
  #users-list.expanded {
    flex-wrap: wrap;
    row-gap: 4px;
    overflow: visible;
  }
  #users-list li {
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    max-width: 200px;
    margin-right: 12px;
    /* Keep natural width so #users-list's overflow:hidden actually has
       something to clip; without this the items would just shrink into
       the container and the "+N more" count would always be 0. */
    flex-shrink: 0;
    transition: transform 260ms ease, opacity 220ms ease,
                max-width 260ms ease, margin-right 260ms ease;
  }
  /* Joining: start below the bar (translateY down) with no opacity, then
     slide up into place. Leaving reverses that and also collapses the
     item's width + margin so neighbors close the gap smoothly. */
  #users-list li.entering { transform: translateY(120%); opacity: 0; }
  #users-list li.leaving {
    transform: translateY(120%);
    opacity: 0;
    max-width: 0;
    margin-right: 0;
  }
  /* Fingerprint sits next to the name in the dropdown/modal contexts; in
     the compact horizontal strip it's noise — let the click-to-open user
     modal surface it instead. */
  #users-list .fp { display: none; }

  #users-more {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 600;
    padding: 0;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }
  #users-more:hover { color: var(--text); }


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
    min-width: 0;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 8px 12px 8px 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    scroll-behavior: smooth;
  }
  /* Stack messages from the bottom: when the list is shorter than the
     viewport, margin-top:auto pushes everything down. When it's taller
     and scrolls, flex collapses the auto margin so normal scrolling
     behavior wins. */
  #messages > *:first-child { margin-top: auto; }
  .msg {
    font-size: 13px;
    line-height: 1.45;
    padding: 2px 0 2px 6px;
    border-left: 2px solid transparent;
    max-width: 100%;
    min-width: 0;
    overflow-wrap: anywhere;
    word-break: break-all;
  }
  .msg .text { overflow-wrap: anywhere; word-break: break-all; }
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
    position: relative;
  }
  /* Icon buttons inside the input bar match the text input's box: same
     border, radius, and vertical padding so all three elements align. */
  #input-bar .btn {
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
  }
  #input-bar #send-btn { border-color: var(--accent); }

  /* --- @mention autocomplete -------------------------------------------- */
  #mention-suggest {
    position: absolute;
    bottom: calc(100% + 4px);
    /* Aligned with the left edge of #msg-input (input-bar padding-left). */
    left: 12px;
    min-width: 180px;
    max-width: 280px;
    max-height: 220px;
    overflow-y: auto;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: 0 6px 16px rgba(0,0,0,.45);
    display: none;
    z-index: 20;
  }
  #mention-suggest.open { display: block; }
  .mention-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    font-size: 13px;
    cursor: pointer;
    white-space: nowrap;
  }
  .mention-item .m-name { font-weight: 600; }
  .mention-item .m-badge {
    font-size: 10px;
    color: var(--text-muted);
    margin-left: auto;
  }
  .mention-item.active, .mention-item:hover { background: var(--border); }
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
  #auth-primary { display: flex; gap: 8px; }
  #auth-primary .btn { padding: 8px 14px; font-size: 13px; }
  #email-plea {
    max-width: 320px;
    color: #ff6b6b;
    font-size: 12px;
    line-height: 1.5;
    text-align: center;
    border: 1px solid rgba(255, 107, 107, .35);
    background: rgba(255, 107, 107, .08);
    padding: 8px 12px;
    border-radius: 6px;
  }
  #auth-alts { font-size: 12px; color: var(--text-muted); display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
  #auth-alts a { color: var(--accent); text-decoration: none; }
  #auth-alts a:hover { text-decoration: underline; }
  #signup-form, #recovery-form { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
  #signup-form input { width: 240px; }
  #recovery-form input { width: 180px; }
  #signup-form input, #recovery-form input {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 14px;
    outline: none;
  }
  #signup-form input:focus, #recovery-form input:focus { border-color: var(--accent); }

  /* --- Recovery codes modal --------------------------------------------- */
  #rc-modal {
    display: none; position: fixed; inset: 0;
    background: rgba(0,0,0,.75);
    align-items: center; justify-content: center;
    z-index: 200;
  }
  #rc-modal.open { display: flex; }
  #rc-box {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px;
    width: 360px;
    max-width: calc(100vw - 32px);
    display: flex; flex-direction: column; gap: 10px;
    font-size: 13px;
  }
  #rc-box h3 { font-size: 15px; font-weight: 600; }
  #rc-box p { color: var(--text-muted); font-size: 12px; }
  #rc-codes {
    background: var(--bg);
    border: 1px solid var(--border);
    padding: 10px;
    border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 13px;
    line-height: 1.7;
    white-space: pre;
    user-select: all;
  }
  #rc-box .actions { display: flex; gap: 8px; justify-content: flex-end; }

  /* --- Grouped sections in profile modal --------------------------------- */
  #pk-section, #email-section, #account-section {
    border-top: 1px solid var(--border);
    padding-top: 10px;
    display: flex; flex-direction: column; gap: 6px;
  }
  #pk-section h4, #email-section h4, #account-section h4 { font-size: 12px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: .5px; }
  .account-actions { display: flex; gap: 8px; justify-content: space-between; }
  #email-current {
    display: flex; align-items: center; gap: 8px;
    font-size: 13px;
  }
  #email-value { flex: 1; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #email-value:empty::before { content: 'None'; color: var(--text-muted); }
  #email-actions { display: flex; gap: 4px; }
  #email-actions .btn { padding: 3px 8px; font-size: 11px; }
  #email-form { display: flex; flex-direction: column; gap: 6px; }
  #email-new-input {
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 6px 8px;
    border-radius: 4px;
    font-size: 14px;
    outline: none;
  }
  #email-new-input:focus { border-color: var(--accent); }
  .email-form-actions { display: flex; gap: 6px; justify-content: flex-end; }
  #email-msg { font-size: 11px; min-height: 14px; color: var(--text-muted); }
  #email-msg.error { color: #ff6b6b; }
  #email-msg.ok { color: #8fd18f; }
  .pk-row {
    display: flex; align-items: center; gap: 8px;
    font-size: 12px;
  }
  .pk-row .pk-id { flex: 1; color: var(--text-muted); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pk-row .btn { padding: 3px 8px; font-size: 11px; }

  #auth-form, #code-form { display: flex; gap: 8px; }
  #auth-form input, #code-form input {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 14px;
    width: 240px;
    outline: none;
  }
  #auth-form input:focus, #code-form input:focus { border-color: var(--accent); }
  #code-form input { letter-spacing: 4px; text-align: center; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
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
    position: relative;
  }
  #profile-box h3 { font-size: 15px; font-weight: 600; }
  #profile-meta {
    font-size: 11px;
    color: var(--text-muted);
    margin-top: -8px;
  }
  #profile-meta .fp { font-size: 11px; margin: 0; }
  #profile-close {
    position: absolute;
    top: 8px;
    right: 8px;
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 20px;
    line-height: 1;
    padding: 4px 8px;
    cursor: pointer;
    border-radius: 4px;
  }
  #profile-close:hover { color: var(--text); background: var(--border); }
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
  /* The generic #profile-box input[type="text"] rule forces width: 100%,
     which breaks the flex layout. Switch these to flex-basis inside
     .color-row so username grows into the remaining space and the hex /
     swatch stay their fixed sizes. */
  .color-row input[type="text"] { width: auto; }
  .color-row #username-input { flex: 1; min-width: 0; font-weight: 600; }
  .color-row #color-hex { flex: 0 0 90px; }
  .color-row #color-input { flex: 0 0 40px; }
  #color-input {
    height: 32px;
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
    background: var(--bg);
    padding: 2px;
  }
  #color-hex {
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 6px 8px;
    border-radius: 4px;
    font-size: 13px;
    font-family: monospace;
    outline: none;
  }
  #color-warn {
    margin-top: 4px;
    font-size: 11px;
    color: #ff6b6b;
    min-height: 14px;
  }
  #profile-box .actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
  #profile-box .actions .spacer { flex: 1; }
  /* Save is the only footer button now — make it fill the row so it doesn't
     look stranded on its own line. */
  #profile-save { width: 100%; padding: 8px; font-size: 13px; }
  .btn-danger { background: #5a1f1f; color: #f5bebe; }
  .btn-danger:hover { background: #7a2a2a; }

  /* --- Build badge + verify modal --------------------------------------- */
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

  /* --- Links ------------------------------------------------------------- */
  .msg .link { color: var(--accent); text-decoration: underline; }
  .msg .link:hover { text-decoration: none; }

  /* --- Mentions ---------------------------------------------------------- */
  .mention { color: var(--accent); font-weight: 600; }
  .msg.mentioned {
    background: rgba(91,141,239,.12);
    border-left-color: var(--accent);
  }

  /* --- Profile toggle row ------------------------------------------------ */
  #profile-box .toggle-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    cursor: pointer;
    user-select: none;
  }
  #profile-box .toggle-row input { cursor: pointer; }
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

<!-- Auth screen (hidden until checkAuth resolves - avoids a flash of the
     login page on refresh when the user is already signed in) -->
<div id="auth-screen" style="display:none;">
  <h1>Shoutbox</h1>
  <p id="auth-intro">Sign in with a passkey - no email, no password.</p>

  <div id="auth-primary">
    <button class="btn btn-primary" id="pk-signin-btn">Sign in with passkey</button>
    <button class="btn" id="pk-signup-btn">Create account</button>
  </div>

  <form id="signup-form" style="display:none;">
    <input type="text" id="signup-name" placeholder="Pick a username" maxlength="20" pattern="[a-zA-Z0-9_\\-]+" required autocomplete="username webauthn">
    <button type="submit" class="btn btn-primary">Create passkey</button>
  </form>

  <form id="auth-form" style="display:none;">
    <input type="email" id="email-input" placeholder="you@example.com" required autocomplete="email">
    <button type="submit" class="btn btn-primary">Continue</button>
  </form>
  <p id="email-plea" style="display:none;">
    Please use a passkey instead - I'd rather not have your email address.
    Passkeys sign you in with Face ID, Touch ID, Windows Hello, or a hardware key
    and sync across your devices automatically.
  </p>
  <form id="code-form" style="display:none;">
    <input type="text" id="code-input" placeholder="6-digit code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required>
    <button type="submit" class="btn btn-primary">Sign in</button>
  </form>

  <form id="recovery-form" style="display:none;">
    <input type="text" id="recovery-user" placeholder="username" maxlength="20" autocomplete="username" required>
    <input type="text" id="recovery-code" placeholder="XXXX-XXXX-XXXX" maxlength="14" autocomplete="off" required>
    <button type="submit" class="btn btn-primary">Sign in</button>
  </form>

  <div id="auth-status"></div>
  <div id="dev-link"></div>
  <div id="auth-alts">
    <a href="#" id="use-passkey" style="display:none;">Use passkey instead</a>
    <a href="#" id="use-email">Use email instead</a>
    <span id="alts-sep">·</span>
    <a href="#" id="use-recovery">Use recovery code</a>
    <span id="alts-sep2">·</span>
    <a href="#" id="auth-back" style="display:none;">Back</a>
  </div>
</div>

<!-- Recovery codes modal (shown after passkey signup) -->
<div id="rc-modal">
  <div id="rc-box">
    <h3>Save your recovery codes</h3>
    <p>If you lose every device with your passkey, these one-time codes are the only way back in. Save them somewhere safe now - they won't be shown again.</p>
    <pre id="rc-codes"></pre>
    <div class="actions">
      <button class="btn" id="rc-copy">Copy</button>
      <button class="btn btn-primary" id="rc-continue">I saved them</button>
    </div>
  </div>
</div>

<!-- Chat screen (hidden until authed) -->
<div id="chat-screen" style="display:none; flex-direction:column; height:100dvh;">
  <div id="chat-body">
    <div id="main-col">
      <div id="conn-status">Reconnecting...</div>
      <div id="messages"></div>
      <div id="chat-status">
        <ul id="users-list"></ul>
        <button id="users-more" type="button" style="display:none;"></button>
      </div>
      <div id="input-bar">
        <div id="mention-suggest" role="listbox"></div>
        <input type="text" id="msg-input" placeholder="Type a message..." maxlength="500" autocomplete="off">
        <button class="btn btn-primary icon-btn" id="send-btn" aria-label="Send">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
        </button>
      </div>
    </div>
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
    <button type="button" id="profile-close" aria-label="Close">&times;</button>
    <h3>Edit Profile</h3>
    <div id="profile-meta">
      Joined <span id="profile-joined">—</span> · <span id="profile-fp" class="fp">—</span>
    </div>
    <div>
      <label for="username-input">Username</label>
      <div class="color-row">
        <input type="text" id="username-input" maxlength="20" pattern="[a-zA-Z0-9_\\-]+">
        <input type="text" id="color-hex" maxlength="7" placeholder="#5b8def">
        <input type="color" id="color-input">
      </div>
      <div id="color-warn"></div>
    </div>
    <label class="toggle-row" for="notify-toggle">
      <input type="checkbox" id="notify-toggle">
      Play sound when mentioned
    </label>
    <div id="email-section">
      <h4>Email</h4>
      <div id="email-current">
        <span id="email-value"></span>
        <span id="email-actions">
          <button class="btn" id="email-change-btn" type="button">Change</button>
          <button class="btn" id="email-remove-btn" type="button">Remove</button>
          <button class="btn" id="email-add-btn" type="button">Add email</button>
        </span>
      </div>
      <div id="email-form" style="display:none;">
        <input type="email" id="email-new-input" placeholder="new@example.com">
        <div class="email-form-actions">
          <button class="btn btn-primary" id="email-send-btn" type="button">Send verification</button>
          <button class="btn" id="email-form-cancel" type="button">Cancel</button>
        </div>
      </div>
      <div id="email-msg"></div>
    </div>
    <div id="pk-section">
      <h4>Passkeys</h4>
      <div id="pk-list"></div>
      <button class="btn" id="pk-add-btn" type="button">Add passkey</button>
      <button class="btn" id="rc-regen-btn" type="button">New recovery codes</button>
      <button class="btn" id="revoke-others-btn" type="button">Sign out other devices</button>
    </div>
    <div id="account-section">
      <h4>Account</h4>
      <div class="account-actions">
        <button class="btn" id="profile-logout" type="button">Sign out</button>
        <button class="btn btn-danger" id="profile-delete" type="button">Delete account</button>
      </div>
      <button class="btn" id="build-provenance-btn" type="button">Build provenance</button>
    </div>
    <div class="actions">
      <button class="btn btn-primary" id="profile-save">Save</button>
    </div>
  </div>
</div>

<script>
(function() {
  // --- Elements ---
  const authScreen  = document.getElementById('auth-screen');
  const chatScreen  = document.getElementById('chat-screen');
  const authPrimary = document.getElementById('auth-primary');
  const signupForm  = document.getElementById('signup-form');
  const signupName  = document.getElementById('signup-name');
  const pkSigninBtn = document.getElementById('pk-signin-btn');
  const pkSignupBtn = document.getElementById('pk-signup-btn');
  const useEmail    = document.getElementById('use-email');
  const usePasskey  = document.getElementById('use-passkey');
  const useRecovery = document.getElementById('use-recovery');
  const altsSep     = document.getElementById('alts-sep');
  const altsSep2    = document.getElementById('alts-sep2');
  const emailPlea   = document.getElementById('email-plea');
  const recoveryForm = document.getElementById('recovery-form');
  const recoveryUser = document.getElementById('recovery-user');
  const recoveryCode = document.getElementById('recovery-code');
  const rcModal     = document.getElementById('rc-modal');
  const rcCodes     = document.getElementById('rc-codes');
  const rcCopy      = document.getElementById('rc-copy');
  const rcContinue  = document.getElementById('rc-continue');
  const authForm    = document.getElementById('auth-form');
  const emailInput  = document.getElementById('email-input');
  const codeForm    = document.getElementById('code-form');
  const codeInput   = document.getElementById('code-input');
  const authBack    = document.getElementById('auth-back');
  const authStatus  = document.getElementById('auth-status');
  const devLink     = document.getElementById('dev-link');
  const pkSection   = document.getElementById('pk-section');
  const pkList      = document.getElementById('pk-list');
  const pkAddBtn    = document.getElementById('pk-add-btn');
  const rcRegenBtn  = document.getElementById('rc-regen-btn');
  const revokeOthersBtn = document.getElementById('revoke-others-btn');
  let pendingEmail  = '';
  const messagesDiv = document.getElementById('messages');
  const msgInput    = document.getElementById('msg-input');
  const sendBtn     = document.getElementById('send-btn');
  const usersList   = document.getElementById('users-list');
  const usersMore   = document.getElementById('users-more');
  const logoutBtn   = document.getElementById('profile-logout');
  const profileModal = document.getElementById('profile-modal');
  const profileJoined = document.getElementById('profile-joined');
  const profileFp   = document.getElementById('profile-fp');
  const usernameInput = document.getElementById('username-input');
  const colorInput  = document.getElementById('color-input');
  const colorHex    = document.getElementById('color-hex');
  const colorWarn    = document.getElementById('color-warn');
  const profileSave = document.getElementById('profile-save');
  const profileClose = document.getElementById('profile-close');
  const profileDelete = document.getElementById('profile-delete');
  const notifyToggle = document.getElementById('notify-toggle');
  const emailValue  = document.getElementById('email-value');
  const emailActions = document.getElementById('email-actions');
  const emailChangeBtn = document.getElementById('email-change-btn');
  const emailRemoveBtn = document.getElementById('email-remove-btn');
  const emailAddBtn  = document.getElementById('email-add-btn');
  const emailForm   = document.getElementById('email-form');
  const emailNewInput = document.getElementById('email-new-input');
  const emailSendBtn = document.getElementById('email-send-btn');
  const emailFormCancel = document.getElementById('email-form-cancel');
  const emailMsg    = document.getElementById('email-msg');
  const suggestEl   = document.getElementById('mention-suggest');
  const connStatus  = document.getElementById('conn-status');

  let ws = null;
  let myUsername = '';
  let myColor = '';
  let myEmail = null;
  let myFingerprint = null;
  let myCreatedAt = null;
  let isAuthed = false;
  let reconnectTimer = null;
  let reconnectDelay = 1000;
  let notifyOn = localStorage.getItem('notify') !== 'off';
  let audioCtx = null;
  const knownUsers = new Map(); // key: lowercase username → { username, color, online }
  let suggestItems = [];
  let suggestIdx = 0;
  let suggestToken = null;

  function addKnownUser(username, color, online) {
    if (!username) return;
    const key = username.toLowerCase();
    const cur = knownUsers.get(key) || { username, color: '', online: false };
    cur.username = username;
    if (color) cur.color = color;
    if (online) cur.online = true;
    // delete + set moves the key to the end so the oldest entry is always
    // the first one returned by .keys() — gives us a simple FIFO cap.
    knownUsers.delete(key);
    knownUsers.set(key, cur);
    if (knownUsers.size > 500) {
      const oldest = knownUsers.keys().next().value;
      knownUsers.delete(oldest);
    }
  }
  function setOnlineUsers(users) {
    for (const v of knownUsers.values()) v.online = false;
    for (const u of users) addKnownUser(u.username, u.color, true);
  }

  function getMentionToken() {
    if (document.activeElement !== msgInput) return null;
    const pos = msgInput.selectionStart;
    const before = msgInput.value.slice(0, pos);
    const m = before.match(/@([a-zA-Z0-9_\\-]*)$/);
    if (!m) return null;
    const start = pos - m[0].length;
    if (start > 0 && !/\\s/.test(before[start - 1])) return null;
    return { query: m[1], start, end: pos };
  }

  function hideSuggest() {
    suggestEl.classList.remove('open');
    suggestItems = [];
    suggestToken = null;
  }

  function renderSuggest() {
    suggestEl.innerHTML = '';
    suggestItems.forEach((u, i) => {
      const el = document.createElement('div');
      el.className = 'mention-item' + (i === suggestIdx ? ' active' : '');
      el.dataset.idx = String(i);
      const name = document.createElement('span');
      name.className = 'm-name';
      name.style.color = u.color || '';
      name.textContent = u.username;
      el.appendChild(name);
      if (u.online) {
        const b = document.createElement('span');
        b.className = 'm-badge';
        b.textContent = 'online';
        el.appendChild(b);
      }
      suggestEl.appendChild(el);
    });
  }

  function updateSuggest() {
    const token = getMentionToken();
    if (!token) { hideSuggest(); return; }
    const q = token.query.toLowerCase();
    const items = [...knownUsers.values()]
      .filter((u) => !q || u.username.toLowerCase().includes(q))
      .filter((u) => u.username.toLowerCase() !== (myUsername || '').toLowerCase())
      .sort((a, b) => {
        if (a.online !== b.online) return a.online ? -1 : 1;
        const as = a.username.toLowerCase().startsWith(q) ? 0 : 1;
        const bs = b.username.toLowerCase().startsWith(q) ? 0 : 1;
        if (as !== bs) return as - bs;
        return a.username.localeCompare(b.username);
      })
      .slice(0, 8);
    if (items.length === 0) { hideSuggest(); return; }
    suggestItems = items;
    suggestIdx = 0;
    suggestToken = token;
    renderSuggest();
    suggestEl.classList.add('open');
  }

  function pickMention(i) {
    const u = suggestItems[i];
    if (!u || !suggestToken) return;
    const v = msgInput.value;
    const insert = '@' + u.username + ' ';
    msgInput.value = v.slice(0, suggestToken.start) + insert + v.slice(suggestToken.end);
    const pos = suggestToken.start + insert.length;
    msgInput.setSelectionRange(pos, pos);
    hideSuggest();
    msgInput.focus();
  }

  function playNotification() {
    if (!notifyOn) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const t = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(880, t);
      o.frequency.setValueAtTime(1320, t + 0.08);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t);
      o.stop(t + 0.32);
    } catch {}
  }

  function renderMessageText(parent, text) {
    const re = /(https?:\\/\\/[^\\s<>"'()]+[^\\s<>"'().,!?;:])|@([a-zA-Z0-9_\\-]{1,20})/g;
    let last = 0;
    let mentionedMe = false;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) {
        parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      }
      if (m[1]) {
        const a = document.createElement('a');
        a.href = m[1];
        a.textContent = m[1];
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.className = 'link';
        parent.appendChild(a);
      } else {
        const span = document.createElement('span');
        span.className = 'mention';
        span.textContent = m[0];
        parent.appendChild(span);
        if (myUsername && m[2].toLowerCase() === myUsername.toLowerCase()) {
          mentionedMe = true;
        }
      }
      last = m.index + m[0].length;
    }
    if (last < text.length) {
      parent.appendChild(document.createTextNode(text.slice(last)));
    }
    return mentionedMe;
  }

  // --- Auth check ---
  async function checkAuth() {
    try {
      const res = await fetch('/auth/me');
      if (res.ok) {
        const data = await res.json();
        myUsername = data.username;
        myColor = data.color;
        myEmail = data.email || null;
        myFingerprint = data.fingerprint || null;
        myCreatedAt = data.created_at || null;
        showChat();
        return;
      }
    } catch {}
    showAuth();
  }

  function resetConnectionState() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    reconnectDelay = 1000;
    const socket = ws;
    ws = null;
    if (socket) {
      try { socket.close(); } catch {}
    }
    connStatus.classList.remove('show');
  }

  function showAuth() {
    isAuthed = false;
    resetConnectionState();
    authScreen.style.display = 'flex';
    chatScreen.style.display = 'none';
    try { showAuthForm('primary'); } catch {}
  }

  function showChat() {
    isAuthed = true;
    resetConnectionState();
    authScreen.style.display = 'none';
    chatScreen.style.display = 'flex';
    connectWS();
  }

  // --- Passkey helpers ---
  function b64urlToBuf(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr.buffer;
  }
  function bufToB64url(buf) {
    const arr = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
    return btoa(bin).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
  }

  function prepCreate(opts) {
    opts.challenge = b64urlToBuf(opts.challenge);
    opts.user.id = b64urlToBuf(opts.user.id);
    if (opts.excludeCredentials) {
      opts.excludeCredentials = opts.excludeCredentials.map((c) => ({ ...c, id: b64urlToBuf(c.id) }));
    }
    return opts;
  }
  function prepGet(opts) {
    opts.challenge = b64urlToBuf(opts.challenge);
    if (opts.allowCredentials) {
      opts.allowCredentials = opts.allowCredentials.map((c) => ({ ...c, id: b64urlToBuf(c.id) }));
    }
    return opts;
  }

  async function passkeyCreate(opts) {
    const cred = await navigator.credentials.create({ publicKey: prepCreate(opts) });
    return {
      id: cred.id,
      rawId: bufToB64url(cred.rawId),
      type: cred.type,
      response: {
        attestationObject: bufToB64url(cred.response.attestationObject),
        clientDataJSON: bufToB64url(cred.response.clientDataJSON),
        transports: cred.response.getTransports ? cred.response.getTransports() : [],
      },
      clientExtensionResults: cred.getClientExtensionResults ? cred.getClientExtensionResults() : {},
    };
  }

  async function passkeyGet(opts) {
    const cred = await navigator.credentials.get({ publicKey: prepGet(opts) });
    return {
      id: cred.id,
      rawId: bufToB64url(cred.rawId),
      type: cred.type,
      response: {
        authenticatorData: bufToB64url(cred.response.authenticatorData),
        clientDataJSON: bufToB64url(cred.response.clientDataJSON),
        signature: bufToB64url(cred.response.signature),
        userHandle: cred.response.userHandle ? bufToB64url(cred.response.userHandle) : null,
      },
      clientExtensionResults: cred.getClientExtensionResults ? cred.getClientExtensionResults() : {},
    };
  }

  function showAuthForm(which) {
    authPrimary.style.display = which === 'primary' ? 'flex' : 'none';
    signupForm.style.display = which === 'signup' ? 'flex' : 'none';
    authForm.style.display = which === 'email' ? 'flex' : 'none';
    codeForm.style.display = which === 'code' ? 'flex' : 'none';
    recoveryForm.style.display = which === 'recovery' ? 'flex' : 'none';
    const onPrimary = which === 'primary';
    authBack.style.display = onPrimary ? 'none' : 'inline';
    // Only show the email plea on the initial email-entry page.
    emailPlea.style.display = which === 'email' ? 'block' : 'none';
    // Don't offer "Use email instead" once we're already in the email/code flow;
    // instead offer a one-click path back to the passkey menu.
    const inEmailFlow = which === 'email' || which === 'code';
    useEmail.style.display = inEmailFlow ? 'none' : 'inline';
    usePasskey.style.display = inEmailFlow ? 'inline' : 'none';
    altsSep.style.display = 'inline';
    // Second separator sits between "Use recovery code" and "Back"; hide it
    // on the primary screen so there's no dangling dot when Back is absent.
    altsSep2.style.display = onPrimary ? 'none' : 'inline';
  }

  async function doPasskeySignin() {
    if (!window.PublicKeyCredential) {
      authStatus.textContent = 'Passkeys not supported on this browser';
      return;
    }
    authStatus.textContent = 'Waiting for passkey...';
    try {
      const startRes = await fetch('/auth/webauthn/auth/start', { method: 'POST' });
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.error || 'Failed to start');
      const assertion = await passkeyGet(startData.options);
      const finRes = await fetch('/auth/webauthn/auth/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: assertion }),
      });
      const finData = await finRes.json();
      if (!finRes.ok) throw new Error(finData.error || 'Sign-in failed');
      authStatus.textContent = '';
      checkAuth();
    } catch (e) {
      authStatus.textContent = (e && e.message) || 'Cancelled';
    }
  }

  async function doPasskeySignup(displayName) {
    if (!window.PublicKeyCredential) {
      authStatus.textContent = 'Passkeys not supported on this browser';
      return;
    }
    authStatus.textContent = 'Creating passkey...';
    try {
      const startRes = await fetch('/auth/webauthn/register/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName }),
      });
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.error || 'Failed to start');
      const attestation = await passkeyCreate(startData.options);
      const finRes = await fetch('/auth/webauthn/register/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: attestation }),
      });
      const finData = await finRes.json();
      if (!finRes.ok) throw new Error(finData.error || 'Registration failed');
      authStatus.textContent = '';
      if (finData.recoveryCodes && finData.recoveryCodes.length) {
        rcCodes.textContent = finData.recoveryCodes.join('\\n');
        rcModal.classList.add('open');
      } else {
        checkAuth();
      }
    } catch (e) {
      authStatus.textContent = (e && e.message) || 'Cancelled';
    }
  }

  pkSigninBtn.addEventListener('click', doPasskeySignin);
  pkSignupBtn.addEventListener('click', () => {
    showAuthForm('signup');
    authStatus.textContent = '';
    signupName.focus();
  });
  signupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const n = signupName.value.trim();
    if (!/^[a-zA-Z0-9_\\-]{1,20}$/.test(n)) {
      authStatus.textContent = 'Username: 1-20 chars, letters/numbers/_/-';
      return;
    }
    doPasskeySignup(n);
  });
  useEmail.addEventListener('click', (e) => {
    e.preventDefault();
    showAuthForm('email');
    authStatus.textContent = '';
    devLink.innerHTML = '';
    emailInput.focus();
  });
  usePasskey.addEventListener('click', (e) => {
    e.preventDefault();
    pendingEmail = '';
    showAuthForm('primary');
    authStatus.textContent = '';
    devLink.innerHTML = '';
  });
  useRecovery.addEventListener('click', (e) => {
    e.preventDefault();
    showAuthForm('recovery');
    authStatus.textContent = '';
    recoveryUser.focus();
  });
  recoveryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const uname = recoveryUser.value.trim();
    const code = recoveryCode.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^[a-zA-Z0-9_\\-]{1,20}$/.test(uname) || !/^[A-HJ-NP-Z2-9]{12}$/.test(code)) {
      authStatus.textContent = 'Invalid username or code';
      return;
    }
    authStatus.textContent = 'Verifying...';
    try {
      const res = await fetch('/auth/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: uname, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed');
      authStatus.textContent = '';
      checkAuth();
    } catch (err) {
      authStatus.textContent = (err && err.message) || 'Failed';
    }
  });

  rcCopy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(rcCodes.textContent); rcCopy.textContent = 'Copied'; }
    catch { rcCopy.textContent = 'Copy failed'; }
    setTimeout(() => { rcCopy.textContent = 'Copy'; }, 2000);
  });
  rcContinue.addEventListener('click', () => {
    rcModal.classList.remove('open');
    checkAuth();
  });

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
        if (data.mode === 'code') {
          pendingEmail = email;
          showAuthForm('code');
          authStatus.textContent = 'Enter the 6-digit code we sent to ' + email;
          codeInput.value = '';
          codeInput.focus();
          if (data.dev_code) {
            devLink.textContent = '';
            const label = document.createElement('span');
            label.textContent = 'Dev code: ';
            const code = document.createElement('b');
            code.textContent = data.dev_code;
            label.appendChild(code);
            devLink.appendChild(label);
          }
        } else {
          authStatus.textContent = 'Check your email for the login link!';
          if (data.dev_link) {
            devLink.textContent = '';
            const a = document.createElement('a');
            a.href = data.dev_link;
            a.target = '_blank';
            a.rel = 'noopener';
            a.textContent = 'Dev: click here to sign in';
            devLink.appendChild(a);
          }
        }
      } else {
        authStatus.textContent = data.error || 'Something went wrong';
      }
    } catch {
      authStatus.textContent = 'Network error';
    }
  });

  codeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = codeInput.value.trim();
    if (!/^\\d{6}$/.test(code) || !pendingEmail) return;
    authStatus.textContent = 'Verifying...';
    try {
      const res = await fetch('/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        authStatus.textContent = '';
        devLink.innerHTML = '';
        showAuthForm('primary');
        pendingEmail = '';
        checkAuth();
      } else {
        authStatus.textContent = data.error || 'Invalid code';
      }
    } catch {
      authStatus.textContent = 'Network error';
    }
  });

  authBack.addEventListener('click', (e) => {
    e.preventDefault();
    pendingEmail = '';
    showAuthForm('primary');
    authStatus.textContent = '';
    devLink.innerHTML = '';
  });

  // --- WebSocket ---
  function connectWS() {
    if (!isAuthed || ws) return;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(proto + '//' + location.host + '/ws');
    ws = socket;

    socket.addEventListener('open', () => {
      if (ws !== socket || !isAuthed) return;
      connStatus.classList.remove('show');
      reconnectDelay = 1000;
    });

    socket.addEventListener('message', (e) => {
      if (ws !== socket) return;
      const data = JSON.parse(e.data);

      if (data.type === 'history') {
        messagesDiv.innerHTML = '';
        data.messages.forEach((m) => appendMsg(m, false));
        scrollBottom();
      }

      if (data.type === 'msg') {
        // Check scroll position BEFORE appending so the new node doesn't
        // skew the math. Only auto-scroll if the user is already near the
        // bottom — otherwise they're reading history and a jump is annoying.
        const nearBottom = messagesDiv.scrollHeight - messagesDiv.scrollTop - messagesDiv.clientHeight < 80;
        appendMsg(data, true);
        if (nearBottom) scrollBottom();
      }

      if (data.type === 'online') {
        const users = data.users || [];
        setOnlineUsers(users);
        renderUsers(users);
      }

      if (data.type === 'rate_limit') {
        msgInput.placeholder = 'Slow down...';
        setTimeout(() => { msgInput.placeholder = 'Type a message...'; }, data.retryMs || 3000);
      }
    });

    socket.addEventListener('close', () => {
      if (ws !== socket) return;
      ws = null;
      if (!isAuthed) return;
      connStatus.classList.add('show');
      scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      if (ws !== socket || !isAuthed) return;
      connStatus.classList.add('show');
    });
  }

  function scheduleReconnect() {
    if (!isAuthed || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (!isAuthed) return;
      reconnectDelay = Math.min(reconnectDelay * 1.5, 10000);
      connectWS();
    }, reconnectDelay);
  }

  // --- Messages ---
  function appendMsg(m, isLive) {
    addKnownUser(m.username, m.color, false);
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

    const text = document.createElement('span');
    text.className = 'text';
    const mentionedMe = renderMessageText(text, m.text);

    if (mentionedMe && m.username !== myUsername) {
      div.classList.add('mentioned');
      if (isLive) playNotification();
    }

    div.appendChild(ts);
    div.appendChild(name);
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
    if (suggestEl.classList.contains('open') && suggestItems.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        suggestIdx = (suggestIdx + 1) % suggestItems.length;
        renderSuggest();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        suggestIdx = (suggestIdx - 1 + suggestItems.length) % suggestItems.length;
        renderSuggest();
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pickMention(suggestIdx);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        hideSuggest();
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMsg();
    }
  });
  msgInput.addEventListener('input', updateSuggest);
  msgInput.addEventListener('click', updateSuggest);
  msgInput.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') updateSuggest();
  });
  msgInput.addEventListener('blur', () => setTimeout(hideSuggest, 120));
  suggestEl.addEventListener('mousedown', (e) => {
    const item = e.target.closest('.mention-item');
    if (!item) return;
    e.preventDefault();
    pickMention(Number(item.dataset.idx));
  });

  // --- Profile modal ---
  async function renderPasskeys() {
    pkList.innerHTML = '';
    try {
      const res = await fetch('/auth/passkeys');
      if (!res.ok) return;
      const data = await res.json();
      if (!data.passkeys || !data.passkeys.length) {
        const row = document.createElement('div');
        row.className = 'pk-row';
        row.innerHTML = '<span class="pk-id" style="color:var(--text-muted)">No passkeys yet</span>';
        pkList.appendChild(row);
        return;
      }
      for (const p of data.passkeys) {
        const row = document.createElement('div');
        row.className = 'pk-row';
        const id = document.createElement('span');
        id.className = 'pk-id';
        id.textContent = (p.createdAt ? new Date(p.createdAt).toLocaleDateString() + ' · ' : '') + (p.id.slice(0, 12) + '…');
        const del = document.createElement('button');
        del.className = 'btn btn-danger';
        del.textContent = 'Remove';
        del.addEventListener('click', async () => {
          if (!confirm('Remove this passkey? You can still sign in with other passkeys or recovery codes.')) return;
          const r = await fetch('/auth/passkeys/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: p.id }),
          });
          if (r.ok) renderPasskeys();
          else alert('Failed to remove');
        });
        row.appendChild(id);
        row.appendChild(del);
        pkList.appendChild(row);
      }
    } catch {}
  }

  revokeOthersBtn.addEventListener('click', async () => {
    if (!confirm('Sign out every other device? You will stay signed in here.')) return;
    revokeOthersBtn.disabled = true;
    const prev = revokeOthersBtn.textContent;
    revokeOthersBtn.textContent = 'Signing out...';
    try {
      const res = await fetch('/auth/sessions/revoke-others', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed');
      revokeOthersBtn.textContent = data.revoked ? 'Signed out ' + data.revoked + ' other session(s)' : 'No other sessions';
      setTimeout(() => { revokeOthersBtn.textContent = prev; revokeOthersBtn.disabled = false; }, 2500);
    } catch (e) {
      alert((e && e.message) || 'Failed');
      revokeOthersBtn.textContent = prev;
      revokeOthersBtn.disabled = false;
    }
  });

  rcRegenBtn.addEventListener('click', async () => {
    if (!confirm('Regenerate your recovery codes? All previous codes will stop working. This takes a few seconds.')) return;
    rcRegenBtn.disabled = true;
    const prevLabel = rcRegenBtn.textContent;
    rcRegenBtn.textContent = 'Generating…';
    try {
      const res = await fetch('/auth/recovery/regenerate', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed');
      rcCodes.textContent = (data.recoveryCodes || []).join('\\n');
      rcModal.classList.add('open');
    } catch (e) {
      alert((e && e.message) || 'Failed');
    } finally {
      rcRegenBtn.disabled = false;
      rcRegenBtn.textContent = prevLabel;
    }
  });

  pkAddBtn.addEventListener('click', async () => {
    if (!window.PublicKeyCredential) { alert('Passkeys not supported on this browser'); return; }
    try {
      const startRes = await fetch('/auth/webauthn/register/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.error || 'Failed');
      const attestation = await passkeyCreate(startData.options);
      const finRes = await fetch('/auth/webauthn/register/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: attestation }),
      });
      const finData = await finRes.json();
      if (!finRes.ok) throw new Error(finData.error || 'Failed');
      renderPasskeys();
    } catch (e) {
      alert((e && e.message) || 'Cancelled');
    }
  });

  function renderEmail() {
    emailValue.textContent = myEmail || '';
    emailForm.style.display = 'none';
    emailNewInput.value = '';
    emailMsg.textContent = '';
    emailMsg.className = '';
    emailChangeBtn.style.display = myEmail ? '' : 'none';
    emailRemoveBtn.style.display = myEmail ? '' : 'none';
    emailAddBtn.style.display = myEmail ? 'none' : '';
  }

  function openEmailForm(placeholder) {
    emailForm.style.display = 'flex';
    emailActions.style.display = 'none';
    emailNewInput.placeholder = placeholder;
    emailNewInput.focus();
  }

  function closeEmailForm() {
    emailForm.style.display = 'none';
    emailActions.style.display = '';
    emailNewInput.value = '';
    emailMsg.textContent = '';
    emailMsg.className = '';
  }

  emailChangeBtn.addEventListener('click', () => openEmailForm('new@example.com'));
  emailAddBtn.addEventListener('click', () => openEmailForm('you@example.com'));
  emailFormCancel.addEventListener('click', closeEmailForm);

  emailSendBtn.addEventListener('click', async () => {
    const val = emailNewInput.value.trim().toLowerCase();
    if (!val || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      emailMsg.textContent = 'Enter a valid email address.';
      emailMsg.className = 'error';
      return;
    }
    emailSendBtn.disabled = true;
    emailMsg.textContent = 'Sending...';
    emailMsg.className = '';
    try {
      const res = await fetch('/auth/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: val }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        emailMsg.textContent = data.error || 'Failed to send';
        emailMsg.className = 'error';
      } else {
        emailMsg.textContent = 'Check ' + val + ' for a verification link.';
        emailMsg.className = 'ok';
        if (data.dev_link) {
          const a = document.createElement('a');
          a.href = data.dev_link;
          a.textContent = 'Open dev link';
          a.target = '_blank';
          emailMsg.appendChild(document.createTextNode(' '));
          emailMsg.appendChild(a);
        }
      }
    } catch {
      emailMsg.textContent = 'Network error';
      emailMsg.className = 'error';
    } finally {
      emailSendBtn.disabled = false;
    }
  });

  emailRemoveBtn.addEventListener('click', async () => {
    if (!confirm('Remove your email? You will only be able to sign in with a passkey or a recovery code.')) return;
    try {
      const res = await fetch('/auth/email/remove', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        emailMsg.textContent = data.error || 'Failed to remove';
        emailMsg.className = 'error';
        return;
      }
      myEmail = null;
      renderEmail();
      emailMsg.textContent = 'Email removed.';
      emailMsg.className = 'ok';
    } catch {
      emailMsg.textContent = 'Network error';
      emailMsg.className = 'error';
    }
  });

  function openProfileModal() {
    usernameInput.value = myUsername;
    colorInput.value = myColor.startsWith('#') ? myColor : '#5b8def';
    colorHex.value = colorInput.value;
    usernameInput.style.color = colorInput.value;
    notifyToggle.checked = notifyOn;
    profileJoined.textContent = myCreatedAt
      ? new Date(myCreatedAt).toLocaleDateString()
      : '—';
    profileFp.textContent = myFingerprint ? '#' + myFingerprint : '—';
    updateColorWarn();
    renderEmail();
    emailActions.style.display = '';
    renderPasskeys();
    profileModal.classList.add('open');
  }

  profileClose.addEventListener('click', () => profileModal.classList.remove('open'));
  profileModal.addEventListener('click', (e) => {
    if (e.target === profileModal) profileModal.classList.remove('open');
  });

  profileDelete.addEventListener('click', async () => {
    if (!confirm('Delete your account? This removes your profile, username, all your messages, and signs out every device. This cannot be undone.')) return;
    const typed = prompt('Type DELETE to confirm:');
    if (typed !== 'DELETE') return;
    try {
      const res = await fetch('/auth/delete', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Delete failed');
        return;
      }
    } catch {
      alert('Network error');
      return;
    }
    profileModal.classList.remove('open');
    myUsername = '';
    myColor = '';
    showAuth();
  });

  // --- Color contrast (WCAG) ---
  const BG_HEX = '#0f0f0f';
  const MIN_CONTRAST = 3.0;
  function hexToRgb(hex) {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '');
    if (!m) return null;
    const v = parseInt(m[1], 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function relLum(rgb) {
    const chan = (c) => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * chan(rgb[0]) + 0.7152 * chan(rgb[1]) + 0.0722 * chan(rgb[2]);
  }
  function contrastRatio(h1, h2) {
    const a = relLum(hexToRgb(h1)), b = relLum(hexToRgb(h2));
    const lo = Math.min(a, b), hi = Math.max(a, b);
    return (hi + 0.05) / (lo + 0.05);
  }
  function updateColorWarn() {
    const v = colorHex.value;
    if (!/^#[0-9a-fA-F]{6}$/.test(v)) { colorWarn.textContent = ''; return; }
    const r = contrastRatio(v, BG_HEX);
    colorWarn.textContent = r >= MIN_CONTRAST ? '' : 'Too close to background (' + r.toFixed(1) + ':1). Pick something lighter.';
  }

  colorInput.addEventListener('input', () => {
    colorHex.value = colorInput.value;
    usernameInput.style.color = colorInput.value;
    updateColorWarn();
  });

  colorHex.addEventListener('input', () => {
    const v = colorHex.value;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      colorInput.value = v;
      usernameInput.style.color = v;
    }
    updateColorWarn();
  });

  // Toggling the notify preference is client-only (localStorage), so apply
  // it immediately instead of waiting for Save. Playing a short tone on
  // enable doubles as a preview so the user knows what they opted into.
  notifyToggle.addEventListener('change', () => {
    notifyOn = notifyToggle.checked;
    localStorage.setItem('notify', notifyOn ? 'on' : 'off');
    if (notifyOn) playNotification();
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
    // Only block on a changed color; pre-existing low-contrast colors can
    // still be saved (matches the server's behavior).
    if (color.toLowerCase() !== String(myColor || '').toLowerCase() &&
        contrastRatio(color, BG_HEX) < MIN_CONTRAST) {
      alert('Color is too close to the background. Pick something lighter.');
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
        // Notify preference is persisted live via the toggle's change
        // handler; no need to touch it here.
        // The Worker already pushed the new profile to the Durable Object via
        // its /admin/update-user admin route before responding, so there's
        // nothing to announce from here.
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
    profileModal.classList.remove('open');
    await fetch('/auth/logout', { method: 'POST' });
    showAuth();
  });

  // --- Build provenance (triggered from the profile modal) ---
  const buildProvenanceBtn = document.getElementById('build-provenance-btn');
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
    } catch {}
  }

  buildProvenanceBtn.addEventListener('click', () => {
    if (!versionInfo) return;
    const sha  = versionInfo.commit || '';
    const repo = versionInfo.repo || '';
    const slug = repo.replace('https://github.com/', '');
    const owner = slug.split('/')[0] || '';
    const short = sha.slice(0, 12);
    vmCommitLink.textContent = sha;
    vmCommitLink.href = repo && sha !== 'dev' ? repo + '/commit/' + sha : '#';
    vmBuiltAt.textContent = versionInfo.built_at || '-';
    vmRunLink.href = versionInfo.workflow_run || '#';
    vmRepoLink.textContent = slug;
    vmRepoLink.href = repo;
    vmRecipe.textContent = [
      'gh release download build-' + short + ' --repo ' + slug,
      'gh attestation verify index.js --owner ' + owner,
    ].join(String.fromCharCode(10));
    // Close profile modal so the verify modal isn't stacked on top.
    profileModal.classList.remove('open');
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
    // Clicking your own name opens the editable profile modal instead
    // of the read-only user-info modal.
    if (username && username === myUsername) {
      openProfileModal();
      return;
    }
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
        umJoined.textContent = '-';
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

  // --- Online users strip (animated) ---
  // Keep a username -> li map so successive 'online' events diff against
  // the current DOM instead of rebuilding it. That lets us slide arrivals
  // up from behind the chat bar and slide departures back into it
  // without interrupting unrelated rows.
  const userLiByName = new Map();

  function buildUserLi(u) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'clickable-name';
    name.style.color = u.color || '';
    name.textContent = u.username;
    name.dataset.username = u.username;
    li.appendChild(name);
    if (u.fingerprint) {
      const fp = document.createElement('span');
      fp.className = 'fp';
      fp.textContent = '#' + u.fingerprint;
      li.appendChild(fp);
    }
    return li;
  }

  function renderUsers(users) {
    const incoming = new Set(users.map((u) => u.username));

    // Users no longer online: start the leave animation, then remove
    // once it finishes. If they reappear in the meantime, we reuse the
    // element and cancel the removal.
    for (const [name, li] of userLiByName) {
      if (incoming.has(name)) {
        if (li.classList.contains('leaving')) li.classList.remove('leaving');
        continue;
      }
      if (li.classList.contains('leaving')) continue;
      li.classList.add('leaving');
      setTimeout(() => {
        if (!li.classList.contains('leaving')) return;
        li.remove();
        userLiByName.delete(name);
      }, 300);
    }

    // Users in the new list: update color on existing rows, or create
    // fresh ones and trigger the entering transition.
    for (const u of users) {
      const existing = userLiByName.get(u.username);
      if (existing) {
        const nameEl = existing.querySelector('.clickable-name');
        if (nameEl) nameEl.style.color = u.color || '';
        continue;
      }
      const li = buildUserLi(u);
      li.classList.add('entering');
      usersList.appendChild(li);
      userLiByName.set(u.username, li);
      // Two rAFs so the browser commits the 'entering' state before we
      // remove the class — otherwise the transition is skipped.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => li.classList.remove('entering'));
      });
    }

    // Always render the signed-in user first so they can spot themselves
    // without scanning the list.
    const ownLi = myUsername ? userLiByName.get(myUsername) : null;
    if (ownLi && usersList.firstChild !== ownLi) {
      usersList.insertBefore(ownLi, usersList.firstChild);
    }

    updateUserOverflow();
  }

  // Count how many user chips overflow the collapsed row's visible width
  // and surface them as "+N more". Clicking the chip expands the row so
  // it wraps and shows everyone.
  function updateUserOverflow() {
    if (usersList.classList.contains('expanded')) {
      usersMore.style.display = 'none';
      return;
    }
    // Show the button with a placeholder so its width is included while
    // we measure which rows overflow.
    usersMore.style.display = '';
    usersMore.textContent = '+0 more';
    const listRect = usersList.getBoundingClientRect();
    const lis = usersList.querySelectorAll('li:not(.leaving)');
    let hidden = 0;
    for (const li of lis) {
      const r = li.getBoundingClientRect();
      if (r.right > listRect.right + 0.5) hidden++;
    }
    if (hidden > 0) {
      usersMore.textContent = '+' + hidden + ' more';
    } else {
      usersMore.style.display = 'none';
    }
  }

  usersMore.addEventListener('click', (e) => {
    e.stopPropagation();
    usersList.classList.toggle('expanded');
    updateUserOverflow();
  });

  // Tap/click outside the row collapses the expanded list.
  document.addEventListener('click', (e) => {
    if (!usersList.classList.contains('expanded')) return;
    if (e.target.closest('#chat-status')) return;
    usersList.classList.remove('expanded');
    updateUserOverflow();
  });

  window.addEventListener('resize', updateUserOverflow);

  // --- Boot ---
  loadVersion();
  checkAuth();
})();
</script>
</body>
</html>`;
