// Mobile pairing page served at /p?t=TOKEN. Users land here after scanning
// the QR code the desktop rendered during /auth/qr/start. The page reads
// the token from the URL, lets the user confirm with a passkey (or pick a
// username to create one), and POSTs /auth/qr/claim so the desktop's next
// poll picks up the bound ownerId.
export const PAIR_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<title>Sign in to Shoutbox</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    background: #0f0f0f;
    color: #e0e0e0;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px;
    gap: 20px;
    text-align: center;
    -webkit-tap-highlight-color: transparent;
  }
  h1 { font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
  /* Positioned absolutely below #root so growing the text doesn't
     change #root's height, so the centered card above stays fixed no
     matter how long an error runs. Text itself wraps freely. */
  .sub {
    position: absolute;
    top: calc(100% + 10px);
    left: 0;
    right: 0;
    margin: 0 auto;
    max-width: 320px;
    color: #888;
    font-size: 14px;
    line-height: 1.5;
    text-align: center;
    overflow-wrap: anywhere;
  }
  .sub:empty { display: none; }
  .sub.error { color: #ff6b6b; }
  .sub.ok { color: #8fd18f; }
  /* #root is centered in the body; pulling #sub out of its flow means
     status/error copy of any length renders under the buttons without
     re-centering the card and nudging them up. */
  #root {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: 100%;
    max-width: 340px;
  }
  .who { font-size: 14px; color: #bbb; }
  /* Onboarding preview: the username rendered in the color the user is
     about to commit to. Same treatment as names in the chat itself so
     the picker is a real preview, not an abstract swatch. */
  .preview {
    font-size: 22px;
    font-weight: 700;
    text-align: center;
    letter-spacing: -0.01em;
    word-break: break-all;
    padding: 4px 0 2px;
  }
  .color-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    padding: 4px 2px;
  }
  .swatch {
    aspect-ratio: 1;
    border: 2px solid rgba(255, 255, 255, 0.14);
    border-radius: 50%;
    cursor: pointer;
    padding: 0;
    transition: transform 120ms ease, border-color 120ms ease;
    -webkit-tap-highlight-color: transparent;
  }
  .swatch:hover { border-color: rgba(255, 255, 255, 0.35); }
  .swatch.selected {
    border-color: #fff;
    transform: scale(1.08);
  }
  .step-dots {
    display: flex;
    gap: 6px;
    justify-content: center;
    padding: 2px 0 4px;
  }
  .step-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.18);
    transition: background-color 120ms ease, width 120ms ease;
  }
  .step-dot.on { background: var(--preview, #5b8def); width: 18px; border-radius: 3px; }
  .recovery-block {
    background: #000;
    border: 1px solid #2a2a2a;
    border-radius: 8px;
    padding: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 13px;
    line-height: 1.6;
    white-space: pre;
    text-align: left;
    overflow: auto;
    user-select: all;
  }
  .recovery-label { font-size: 13px; color: #bbb; text-align: left; line-height: 1.5; }
  .who b { color: #fff; }
  .btn {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: #e0e0e0;
    padding: 12px 18px;
    font-size: 15px;
    border-radius: 999px;
    cursor: pointer;
    min-height: 48px;
    transition: background-color 120ms ease, border-color 120ms ease;
  }
  .btn:hover { background: rgba(255, 255, 255, 0.08); border-color: rgba(255, 255, 255, 0.26); }
  .btn-primary {
    background: rgba(91, 141, 239, 0.22);
    border-color: rgba(91, 141, 239, 0.5);
    color: #fff;
  }
  .btn-primary:hover { background: rgba(91, 141, 239, 0.32); border-color: rgba(91, 141, 239, 0.7); }
  .btn[disabled] { opacity: 0.6; cursor: not-allowed; }
  .link {
    background: none;
    border: none;
    color: #5b8def;
    cursor: pointer;
    font-size: 13px;
    padding: 6px 8px;
    font-family: inherit;
  }
  .link:hover { text-decoration: underline; }
  input[type=text] {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: #e0e0e0;
    padding: 12px 16px;
    border-radius: 999px;
    font-size: 16px;
    min-height: 48px;
    outline: none;
    width: 100%;
    transition: background-color 120ms ease, border-color 120ms ease;
  }
  input[type=text]:focus { background: rgba(255, 255, 255, 0.08); border-color: rgba(255, 255, 255, 0.3); }
  .check {
    width: 56px; height: 56px; border-radius: 50%;
    background: rgba(143, 209, 143, 0.18);
    border: 1px solid rgba(143, 209, 143, 0.5);
    display: inline-flex; align-items: center; justify-content: center;
    color: #8fd18f;
    margin: 0 auto;
  }
  .row { display: flex; flex-direction: column; gap: 10px; }
</style>
</head>
<body>
  <div id="root">
    <h1 id="title">Shoutbox device login</h1>
    <div id="body" class="row"></div>
    <div id="sub" class="sub">Loading…</div>
  </div>
<script>
(function () {
  const title = document.getElementById('title');
  const sub = document.getElementById('sub');
  const body = document.getElementById('body');
  const token = new URLSearchParams(location.search).get('t') || '';

  function setSub(text, kind) {
    sub.textContent = text || '';
    sub.className = 'sub' + (kind ? ' ' + kind : '');
  }
  function clearBody() { while (body.firstChild) body.removeChild(body.firstChild); }
  function button(label, variant, handler) {
    const b = document.createElement('button');
    b.className = 'btn' + (variant === 'primary' ? ' btn-primary' : '');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', handler);
    return b;
  }

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
      opts.excludeCredentials = opts.excludeCredentials.map(function (c) { return Object.assign({}, c, { id: b64urlToBuf(c.id) }); });
    }
    return opts;
  }
  function prepGet(opts) {
    opts.challenge = b64urlToBuf(opts.challenge);
    if (opts.allowCredentials) {
      opts.allowCredentials = opts.allowCredentials.map(function (c) { return Object.assign({}, c, { id: b64urlToBuf(c.id) }); });
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

  async function claim() {
    setSub('Linking your other device…');
    const res = await fetch('/auth/qr/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || 'Could not link device');
    return true;
  }

  function renderDone(recoveryCodes) {
    title.textContent = 'Signed in';
    setSub('Return to your other device. It will switch to chat automatically.', 'ok');
    clearBody();
    const check = document.createElement('div');
    check.className = 'check';
    check.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    body.appendChild(check);
    if (Array.isArray(recoveryCodes) && recoveryCodes.length) {
      const label = document.createElement('div');
      label.className = 'recovery-label';
      label.textContent = 'Save these recovery codes. They are the only way back in if you lose your phone.';
      const pre = document.createElement('pre');
      pre.className = 'recovery-block';
      pre.textContent = recoveryCodes.join('\\n');
      body.appendChild(label);
      body.appendChild(pre);
    }
  }

  function renderExpired() {
    title.textContent = 'Link expired';
    setSub('The pairing code expired. Go back to the other device and generate a new one.', 'error');
    clearBody();
  }

  async function doPasskeySignIn() {
    setSub('Waiting for passkey…');
    const startRes = await fetch('/auth/webauthn/auth/start', { method: 'POST' });
    const startData = await startRes.json();
    if (!startRes.ok) throw new Error(startData.error || 'Could not start sign-in');
    const assertion = await passkeyGet(startData.options);
    const finRes = await fetch('/auth/webauthn/auth/finish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: assertion }),
    });
    const finData = await finRes.json();
    if (!finRes.ok) throw new Error(finData.error || 'Sign-in failed');
  }

  async function doPasskeySignUp(displayName) {
    setSub('Creating passkey…');
    const startRes = await fetch('/auth/webauthn/register/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName }),
    });
    const startData = await startRes.json();
    if (!startRes.ok) throw new Error(startData.error || 'Could not start sign-up');
    const attestation = await passkeyCreate(startData.options);
    const finRes = await fetch('/auth/webauthn/register/finish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: attestation }),
    });
    const finData = await finRes.json();
    if (!finRes.ok) throw new Error(finData.error || 'Sign-up failed');
    return finData;
  }

  // Onboarding: pick a username, pick a color, then create the passkey.
  // State survives step transitions so Back doesn't wipe inputs. The
  // palette is hand-picked to pass WCAG contrast against #0f0f0f so every
  // option clears the server's /auth/profile contrast check without the
  // user needing to think about legibility.
  const COLOR_PRESETS = [
    '#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c',
    '#4dabf7', '#5b8def', '#b197fc', '#f783ac',
  ];
  const onboard = { username: '', color: COLOR_PRESETS[5] };

  function renderStepDots(active) {
    const row = document.createElement('div');
    row.className = 'step-dots';
    for (let i = 0; i < 3; i++) {
      const d = document.createElement('div');
      d.className = 'step-dot' + (i === active ? ' on' : '');
      if (i === active) d.style.setProperty('--preview', onboard.color);
      row.appendChild(d);
    }
    return row;
  }

  function renderOnboardUsername(errorMsg) {
    title.textContent = 'Pick a username';
    setSub(errorMsg || '', errorMsg ? 'error' : null);
    clearBody();
    body.appendChild(renderStepDots(0));
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Username';
    input.maxLength = 20;
    input.value = onboard.username;
    input.autocapitalize = 'none';
    input.autocomplete = 'username webauthn';
    input.spellcheck = false;
    body.appendChild(input);
    const go = function () {
      const name = input.value.trim();
      if (!/^[a-zA-Z0-9_\\-]{1,20}$/.test(name)) {
        setSub('1-20 characters, letters/numbers/_/-', 'error');
        input.focus();
        return;
      }
      onboard.username = name;
      renderOnboardColor();
    };
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    body.appendChild(button('Next', 'primary', go));
    setTimeout(function () { input.focus(); }, 50);
  }

  function renderOnboardColor() {
    title.textContent = 'Pick a name color';
    setSub('', null);
    clearBody();
    body.appendChild(renderStepDots(1));
    const preview = document.createElement('div');
    preview.className = 'preview';
    preview.textContent = '@' + onboard.username;
    preview.style.color = onboard.color;
    body.appendChild(preview);
    const grid = document.createElement('div');
    grid.className = 'color-grid';
    COLOR_PRESETS.forEach(function (c) {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'swatch' + (onboard.color === c ? ' selected' : '');
      sw.style.background = c;
      sw.setAttribute('aria-label', 'Color ' + c);
      sw.addEventListener('click', function () {
        onboard.color = c;
        preview.style.color = c;
        grid.querySelectorAll('.swatch').forEach(function (el) { el.classList.remove('selected'); });
        sw.classList.add('selected');
      });
      grid.appendChild(sw);
    });
    body.appendChild(grid);
    body.appendChild(button('Next', 'primary', function () { renderOnboardPasskey(); }));
    const back = button('Back', null, function () { renderOnboardUsername(); });
    back.className = 'link';
    body.appendChild(back);
  }

  function renderOnboardPasskey(errorMsg) {
    title.textContent = 'Create your passkey';
    setSub(errorMsg || '', errorMsg ? 'error' : null);
    clearBody();
    body.appendChild(renderStepDots(2));
    const preview = document.createElement('div');
    preview.className = 'preview';
    preview.textContent = '@' + onboard.username;
    preview.style.color = onboard.color;
    body.appendChild(preview);
    const hint = document.createElement('div');
    hint.className = 'who';
    hint.style.textAlign = 'center';
    hint.textContent = 'A passkey on this phone is how you sign in. No password to remember.';
    body.appendChild(hint);
    const btn = button('Create passkey', 'primary', async function () {
      btn.disabled = true;
      backBtn.disabled = true;
      try {
        const out = await doPasskeySignUp(onboard.username);
        // Server-generated profile used defaultColor(ownerId); apply the
        // one the user actually picked. Best-effort: if the color POST
        // fails we still proceed to claim, the account just keeps the
        // default and can be changed from the profile later.
        try {
          await fetch('/auth/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ color: onboard.color }),
          });
        } catch {}
        await claim();
        renderDone(out && out.recoveryCodes);
      } catch (e) {
        btn.disabled = false;
        backBtn.disabled = false;
        const msg = (e && e.message) || 'Could not create passkey';
        // Username collisions are caught at register/start; bounce back
        // to step 1 so the user can pick a different one.
        if (/username/i.test(msg) && /taken|already/i.test(msg)) {
          renderOnboardUsername(msg);
          return;
        }
        setSub(msg, 'error');
      }
    });
    body.appendChild(btn);
    const backBtn = button('Back', null, renderOnboardColor);
    backBtn.className = 'link';
    body.appendChild(backBtn);
  }

  function renderSignup(errorMsg) {
    // Reset the flow on fresh entry so a returning signup starts at step 1.
    onboard.username = '';
    onboard.color = COLOR_PRESETS[5];
    renderOnboardUsername(errorMsg);
  }

  function renderSignedInConfirm(username) {
    title.textContent = 'Sign in on your other device?';
    const who = document.createElement('div');
    who.className = 'who';
    who.innerHTML = 'You are <b></b> on this phone.';
    who.querySelector('b').textContent = username ? '@' + username : 'signed in';
    body.appendChild(who);
    setSub('Tap confirm to finish signing in on the other device.');
    const btn = button('Confirm sign-in', 'primary', async function () {
      btn.disabled = true;
      try {
        await claim();
        renderDone();
      } catch (e) {
        btn.disabled = false;
        setSub((e && e.message) || 'Could not link device', 'error');
      }
    });
    body.appendChild(btn);
  }

  function renderFresh() {
    title.textContent = 'Shoutbox device login';
    setSub('', null);
    clearBody();
    const btn = button('Use passkey', 'primary', async function () {
      btn.disabled = true;
      try {
        await doPasskeySignIn();
        await claim();
        renderDone();
      } catch (e) {
        // WebAuthn returns the same NotAllowedError for "no credential" and
        // "user cancelled", so we can't tell the difference. Offer signup
        // as the next step and let the user back out via reload if they
        // meant to cancel.
        btn.disabled = false;
        renderSignup('No passkey found on this device. Create one to sign in.');
      }
    });
    body.appendChild(btn);
    body.appendChild(button('Create a new account instead', null, function () { renderSignup(); }));
  }

  async function boot() {
    if (!token) { renderExpired(); return; }
    if (!window.PublicKeyCredential || !navigator.credentials) {
      title.textContent = 'Passkeys not supported';
      setSub('This browser does not support passkeys. Try Safari or Chrome.', 'error');
      return;
    }
    try {
      const statusRes = await fetch('/auth/qr/status?t=' + encodeURIComponent(token));
      const statusData = await statusRes.json().catch(function () { return {}; });
      if (statusData.status === 'expired' || statusData.status === 'authed') {
        if (statusData.status === 'authed') {
          title.textContent = 'Already signed in';
          setSub('This link was already used.', 'error');
        } else {
          renderExpired();
        }
        clearBody();
        return;
      }
    } catch {
      setSub('Network error', 'error');
      return;
    }
    try {
      const meRes = await fetch('/auth/me');
      if (meRes.ok) {
        const me = await meRes.json();
        clearBody();
        renderSignedInConfirm(me.username);
        return;
      }
    } catch {}
    clearBody();
    renderFresh();
  }

  boot();
})();
</script>
</body>
</html>`;
