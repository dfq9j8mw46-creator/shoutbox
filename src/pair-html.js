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
     re-centering the card and nudging them up. A fixed min-height holds
     the title and back-slot at the same viewport y across every step,
     so switching panes doesn't feel like the header is jumping. */
  #root {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 340px;
    min-height: 520px;
    gap: 18px;
  }
  #body {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 14px;
  }
  /* Reserved slot for the back button. Empty on the default step so
     its absence doesn't shrink the card and shift the title up. */
  #back-slot {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 44px;
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
  /* Custom-color tile: reads as a rainbow until the user picks, then
     swaps to the chosen solid (set inline via JS). A visually-hidden
     native color input fills the swatch so clicking anywhere on the
     tile hits the input and opens the OS picker. Using a <label>
     wrapper means no extra JS click forwarding, which matters on
     mobile Safari where programmatic .click() on an opacity:0 input
     doesn't always show the picker. */
  .custom-swatch {
    position: relative;
    overflow: hidden;
    background: conic-gradient(from 0deg,
      #ff6b6b, #ffa94d, #ffd43b, #69db7c, #4dabf7, #5b8def, #b197fc, #f783ac, #ff6b6b);
  }
  .custom-swatch input[type=color] {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
    border: 0;
    padding: 0;
    background: transparent;
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
    /* Reset the native button chrome so mobile Chrome/Safari don't draw
       their default focus ring or tap highlight on the pill edges. */
    appearance: none;
    -webkit-appearance: none;
    -webkit-tap-highlight-color: transparent;
    font: inherit;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: #e0e0e0;
    padding: 12px 18px;
    font-size: 15px;
    border-radius: 999px;
    cursor: pointer;
    min-height: 48px;
    outline: none;
    transition: background-color 120ms ease, border-color 120ms ease;
  }
  .btn:hover { background: rgba(255, 255, 255, 0.08); border-color: rgba(255, 255, 255, 0.26); }
  .btn:focus-visible {
    border-color: rgba(91, 141, 239, 0.8);
    box-shadow: 0 0 0 2px rgba(91, 141, 239, 0.35);
  }
  .btn-primary {
    background: rgba(91, 141, 239, 0.22);
    border-color: rgba(91, 141, 239, 0.5);
    color: #fff;
  }
  .btn-primary:hover { background: rgba(91, 141, 239, 0.32); border-color: rgba(91, 141, 239, 0.7); }
  .btn[disabled] { opacity: 0.6; cursor: not-allowed; }
  /* Loading: hide the label and drop a spinner in its place. Matches
     the convention used on the main auth screen. */
  .btn.loading {
    position: relative;
    color: transparent !important;
    pointer-events: none;
  }
  .btn.loading::after {
    content: '';
    position: absolute;
    inset: 0;
    margin: auto;
    width: 18px;
    height: 18px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    color: #fff;
    animation: btn-spin 0.7s linear infinite;
  }
  @keyframes btn-spin { to { transform: rotate(360deg); } }
  /* Error state: swap the button wash for a red-tinted one and show the
     failure text right on the button itself instead of a separate line
     below. Reverts on the caller's next state transition. */
  .btn.err {
    background: rgba(255, 107, 107, 0.22) !important;
    border-color: rgba(255, 107, 107, 0.55) !important;
    color: #fff !important;
  }
  /* Circular glass back button matching #auth-back on the main auth
     screen. Used by every non-default onboarding step. */
  .back-circle {
    appearance: none;
    -webkit-appearance: none;
    -webkit-tap-highlight-color: transparent;
    width: 44px;
    height: 44px;
    padding: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: #888;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 0;
    outline: none;
    transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
  }
  .back-circle:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.3);
    color: #fff;
  }
  .back-circle svg { display: block; }
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
  /* Pill wrapping an input with an inline send-arrow. Same shape the chat
     input (#input-wrap + #send-btn) uses, so the onboarding username
     field advances on the same control users hit everywhere else.
     Arrow visibility is driven by whether the input has content. */
  .input-pill {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 999px;
    min-height: 48px;
    transition: background-color 120ms ease, border-color 120ms ease;
  }
  .input-pill:focus-within {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.3);
  }
  .input-pill > input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    color: #e0e0e0;
    padding: 12px 16px;
    font-size: 16px;
    min-height: 48px;
    outline: none;
    font: inherit;
  }
  .input-pill > input::placeholder { color: #888; }
  .input-pill > .pill-submit {
    appearance: none;
    -webkit-appearance: none;
    -webkit-tap-highlight-color: transparent;
    margin: 4px;
    padding: 8px;
    min-height: 0;
    border: none;
    border-radius: 999px;
    background: #5b8def;
    color: #fff;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 0;
    transition: background-color 120ms ease, opacity 120ms ease;
  }
  .input-pill > .pill-submit:hover { background: #4a7de0; }
  .input-pill > .pill-submit svg { display: block; }
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
    <div id="back-slot"></div>
    <div id="sub" class="sub">Loading…</div>
  </div>
<script>
(function () {
  const title = document.getElementById('title');
  const sub = document.getElementById('sub');
  const body = document.getElementById('body');
  const backSlot = document.getElementById('back-slot');
  const token = new URLSearchParams(location.search).get('t') || '';

  function setSub(text, kind) {
    sub.textContent = text || '';
    sub.className = 'sub' + (kind ? ' ' + kind : '');
  }
  function clearBody() { while (body.firstChild) body.removeChild(body.firstChild); }
  function clearBack() { while (backSlot.firstChild) backSlot.removeChild(backSlot.firstChild); }
  function setBack(target) {
    clearBack();
    if (!target) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'back-circle';
    b.setAttribute('aria-label', 'Back');
    b.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>';
    b.addEventListener('click', function () { target(); });
    backSlot.appendChild(b);
  }
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
    // Callers drive their own in-button or below-button feedback; this
    // helper stays silent so it doesn't clobber their messaging.
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
    clearBack();
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
    clearBack();
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
    // No setSub call: onboarding step 3 shows spinner + error directly on
    // the Create passkey button rather than in the status line below.
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
    clearBack();
    body.appendChild(renderStepDots(0));
    const pill = document.createElement('div');
    pill.className = 'input-pill';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Username';
    input.maxLength = 20;
    input.value = onboard.username;
    input.autocapitalize = 'none';
    input.autocomplete = 'username webauthn';
    input.spellcheck = false;
    pill.appendChild(input);
    const submit = document.createElement('button');
    submit.type = 'button';
    submit.className = 'pill-submit';
    submit.setAttribute('aria-label', 'Continue');
    submit.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>';
    submit.style.visibility = input.value.trim() ? 'visible' : 'hidden';
    pill.appendChild(submit);
    body.appendChild(pill);
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
    input.addEventListener('input', function () {
      submit.style.visibility = input.value.trim() ? 'visible' : 'hidden';
    });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    submit.addEventListener('click', go);
    setTimeout(function () { input.focus(); }, 50);
  }

  // Client-side mirror of the server's contrast gate (WCAG 3.0:1 vs
   // #0f0f0f). Keeps the custom picker from accepting a color the
   // server would later reject via /auth/profile.
  function contrastOk(hex) {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '');
    if (!m) return false;
    const v = parseInt(m[1], 16);
    const rgb = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    const chan = function (c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const l = 0.2126 * chan(rgb[0]) + 0.7152 * chan(rgb[1]) + 0.0722 * chan(rgb[2]);
    const bg = 0.2126 * chan(0x0f) + 0.7152 * chan(0x0f) + 0.0722 * chan(0x0f);
    const hi = Math.max(l, bg), lo = Math.min(l, bg);
    return (hi + 0.05) / (lo + 0.05) >= 3.0;
  }

  function renderOnboardColor() {
    title.textContent = 'Pick a name color';
    setSub('', null);
    clearBody();
    setBack(renderOnboardUsername);
    body.appendChild(renderStepDots(1));
    const preview = document.createElement('div');
    preview.className = 'preview';
    preview.textContent = onboard.username;
    preview.style.color = onboard.color;
    body.appendChild(preview);
    const grid = document.createElement('div');
    grid.className = 'color-grid';
    const selectColor = function (c, swatchEl) {
      onboard.color = c;
      preview.style.color = c;
      grid.querySelectorAll('.swatch').forEach(function (el) { el.classList.remove('selected'); });
      swatchEl.classList.add('selected');
    };
    COLOR_PRESETS.forEach(function (c) {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'swatch' + (onboard.color === c ? ' selected' : '');
      sw.style.background = c;
      sw.setAttribute('aria-label', 'Color ' + c);
      sw.addEventListener('click', function () { selectColor(c, sw); });
      grid.appendChild(sw);
    });
    // Custom picker: a <label> wrapping a native color input. Clicking
    // anywhere on the tile activates the input (label semantics), which
    // opens the OS color picker. Avoids the mobile-Safari quirk where
    // programmatic picker.click() on a truly-hidden input is a no-op.
    const custom = document.createElement('label');
    custom.className = 'swatch custom-swatch';
    custom.setAttribute('aria-label', 'Custom color');
    const isCustomActive = onboard.color && COLOR_PRESETS.indexOf(onboard.color) === -1;
    if (isCustomActive) {
      custom.style.background = onboard.color;
      custom.classList.add('selected');
    }
    const picker = document.createElement('input');
    picker.type = 'color';
    picker.value = isCustomActive ? onboard.color : '#5b8def';
    custom.appendChild(picker);
    picker.addEventListener('input', function () {
      const c = picker.value;
      if (!contrastOk(c)) {
        setSub('That color is too dark to read on the chat background. Try a lighter one.', 'error');
        return;
      }
      setSub('', null);
      custom.style.background = c;
      selectColor(c, custom);
    });
    grid.appendChild(custom);
    body.appendChild(grid);
    body.appendChild(button('Next', 'primary', function () { renderOnboardPasskey(); }));
  }

  function renderOnboardPasskey() {
    title.textContent = 'Create your passkey';
    setSub('', null);
    clearBody();
    setBack(renderOnboardColor);
    body.appendChild(renderStepDots(2));
    const preview = document.createElement('div');
    preview.className = 'preview';
    preview.textContent = onboard.username;
    preview.style.color = onboard.color;
    body.appendChild(preview);
    const hint = document.createElement('div');
    hint.className = 'who';
    hint.style.textAlign = 'center';
    const line1 = document.createElement('div');
    line1.textContent = 'rooty.org uses passkey authentication only.';
    const line2 = document.createElement('div');
    line2.style.marginTop = '10px';
    line2.textContent = 'No emails. No passwords.';
    hint.appendChild(line1);
    hint.appendChild(line2);
    body.appendChild(hint);
    const btn = button('Create passkey', 'primary', async function () {
      const backBtn = backSlot.querySelector('.back-circle');
      btn.classList.add('loading');
      btn.classList.remove('err');
      btn.disabled = true;
      if (backBtn) backBtn.disabled = true;
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
        btn.classList.remove('loading');
        btn.disabled = false;
        if (backBtn) backBtn.disabled = false;
        const msg = (e && e.message) || 'Could not create passkey';
        // Username collisions are caught at register/start; bounce back
        // to step 1 so the user can pick a different one.
        if (/username/i.test(msg) && /taken|already/i.test(msg)) {
          renderOnboardUsername(msg);
          return;
        }
        // Error surfaces on the button itself: swap its label to the
        // failure text and tint it red. Reverts after a few seconds so
        // the user can retry with the same primary action.
        btn.classList.add('err');
        btn.textContent = msg;
        setTimeout(function () {
          if (!btn.isConnected) return;
          btn.classList.remove('err');
          btn.textContent = 'Create passkey';
        }, 4500);
      }
    });
    body.appendChild(btn);
  }

  function renderSignup(errorMsg) {
    // Reset the flow on fresh entry so a returning signup starts at step 1.
    onboard.username = '';
    onboard.color = COLOR_PRESETS[5];
    renderOnboardUsername(errorMsg);
  }

  function renderSignedInConfirm(username) {
    title.textContent = 'Sign in on your other device?';
    clearBack();
    const who = document.createElement('div');
    who.className = 'who';
    who.innerHTML = 'You are <b></b> on this phone.';
    who.querySelector('b').textContent = username ? '@' + username : 'signed in';
    body.appendChild(who);
    setSub('Tap confirm to finish signing in on the other device.');
    const btn = button('Confirm sign-in', 'primary', async function () {
      btn.classList.add('loading');
      btn.disabled = true;
      try {
        await claim();
        renderDone();
      } catch (e) {
        btn.classList.remove('loading');
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
    clearBack();
    const btn = button('Use passkey', 'primary', async function () {
      btn.classList.add('loading');
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
        btn.classList.remove('loading');
        btn.disabled = false;
        renderSignup('No passkey found on this device. Create one to sign in.');
      }
    });
    body.appendChild(btn);
    body.appendChild(button('Create account', null, function () { renderSignup(); }));
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
