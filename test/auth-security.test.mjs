import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { unstable_dev } from 'wrangler';

let worker;
let baseUrl;
let persistTo;

before(async () => {
  persistTo = await mkdtemp(path.join(os.tmpdir(), 'shoutbox-test-'));
  worker = await unstable_dev('src/index.js', {
    config: 'wrangler.toml',
    envFiles: [],
    local: true,
    logLevel: 'error',
    persistTo,
    vars: {
      BASE_URL: '',
      SECRET: 'test-secret',
    },
    experimental: {
      disableExperimentalWarning: true,
      testMode: true,
    },
  });
  baseUrl = `http://${worker.address}:${worker.port}`;
});

after(async () => {
  await worker?.stop();
  if (persistTo) {
    await rm(persistTo, { recursive: true, force: true });
  }
});

function uniqueUsername() {
  return `user${Math.random().toString(36).slice(2, 10)}`;
}

async function api(url, { cookie, json, ...init } = {}) {
  const headers = new Headers(init.headers || {});
  if (cookie) headers.set('Cookie', cookie);
  if (json !== undefined) {
    headers.set('Content-Type', 'application/json');
    init.body = JSON.stringify(json);
  }
  return fetch(baseUrl + url, { redirect: 'manual', ...init, headers });
}

test('passkey start flows require local user verification', async () => {
  const regRes = await api('/auth/webauthn/register/start', {
    method: 'POST',
    json: { displayName: uniqueUsername() },
  });
  assert.equal(regRes.status, 200);
  const regData = await regRes.json();
  assert.equal(regData.options.authenticatorSelection.userVerification, 'required');

  const authRes = await api('/auth/webauthn/auth/start', {
    method: 'POST',
  });
  assert.equal(authRes.status, 200);
  const authData = await authRes.json();
  assert.equal(authData.options.userVerification, 'required');
});

test('QR pairing mints a token, SVG, and rejects status claims without a session', async () => {
  const startRes = await api('/auth/qr/start', { method: 'POST' });
  assert.equal(startRes.status, 200);
  const startData = await startRes.json();
  assert.ok(startData.token && typeof startData.token === 'string', 'expected token string');
  assert.ok(/^<svg/.test(startData.qrSvg), 'expected SVG QR markup');
  assert.ok(startData.url.includes('/p?t=' + startData.token), 'expected pair URL with token');
  assert.equal(typeof startData.expiresInSec, 'number');

  const statusRes = await api('/auth/qr/status?t=' + encodeURIComponent(startData.token));
  assert.equal(statusRes.status, 200);
  const statusData = await statusRes.json();
  assert.equal(statusData.status, 'pending');

  const expiredRes = await api('/auth/qr/status?t=' + encodeURIComponent('bogus'));
  const expiredData = await expiredRes.json();
  assert.equal(expiredData.status, 'expired');

  const claimRes = await api('/auth/qr/claim', {
    method: 'POST',
    json: { token: startData.token },
  });
  assert.equal(claimRes.status, 401, 'claim without session must 401');
});

test('the /p pairing page renders with the expected CSP', async () => {
  const res = await api('/p?t=' + encodeURIComponent('any'));
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /text\/html/);
  const csp = res.headers.get('content-security-policy') || '';
  assert.ok(csp.includes("frame-ancestors 'none'"), 'CSP must deny framing');
  assert.ok(csp.includes("default-src 'self'"), 'CSP must default to self');
});

test('removed email endpoints return 404', async () => {
  for (const url of ['/auth/send', '/auth/verify', '/auth/verify-code', '/auth/email/send', '/auth/email/verify', '/auth/email/remove']) {
    const res = await api(url, { method: url.endsWith('/verify') ? 'GET' : 'POST' });
    assert.equal(res.status, 404, `${url} must be removed`);
  }
});
