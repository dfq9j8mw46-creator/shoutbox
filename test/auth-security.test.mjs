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
      DEV_MODE: 'true',
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

function uniqueEmail(label) {
  return `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
}

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

function sidFromResponse(res) {
  const setCookie = res.headers.get('set-cookie');
  assert.ok(setCookie, 'expected Set-Cookie header');
  const match = /(?:^|,\s*)sid=([^;]+)/.exec(setCookie);
  assert.ok(match, `expected sid cookie in ${setCookie}`);
  return `sid=${decodeURIComponent(match[1])}`;
}

async function loginViaEmail(email) {
  const sendRes = await api('/auth/send', {
    method: 'POST',
    json: { email },
  });
  assert.equal(sendRes.status, 200);
  const sendData = await sendRes.json();
  assert.ok(sendData.dev_link, 'expected dev login link in test mode');

  const devLink = new URL(sendData.dev_link);
  const verifyRes = await fetch(baseUrl + devLink.pathname + devLink.search, { redirect: 'manual' });
  assert.ok([301, 302].includes(verifyRes.status), `unexpected verify status ${verifyRes.status}`);
  return sidFromResponse(verifyRes);
}

async function authMe(cookie) {
  const res = await api('/auth/me', { cookie });
  assert.equal(res.status, 200);
  return res.json();
}

async function completeEmailChange(cookie, email) {
  const sendRes = await api('/auth/email/send', {
    method: 'POST',
    cookie,
    json: { email },
  });
  assert.equal(sendRes.status, 200);
  const sendData = await sendRes.json();
  assert.ok(sendData.dev_link, 'expected dev verification link in test mode');

  const devLink = new URL(sendData.dev_link);
  const verifyRes = await fetch(baseUrl + devLink.pathname + devLink.search, { redirect: 'manual' });
  assert.ok([301, 302].includes(verifyRes.status), `unexpected verify status ${verifyRes.status}`);
}

test('profile saves preserve linked email and rotating email revokes the old account alias', async () => {
  const oldEmail = uniqueEmail('old');
  const newEmail = uniqueEmail('new');
  const cookie = await loginViaEmail(oldEmail);

  const initial = await authMe(cookie);
  const renamed = uniqueUsername();

  const saveRes = await api('/auth/profile', {
    method: 'POST',
    cookie,
    json: {
      username: renamed,
      color: initial.color,
    },
  });
  assert.equal(saveRes.status, 200);

  const afterSave = await authMe(cookie);
  assert.equal(afterSave.email, oldEmail);
  assert.equal(afterSave.username, renamed);

  await completeEmailChange(cookie, newEmail);

  const afterChange = await authMe(cookie);
  assert.equal(afterChange.email, newEmail);
  assert.equal(afterChange.username, renamed);

  const currentEmailCookie = await loginViaEmail(newEmail);
  const currentEmailAccount = await authMe(currentEmailCookie);
  assert.equal(currentEmailAccount.username, renamed);
  assert.equal(currentEmailAccount.created_at, initial.created_at);

  const oldEmailCookie = await loginViaEmail(oldEmail);
  const oldEmailAccount = await authMe(oldEmailCookie);
  assert.notEqual(oldEmailAccount.username, renamed);
  assert.notEqual(oldEmailAccount.created_at, initial.created_at);
});

test('account deletion removes active email aliases instead of resurrecting the deleted account', async () => {
  const oldEmail = uniqueEmail('delete-old');
  const newEmail = uniqueEmail('delete-new');
  const cookie = await loginViaEmail(oldEmail);

  const initial = await authMe(cookie);
  await completeEmailChange(cookie, newEmail);
  const current = await authMe(cookie);
  assert.equal(current.email, newEmail);

  const deleteRes = await api('/auth/delete', {
    method: 'POST',
    cookie,
  });
  assert.equal(deleteRes.status, 200);

  const recreatedCookie = await loginViaEmail(newEmail);
  const recreated = await authMe(recreatedCookie);
  assert.equal(recreated.email, newEmail);
  assert.notEqual(recreated.created_at, initial.created_at);
});

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
