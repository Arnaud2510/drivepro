// End-to-end test — see e2e/README.md (needs `supabase start` and `npm run dev`).
import { chromium } from 'playwright';
const S = new URL('./screenshots/', import.meta.url).pathname;
import { mkdirSync } from 'node:fs';
mkdirSync(S, { recursive: true });
const APP = process.env.APP_URL || 'http://localhost:5173';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errors = [];
const results = [];
const ok = (c, m) => { results.push((c ? 'PASS ' : 'FAIL ') + m); };

async function newUser(name, width = 390) {
  const ctx = await b.newContext({ viewport: { width, height: 900 }, locale: 'fr-FR', timezoneId: 'Europe/Paris', permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.addInitScript(() => { if (!localStorage.getItem('drivepro:lang')) localStorage.setItem('drivepro:lang', 'fr'); });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && !m.text().includes('403') && errors.push(`${name} console: ${m.text()}`));
  p.on('dialog', (d) => d.accept());
  return p;
}
async function signup(p, email) {
  await p.getByRole('link', { name: 'Créer un compte' }).first().click().catch(() => p.goto(APP + '/signup'));
  await p.waitForURL('**/signup');
  await p.getByLabel('E-mail').fill(email);
  await p.getByLabel('Mot de passe').fill('motdepasse123');
  await p.getByRole('checkbox').check();
  await p.getByRole('button', { name: 'Créer un compte' }).first().click();
  await p.waitForURL('**/onboarding');
}
async function onboard(p, name) {
  await p.getByLabel('Nom ou pseudonyme').fill(name);
  for (let i = 0; i < 2; i++) await p.getByRole('button', { name: 'Suivant' }).click();
  await p.getByRole('button', { name: 'Uber', exact: true }).click();
  await p.getByRole('button', { name: 'Suivant' }).click();
  await p.getByLabel('Nom du véhicule').fill(`Voiture ${name}`);
  await p.getByLabel(/Consommation moyenne/).fill('6');
  await p.getByLabel(/Prix du carburant/).fill('1,70');
  await p.getByRole('button', { name: 'Suivant' }).click();
  await p.getByRole('button', { name: 'Terminer' }).click();
}
async function enterDay(p, date, gross) {
  await p.goto(`${APP}/app/day/${date}`);
  await p.getByLabel('Début', { exact: true }).fill('08:00');
  await p.getByLabel('Fin', { exact: true }).fill('18:00');
  await p.getByLabel(/Chiffre d'affaires de la journée/).fill(String(gross));
  await p.getByLabel(/Commission de la plateforme/).fill(String(gross / 5));
  await p.getByRole('button', { name: /Terminer ma journée|Mettre à jour/ }).click();
  await p.getByText('Journée enregistrée').waitFor();
}

// 1. Manager creates a fleet and invites two drivers
const m = await newUser('manager', 1280);
await m.goto(APP + '/login');
await signup(m, 'manager@test.local');
await onboard(m, 'Mamadou');
await m.waitForURL('**/app');
await m.goto(APP + '/app/fleet');
await m.getByLabel('Nom de la flotte').fill('Taxis Lyon');
await m.getByRole('button', { name: 'Créer', exact: true }).click();
await m.getByRole('heading', { name: /Taxis Lyon/ }).waitFor();
ok(true, 'manager creates fleet');
await m.getByRole('radio', { name: 'Chauffeurs et accès' }).click();
const links = {};
for (const email of ['awa@test.local', 'bruno@test.local']) {
  await m.getByLabel('E-mail').fill(email);
  await m.getByRole('button', { name: "Créer l'invitation" }).click();
  const prev = Object.values(links);
  await m.waitForFunction((prev) => { const i = document.querySelector('input[readonly]'); return i && i.value && !prev.includes(i.value); }, prev);
  links[email] = await m.getByLabel("Lien d'invitation").inputValue();
}
ok(Object.values(links).every((l) => l.includes('/app/fleet/join/')) && new Set(Object.values(links)).size === 2, 'two distinct invitation links created');
await m.screenshot({ path: `${S}/e2e-members.png`, fullPage: true });

// 2. Awa opens the link logged out, signs up, onboards, lands on the invitation, shares data
const a = await newUser('awa');
await a.goto(links['awa@test.local']);
await a.waitForURL('**/login');
await signup(a, 'awa@test.local');
await onboard(a, 'Awa');
await a.waitForURL('**/app/fleet/join/**');
ok(true, 'driver returns to the invitation after sign-up and onboarding');
await a.getByText(/Taxis Lyon/).first().waitFor();
await a.getByRole('checkbox').check();
await a.screenshot({ path: `${S}/e2e-join.png`, fullPage: true });
await a.getByRole('button', { name: 'Rejoindre' }).click();
await a.waitForURL('**/app/fleet');
await a.getByText('Flottes dont je fais partie').waitFor();
ok(await a.getByRole('checkbox').isChecked(), 'driver membership shows sharing enabled');
const today = new Date().toISOString().slice(0, 10);
await enterDay(a, today, 150);

// 3. Bruno joins without sharing
const br = await newUser('bruno');
await br.goto(APP + '/signup');
await signup(br, 'bruno@test.local');
await onboard(br, 'Bruno');
await br.waitForURL('**/app');
await br.goto(links['bruno@test.local']);
await br.screenshot({ path: `${S}/e2e-bruno-join.png`, fullPage: true });
await br.getByRole('button', { name: 'Rejoindre' }).click();
await br.waitForURL('**/app/fleet');
await enterDay(br, today, 100);

// wrong account trying Awa's link again
await br.goto(links['awa@test.local']);
ok(await br.getByText(/déjà été utilisée/).isVisible().catch(() => false) || await br.getByText(/déjà été utilisée/).waitFor({ timeout: 4000 }).then(() => true).catch(() => false), 'used invitation is refused');

// 4. Manager dashboard: only Awa's data
await m.goto(APP + '/app/fleet');
await m.getByRole('heading', { name: 'Par chauffeur', exact: true }).waitFor();
let txt = await m.locator('main').innerText();
ok(txt.includes('Awa') && /150,00/.test(txt), 'manager sees consenting driver figures');
ok(!/100,00/.test(txt.split('Par chauffeur')[1] ?? ''), 'non-consenting driver figures hidden');
ok(/1 chauffeur n'a pas autorisé/.test(txt), 'manager told one driver is not sharing');
await m.screenshot({ path: `${S}/e2e-fleet-dashboard.png`, fullPage: true });

// 5. Bruno enables sharing -> manager sees both
await br.goto(APP + '/app/fleet');
await br.getByRole('checkbox').check();
await br.waitForTimeout(800);
await m.reload();
await m.getByRole('heading', { name: 'Par chauffeur', exact: true }).waitFor();
txt = await m.locator('main').innerText();
ok(txt.includes('Bruno') && /250,00/.test(txt), 'after consent, totals include both drivers (250 €)');
await m.screenshot({ path: `${S}/e2e-fleet-dashboard2.png`, fullPage: true });

// 6. Bruno withdraws consent -> back to Awa only
await br.goto(APP + '/app/fleet');
await br.getByRole('checkbox').uncheck();
await br.waitForTimeout(800);
await m.reload();
await m.getByRole('heading', { name: 'Par chauffeur', exact: true }).waitFor();
txt = await m.locator('main').innerText();
ok(!txt.includes('250,00'), 'withdrawn consent removes the driver from totals');

// 7. Manager members tab shows consent states
await m.getByRole('radio', { name: 'Chauffeurs et accès' }).click();
await m.getByText(/2 membres|3 membres/).waitFor();
txt = await m.locator('main').innerText();
ok(/Partage depuis le/.test(txt) && /Non partagé/.test(txt), 'roster shows consent state per driver');

console.log(results.join('\n'));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no browser errors');
await b.close();
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
