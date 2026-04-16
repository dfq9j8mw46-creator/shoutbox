import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';

const {
  CLOUDFLARE_API_TOKEN,
  CLOUDFLARE_ACCOUNT_ID,
  ATTESTED_HASH,
  SCRIPT_NAME = 'shoutbox',
} = process.env;

const url = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${SCRIPT_NAME}`;

async function fetchLive() {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}` },
  });
  if (!res.ok) throw new Error(`CF API ${res.status}: ${await res.text()}`);

  const contentType = res.headers.get('content-type') || '';
  const buf = Buffer.from(await res.arrayBuffer());

  const m = /boundary="?([^";]+)"?/.exec(contentType);
  if (!m) throw new Error(`Unexpected content-type: ${contentType}`);
  const boundary = Buffer.from('--' + m[1]);

  const positions = [];
  let i = 0;
  while ((i = buf.indexOf(boundary, i)) !== -1) {
    positions.push(i);
    i += boundary.length;
  }
  if (positions.length < 2) throw new Error('No multipart parts found');

  const partStart = positions[0] + boundary.length;
  const partEnd = positions[1];
  const part = buf.subarray(partStart, partEnd);

  const sep = Buffer.from('\r\n\r\n');
  const bs = part.indexOf(sep);
  if (bs === -1) throw new Error('No header/body split in first part');
  let body = part.subarray(bs + sep.length);
  if (body.length >= 2 && body[body.length - 2] === 0x0d && body[body.length - 1] === 0x0a) {
    body = body.subarray(0, body.length - 2);
  }
  return body;
}

let body;
let lastErr;
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    body = await fetchLive();
    break;
  } catch (e) {
    lastErr = e;
    console.error(`attempt ${attempt} failed: ${e.message}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
}
if (!body) {
  console.error('Could not fetch live script:', lastErr?.message);
  process.exit(1);
}

const liveHash = createHash('sha256').update(body).digest('hex');

mkdirSync('dist', { recursive: true });
writeFileSync('dist/live-script.js', body);

console.log('Live deployed bundle  sha256:', liveHash);
console.log('Attested build bundle sha256:', ATTESTED_HASH);

if (liveHash !== ATTESTED_HASH) {
  console.error('\nFAIL: live deployed bundle does not match attested build output.');
  process.exit(1);
}
console.log('\nOK: live deployed bundle matches attested build.');
