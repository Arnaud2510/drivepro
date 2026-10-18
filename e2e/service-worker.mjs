// End-to-end test — see e2e/README.md (needs `supabase start` and `npm run dev`).
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await b.newContext({ permissions: ['notifications'] });
const p = await ctx.newPage();
await p.goto((process.env.APP_URL || 'http://localhost:5173') + '/');
const regId = await p.evaluate(async () => {
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  return reg.scope;
});
const cdp = await ctx.newCDPSession(p);
await cdp.send('ServiceWorker.enable');
const regs = [];
cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => regs.push(...e.registrations));
await p.waitForTimeout(1000);
const reg = regs.find((r) => r.scopeURL === regId);
await cdp.send('ServiceWorker.deliverPushMessage', { origin: process.env.APP_URL || 'http://localhost:5173', registrationId: reg.registrationId, data: JSON.stringify({ title: 'Ma journée', body: 'Rappel test', url: '/app/day' }) });
await p.waitForTimeout(1000);
const shown = await p.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => ({ title: n.title, body: n.body, data: n.data, tag: n.tag })));
console.log(JSON.stringify(shown));
console.log(shown.length === 1 && shown[0].title === 'Ma journée' && shown[0].data.url === '/app/day' ? 'PASS service worker shows the push notification' : 'FAIL');
await b.close();
