export const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<title>Shoutbox</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  /* Lock the root element to the viewport so iOS Safari can't scroll
     the window when the on-screen keyboard opens. Without this, tapping
     the chat input pushes the whole page up and the input ends up
     floating near the top with a blank area below it. */
  html {
    height: 100%;
    overflow: hidden;
    overscroll-behavior: none;
  }

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
    /* Keep the body itself unscrollable so the mobile keyboard can't
       reveal empty space below the floating input bar. Inner scrolling
       (messages list) stays intact. */
    overflow: hidden;
    overscroll-behavior: none;
  }
  pre, code, kbd, samp, #vm-recipe, #verify-box dd {
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  }

  /* --- Scrollbars --------------------------------------------------------
     A thin, translucent scrollbar that fades into the glass aesthetic:
     transparent track, a rounded white thumb at ~12% opacity that brightens
     on hover. The 2px transparent border + background-clip trick shrinks
     the visible thumb so it looks detached from the scroll gutter. */
  * {
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.14) transparent;
  }
  ::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.14);
    border-radius: 999px;
    border: 2px solid transparent;
    background-clip: padding-box;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.28);
    background-clip: padding-box;
  }
  ::-webkit-scrollbar-corner { background: transparent; }

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
    /* position:relative anchors the absolutely-floated #input-bar so it
       can sit above the messages area without consuming its own row. */
    position: relative;
  }

  /* Top bar of online users. Floats over the messages area (so the
     scrollbar on #messages can extend all the way to the top of the
     page) with pointer-events:none on the frame; interactive children
     re-enable them. overflow:hidden here (rather than on #users-list)
     sits flush with the page top, so the 8px breathing room above the
     pills is part of the animation path — arriving pills slide from
     y=0 down through the gap to their resting position at y=8. The
     :has() override drops the clip when the shade is open so the
     expanded list isn't cut off. */
  #users-bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 10;
    pointer-events: none;
    overflow: hidden;
  }
  #users-bar:has(#users-list.expanded) { overflow: visible; }
  #users-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    /* 8px top/bottom matches the input-bar padding so the gaps above
       the pills and below the input pill are identical. */
    padding: 8px 12px;
    max-width: 100%;
    pointer-events: auto;
  }
  /* Centered list of user pills. The row wraps up to 3 lines naturally;
     a 4th row overflows beyond #users-list's max-height and is clipped
     by the users-bar overflow:hidden above (which also doubles as the
     page-top clip for the slide-in animation). */
  #users-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 6px;
    min-width: 0;
    justify-content: center;
    /* ~3 rows of 26px pills with two 6px row-gaps; extra rows spill
       visibly below and get clipped by #users-bar. */
    max-height: 90px;
  }
  /* Expanded "shade": the list pops out of the flex row and anchors to
     the top of #users-bar, overlaying the messages area so every user
     is visible. No backdrop — the pills float directly over the chat. */
  #users-list.expanded {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    padding: 8px 12px;
    max-height: 60vh;
    overflow-y: auto;
    z-index: 20;
  }
  /* Each user name is rendered as a glass pill that matches the input
     bar below — same translucent wash, same border, same backdrop
     blur. Messages that scroll behind the pill stay readable but
     softened, tying the top and bottom bars together visually.
     Hovering the pill brightens the wash and border the same way the
     input pill does when it receives focus. */
  #users-list li {
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 160px;
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    flex-shrink: 0;
    cursor: pointer;
    transition: transform 260ms ease, opacity 220ms ease,
                max-width 260ms ease, padding 260ms ease,
                background-color 150ms ease, border-color 150ms ease;
  }
  #users-list li:hover {
    border-color: rgba(255, 255, 255, 0.22);
    background: rgba(255, 255, 255, 0.08);
  }
  /* Suppress the default clickable-name underline inside a pill —
     the pill's hover highlight signals interactivity instead. The
     li itself carries the clickable-name class now (so the whole pill
     is the click target), so we have to cover both it and any nested
     .clickable-name spans. */
  #users-list li:hover,
  #users-list li:hover .clickable-name,
  #users-list li .clickable-name:hover { text-decoration: none; }
  /* Joining: start above the bar (translateY up) with no opacity, then
     slide down into place. Leaving reverses that and collapses the
     pill's width + padding so neighbors close the gap smoothly. */
  #users-list li.entering { transform: translateY(-120%); opacity: 0; }
  #users-list li.leaving {
    transform: translateY(-120%);
    opacity: 0;
    max-width: 0;
    padding-left: 0;
    padding-right: 0;
  }
  /* Fingerprint sits next to the name in the dropdown/modal contexts; in
     the compact horizontal strip it's noise — let the click-to-open user
     modal surface it instead. */
  #users-list .fp { display: none; }

  /* "+N more" pill. Absolutely pinned to the right edge so the users
     row stays visually centered — otherwise its width would shift the
     list off-center. Same glass surface as the user pills. */
  #users-more {
    position: absolute;
    right: 12px;
    top: 8px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    color: var(--text-muted);
    font-size: 13px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 999px;
    cursor: pointer;
    white-space: nowrap;
    pointer-events: auto;
    z-index: 11;
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
    font-size: 13px;
    cursor: pointer;
  }
  .btn:hover { background: #333; }
  .btn-primary { background: var(--accent); color: #fff; }
  .btn-primary:hover { background: #4a7de0; }

  /* --- Messages area ----------------------------------------------------- */
  #messages {
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    /* Bottom padding clears the floating input pill (37.6px tall inside
       an 8px-padded bar = 45.6px to the pill's top edge) and adds the
       same 2px flex gap that sits between any two adjacent messages, so
       the last message rests with the same breathing room above the
       input pill as it would have above another message. The entry
       animation pins the new message's bottom at this resting line, so
       it visibly rises out of that 2px gap — adjust this padding and
       the animation's starting point follows automatically. No top
       padding: messages scroll behind the floating users pills so their
       backdrop-filter blur softens whatever text is currently
       underneath — the scrollbar on #messages therefore runs from the
       top of the page all the way down to the input pill. */
    padding: 8px 12px 48px 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    scroll-behavior: smooth;
  }
  /* Stack messages from the bottom: a zero-basis flex spacer absorbs any
     extra height so messages hug the chat bar when the list is short.
     When content overflows the spacer shrinks to 0 (flex-shrink: 1) and
     normal scroll behavior wins. We use this instead of margin-top:auto
     on the first child because auto-margin resolution is flaky inside
     an overflow:auto flex container on mobile browsers (the margin
     doesn't absorb the space and content clings to the top). */
  #messages::before {
    content: '';
    flex: 1 1 0;
    min-height: 0;
  }
  /* Each message is a 3-column grid: a fixed left gutter holds the
     timeline label, then name and text follow. The label text is only
     populated for the first message of each group sharing a relative-
     time bucket (see refreshTimestamps), so a run of five messages at
     "15h ago" shows the label once at the top of the run and blank
     cells below — forming a left-column timeline. */
  .msg {
    font-size: 13px;
    line-height: 1.45;
    padding: 2px 0 2px 6px;
    border-left: 2px solid transparent;
    max-width: 100%;
    min-width: 0;
    display: grid;
    grid-template-columns: 2.5em auto 1fr;
    column-gap: 6px;
    align-items: baseline;
  }
  /* Subtle hover wash so the message under the cursor reads as the
     active row. Same translucent-white tint used by the input pill,
     dialed down to keep the chat scan-friendly. */
  .msg:hover { background: rgba(255, 255, 255, 0.03); }
  .msg .timeline {
    color: var(--text-muted);
    font-size: 13px;
    text-align: right;
    white-space: nowrap;
    user-select: none;
  }
  .msg .name {
    font-weight: 600;
    white-space: nowrap;
    cursor: default;
  }
  .msg .text {
    color: var(--text);
    min-width: 0;
    /* overflow-wrap: anywhere handles long URLs and runs without breaking
       inside ordinary words on narrow viewports (word-break: break-all
       did, which made prose ugly on mobile). */
    overflow-wrap: anywhere;
  }

  /* --- Floating input bar ----------------------------------------------- */
  /* The input-bar floats over the bottom of the messages area so that
     chat scrolls up behind it. pointer-events: none on the container
     lets messages receive clicks everywhere except through the pill
     itself (which re-enables them). */
  #input-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 8px 12px;
    pointer-events: none;
    z-index: 5;
  }
  #input-wrap {
    pointer-events: auto;
    position: relative;
    /* Subtle glass: translucent surface plus a backdrop blur so chat
       messages scrolling behind the pill stay readable but softened. */
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 999px;
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    display: flex;
    align-items: center;
  }
  /* When focused the wash and border brighten slightly to signal focus. */
  #input-wrap:focus-within {
    border-color: rgba(255, 255, 255, 0.22);
    background: rgba(255, 255, 255, 0.08);
  }
  #input-wrap #msg-input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    color: var(--text);
    padding: 8px 16px;
    /* Match the chat-message body size (.msg font-size: 13px). Mobile
       still forces 16px via the iOS auto-zoom guard below. */
    font-size: 13px;
    outline: none;
  }
  /* Pin the placeholder to the chat-message body size (13px). The
     iOS auto-zoom guard below forces input font-size to 16px on mobile,
     which would otherwise drag the placeholder up to 16px too — making
     it visibly larger than every message in the chat. The placeholder
     itself is purely visual and doesn't affect Safari's zoom heuristic,
     so we can pin it back down independently. */
  #input-wrap #msg-input::placeholder { color: var(--text-muted); font-size: 13px; }
  /* Send button sits inside the pill on the right and only shows once
     the user has typed something. Toggled via [data-empty] on #input-wrap. */
  #input-wrap #send-btn {
    margin: 4px;
    border: none;
    border-radius: 999px;
    padding: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 0;
  }

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
    /* Re-enable pointer events; #input-bar uses pointer-events:none so
       that chat scrolls through to the messages behind it. */
    pointer-events: auto;
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
    font-size: 13px;
    color: var(--text-muted);
    margin-left: auto;
  }
  .mention-item.active, .mention-item:hover { background: var(--border); }

  /* --- Auth screen ------------------------------------------------------- */
  #auth-screen {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100dvh;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
  }
  #auth-screen h2 { font-size: 13px; font-weight: 600; }
  #auth-screen p { color: var(--text-muted); font-size: 13px; max-width: 300px; text-align: center; }
  /* Wrapper around the per-state form area (primary buttons, email pill,
     code/signup/recovery forms). A fixed min-height absorbs the height
     differences between states so the heading above and alts below
     don't shift when the user toggles between passkey and email. The
     visible content centers within the reserved space. */
  #auth-stack {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    width: 100%;
    min-height: 100px;
  }
  @media (max-width: 640px) {
    #auth-stack { min-height: 170px; }
  }
  #auth-primary { display: flex; gap: 8px; }
  /* Glass button treatment matches the chat-input pill (#input-wrap):
     translucent surface, soft border, fully rounded, with backdrop blur.
     Scoped to #auth-screen so the chat profile modal's solid-pill
     buttons are unaffected. */
  #auth-screen .btn {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 999px;
    -webkit-backdrop-filter: blur(14px);
    backdrop-filter: blur(14px);
    color: var(--text);
    padding: 8px 18px;
    font-size: 13px;
    cursor: pointer;
    transition: background-color 120ms ease, border-color 120ms ease;
  }
  #auth-screen .btn:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.22);
  }
  /* Primary lifts the wash with an accent tint so it still reads as
     the recommended action without breaking the glass aesthetic. */
  #auth-screen .btn-primary {
    background: rgba(91, 141, 239, 0.20);
    border-color: rgba(91, 141, 239, 0.45);
    color: #fff;
  }
  #auth-screen .btn-primary:hover {
    background: rgba(91, 141, 239, 0.30);
    border-color: rgba(91, 141, 239, 0.65);
  }
  /* Smaller, ghost-style toggle to opt into the email flow when passkeys
     are the primary path. Less visual weight than the main auth buttons
     so it reads as a fallback, not a parallel choice. */
  #use-email-btn {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 999px;
    color: var(--text-muted);
    padding: 4px 14px;
    font-size: 12px;
    cursor: pointer;
    transition: color 120ms ease, border-color 120ms ease;
  }
  #use-email-btn:hover {
    color: var(--text);
    border-color: rgba(255, 255, 255, 0.18);
  }
  #auth-alts { font-size: 13px; color: var(--text-muted); display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
  #auth-alts a { color: var(--accent); text-decoration: none; }
  #auth-alts a:hover { text-decoration: underline; }
/* --- Auth button loading state + resend row --------------------------- */
  #auth-screen .btn[disabled] {
    opacity: .65;
    cursor: not-allowed;
  }
  #auth-screen .btn.loading {
    position: relative;
    color: transparent !important;
  }
  #auth-screen .btn.loading::after {
    content: '';
    position: absolute;
    inset: 0;
    margin: auto;
    width: 14px;
    height: 14px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    color: #fff;
    animation: auth-spin .7s linear infinite;
  }
  #auth-screen .btn.loading:not(.btn-primary)::after { color: var(--text); }
  @keyframes auth-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    #auth-screen .btn.loading::after { animation-duration: 2s; }
  }
  #resend-row {
    font-size: 13px;
    color: var(--text-muted);
    display: flex;
    gap: 6px;
    justify-content: center;
    align-items: center;
    min-height: 18px;
  }
  #resend-row a { color: var(--accent); text-decoration: none; }
  #resend-row a:hover { text-decoration: underline; }
  #resend-row a[aria-disabled="true"] { color: var(--text-muted); pointer-events: none; cursor: default; text-decoration: none; }
  /* Larger tap targets on touch screens. The global iOS rule above already
     bumps input font to 16px to suppress focus-zoom; this widens the auth
     buttons to the 44px minimum recommended by WCAG/HIG. */
  @media (max-width: 640px) {
    #auth-screen .btn { min-height: 44px; padding-left: 16px; padding-right: 16px; }
    #auth-screen #auth-primary { flex-direction: column; width: 280px; max-width: 100%; }
    #auth-screen #auth-primary .btn { width: 100%; }
  }

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
  #rc-box h3 { font-size: 13px; font-weight: 600; }
  #rc-box p { color: var(--text-muted); font-size: 13px; }
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
    padding-top: 6px;
    display: flex; flex-direction: column; gap: 6px;
  }
  #pk-section h4, #email-section h4, #account-section h4 { font-size: 13px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: .5px; }
  .account-actions { display: flex; gap: 8px; justify-content: space-between; }
  #email-current {
    display: flex; align-items: center; gap: 8px;
    font-size: 13px;
  }
  #email-value { flex: 1; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #email-value:empty::before { content: 'None'; color: var(--text-muted); }
  #email-actions { display: flex; gap: 4px; }
  #email-form { display: flex; flex-direction: column; gap: 6px; }
  #email-new-input {
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 6px 8px;
    border-radius: 4px;
    font-size: 13px;
    outline: none;
  }
  #email-new-input:focus { border-color: var(--accent); }
  .email-form-actions { display: flex; gap: 6px; justify-content: flex-end; }
  /* Let the message collapse to 0 height when empty so it doesn't pad
     out the bottom of the Email section. */
  #email-msg { font-size: 13px; color: var(--text-muted); }
  #email-msg:empty { display: none; }
  #email-msg.error { color: #ff6b6b; }
  #email-msg.ok { color: #8fd18f; }
  .pk-row {
    display: flex; align-items: center; gap: 8px;
    font-size: 13px;
  }
  .pk-row .pk-id { flex: 1; color: var(--text-muted); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  #auth-form { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
  /* Stack the secondary forms vertically (input(s) on top, button below)
     so they read as a focused single-purpose prompt rather than a row of
     controls. The Continue/Sign-in button sits centered beneath. */
  #signup-form, #code-form, #recovery-form {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: 100%;
  }
  /* Glass pill inputs match the email pill aesthetic: translucent
     surface, soft border, fully rounded, with backdrop blur. Focus
     lifts both the wash and border slightly. Direct-child selector so
     inputs nested inside an .input-pill (e.g. the recovery-code field)
     stay unstyled here and pick up the .input-pill rules instead. */
  #signup-form > input, #code-form > input, #recovery-form > input {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: var(--text);
    padding: 8px 16px;
    border-radius: 999px;
    -webkit-backdrop-filter: blur(14px);
    backdrop-filter: blur(14px);
    font-size: 13px;
    width: 320px;
    max-width: 100%;
    outline: none;
    transition: background-color 120ms ease, border-color 120ms ease;
  }
  #signup-form > input:focus, #code-form > input:focus, #recovery-form > input:focus {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.22);
  }
  #code-form input { letter-spacing: 4px; text-align: center; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  /* Glass pill containing an input + submit arrow, mirroring the chat
     #input-wrap + #send-btn pattern. Used by both the email entry and
     the recovery-code entry; the arrow only appears once the user has
     typed something (visibility toggled in JS). */
  .input-pill {
    position: relative;
    display: flex;
    align-items: center;
    width: 320px;
    max-width: 100%;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 999px;
    -webkit-backdrop-filter: blur(14px);
    backdrop-filter: blur(14px);
    transition: background-color 120ms ease, border-color 120ms ease;
  }
  .input-pill:focus-within {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.22);
  }
  .input-pill > input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    color: var(--text);
    padding: 8px 16px;
    font-size: 13px;
    outline: none;
  }
  .input-pill > input::placeholder { color: var(--text-muted); font-size: 13px; }
  /* Button shrunk just enough that the pill's flex height matches the
     standalone glass inputs in signup/code/recovery (~33px desktop /
     ~46px mobile). Explicitly opts out of the mobile .btn min-height
     since the surrounding pill already provides the 44px tap target. */
  .input-pill > button[type=submit] {
    margin: 3px;
    padding: 4px;
    min-height: 0;
    border: none;
    border-radius: 999px;
    background: var(--accent);
    color: #fff;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 0;
    transition: background-color 120ms ease;
  }
  .input-pill > button[type=submit]:hover { background: #4a7de0; }
  .input-pill > button[type=submit] > svg { display: block; }
  /* Wrapper reserves enough vertical space for the worst-case status
     (a 2-3 line success/error message) plus the resend row, so the
     centered auth-screen above doesn't reflow when a message lands. */
  #auth-meta {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    min-height: 84px;
    width: 100%;
    max-width: 320px;
  }
  #auth-status { color: var(--text-muted); font-size: 13px; min-height: 18px; text-align: center; max-width: 320px; }
  #auth-status.error { color: #ff6b6b; }
  #dev-link a { color: var(--accent); font-size: 13px; }
  @media (max-width: 640px) {
    #auth-screen #auth-form input,
    #auth-screen #code-form input,
    #auth-screen #signup-form input,
    #auth-screen #recovery-form input {
      width: 100%;
      max-width: 320px;
      min-height: 44px;
    }
  }

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
    gap: 10px;
    position: relative;
  }
  #profile-box h3 { font-size: 13px; font-weight: 600; }
  #profile-meta {
    font-size: 13px;
    color: var(--text-muted);
    margin-top: -8px;
  }
  #profile-meta .fp { font-size: 13px; margin: 0; }
  #profile-close {
    position: absolute;
    top: 8px;
    right: 8px;
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1;
    padding: 4px 8px;
    cursor: pointer;
    border-radius: 4px;
  }
  #profile-close:hover { color: var(--text); background: var(--border); }
  #profile-box label { font-size: 13px; color: var(--text-muted); }
  #profile-box input[type="text"] {
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 6px 8px;
    border-radius: 4px;
    font-size: 13px;
    width: 100%;
    outline: none;
  }
  .color-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  /* Username input grows into the remaining width; the color swatch
     stays a fixed square next to it. */
  .color-row input[type="text"] { width: auto; }
  .color-row #username-input { flex: 1; min-width: 0; font-weight: 600; }
  .color-row #color-input { flex: 0 0 40px; }
  #color-input {
    height: 32px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    padding: 0;
    /* Strip the browser's default swatch chrome so the entire box is a
       solid block of the picked color (no inner padding, no frame). */
    -webkit-appearance: none;
    appearance: none;
  }
  #color-input::-webkit-color-swatch-wrapper { padding: 0; }
  #color-input::-webkit-color-swatch { border: none; border-radius: 4px; }
  #color-input::-moz-color-swatch { border: none; border-radius: 4px; }
  #color-warn {
    margin-top: 4px;
    font-size: 13px;
    color: #ff6b6b;
    min-height: 14px;
  }
  #profile-box .actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
  #profile-box .actions .spacer { flex: 1; }
  /* All buttons inside the profile modal share a single height so the
     stack reads cleanly; icon-only buttons use equal padding to stay
     square. Save fills the row as the sole footer action. */
  #profile-box .btn { padding: 6px 10px; font-size: 13px; line-height: 1.35; }
  #profile-box .btn.icon-btn { padding: 7px; }
  #profile-save { width: 100%; }
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
  #verify-box h3 { font-size: 13px; font-weight: 600; margin: 0; }
  #verify-box dl { display: grid; grid-template-columns: 100px 1fr; gap: 4px 10px; margin: 0; }
  #verify-box dt { color: var(--text-muted); }
  #verify-box dd { margin: 0; font-family: monospace; word-break: break-all; }
  #verify-box a { color: var(--accent); }
  #verify-box p { color: var(--text-muted); margin: 4px 0 0; }
  #verify-box pre {
    background: var(--bg); border: 1px solid var(--border);
    padding: 8px; border-radius: 4px;
    font-size: 13px; overflow-x: auto;
    white-space: pre; margin: 0;
  }
  #verify-box .actions { display: flex; justify-content: flex-end; }

  /* --- User fingerprint + clickable names + profile modal --------------- */
  .clickable-name { cursor: pointer; }
  .clickable-name:hover { text-decoration: underline; }
  .fp {
    color: var(--text-muted);
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    font-size: 13px;
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
  #user-box h3 { font-size: 13px; font-weight: 600; margin: 0; display: flex; align-items: baseline; gap: 8px; }
  #user-box h3 .fp { font-size: 13px; }
  #user-box dl { display: grid; grid-template-columns: 90px 1fr; gap: 4px 10px; margin: 0; }
  #user-box dt { color: var(--text-muted); }
  #user-box dd { margin: 0; }
  #user-box .actions { display: flex; justify-content: flex-end; }

  /* --- Connection status ------------------------------------------------- */
  #conn-status {
    font-size: 13px;
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

  <div id="auth-stack">
    <div id="auth-primary" style="display:none;">
      <button class="btn btn-primary" id="pk-signin-btn">Continue with passkey</button>
    </div>

    <button type="button" id="use-email-btn" style="display:none;">Sign in with email</button>

    <form id="auth-form" style="display:none;">
      <div id="email-pill" class="input-pill">
        <input type="email" id="email-input" placeholder="Sign in with email" inputmode="email" required autocomplete="username webauthn">
        <button type="submit" class="btn btn-primary" id="email-submit-btn" aria-label="Continue" style="visibility:hidden;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
        </button>
      </div>
    </form>

    <form id="signup-form" style="display:none;">
      <input type="text" id="signup-name" placeholder="Pick a username" maxlength="20" pattern="[a-zA-Z0-9_\\-]+" required autocomplete="username webauthn">
      <button type="submit" class="btn btn-primary">Create passkey</button>
    </form>

    <form id="code-form" style="display:none;">
      <input type="text" id="code-input" placeholder="6-digit code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required>
      <button type="submit" class="btn btn-primary">Sign in</button>
    </form>

    <form id="recovery-form" style="display:none;">
      <input type="text" id="recovery-user" placeholder="username" maxlength="20" autocomplete="username" required>
      <div id="recovery-pill" class="input-pill">
        <input type="text" id="recovery-code" placeholder="XXXX-XXXX-XXXX" maxlength="14" autocomplete="off" required>
        <button type="submit" class="btn btn-primary" id="recovery-submit-btn" aria-label="Sign in" style="visibility:hidden;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
        </button>
      </div>
    </form>
  </div>

  <div id="auth-meta">
    <div id="auth-status"></div>
    <div id="resend-row" style="display:none;"></div>
    <div id="dev-link"></div>
  </div>
  <div id="auth-alts">
    <a href="#" id="use-passkey" style="display:none;">Use passkey instead</a>
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
      <div id="users-bar">
        <div id="users-row">
          <ul id="users-list"></ul>
        </div>
        <button id="users-more" type="button" style="display:none;"></button>
      </div>
      <div id="messages"></div>
      <div id="input-bar">
        <div id="mention-suggest" role="listbox"></div>
        <div id="input-wrap">
          <input type="text" id="msg-input" placeholder="Message Shoutbox" maxlength="500" autocomplete="off">
          <button class="btn btn-primary icon-btn" id="send-btn" aria-label="Send" style="visibility:hidden;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
          </button>
        </div>
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
        <input type="color" id="color-input" title="Pick a color">
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
          <button class="btn icon-btn" id="email-change-btn" type="button" title="Change email" aria-label="Change email">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>
          <button class="btn btn-danger icon-btn" id="email-remove-btn" type="button" title="Remove email" aria-label="Remove email">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
          </button>
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
  const usePasskey  = document.getElementById('use-passkey');
  const useRecovery = document.getElementById('use-recovery');
  const altsSep2    = document.getElementById('alts-sep2');
  const useEmailBtn = document.getElementById('use-email-btn');
  const resendRow   = document.getElementById('resend-row');
  const recoveryForm = document.getElementById('recovery-form');
  const recoveryUser = document.getElementById('recovery-user');
  const recoveryCode = document.getElementById('recovery-code');
  const recoverySubmitBtn = document.getElementById('recovery-submit-btn');
  const rcModal     = document.getElementById('rc-modal');
  const rcCodes     = document.getElementById('rc-codes');
  const rcCopy      = document.getElementById('rc-copy');
  const rcContinue  = document.getElementById('rc-continue');
  const authForm    = document.getElementById('auth-form');
  const emailInput  = document.getElementById('email-input');
  const emailSubmitBtn = document.getElementById('email-submit-btn');
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
  // Track the messages list length so the 100-message DOM cap doesn't
  // walk the full list with querySelectorAll on every incoming message.
  let messageCount = 0;
  const MAX_VISIBLE_MESSAGES = 100;

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
    if (typeof updateSendVisibility === 'function') updateSendVisibility();
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

  // Defense-in-depth against @mention notification floods. The server
  // already strips the @ prefix on mentions past its cap before
  // broadcasting, but if that ever regresses the client still refuses
  // to render — or ping on — more than MAX_MENTIONS distinct recipients
  // in one message.
  const MAX_MENTIONS = 5;
  function renderMessageText(parent, text) {
    const re = /(https?:\\/\\/[^\\s<>"'()]+[^\\s<>"'().,!?;:])|@([a-zA-Z0-9_\\-]{1,20})/gi;
    let last = 0;
    let mentionedMe = false;
    const seenMentions = new Set();
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
        const lower = m[2].toLowerCase();
        if (!seenMentions.has(lower) && seenMentions.size >= MAX_MENTIONS) {
          // Excess mention: render as plain text so no ping, no highlight.
          parent.appendChild(document.createTextNode(m[0]));
        } else {
          seenMentions.add(lower);
          const span = document.createElement('span');
          span.className = 'mention';
          span.textContent = m[0];
          parent.appendChild(span);
          if (myUsername && lower === myUsername.toLowerCase()) {
            mentionedMe = true;
          }
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
    // Reset any height the iOS visualViewport pin wrote onto chatScreen;
    // otherwise the stale inline height lingers on the hidden element and
    // can leak back in on a subsequent sign-in before pin() re-fires.
    chatScreen.style.height = '';
    authScreen.style.display = 'flex';
    chatScreen.style.display = 'none';
    // Prefill the email input from the last sign-in so returning users
    // don't have to retype. Method preference would steer the layout, but
    // the primary screen now exposes both options at once, so prefill is
    // the only persistence that materially changes the UX.
    try {
      const last = getStored('auth.lastEmail');
      if (last && !emailInput.value) emailInput.value = last;
    } catch {}
    updateEmailSubmitVisibility();
    try { showAuthForm('primary'); } catch {}
  }

  // Mirror the chat input pattern: only surface the submit arrow once
  // the user has typed something, so the empty pill stays uncluttered.
  function updateEmailSubmitVisibility() {
    emailSubmitBtn.style.visibility = emailInput.value.trim() ? 'visible' : 'hidden';
  }
  emailInput.addEventListener('input', updateEmailSubmitVisibility);

  function showChat() {
    isAuthed = true;
    resetConnectionState();
    stopAuthPolling();
    abortConditionalPasskey();
    // Dismiss any auth-flow input still focused (e.g. a mobile keyboard
    // up from the email-code field). If we don't, the visualViewport
    // stays shrunk while history loads, the initial scrollBottom() pins
    // to the wrong height, and the user lands somewhere mid-list when
    // the keyboard finally dismisses.
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
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

  async function passkeyGet(opts, extra) {
    const args = { publicKey: prepGet(opts) };
    if (extra && extra.mediation) args.mediation = extra.mediation;
    if (extra && extra.signal) args.signal = extra.signal;
    const cred = await navigator.credentials.get(args);
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

  // --- Auth helpers -------------------------------------------------------
  // Capability detection: gate every passkey UI affordance on a real
  // PublicKeyCredential implementation. Without it we collapse to the
  // email-only flow rather than letting users click buttons that error.
  const pkSupported = !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.get);
  let pkConditionalSupported = false;
  if (pkSupported && typeof PublicKeyCredential.isConditionalMediationAvailable === 'function') {
    PublicKeyCredential.isConditionalMediationAvailable()
      .then((ok) => { pkConditionalSupported = !!ok; if (ok && authScreen.style.display !== 'none') startConditionalPasskey(); })
      .catch(() => {});
  }

  // Persist the user's last-used email and method so returning visitors land
  // on the right screen with their address prefilled. Wrapped in try/catch
  // because Safari private mode throws on localStorage access.
  function getStored(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function setStored(k, v) { try { localStorage.setItem(k, v); } catch {} }

  function setStatus(msg, isError) {
    authStatus.textContent = msg || '';
    authStatus.classList.toggle('error', !!isError && !!msg);
  }

  // Loading helper: spinner on the primary submit button + disable inputs to
  // block double-submit. Works for both forms (querySelectorAll inputs) and
  // the bare passkey buttons (passed directly).
  function setLoading(target, on) {
    const isForm = target && target.tagName === 'FORM';
    const btn = isForm ? target.querySelector('button[type=submit], button.btn-primary') : target;
    if (btn) { btn.classList.toggle('loading', !!on); btn.disabled = !!on; }
    if (isForm) target.querySelectorAll('input').forEach((i) => { i.disabled = !!on; });
  }

  // Conditional WebAuthn (autofill UI). Browsers surface saved passkeys in
  // the autocomplete dropdown when an input with autocomplete="webauthn" is
  // focused; selecting one resolves the pending get() and we sign in. The
  // request is aborted whenever the user takes another auth path so the
  // server-side challenge isn't left dangling.
  let conditionalAbort = null;
  async function startConditionalPasskey() {
    if (!pkSupported || !pkConditionalSupported) return;
    // Idempotent: a pending conditional get() outlives state changes
    // (primary <-> email both expose webauthn-tagged inputs), so calling
    // start again is a no-op until the previous one is aborted or
    // resolves. Without this guard, every state toggle would burn a
    // fresh /auth/webauthn/auth/start challenge against the rate limit.
    if (conditionalAbort) return;
    const ac = new AbortController();
    conditionalAbort = ac;
    try {
      const startRes = await fetch('/auth/webauthn/auth/start', { method: 'POST' });
      if (!startRes.ok || ac.signal.aborted) return;
      const startData = await startRes.json();
      const assertion = await passkeyGet(startData.options, { mediation: 'conditional', signal: ac.signal });
      if (ac.signal.aborted) return;
      const finRes = await fetch('/auth/webauthn/auth/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: assertion }),
      });
      if (!finRes.ok) return;
      setStored('auth.lastMethod', 'passkey');
      checkAuth();
    } catch {
      // Aborted, cancelled, or no credential picked - all silent.
    } finally {
      if (conditionalAbort === ac) conditionalAbort = null;
    }
  }
  function abortConditionalPasskey() {
    if (conditionalAbort) {
      try { conditionalAbort.abort(); } catch {}
      conditionalAbort = null;
    }
  }

  // Magic-link mode polls /auth/me so when the user clicks the link in a
  // sibling tab (Mail.app etc. opens in the default browser), this tab
  // notices the new session cookie and switches to chat without a manual
  // refresh.
  let pollTimer = null;
  function startAuthPolling() {
    stopAuthPolling();
    pollTimer = setInterval(async () => {
      try {
        const res = await fetch('/auth/me');
        if (res.ok) { stopAuthPolling(); checkAuth(); }
      } catch {}
    }, 2000);
  }
  function stopAuthPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  // Resend cooldown shared by both the code and link flows. The server's
  // per-email rate limit is 5/hr, so a 30s client-side guard mainly stops
  // accidental double-clicks; the actual resend goes through submitSend()
  // which performs the full /auth/send round-trip.
  const RESEND_COOLDOWN = 30;
  let resendTick = null;
  let resendRemaining = 0;
  let lastSentEmail = '';
  let lastSentMode = '';
  function showResend(mode, email) {
    lastSentMode = mode; lastSentEmail = email;
    resendRow.style.display = 'flex';
    resendRemaining = RESEND_COOLDOWN;
    renderResend();
    if (resendTick) clearInterval(resendTick);
    resendTick = setInterval(() => {
      resendRemaining--;
      if (resendRemaining <= 0) { clearInterval(resendTick); resendTick = null; }
      renderResend();
    }, 1000);
  }
  function hideResend() {
    resendRow.style.display = 'none';
    resendRow.textContent = '';
    if (resendTick) { clearInterval(resendTick); resendTick = null; }
  }
  function renderResend() {
    resendRow.textContent = '';
    const label = document.createElement('span');
    label.textContent = lastSentMode === 'code' ? "Didn't get the code?" : "Didn't get the link?";
    resendRow.appendChild(label);
    const a = document.createElement('a');
    a.href = '#';
    if (resendRemaining > 0) {
      a.textContent = 'Resend in ' + resendRemaining + 's';
      a.setAttribute('aria-disabled', 'true');
    } else {
      a.textContent = 'Resend';
      a.addEventListener('click', (e) => {
        e.preventDefault();
        if (a.getAttribute('aria-disabled') === 'true') return;
        submitSend(lastSentEmail, /*isResend*/ true);
      });
    }
    resendRow.appendChild(a);
  }

  function showAuthForm(which) {
    const onPrimary = which === 'primary';
    const onEmail = which === 'email';
    // Passkey-first: primary view shows the passkey buttons + a small
    // "Sign in with email" toggle; the email pill lives in its own
    // 'email' state. When passkeys aren't supported we collapse to the
    // email pill on the primary view (since there's nothing to gate).
    authPrimary.style.display = (onPrimary && pkSupported) ? 'flex' : 'none';
    useEmailBtn.style.display = (onPrimary && pkSupported) ? 'inline-block' : 'none';
    authForm.style.display = (onEmail || (onPrimary && !pkSupported)) ? 'flex' : 'none';
    signupForm.style.display = which === 'signup' ? 'flex' : 'none';
    codeForm.style.display = which === 'code' ? 'flex' : 'none';
    recoveryForm.style.display = which === 'recovery' ? 'flex' : 'none';
    authBack.style.display = onPrimary ? 'none' : 'inline';
    // "Use passkey instead" escapes back to the primary view from the
    // email or code flows; pointless when we're already on primary.
    usePasskey.style.display = ((onEmail || which === 'code') && pkSupported) ? 'inline' : 'none';
    // "Use recovery code" only makes sense as an alternative when the user
    // is staring at the primary login choice; once they've started entering
    // an email, code, signup name, or recovery code, surfacing it again is
    // just clutter.
    useRecovery.style.display = onPrimary ? 'inline' : 'none';
    altsSep2.style.display = onPrimary ? 'none' : 'inline';
    // Re-enable inputs that a previous setLoading() may have disabled.
    [authForm, codeForm, signupForm, recoveryForm].forEach((f) => {
      f.querySelectorAll('input,button').forEach((el) => { el.disabled = false; el.classList.remove('loading'); });
    });
    // Sync pill arrow visibility to the current input contents in case
    // the user navigated away with a value typed and then returned.
    updateEmailSubmitVisibility();
    updateRecoverySubmitVisibility();
    if (which !== 'code') hideResend();
    stopAuthPolling();
    // Conditional WebAuthn fires on any screen with a webauthn-tagged
    // input visible — both 'primary' (where the passkey buttons live)
    // and 'email' (the email pill is the autofill anchor).
    if ((onPrimary || onEmail) && pkSupported) startConditionalPasskey();
    else abortConditionalPasskey();
  }

  async function doPasskeySignin() {
    if (!pkSupported) { setStatus('Passkeys not supported on this browser', true); return; }
    abortConditionalPasskey();
    setLoading(pkSigninBtn, true);
    setStatus('Waiting for passkey...');
    try {
      const startRes = await fetch('/auth/webauthn/auth/start', { method: 'POST' });
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.error || 'Failed to start');
      let assertion;
      try {
        assertion = await passkeyGet(startData.options);
      } catch {
        // WebAuthn returns the same NotAllowedError whether the user
        // has no passkey for this site or just cancelled the prompt.
        // Either way, surface the signup form so they can pick a
        // username and create one — they can hit Back to retry sign-in.
        showAuthForm('signup');
        setStatus('No passkey found - pick a username to create one.');
        signupName.focus();
        return;
      }
      const finRes = await fetch('/auth/webauthn/auth/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: assertion }),
      });
      const finData = await finRes.json();
      if (!finRes.ok) throw new Error(finData.error || 'Sign-in failed');
      setStatus('');
      setStored('auth.lastMethod', 'passkey');
      checkAuth();
    } catch (e) {
      // Server-side failure (network, /auth/webauthn/* error). Stay on
      // primary so the user can retry the same button.
      setStatus((e && e.message) || 'Sign-in failed', true);
      if (authScreen.style.display !== 'none') startConditionalPasskey();
    } finally {
      setLoading(pkSigninBtn, false);
    }
  }

  async function doPasskeySignup(displayName) {
    if (!pkSupported) { setStatus('Passkeys not supported on this browser', true); return; }
    abortConditionalPasskey();
    const submitBtn = signupForm.querySelector('button[type=submit]');
    setLoading(signupForm, true);
    setStatus('Creating passkey...');
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
      setStatus('');
      setStored('auth.lastMethod', 'passkey');
      if (finData.recoveryCodes && finData.recoveryCodes.length) {
        rcCodes.textContent = finData.recoveryCodes.join('\\n');
        rcModal.classList.add('open');
      } else {
        checkAuth();
      }
    } catch (e) {
      setStatus((e && e.message) || 'Cancelled', true);
    } finally {
      setLoading(signupForm, false);
      if (submitBtn) submitBtn.classList.remove('loading');
    }
  }

  // Shared between the form submit and the resend link.
  async function submitSend(email, isResend) {
    if (!email) return;
    if (!isResend) setLoading(authForm, true);
    setStatus(isResend ? 'Resending...' : 'Sending...');
    devLink.innerHTML = '';
    try {
      const res = await fetch('/auth/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(data.error || 'Something went wrong', true);
        return;
      }
      setStored('auth.lastEmail', email);
      setStored('auth.lastMethod', 'email');
      if (data.mode === 'code') {
        pendingEmail = email;
        if (!isResend) showAuthForm('code');
        setStatus('Enter the 6-digit code we sent to ' + email);
        if (!isResend) { codeInput.value = ''; codeInput.focus(); }
        showResend('code', email);
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
        setStatus('Sign-in link sent to ' + email + '. Check your inbox.');
        showResend('link', email);
        startAuthPolling();
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
    } catch {
      setStatus('Network error', true);
    } finally {
      if (!isResend) setLoading(authForm, false);
    }
  }

  pkSigninBtn.addEventListener('click', doPasskeySignin);
  signupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const n = signupName.value.trim();
    if (!/^[a-zA-Z0-9_\\-]{1,20}$/.test(n)) {
      setStatus('Username: 1-20 chars, letters/numbers/_/-', true);
      return;
    }
    doPasskeySignup(n);
  });
  usePasskey.addEventListener('click', (e) => {
    e.preventDefault();
    pendingEmail = '';
    showAuthForm('primary');
    setStatus('');
    devLink.innerHTML = '';
  });
  useEmailBtn.addEventListener('click', () => {
    showAuthForm('email');
    setStatus('');
    devLink.innerHTML = '';
    emailInput.focus();
  });
  useRecovery.addEventListener('click', (e) => {
    e.preventDefault();
    showAuthForm('recovery');
    setStatus('');
    // Skip auto-focus on touch viewports so the on-screen keyboard
    // doesn't slam open the moment the user lands on this screen.
    if (!matchMedia('(max-width: 640px)').matches) recoveryUser.focus();
  });
  // Mirror the email pill: only surface the submit arrow once the user
  // has typed something so the empty pill stays uncluttered.
  function updateRecoverySubmitVisibility() {
    recoverySubmitBtn.style.visibility = recoveryCode.value.trim() ? 'visible' : 'hidden';
  }
  recoveryCode.addEventListener('input', updateRecoverySubmitVisibility);
  recoveryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const uname = recoveryUser.value.trim();
    const code = recoveryCode.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^[a-zA-Z0-9_\\-]{1,20}$/.test(uname) || !/^[A-HJ-NP-Z2-9]{12}$/.test(code)) {
      setStatus('Invalid username or code', true);
      return;
    }
    setLoading(recoveryForm, true);
    setStatus('Verifying...');
    try {
      const res = await fetch('/auth/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: uname, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed');
      setStatus('');
      checkAuth();
    } catch (err) {
      setStatus((err && err.message) || 'Failed', true);
    } finally {
      setLoading(recoveryForm, false);
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

  authForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submitSend(emailInput.value.trim(), /*isResend*/ false);
  });

  // Auto-submit the 6-digit code as soon as it's entered (typed or pasted).
  // Stripping non-digits lets paste of "123-456" or "Your code: 123456" land
  // cleanly. The submit handler still re-validates so a bad value is safe.
  codeInput.addEventListener('input', () => {
    const digits = codeInput.value.replace(/\\D/g, '').slice(0, 6);
    if (digits !== codeInput.value) codeInput.value = digits;
    if (digits.length === 6 && !codeInput.disabled) {
      if (typeof codeForm.requestSubmit === 'function') codeForm.requestSubmit();
      else codeForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    }
  });

  codeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = codeInput.value.trim();
    if (!/^\\d{6}$/.test(code) || !pendingEmail) return;
    setLoading(codeForm, true);
    setStatus('Verifying...');
    try {
      const res = await fetch('/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus('');
        devLink.innerHTML = '';
        hideResend();
        showAuthForm('primary');
        pendingEmail = '';
        checkAuth();
      } else {
        setStatus(data.error || 'Invalid code', true);
      }
    } catch {
      setStatus('Network error', true);
    } finally {
      setLoading(codeForm, false);
    }
  });

  authBack.addEventListener('click', (e) => {
    e.preventDefault();
    pendingEmail = '';
    showAuthForm('primary');
    setStatus('');
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
        messageCount = 0;
        data.messages.forEach((m) => appendMsg(m, false));
        refreshTimestamps();
        scrollBottom();
        // Belt-and-suspenders for the post-login first paint: the
        // chat-screen was display:none until a moment ago, the iOS
        // visualViewport pin may still be in flight, and a fresh
        // sign-in can race with the keyboard dismissing. Re-pin on
        // the next two frames so the user reliably lands at the
        // newest message instead of the top of the list.
        requestAnimationFrame(scrollBottom);
        requestAnimationFrame(() => requestAnimationFrame(scrollBottom));
      }

      if (data.type === 'msg') {
        // Check scroll position BEFORE appending so the new node doesn't
        // skew the math. Only auto-scroll if the user is already near the
        // bottom — otherwise they're reading history and a jump is annoying.
        const nearBottom = messagesDiv.scrollHeight - messagesDiv.scrollTop - messagesDiv.clientHeight < 80;
        appendMsg(data, true, nearBottom);
        refreshTimestamps();
      }

      if (data.type === 'online') {
        const users = data.users || [];
        setOnlineUsers(users);
        renderUsers(users);
      }

      if (data.type === 'rate_limit') {
        msgInput.placeholder = 'Slow down...';
        setTimeout(() => { msgInput.placeholder = 'Message Shoutbox'; }, data.retryMs || 3000);
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
  // Render a relative timestamp: "<1m" for the first 2 minutes (a stable
  // label, not a ticking seconds counter), "Nm" up to 10 minutes,
  // multiples of 5 minutes ("10m", "15m", "20m", ...) up to 2 hours,
  // then "Nh" up to 2 days, "Nd" after that. The 5-minute rounding past
  // 10m keeps the time column from re-ticking on every minute boundary
  // for messages that are no longer "fresh" — labels in this band only
  // change once every 5 minutes by construction.
  function formatRelativeTime(tsMs) {
    const diffSec = Math.max(0, Math.floor((Date.now() - tsMs) / 1000));
    if (diffSec < 120) return '<1m';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 10) return diffMin + 'm';
    if (diffMin < 120) return (Math.floor(diffMin / 5) * 5) + 'm';
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 48) return diffHr + 'h';
    const diffDay = Math.floor(diffHr / 24);
    return diffDay + 'd';
  }

  function appendMsg(m, isLive, autoScroll) {
    addKnownUser(m.username, m.color, false);
    const div = document.createElement('div');
    div.className = 'msg';
    // Raw timestamp rides along on the message itself so
    // refreshTimestamps() can recompute the left-column timeline.
    // Absolute time stays on hover via the title attribute.
    div.dataset.ts = String(m.ts);
    div.title = new Date(m.ts).toLocaleString();

    // Empty timeline cell; refreshTimestamps fills it on the first
    // message of each time-bucket group.
    const timeline = document.createElement('span');
    timeline.className = 'timeline';

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

    div.appendChild(timeline);
    div.appendChild(name);
    div.appendChild(text);
    messagesDiv.appendChild(div);
    messageCount++;

    // Keep DOM limited to MAX_VISIBLE_MESSAGES. Using the tracked counter
    // avoids re-scanning the message list on every append.
    while (messageCount > MAX_VISIBLE_MESSAGES) {
      const first = messagesDiv.firstElementChild;
      if (!first) break;
      first.remove();
      messageCount--;
    }

    if (isLive) animateMsgEntry(div, autoScroll);
  }

  // Fade + translate the new message into place, letting CSS smooth
  // scroll handle the viewport shift in a single scrollTop assignment.
  // We deliberately avoid animating max-height here: height transitions
  // on a flex item re-lay out every sibling on every frame, which
  // stutters badly once the chat has dozens of messages. Transform and
  // opacity are compositor-only, so 100 messages cost the same as 5.
  function animateMsgEntry(div, autoScroll) {
    div.style.willChange = 'transform, opacity';
    div.style.transform = 'translateY(6px)';
    div.style.opacity = '0';
    // Force the pre-state to commit so the transition actually fires.
    void div.offsetHeight;
    div.style.transition = 'transform 140ms ease-out, opacity 140ms ease-out';
    div.style.transform = 'translateY(0)';
    div.style.opacity = '1';

    if (autoScroll) {
      // #messages has scroll-behavior: smooth, so this one assignment
      // animates the viewport up to reveal the new (already-full-height)
      // message — no per-frame layout work required.
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    setTimeout(() => {
      div.style.transition = '';
      div.style.transform = '';
      div.style.opacity = '';
      div.style.willChange = '';
    }, 160);
  }

  // Walk the messages newest-first and decide which .timeline cells
  // surface their label vs. stay blank. Two grouping rules combine:
  //   - Within the first 2 hours, any two messages whose timestamps
  //     are 5 minutes or less apart collapse into one group, so a
  //     conversation chain shows a single label on the newest of the
  //     run (transitive: 4-minute hops chain through indefinitely).
  //   - Past 2 hours we fall back to label-equality grouping ("15h"
  //     repeats are blanked), since the bucket itself already widens
  //     to an hour and timestamp-window grouping would be redundant.
  // The rules also handle the stable "<1m" sub-2-minute bucket: same
  // label on every entry, so it groups under the second rule.
  function refreshTimestamps() {
    if (messageCount === 0) return;
    const msgs = messagesDiv.querySelectorAll('.msg[data-ts]');
    const now = Date.now();
    const GROUP_WINDOW_MS = 5 * 60 * 1000;
    const SUB_2H_MS = 120 * 60 * 1000;
    let nextLabel = null;
    let nextTs = null;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const msg = msgs[i];
      const ts = Number(msg.dataset.ts);
      const label = formatRelativeTime(ts);
      const timeline = msg.querySelector('.timeline');
      let hide;
      if (nextLabel === null) {
        hide = false;
      } else if ((now - ts) < SUB_2H_MS && (now - nextTs) < SUB_2H_MS && (nextTs - ts) <= GROUP_WINDOW_MS) {
        hide = true;
      } else {
        hide = (label === nextLabel);
      }
      if (timeline) setTimelineText(timeline, hide ? '' : label);
      nextLabel = label;
      nextTs = ts;
    }
  }

  // Cross-fade a timeline cell when its text changes so labels drifting
  // from "2m" → "3m" as messages age feel like ambient updates instead
  // of jump cuts. First-time population (empty → label) sets the text
  // instantly — only subsequent changes fade.
  function setTimelineText(timeline, display) {
    const prev = timeline.textContent;
    if (prev === display) return;
    if (!prev) { timeline.textContent = display; return; }
    if (timeline._fadeTimer) clearTimeout(timeline._fadeTimer);
    timeline.style.transition = 'opacity 180ms ease-out';
    timeline.style.opacity = '0';
    timeline._fadeTimer = setTimeout(() => {
      timeline.textContent = display;
      timeline.style.opacity = '1';
      timeline._fadeTimer = 0;
    }, 180);
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
    updateSendVisibility();
    msgInput.focus();
  }

  // Send button only appears once the user has typed something. We
  // toggle visibility rather than display so the button keeps its slot
  // in the flex row — otherwise the text input jumps wider/narrower
  // each time the button appears or disappears.
  function updateSendVisibility() {
    sendBtn.style.visibility = msgInput.value.trim() ? 'visible' : 'hidden';
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
  msgInput.addEventListener('input', () => { updateSuggest(); updateSendVisibility(); });
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
        del.className = 'btn btn-danger icon-btn';
        del.title = 'Remove passkey';
        del.setAttribute('aria-label', 'Remove passkey');
        del.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';
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
    const v = colorInput.value;
    if (!/^#[0-9a-fA-F]{6}$/.test(v)) { colorWarn.textContent = ''; return; }
    const r = contrastRatio(v, BG_HEX);
    colorWarn.textContent = r >= MIN_CONTRAST ? '' : 'Too close to background (' + r.toFixed(1) + ':1). Pick something lighter.';
  }

  colorInput.addEventListener('input', () => {
    usernameInput.style.color = colorInput.value;
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
    const color = colorInput.value.trim();
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

  // Bumped on every open (and close) so a late /user/... response from a
  // prior click can't overwrite the modal with stale data when the user
  // has already clicked someone else or dismissed the dialog.
  let userModalToken = 0;
  async function showUser(username) {
    // Clicking your own name opens the editable profile modal instead
    // of the read-only user-info modal.
    if (username && username === myUsername) {
      openProfileModal();
      return;
    }
    const token = ++userModalToken;
    umName.textContent = username;
    umName.style.color = '';
    umFp.textContent = '';
    umJoined.textContent = 'Loading...';
    userModal.classList.add('open');
    try {
      const res = await fetch('/user/' + encodeURIComponent(username));
      if (token !== userModalToken) return;
      if (!res.ok) { umJoined.textContent = 'Unknown user'; return; }
      const u = await res.json();
      if (token !== userModalToken) return;
      umName.style.color = u.color || '';
      umFp.textContent = u.fingerprint ? '#' + u.fingerprint : '';
      if (u.created_at) {
        const d = new Date(u.created_at);
        umJoined.textContent = d.toLocaleString();
      } else {
        umJoined.textContent = '-';
      }
    } catch {
      if (token !== userModalToken) return;
      umJoined.textContent = 'Network error';
    }
  }
  function closeUserModal() {
    userModalToken++;
    userModal.classList.remove('open');
  }
  userClose.addEventListener('click', closeUserModal);
  userModal.addEventListener('click', (e) => {
    if (e.target === userModal) closeUserModal();
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
    // The whole pill acts as the click target (clickable-name + the
    // username dataset both on the li) so hovering anywhere in the
    // padded area — not just the text — triggers the hover highlight
    // and opens the user modal on click.
    const li = document.createElement('li');
    li.classList.add('clickable-name');
    li.dataset.username = u.username;
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
      // Signed-in user always renders first; placing them at the head on
      // creation (rather than appending and then moving) means the
      // entering animation plays from their final position instead of
      // getting reshuffled mid-transition.
      if (u.username === myUsername) {
        usersList.insertBefore(li, usersList.firstChild);
      } else {
        usersList.appendChild(li);
      }
      userLiByName.set(u.username, li);
      // Two rAFs so the browser commits the 'entering' state before we
      // remove the class — otherwise the transition is skipped.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => li.classList.remove('entering'));
      });
    }

    // Re-pin the own-user row to the head if it's still somewhere else
    // (e.g., it was created before myUsername resolved, or the row was
    // pre-existing and something else snuck in ahead of it).
    const ownLi = myUsername ? userLiByName.get(myUsername) : null;
    if (ownLi && usersList.firstChild !== ownLi) {
      usersList.insertBefore(ownLi, usersList.firstChild);
    }

    updateUserOverflow();
  }

  // Count how many user pills overflow the 3-row limit and surface them
  // as "+N more". Since the bar wraps onto multiple lines, any pill
  // whose bottom edge falls below the visible list bottom is one of the
  // clipped rows. Clicking the pill expands the list to show everyone.
  function updateUserOverflow() {
    if (usersList.classList.contains('expanded')) {
      usersMore.style.display = 'none';
      return;
    }
    usersMore.style.display = '';
    usersMore.textContent = '+0 more';
    const listRect = usersList.getBoundingClientRect();
    const lis = usersList.querySelectorAll('li:not(.leaving)');
    let hidden = 0;
    for (const li of lis) {
      const r = li.getBoundingClientRect();
      if (r.bottom > listRect.bottom + 0.5) hidden++;
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

  // Tap/click outside the bar collapses the expanded shade.
  document.addEventListener('click', (e) => {
    if (!usersList.classList.contains('expanded')) return;
    if (e.target.closest('#users-bar')) return;
    usersList.classList.remove('expanded');
    updateUserOverflow();
  });

  // rAF-throttle resize so a stream of events during window/keyboard
  // animations collapses to one updateUserOverflow call per frame —
  // each call does a getBoundingClientRect sweep across every pill.
  let overflowRaf = 0;
  window.addEventListener('resize', () => {
    if (overflowRaf) return;
    overflowRaf = requestAnimationFrame(() => {
      overflowRaf = 0;
      updateUserOverflow();
    });
  });

  // Rebuild the timeline dividers periodically so labels age in place
  // and groups re-coalesce as messages slide across the 5-minute window
  // boundary. Past 10m the labels themselves only flip on 5-minute
  // marks, so a 10-second cadence is enough to catch every transition
  // visibly; the tab-hidden bail keeps it from running off-screen.
  setInterval(() => {
    if (document.hidden) return;
    refreshTimestamps();
  }, 10000);

  // Pin the chat screen to the actual visual viewport height so iOS
  // Safari keeps the input bar flush with the top of the keyboard
  // instead of letting the page scroll below it. dvh handles most
  // browsers, but visualViewport is more reliable when the keyboard
  // toggles.
  //
  // iOS fires a burst of resize + scroll events on visualViewport as
  // the keyboard slides up or down — dozens per second. rAF-coalesce
  // them so we do at most one layout-and-rescroll pass per frame, and
  // skip writes that would be no-ops. This is the single biggest lever
  // for making the keyboard open/close feel snappy.
  if (window.visualViewport) {
    const vv = window.visualViewport;
    let pinRaf = 0;
    const pin = () => {
      if (pinRaf) return;
      pinRaf = requestAnimationFrame(() => {
        pinRaf = 0;
        // If the user was reading "now" before the viewport resized
        // (e.g. the mobile keyboard just opened), keep them pinned to
        // the bottom afterwards. Otherwise shrinking #messages leaves
        // their scrollTop unchanged, which pushes the newest messages
        // behind the input pill.
        const wasNearBottom = messagesDiv.scrollHeight -
          messagesDiv.scrollTop - messagesDiv.clientHeight < 80;
        const targetH = vv.height + 'px';
        if (chatScreen.style.height !== targetH) {
          chatScreen.style.height = targetH;
        }
        // Counter iOS's auto-scroll when the keyboard opens on input
        // focus: the window can still scroll despite overflow:hidden on
        // html/body during the focus transition, so force it back to
        // the top. Guard on scrollY so we don't hit the scrollTo path
        // every frame once we're already at 0.
        if (window.scrollY !== 0) window.scrollTo(0, 0);
        if (wasNearBottom) {
          // behavior: 'auto' bypasses the CSS scroll-behavior: smooth
          // on #messages. A smooth scroll here would chase the bottom
          // every frame of the keyboard animation and always trail it,
          // which is exactly what the stutter looked like.
          messagesDiv.scrollTo({ top: messagesDiv.scrollHeight, behavior: 'auto' });
        }
      });
    };
    vv.addEventListener('resize', pin);
    vv.addEventListener('scroll', pin);
    pin();
  }
  // Belt-and-suspenders for iOS: when the message input gains focus,
  // snap the window back to the top after the browser's auto-scroll,
  // and re-pin the message list to the bottom so the newest message
  // sits just above the input pill instead of behind it.
  msgInput.addEventListener('focus', () => {
    setTimeout(() => {
      window.scrollTo(0, 0);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }, 0);
  });

  // --- Boot ---
  loadVersion();
  checkAuth();
})();
</script>
</body>
</html>`;
