import { HOME_HTML } from './html.js';

const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/favicon.svg' || url.pathname === '/favicon.ico') {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
        + '<rect width="32" height="32" rx="8" fill="#000"/>'
        + '<text x="16" y="22" text-anchor="middle" font-family="ui-monospace, Menlo, monospace" font-size="18" font-weight="700" fill="#f4f4f5">r</text>'
        + '</svg>';
      return new Response(svg, {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(HOME_HTML, { headers: HTML_HEADERS });
    }

    return new Response('Not found', { status: 404 });
  },
};
