// End-to-end test — see e2e/README.md (needs `supabase start` and `npm run dev`).
// End-to-end test of supabase/functions/daily-reminders against the local stack.
import https from 'node:https';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import crypto from 'node:crypto';
import { execSync, spawn } from 'node:child_process';
import webpush from 'web-push';
import ece from 'http_ece';
const S = new URL('./screenshots/', import.meta.url).pathname;
import { mkdirSync } from 'node:fs';
mkdirSync(S, { recursive: true });
const sql = (q) => execSync(`psql ${process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'} -Atc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const results = []; const ok = (c, m) => results.push((c ? 'PASS ' : 'FAIL ') + m);
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const jwt = (payload) => {
  const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), p = b64u(JSON.stringify(payload));
  return `${h}.${p}.${crypto.createHmac('sha256', 'super-secret-jwt-token-with-at-least-32-characters-long').update(`${h}.${p}`).digest('base64url')}`;
};

// Device keys (what a browser's PushManager would generate)
const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
const authSecret = crypto.randomBytes(16);
const received = [];
// Throwaway self-signed certificate for the fake push service (web-push always uses HTTPS).
const tmp = mkdtempSync(join(tmpdir(), 'drivepro-push-'));
execSync(`openssl req -x509 -newkey rsa:2048 -nodes -keyout ${tmp}/key.pem -out ${tmp}/cert.pem -days 1 -subj /CN=127.0.0.1 -addext subjectAltName=IP:127.0.0.1`, { stdio: 'ignore' });
const server = https.createServer({ key: readFileSync(`${tmp}/key.pem`), cert: readFileSync(`${tmp}/cert.pem`) }, (req, res) => {
  const chunks = []; req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    if (req.url === '/push/gone') { res.writeHead(410); return res.end(); }
    received.push({ url: req.url, headers: req.headers, body: Buffer.concat(chunks) });
    res.writeHead(201); res.end();
  });
}).listen(9911);

const uid = sql(`select id from auth.users where email='awa@test.local'`);
const tz = 'Europe/Paris';
const now = new Date(Date.now() - 10 * 60000);
const hhmm = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
const localToday = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
sql(`update user_profiles set timezone='${tz}', reminder_time='${hhmm}', notification_prefs = notification_prefs - 'dailyReminder' where id='${uid}'`);
sql(`delete from work_sessions where user_id='${uid}' and date='${localToday}'`);
sql(`delete from notifications where dedupe_key like 'push:%'`);
sql(`delete from push_subscriptions`);
sql(`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ('${uid}','https://127.0.0.1:9911/push/awa','${b64u(ecdh.getPublicKey())}','${b64u(authSecret)}'), ('${uid}','https://127.0.0.1:9911/push/gone','${b64u(ecdh.getPublicKey())}','${b64u(authSecret)}')`);

const vapid = webpush.generateVAPIDKeys();
const env = {
  ...process.env, SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_SERVICE_ROLE_KEY: jwt({ role: 'service_role', iss: 'supabase-local', exp: 2000000000 }),
  VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey, VAPID_SUBJECT: 'mailto:test@example.com', CRON_SECRET: 'cron-test-secret',
  NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost',
};
const fn = spawn(process.env.DENO_BIN || 'deno', ['run', '-A', '--unsafely-ignore-certificate-errors=127.0.0.1', '--config', new URL('../supabase/functions/daily-reminders/deno.json', import.meta.url).pathname, new URL('../supabase/functions/daily-reminders/index.ts', import.meta.url).pathname], { env });
let log = ''; fn.stdout.on('data', (d) => (log += d)); fn.stderr.on('data', (d) => (log += d));
for (let i = 0; i < 120 && !/Listening/.test(log); i++) await new Promise((r) => setTimeout(r, 1000));
const call = (secret) => fetch('http://127.0.0.1:8000', { method: 'POST', headers: { Authorization: `Bearer ${secret}` } });

ok((await call('wrong')).status === 403, 'rejects calls without the cron secret');
const r1 = await (await call('cron-test-secret')).json();
ok(r1.sent === 1 && r1.removed === 1, `first run: sent=${r1.sent} removed=${r1.removed}`);
ok(received.length === 1 && received[0].headers.authorization?.startsWith('vapid t='), 'push request signed with VAPID');
const clear = ece.decrypt(received[0]?.body ?? Buffer.alloc(0), { version: 'aes128gcm', privateKey: ecdh, authSecret: b64u(authSecret) });
const msg = JSON.parse(clear.toString());
ok(msg.title === 'Ma journée' && msg.url === '/app/day', 'payload decrypts to the localised reminder: ' + JSON.stringify(msg));
ok(sql(`select count(*) from push_subscriptions where endpoint like '%gone'`) === '0', 'expired device (410) removed');
ok(sql(`select count(*) from notifications where dedupe_key='push:dailyReminder:${localToday}'`) === '1', 'reminder recorded with dedupe key');
const r2 = await (await call('cron-test-secret')).json();
ok(r2.sent === 0 && received.length === 1, 'second run the same day sends nothing');
sql(`delete from notifications where dedupe_key like 'push:%'`);
sql(`insert into work_sessions (user_id, date) values ('${uid}','${localToday}')`);
const r3 = await (await call('cron-test-secret')).json();
ok(r3.sent === 0, 'no reminder once the day is entered');
console.log(results.join('\n'));
if (!/Listening/.test(log) || results.some((r) => r.startsWith('FAIL'))) console.log('DENO LOG:', log.slice(0, 1500));
fn.kill(); server.close();
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
