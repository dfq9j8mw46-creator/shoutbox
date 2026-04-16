# Shoutbox

A lightweight, semi-anonymous web chat that runs on Cloudflare Workers. Think old-school forum shoutbox — one shared room, messages flowing, no bloat.

## Features

- **Magic link auth** — sign in with email, no passwords
- **Custom username & color** — pick your display name and name color
- **100-message buffer** — only the last 100 messages are kept
- **Real-time WebSocket** — instant message delivery via Durable Objects
- **< 100 concurrent users** — designed to be small and fast
- **~7 KB gzipped** — single HTML page, zero frontend dependencies

## Architecture

```
Cloudflare Worker (HTTP routes, auth, static HTML)
  └─ Durable Object "ChatRoom" (WebSocket hub, message storage)
  └─ KV Namespace (sessions, magic link tokens)
```

Everything runs on the edge. No database, no server to manage.

## Setup

### 1. Prerequisites

- [Node.js](https://nodejs.org/) 18+
- A [Cloudflare](https://cloudflare.com) account
- (Optional) A [Resend](https://resend.com) account for sending magic link emails

### 2. Install

```sh
npm install
```

### 3. Create KV namespace

```sh
npx wrangler kv namespace create KV
npx wrangler kv namespace create KV --preview
```

Update `wrangler.toml` with the returned namespace IDs.

### 4. Set secrets

```sh
npx wrangler secret put SECRET        # random string for signing
npx wrangler secret put EMAIL_API_KEY  # Resend API key
npx wrangler secret put EMAIL_FROM     # e.g. chat@yourdomain.com
```

### 5. Configure

Edit `wrangler.toml`:
- Set `BASE_URL` to your deployed Worker URL (e.g. `https://shoutbox.yourname.workers.dev`)

### 6. Deploy

```sh
npm run deploy
```

## Local development

```sh
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your secrets
npm run dev
```

In dev mode without `EMAIL_API_KEY`, the magic link is returned directly in the response — no email needed. Check the browser console or network tab.

## Configuration

| Variable | Description |
|---|---|
| `SECRET` | HMAC key for token signing |
| `EMAIL_API_KEY` | Resend API key (or leave unset for dev mode) |
| `EMAIL_FROM` | Sender email address |
| `BASE_URL` | Public URL of the app |

## License

MIT
