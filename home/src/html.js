export const HOME_HTML = `<!doctype html>
<html lang="en" data-theme="dark" data-density="spacious">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>rootsuite</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<style>
  :root {
    --background: #f4f4f5;
    --foreground: #1e293b;
    --bg-card: rgba(255, 255, 255, 0.85);
    --bg-glass: rgba(255, 255, 255, 0.75);
    --border-glass: rgba(0, 0, 0, 0.08);
    --shadow-color: rgba(15, 23, 42, 0.06);
    --shadow-strong: rgba(15, 23, 42, 0.1);
    --text-muted: #64748b;
    --text-faint: #94a3b8;
    --row-alt: rgba(0, 0, 0, 0.02);
    --accent: #2563eb;
    --accent-light: rgba(37, 99, 235, 0.1);
    --accent-mark: rgba(37, 99, 235, 0.25);

    --app-cap: #9333ea;
    --app-cap-soft: rgba(147, 51, 234, 0.12);
    --app-box: #2563eb;
    --app-box-soft: rgba(37, 99, 235, 0.12);
    --app-fix: #0f766e;
    --app-fix-soft: rgba(15, 118, 110, 0.1);
    --app-bot: #c2410c;
    --app-bot-soft: rgba(194, 65, 12, 0.1);

    --radius-card: 20px;
    --radius-chip: 999px;

    --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace;

    --gap: 1.5rem;
    --content-width: 64rem;
  }

  html[data-theme="dark"] {
    --background: #000000;
    --foreground: #f4f4f5;
    --bg-card: rgba(24, 24, 27, 0.7);
    --bg-glass: rgba(20, 20, 22, 0.6);
    --border-glass: rgba(255, 255, 255, 0.08);
    --shadow-color: rgba(0, 0, 0, 0.5);
    --shadow-strong: rgba(0, 0, 0, 0.7);
    --text-muted: #a1a1aa;
    --text-faint: #71717a;
    --row-alt: rgba(255, 255, 255, 0.04);
  }

  html[data-density="spacious"] { --gap: 2.25rem; }
  html[data-density="dense"]    { --gap: 1rem; }

  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--background);
    color: var(--foreground);
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    font-size: 16px;
    line-height: 1.5;
  }

  ::selection { background: var(--accent-mark); }

  a { color: inherit; text-decoration: none; }

  /* Ambient sparse star field bg */
  .bg-grid {
    position: fixed; inset: 0; z-index: -1;
    pointer-events: none;
    overflow: hidden;
  }
  .bg-grid::before,
  .bg-grid::after,
  .bg-grid > .bg-stars-twinkle {
    content: "";
    position: absolute;
    inset: -10% -10%;
    background-repeat: repeat;
    mask-image: radial-gradient(ellipse 80% 75% at 50% 40%, black 30%, transparent 95%);
    -webkit-mask-image: radial-gradient(ellipse 80% 75% at 50% 40%, black 30%, transparent 95%);
    will-change: transform;
  }
  .bg-grid::before {
    background-size: 320px 320px;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320' viewBox='0 0 320 320'><g fill='%23ffffff'><circle cx='23' cy='47' r='0.6' opacity='0.55'/><circle cx='89' cy='18' r='0.5' opacity='0.4'/><circle cx='145' cy='72' r='0.7' opacity='0.6'/><circle cx='201' cy='33' r='0.5' opacity='0.35'/><circle cx='258' cy='91' r='0.6' opacity='0.5'/><circle cx='301' cy='54' r='0.4' opacity='0.3'/><circle cx='41' cy='129' r='0.5' opacity='0.45'/><circle cx='112' cy='157' r='0.7' opacity='0.65'/><circle cx='176' cy='141' r='0.5' opacity='0.4'/><circle cx='237' cy='183' r='0.6' opacity='0.55'/><circle cx='283' cy='164' r='0.5' opacity='0.4'/><circle cx='67' cy='213' r='0.7' opacity='0.6'/><circle cx='128' cy='241' r='0.5' opacity='0.4'/><circle cx='193' cy='227' r='0.6' opacity='0.55'/><circle cx='251' cy='269' r='0.5' opacity='0.45'/><circle cx='16' cy='288' r='0.6' opacity='0.5'/><circle cx='95' cy='299' r='0.5' opacity='0.4'/><circle cx='304' cy='247' r='0.6' opacity='0.5'/></g></svg>");
    animation: star-drift-a 140s linear infinite;
  }
  .bg-grid::after {
    background-size: 540px 540px;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='540' height='540' viewBox='0 0 540 540'><g fill='%23ffffff'><circle cx='58' cy='92' r='1.1' opacity='0.85'/><circle cx='187' cy='43' r='0.9' opacity='0.7'/><circle cx='341' cy='118' r='1.2' opacity='0.9'/><circle cx='472' cy='71' r='0.8' opacity='0.6'/><circle cx='94' cy='237' r='1.0' opacity='0.8'/><circle cx='251' cy='289' r='1.3' opacity='0.95'/><circle cx='398' cy='214' r='0.9' opacity='0.7'/><circle cx='502' cy='311' r='1.0' opacity='0.8'/><circle cx='143' cy='398' r='1.1' opacity='0.85'/><circle cx='303' cy='447' r='0.9' opacity='0.7'/><circle cx='429' cy='481' r='1.2' opacity='0.9'/><circle cx='23' cy='476' r='0.8' opacity='0.6'/></g></svg>");
    animation: star-drift-b 240s linear infinite;
  }
  .bg-grid > .bg-stars-twinkle {
    background-size: 720px 720px;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='720' height='720' viewBox='0 0 720 720'><g fill='%23ffffff'><circle cx='112' cy='168' r='1.6'/><circle cx='389' cy='84' r='1.4'/><circle cx='611' cy='247' r='1.7'/><circle cx='167' cy='483' r='1.5'/><circle cx='504' cy='571' r='1.6'/><circle cx='82' cy='641' r='1.3'/><circle cx='663' cy='429' r='1.5'/><circle cx='297' cy='358' r='1.4'/></g></svg>");
    animation: star-twinkle 6s ease-in-out infinite alternate;
  }
  html[data-theme="light"] .bg-grid::before {
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320' viewBox='0 0 320 320'><g fill='%23000000'><circle cx='23' cy='47' r='0.6' opacity='0.4'/><circle cx='89' cy='18' r='0.5' opacity='0.3'/><circle cx='145' cy='72' r='0.7' opacity='0.45'/><circle cx='201' cy='33' r='0.5' opacity='0.25'/><circle cx='258' cy='91' r='0.6' opacity='0.35'/><circle cx='301' cy='54' r='0.4' opacity='0.22'/><circle cx='41' cy='129' r='0.5' opacity='0.32'/><circle cx='112' cy='157' r='0.7' opacity='0.45'/><circle cx='176' cy='141' r='0.5' opacity='0.3'/><circle cx='237' cy='183' r='0.6' opacity='0.38'/><circle cx='283' cy='164' r='0.5' opacity='0.3'/><circle cx='67' cy='213' r='0.7' opacity='0.42'/><circle cx='128' cy='241' r='0.5' opacity='0.3'/><circle cx='193' cy='227' r='0.6' opacity='0.38'/><circle cx='251' cy='269' r='0.5' opacity='0.32'/><circle cx='16' cy='288' r='0.6' opacity='0.36'/><circle cx='95' cy='299' r='0.5' opacity='0.3'/><circle cx='304' cy='247' r='0.6' opacity='0.36'/></g></svg>");
  }
  html[data-theme="light"] .bg-grid::after {
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='540' height='540' viewBox='0 0 540 540'><g fill='%23000000'><circle cx='58' cy='92' r='1.1' opacity='0.6'/><circle cx='187' cy='43' r='0.9' opacity='0.5'/><circle cx='341' cy='118' r='1.2' opacity='0.65'/><circle cx='472' cy='71' r='0.8' opacity='0.45'/><circle cx='94' cy='237' r='1.0' opacity='0.55'/><circle cx='251' cy='289' r='1.3' opacity='0.7'/><circle cx='398' cy='214' r='0.9' opacity='0.5'/><circle cx='502' cy='311' r='1.0' opacity='0.55'/><circle cx='143' cy='398' r='1.1' opacity='0.6'/><circle cx='303' cy='447' r='0.9' opacity='0.5'/><circle cx='429' cy='481' r='1.2' opacity='0.65'/><circle cx='23' cy='476' r='0.8' opacity='0.45'/></g></svg>");
  }
  html[data-theme="light"] .bg-grid > .bg-stars-twinkle {
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='720' height='720' viewBox='0 0 720 720'><g fill='%23000000'><circle cx='112' cy='168' r='1.6'/><circle cx='389' cy='84' r='1.4'/><circle cx='611' cy='247' r='1.7'/><circle cx='167' cy='483' r='1.5'/><circle cx='504' cy='571' r='1.6'/><circle cx='82' cy='641' r='1.3'/><circle cx='663' cy='429' r='1.5'/><circle cx='297' cy='358' r='1.4'/></g></svg>");
  }
  @keyframes star-drift-a {
    0%   { transform: translate3d(0, 0, 0); }
    100% { transform: translate3d(-320px, -160px, 0); }
  }
  @keyframes star-drift-b {
    0%   { transform: translate3d(0, 0, 0); }
    100% { transform: translate3d(540px, 270px, 0); }
  }
  @keyframes star-twinkle {
    0%   { opacity: 0.4; }
    50%  { opacity: 1; }
    100% { opacity: 0.55; }
  }

  /* Top nav */
  .topnav {
    position: fixed; top: 0; left: 0; right: 0; z-index: 40;
    display: flex; align-items: center; justify-content: space-between;
    padding: 18px 24px;
    background: transparent;
    transition: background 200ms ease, backdrop-filter 200ms ease, border-color 200ms ease;
    border-bottom: 1px solid transparent;
  }
  .topnav.scrolled {
    background: color-mix(in oklab, var(--background) 80%, transparent);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border-color: var(--border-glass);
  }

  .brand {
    display: inline-flex; align-items: center; gap: 10px;
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 500;
    letter-spacing: -0.01em;
  }
  .brand-mark {
    width: 20px; height: 20px;
    display: grid; place-items: center;
    border-radius: 6px;
    background: var(--foreground);
    color: var(--background);
    font-weight: 700;
    font-size: 11px;
    font-family: var(--font-mono);
  }
  .brand strong { font-weight: 600; }

  .btn {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 8px 14px;
    border-radius: var(--radius-chip);
    font-size: 13px;
    font-weight: 500;
    border: 1px solid var(--border-glass);
    background: var(--bg-card);
    color: var(--foreground);
    cursor: pointer;
    transition: transform 140ms ease, box-shadow 140ms ease, background 140ms ease;
  }
  .btn:hover { transform: translateY(-1px); box-shadow: 0 6px 18px -8px var(--shadow-strong); }

  .btn-primary {
    background: var(--foreground);
    color: var(--background);
    border-color: var(--foreground);
  }
  .btn-primary:hover { box-shadow: 0 10px 28px -10px color-mix(in oklab, var(--foreground) 60%, transparent); }

  .btn-kbd {
    font-family: var(--font-mono);
    font-size: 10px;
    padding: 2px 5px;
    border-radius: 4px;
    background: color-mix(in oklab, var(--background) 22%, transparent);
    color: color-mix(in oklab, var(--background) 80%, var(--foreground));
    opacity: 0.9;
  }

  /* Layout */
  .shell {
    max-width: var(--content-width);
    margin: 0 auto;
    padding: 0 24px;
  }

  /* App cards */
  .section {
    padding: clamp(32px, 6vh, 64px) 0;
  }
  .apps {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--gap);
  }
  @media (max-width: 720px) {
    .apps { grid-template-columns: 1fr; }
  }

  .app-card {
    position: relative;
    display: flex; flex-direction: column;
    overflow: hidden;
    border-radius: var(--radius-card);
    background: var(--bg-card);
    border: 1px solid var(--border-glass);
    box-shadow: 0 4px 24px -12px var(--shadow-color);
    transition: transform 280ms cubic-bezier(0.22,1,0.36,1),
                box-shadow 280ms ease,
                border-color 200ms ease;
  }
  .app-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 24px 40px -20px var(--shadow-strong);
    border-color: color-mix(in oklab, var(--app-color, var(--accent)) 30%, var(--border-glass));
  }

  .app-anim {
    position: relative;
    height: 260px;
    overflow: hidden;
    isolation: isolate;
    border-bottom: 1px solid var(--border-glass);
    background: var(--app-color-bg, var(--bg-glass));
  }

  .app-body {
    padding: 20px 22px 22px;
    display: flex; flex-direction: column; gap: 8px;
  }
  .app-name {
    font-size: 18px;
    font-weight: 600;
    letter-spacing: -0.01em;
    margin: 0;
    display: inline-flex; align-items: center; gap: 10px;
  }
  .app-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--app-color, var(--accent));
    box-shadow: 0 0 0 3px color-mix(in oklab, var(--app-color, var(--accent)) 20%, transparent);
  }
  .app-desc {
    font-size: 14px;
    color: var(--text-muted);
    margin: 0;
    max-width: 42ch;
  }
  .app-foot {
    margin-top: 10px;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-muted);
  }

  /* Rootcap animation: screenshot tool in use */
  .cap-scene {
    position: absolute; inset: 0;
    background:
      radial-gradient(140% 100% at 70% 10%, color-mix(in oklab, var(--app-cap) 14%, transparent), transparent 60%),
      linear-gradient(180deg, color-mix(in oklab, var(--app-cap) 4%, transparent), transparent 40%);
    overflow: hidden;
  }
  .cap-desktop {
    position: absolute; inset: 18px;
    border-radius: 10px;
    background: linear-gradient(180deg, rgba(250,250,250,0.98), rgba(244,244,245,0.95));
    border: 1px solid var(--border-glass);
    box-shadow: 0 8px 24px -12px var(--shadow-color);
    overflow: hidden;
  }
  html[data-theme="dark"] .cap-desktop {
    background: linear-gradient(180deg, rgba(39,39,42,0.96), rgba(24,24,27,0.9));
  }
  .cap-menubar {
    position: absolute; top: 0; left: 0; right: 0; height: 16px;
    background: color-mix(in oklab, var(--foreground) 5%, transparent);
    border-bottom: 1px solid var(--border-glass);
    display: flex; align-items: center; gap: 6px;
    padding: 0 8px;
  }
  .cap-menubar i {
    display: block; height: 4px; border-radius: 2px;
    background: color-mix(in oklab, var(--foreground) 18%, transparent);
  }
  .cap-menubar i:nth-child(1) { width: 14px; }
  .cap-menubar i:nth-child(2) { width: 22px; }
  .cap-menubar i:nth-child(3) { width: 18px; }
  .cap-menubar i:nth-child(4) { width: 16px; margin-left: auto; }

  .cap-window {
    position: absolute;
    left: 8%; top: 16%;
    width: 78%; height: 74%;
    border-radius: 6px;
    background: var(--bg-card);
    border: 1px solid var(--border-glass);
    box-shadow: 0 6px 16px -10px var(--shadow-color);
    overflow: hidden;
  }
  .cap-window::before {
    content: "";
    position: absolute; top: 0; left: 0; right: 0; height: 14px;
    background: color-mix(in oklab, var(--foreground) 4%, transparent);
    border-bottom: 1px solid var(--border-glass);
  }
  .cap-window::after {
    content: "";
    position: absolute; top: 4px; left: 6px;
    width: 6px; height: 6px; border-radius: 50%;
    background: color-mix(in oklab, var(--foreground) 20%, transparent);
    box-shadow:
      10px 0 0 color-mix(in oklab, var(--foreground) 20%, transparent),
      20px 0 0 color-mix(in oklab, var(--foreground) 20%, transparent);
  }
  .cap-lines {
    position: absolute;
    left: 10px; right: 10px; top: 22px;
    display: flex; flex-direction: column; gap: 6px;
  }
  .cap-lines i {
    display: block;
    height: 6px; border-radius: 2px;
    background: color-mix(in oklab, var(--foreground) 10%, transparent);
  }
  .cap-lines i.accent { background: color-mix(in oklab, var(--app-cap) 45%, transparent); }
  .cap-lines i:nth-child(1) { width: 58%; }
  .cap-lines i:nth-child(2) { width: 86%; }
  .cap-lines i:nth-child(3) { width: 74%; }
  .cap-lines i:nth-child(4) { width: 80%; }
  .cap-lines i:nth-child(5) { width: 62%; }
  .cap-lines i:nth-child(6) { width: 72%; }

  .cap-dim {
    position: absolute; inset: 0;
    background: color-mix(in oklab, #000 45%, transparent);
    opacity: 0;
    animation: cap-dim 5.8s ease-in-out infinite;
    pointer-events: none;
  }
  @keyframes cap-dim {
    0%, 8%    { opacity: 0; }
    14%, 64%  { opacity: 0.45; }
    72%       { opacity: 0.15; }
    78%, 100% { opacity: 0; }
  }

  .cap-marquee {
    position: absolute;
    left: 18%; top: 28%;
    width: 0; height: 0;
    border: 1.5px dashed var(--app-cap);
    background: transparent;
    animation: cap-marquee 5.8s cubic-bezier(0.45, 0.05, 0.35, 1) infinite;
    pointer-events: none;
    z-index: 3;
  }
  .cap-handle {
    position: absolute;
    width: 6px; height: 6px;
    background: var(--app-cap);
    border: 1px solid #fff;
    border-radius: 1px;
    opacity: 0;
    animation: cap-handle 5.8s ease-in-out infinite;
  }
  .cap-handle.tl { top: -4px; left: -4px; }
  .cap-handle.tr { top: -4px; right: -4px; }
  .cap-handle.bl { bottom: -4px; left: -4px; }
  .cap-handle.br { bottom: -4px; right: -4px; }
  @keyframes cap-handle {
    0%, 58%   { opacity: 0; }
    62%, 72%  { opacity: 1; }
    78%, 100% { opacity: 0; }
  }

  .cap-dims {
    position: absolute;
    bottom: -22px; right: 0;
    font-family: var(--font-mono);
    font-size: 10px; font-weight: 600;
    color: #fff;
    background: var(--app-cap);
    padding: 2px 6px;
    border-radius: 3px;
    white-space: nowrap;
    opacity: 0;
    animation: cap-dims 5.8s ease-in-out infinite;
  }
  @keyframes cap-dims {
    0%, 10%   { opacity: 0; }
    16%, 70%  { opacity: 1; }
    76%, 100% { opacity: 0; }
  }

  .cap-cursor {
    position: absolute;
    width: 18px; height: 18px;
    left: 18%; top: 28%;
    animation: cap-cursor 5.8s cubic-bezier(0.45, 0.05, 0.35, 1) infinite;
    pointer-events: none;
    z-index: 5;
    filter: drop-shadow(0 2px 3px rgba(0,0,0,0.4));
  }
  .cap-cursor svg { width: 100%; height: 100%; display: block; }
  @keyframes cap-marquee {
    0%, 8%    { width: 0;   height: 0;   left: 18%; top: 28%; opacity: 0; }
    12%       { width: 0;   height: 0;   opacity: 1; }
    54%       { width: 50%; height: 40%; opacity: 1; }
    72%       { width: 50%; height: 40%; opacity: 1; }
    78%       { width: 50%; height: 40%; opacity: 0; }
    100%      { width: 50%; height: 40%; opacity: 0; }
  }
  @keyframes cap-cursor {
    0%, 6%    { left: 14%; top: 22%; opacity: 0; }
    10%       { left: 18%; top: 28%; opacity: 1; }
    54%       { left: 68%; top: 68%; opacity: 1; }
    72%       { left: 68%; top: 68%; opacity: 1; }
    78%       { left: 68%; top: 68%; opacity: 0; }
    100%      { left: 68%; top: 68%; opacity: 0; }
  }

  .cap-flash {
    position: absolute; inset: 0;
    background: #fff;
    opacity: 0;
    animation: cap-flash 5.8s ease-out infinite;
    pointer-events: none;
    z-index: 6;
  }
  @keyframes cap-flash {
    0%, 72% { opacity: 0; }
    74%     { opacity: 0.85; }
    80%     { opacity: 0; }
    100%    { opacity: 0; }
  }

  .cap-thumb {
    position: absolute;
    right: 14px; bottom: 14px;
    width: 72px; height: 52px;
    border-radius: 5px;
    background:
      linear-gradient(135deg, color-mix(in oklab, var(--app-cap) 40%, white), color-mix(in oklab, var(--app-cap) 70%, #fff));
    border: 1px solid #fff;
    box-shadow: 0 6px 16px -6px var(--shadow-strong);
    opacity: 0;
    transform: translate(-60px, -40px) scale(0.5);
    animation: cap-thumb 5.8s cubic-bezier(0.22, 1, 0.36, 1) infinite;
    z-index: 7;
  }
  @keyframes cap-thumb {
    0%, 74%   { opacity: 0; transform: translate(-60px, -40px) scale(0.5); }
    80%       { opacity: 1; transform: translate(0, 0) scale(1); }
    92%       { opacity: 1; transform: translate(0, 0) scale(1); }
    98%, 100% { opacity: 0; transform: translate(8px, 4px) scale(0.92); }
  }

  /* Rootbox animation: simple chat box */
  .box-scene {
    position: absolute; inset: 0;
    background:
      radial-gradient(140% 100% at 30% 100%, color-mix(in oklab, var(--app-box) 14%, transparent), transparent 60%),
      linear-gradient(180deg, color-mix(in oklab, var(--app-box) 3%, transparent), transparent 40%);
    padding: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .box-chat {
    position: relative;
    width: 100%;
    max-width: 320px;
    background: var(--bg-card);
    border: 1px solid var(--border-glass);
    border-radius: 12px;
    box-shadow: 0 8px 24px -12px var(--shadow-color);
    overflow: hidden;
    display: flex; flex-direction: column;
  }
  .box-header {
    display: flex; align-items: center; gap: 8px;
    padding: 9px 12px;
    border-bottom: 1px solid var(--border-glass);
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-muted);
  }
  .box-header .hash {
    color: var(--app-box);
    font-weight: 700;
  }
  .box-header .live {
    margin-left: auto;
    width: 6px; height: 6px; border-radius: 50%;
    background: #10b981;
    box-shadow: 0 0 0 3px color-mix(in oklab, #10b981 20%, transparent);
    animation: box-live 1.8s ease-in-out infinite;
  }
  @keyframes box-live {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.5; }
  }
  .box-thread {
    padding: 12px;
    display: flex; flex-direction: column; gap: 8px;
    min-height: 120px;
  }
  .box-msg {
    display: flex; gap: 7px; align-items: flex-end;
    opacity: 0;
    animation: box-msg-in 7.2s ease-out infinite;
  }
  .box-msg .avatar {
    width: 22px; height: 22px;
    border-radius: 6px;
    flex-shrink: 0;
    color: #fff;
    display: grid; place-items: center;
    font-family: var(--font-mono);
    font-size: 10px; font-weight: 700;
  }
  .box-msg .bubble {
    background: color-mix(in oklab, var(--foreground) 5%, transparent);
    padding: 6px 10px;
    border-radius: 10px;
    border-bottom-left-radius: 4px;
    font-size: 12.5px;
    color: var(--foreground);
    max-width: 220px;
  }
  .box-msg.me { flex-direction: row-reverse; }
  .box-msg.me .bubble {
    background: var(--app-box);
    color: #fff;
    border-bottom-left-radius: 10px;
    border-bottom-right-radius: 4px;
  }
  .box-msg-1 { animation-delay: 0.4s; } .box-msg-1 .avatar { background: #0ea5e9; }
  .box-msg-2 { animation-delay: 2.2s; } .box-msg-2 .avatar { background: #f59e0b; }
  .box-msg-3 { animation-delay: 4.6s; } .box-msg-3 .avatar { background: var(--app-box); }

  @keyframes box-msg-in {
    0%   { opacity: 0; transform: translateY(6px); }
    6%   { opacity: 1; transform: translateY(0); }
    94%  { opacity: 1; transform: translateY(0); }
    100% { opacity: 0; transform: translateY(-4px); }
  }

  .box-composer {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 10px;
    border-top: 1px solid var(--border-glass);
    background: color-mix(in oklab, var(--foreground) 2%, transparent);
  }
  .box-input {
    flex: 1;
    height: 26px;
    border-radius: 8px;
    background: var(--bg-card);
    border: 1px solid var(--border-glass);
    padding: 0 9px;
    display: flex; align-items: center;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-muted);
    overflow: hidden;
  }
  .box-input .typed {
    color: var(--foreground);
    white-space: nowrap;
    overflow: hidden;
    display: inline-block;
    max-width: 0;
    animation: box-type 7.2s steps(1, end) infinite;
  }
  .box-input .caret {
    display: inline-block;
    width: 1px; height: 12px;
    background: var(--app-box);
    margin-left: 1px;
    animation: box-caret 1s steps(1) infinite;
  }
  @keyframes box-caret { 50% { opacity: 0; } }
  @keyframes box-type {
    0%   { max-width: 0; }
    44%  { max-width: 0; }
    46%  { max-width: 0.6ch; }
    48%  { max-width: 1.8ch; }
    50%  { max-width: 3.2ch; }
    52%  { max-width: 4.8ch; }
    54%  { max-width: 6.2ch; }
    56%  { max-width: 7.8ch; }
    58%, 62% { max-width: 9.2ch; }
    64%, 100% { max-width: 0; }
  }
  .box-send {
    width: 26px; height: 26px;
    border-radius: 7px;
    background: var(--app-box);
    display: grid; place-items: center;
    color: #fff;
    flex-shrink: 0;
  }
  .box-send svg { width: 12px; height: 12px; display: block; }

  /* Coming soon */
  .soon {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--gap);
  }
  @media (max-width: 720px) { .soon { grid-template-columns: 1fr; } }
  .soon-card {
    position: relative;
    border-radius: var(--radius-card);
    border: 1px dashed var(--border-glass);
    padding: 22px 22px 20px;
    background: color-mix(in oklab, var(--bg-card) 40%, transparent);
    display: flex; flex-direction: column; gap: 6px;
    min-height: 160px;
  }
  .soon-card::before {
    content: "";
    position: absolute; inset: 0;
    border-radius: var(--radius-card);
    background-image: repeating-linear-gradient(
      -45deg, transparent 0 6px,
      color-mix(in oklab, var(--app-color, var(--text-faint)) 4%, transparent) 6px 7px
    );
    pointer-events: none;
  }
  .soon-head {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 4px;
  }
  .soon-name {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
    letter-spacing: -0.01em;
    display: inline-flex; align-items: center; gap: 10px;
    color: var(--foreground);
  }
  .soon-chip {
    font-family: var(--font-mono);
    font-size: 10px;
    padding: 3px 7px;
    border-radius: var(--radius-chip);
    background: var(--row-alt);
    color: var(--text-muted);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .soon-desc {
    font-size: 13.5px;
    color: var(--text-muted);
    max-width: 38ch;
    margin: 4px 0 0;
    line-height: 1.45;
  }
  .placeholder {
    color: var(--text-faint);
    font-style: italic;
  }

  /* Footer */
  .foot {
    padding: 48px 0 56px;
    display: flex; align-items: center; justify-content: space-between;
    gap: 16px;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-faint);
    border-top: 1px solid var(--border-glass);
    margin-top: 48px;
  }
  .foot a { color: var(--text-muted); }
  .foot a:hover { color: var(--foreground); }
  .foot-links { display: flex; gap: 18px; }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0s !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0s !important;
    }
  }
</style>
</head>
<body>
<div class="bg-grid" aria-hidden><div class="bg-stars-twinkle"></div></div>

<nav class="topnav" id="topnav">
  <a class="brand" href="#">
    <span class="brand-mark">r</span>
    <strong>rootsuite</strong>
  </a>
  <a class="btn btn-primary" href="#signin" id="signin">
    Sign in
    <span class="btn-kbd">\u23CE</span>
  </a>
</nav>

<main class="shell">

  <section class="section" id="apps" style="padding-top: clamp(96px, 14vh, 140px);">
    <div class="apps">

      <a class="app-card" href="https://rooty.org/cap"
         style="--app-color: var(--app-cap); --app-color-bg: var(--app-cap-soft);">
        <div class="app-anim" aria-hidden>
          <div class="cap-scene">
            <div class="cap-desktop">
              <div class="cap-menubar"><i></i><i></i><i></i><i></i></div>
              <div class="cap-window">
                <div class="cap-lines">
                  <i class="accent"></i><i></i><i></i><i></i><i></i><i></i>
                </div>
              </div>
              <div class="cap-dim"></div>
              <div class="cap-marquee">
                <span class="cap-handle tl"></span>
                <span class="cap-handle tr"></span>
                <span class="cap-handle bl"></span>
                <span class="cap-handle br"></span>
                <span class="cap-dims">448 \u00D7 276</span>
              </div>
              <div class="cap-cursor">
                <svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2 1.5 L2 14 L5.5 10.5 L7.8 16 L10 15 L7.8 9.5 L12.5 9.5 Z" fill="#fff" stroke="#111" stroke-width="1" stroke-linejoin="round"/>
                </svg>
              </div>
              <div class="cap-flash"></div>
              <div class="cap-thumb"></div>
            </div>
          </div>
        </div>
        <div class="app-body">
          <h3 class="app-name">
            <span class="app-dot"></span>rootcap
          </h3>
          <p class="app-desc">
            <span class="placeholder">// one-liner for rootcap, screenshot utility, your words.</span>
          </p>
          <div class="app-foot">screenshot utility</div>
        </div>
      </a>

      <a class="app-card" href="https://rooty.org/box"
         style="--app-color: var(--app-box); --app-color-bg: var(--app-box-soft);">
        <div class="app-anim" aria-hidden>
          <div class="box-scene">
            <div class="box-chat">
              <div class="box-header">
                <span class="hash">#</span><span>general</span>
                <span class="live" aria-hidden></span>
              </div>
              <div class="box-thread">
                <div class="box-msg box-msg-1">
                  <div class="avatar">AK</div>
                  <div class="bubble">did the deploy go through?</div>
                </div>
                <div class="box-msg box-msg-2">
                  <div class="avatar">JT</div>
                  <div class="bubble">yep, clean run, no warnings</div>
                </div>
                <div class="box-msg box-msg-3 me">
                  <div class="avatar">me</div>
                  <div class="bubble">nice. shipping.</div>
                </div>
              </div>
              <div class="box-composer">
                <div class="box-input">
                  <span class="typed">shipping it</span><span class="caret"></span>
                </div>
                <div class="box-send" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 12 L20 4 L14 20 L11 13 Z" fill="currentColor"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="app-body">
          <h3 class="app-name">
            <span class="app-dot"></span>rootbox
          </h3>
          <p class="app-desc">
            <span class="placeholder">// one-liner for rootbox, community chat, your words.</span>
          </p>
          <div class="app-foot">community chat</div>
        </div>
      </a>

    </div>
  </section>

  <section class="section" id="soon">
    <div class="soon">
      <div class="soon-card" style="--app-color: var(--app-fix);">
        <div class="soon-head">
          <h3 class="soon-name"><span class="app-dot" style="background: var(--app-fix)"></span>rootfix</h3>
          <span class="soon-chip">soon</span>
        </div>
        <p class="soon-desc"><span class="placeholder">// what rootfix does, one line, your words.</span></p>
      </div>

      <div class="soon-card" style="--app-color: var(--app-bot);">
        <div class="soon-head">
          <h3 class="soon-name"><span class="app-dot" style="background: var(--app-bot)"></span>rootbot</h3>
          <span class="soon-chip">soon</span>
        </div>
        <p class="soon-desc"><span class="placeholder">// what rootbot does, one line, your words.</span></p>
      </div>
    </div>
  </section>

  <footer class="foot">
    <span>\u00A9 rootsuite \u00B7 rooty.org</span>
    <div class="foot-links">
      <a href="#">standards</a>
      <a href="#">status</a>
      <a href="#">github</a>
    </div>
  </footer>

</main>

<script>
  const nav = document.getElementById("topnav");
  const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
</script>
</body>
</html>
`;
