// End-to-end test — see e2e/README.md (needs `supabase start` and `npm run dev`).
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
const S = new URL('./screenshots/', import.meta.url).pathname;
import { mkdirSync } from 'node:fs';
mkdirSync(S, { recursive: true });
const APP = process.env.APP_URL || 'http://localhost:5173';
const sql = (q) => execSync(`psql ${process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'} -Atc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errors = [], results = [];
const ok = (c, m) => results.push((c ? 'PASS ' : 'FAIL ') + m);
async function login(email, width = 1280) {
  const ctx = await b.newContext({ viewport: { width, height: 900 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await ctx.addInitScript(() => { if (!localStorage.getItem('drivepro:lang')) localStorage.setItem('drivepro:lang', 'fr'); });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${email}: ${e.message}`));
  p.on('dialog', (d) => d.accept());
  p.on('response', async (r) => { if (r.status() >= 400 && r.url().includes('54321')) errors.push(`${email} HTTP ${r.status()} ${r.url().split('?')[0]} ${(await r.text().catch(() => '')).slice(0, 300)}`); });
  await p.goto(APP + '/login');
  await p.getByLabel('E-mail').fill(email);
  await p.getByLabel('Mot de passe').fill('motdepasse123');
  await p.getByRole('button', { name: 'Connexion' }).click();
  return p;
}

// Non-admin cannot see or use the console
const a = await login('awa@test.local', 390);
await a.waitForURL('**/app');
await a.goto(APP + '/app/more');
ok(!(await a.getByText('Administration').isVisible()), 'admin entry hidden for drivers');
await a.goto(APP + '/app/admin');
ok(await a.getByText(/Accès refusé/).waitFor({ timeout: 5000 }).then(() => true, () => false), 'driver gets access denied on /app/admin');

// Promote the manager server-side (the only way to create the first admin)
sql(`insert into platform_admins select id from auth.users where email='manager@test.local'`);
const m = await login('manager@test.local');
await m.waitForURL('**/app');
await m.getByRole('link', { name: 'Administration' }).click();
await m.getByText('Comptes par pays').waitFor();
let txt = await m.locator('main').innerText();
ok(/COMPTES\s*\n?\s*3/i.test(txt), 'overview counts 3 accounts');
await m.screenshot({ path: `${S}/e2e-admin-overview.png`, fullPage: true });

// Reference data: publish a sourced fuel price
await m.getByRole('tab', { name: 'Référentiels' }).click();
await m.getByLabel('Table').selectOption('fuel_prices');
await m.getByRole('button', { name: 'Ajouter' }).click();
await m.getByLabel('price *').fill('1,789');
await m.getByRole('button', { name: 'Enregistrer' }).click();
ok(await m.getByText(/obligatoire/).isVisible(), 'required fields enforced in the editor');
await m.getByLabel('country_code *').fill('FR');
await m.getByLabel('fuel_type *').selectOption('petrol');
await m.getByLabel('currency *').fill('EUR');
await m.getByLabel('valid_from *').fill('2026-10-01');
await m.getByLabel('source *').fill('Prix moyen relevé (test)');
await m.getByRole('button', { name: 'Enregistrer' }).click();
await m.getByRole('cell', { name: 'Prix moyen relevé (test)' }).waitFor();
ok(sql(`select price from fuel_prices where country_code='FR'`) === '1.7890', 'fuel price stored with 4 decimals');

// Translation override
await m.getByRole('tab', { name: 'Traductions' }).click();
await m.getByLabel('Rechercher une clé ou un texte').fill('dashboard.profit');
await m.getByRole('button', { name: /^dashboard\.profit —/ }).click();
await m.getByLabel(/Texte personnalisé/).fill('Bénéfice réel');
await m.getByRole('button', { name: 'Enregistrer' }).click();
await m.getByText(/1 texte personnalisé/).waitFor();
ok(true, 'translation override saved');

// Audit log
await m.getByRole('tab', { name: 'Journal' }).click();
await m.getByRole('cell', { name: 'fuel_prices' }).first().waitFor();
txt = await m.locator('main').innerText();
ok(txt.includes('fuel_prices') && txt.includes('translations_overrides'), 'audit log records reference changes');

// Users: suspend Bruno
await m.getByRole('tab', { name: 'Utilisateurs' }).click();
await m.getByText('bruno@test.local').waitFor();
await m.getByRole('row', { name: /bruno@test.local/ }).getByRole('button', { name: 'Suspendre' }).click();
await m.getByRole('row', { name: /bruno@test.local/ }).getByText('Suspendu').waitFor();
await m.getByRole('row', { name: /awa@test.local/ }).getByLabel('Plan').selectOption('pro');
await m.waitForTimeout(500);
ok(sql(`select plan_id from subscriptions s join auth.users u on u.id=s.user_id where u.email='awa@test.local' and status='active'`) === 'pro', 'admin grants Pro plan');
await m.screenshot({ path: `${S}/e2e-admin-users.png`, fullPage: true });
const bp = await login('bruno@test.local', 390);
await bp.waitForTimeout(1500);
ok(bp.url().includes('/login') && (await bp.getByText(/Ce compte est suspendu/).isVisible()), 'suspended user cannot sign in and is told why');
await m.getByRole('row', { name: /bruno@test.local/ }).getByRole('button', { name: 'Réactiver' }).click();
await m.waitForTimeout(500);
ok(sql(`select banned_until is null from auth.users where email='bruno@test.local'`) === 't', 'admin reactivates user');

// Driver sees the override and the indicative price (fresh load picks up server catalog)
await a.goto(APP + '/app');
await a.waitForTimeout(1200);
ok((await a.locator('main').innerText()).toUpperCase().includes('BÉNÉFICE RÉEL'), 'override visible to drivers after reload');
await a.goto(APP + '/app/vehicles');
await a.getByRole('button', { name: 'Modifier' }).first().click();
await a.getByText(/Prix indicatif publié : 1.789 EUR\/L/).waitFor();
await a.getByRole('button', { name: 'Utiliser ce prix' }).click();
ok((await a.getByLabel(/Prix du carburant/).inputValue()).replace(',', '.') === '1.789', 'driver applies indicative price on request only');
await a.screenshot({ path: `${S}/e2e-indicative.png`, fullPage: true });
await a.getByRole('button', { name: 'Annuler' }).click();

// Notifications: a day last week produces a weekly summary, read state persists
const d = new Date(); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow - 5);
const lastWeek = d.toISOString().slice(0, 10);
await a.goto(`${APP}/app/day/${lastWeek}`);
await a.getByLabel(/Chiffre d'affaires de la journée/).fill('120');
await a.getByRole('group', { name: 'Commission de la plateforme' }).getByLabel(/Montant/).fill('24');
await a.getByRole('button', { name: 'Terminer ma journée' }).click();
await a.getByText('Journée enregistrée').waitFor();
await a.goto(APP + '/app/notifications');
await a.getByText('Résumé hebdomadaire').first().waitFor();
txt = await a.locator('main').innerText();
ok(/Semaine du .* bénéfice \+.* sur 1 jour travaillé\./.test(txt) && !/\(0 h\)/.test(txt), 'weekly summary generated: ' + (txt.match(/Semaine du[^\n]*/)?.[0] ?? ''));
ok(/pas encore configurées sur ce serveur/.test(txt), 'push state honest when VAPID key is missing');
await a.screenshot({ path: `${S}/e2e-notifications.png`, fullPage: true });
await a.getByRole('button', { name: 'Tout marquer comme lu' }).click();
await a.waitForFunction(() => ![...document.querySelectorAll('button')].some((b) => b.textContent === 'Marquer comme lu'));
await a.waitForTimeout(800);
await a.reload();
await a.getByText('Résumé hebdomadaire').first().waitFor();
await a.waitForTimeout(1500);
const left = await a.locator('main li').evaluateAll((els) => els.filter((e) => e.innerText.includes('Marquer comme lu')).map((e) => e.innerText.replace(/\n+/g, ' | ')));
ok(left.length === 0, 'read state persisted server-side ' + JSON.stringify(left));
ok(Number(sql(`select count(*) from notifications n join auth.users u on u.id=n.user_id where u.email='awa@test.local' and read_at is not null`)) >= 1, 'notifications stored with read_at');

// Pagination: more than 1000 rows still all counted
const uid = sql(`select id from auth.users where email='awa@test.local'`);
const today = new Date().toISOString().slice(0, 10);
sql(`insert into expenses (user_id, date, category, amount) select '${uid}', '${today}', 'misc', 100 from generate_series(1,2500)`);
await a.goto(APP + '/app/reports');
await a.getByText('Synthèse').waitFor();
txt = await a.locator('main').innerText();
ok(/Dépenses variables\s*\n?\s*2\s?5\d\d,\d\d/.test(txt.replace(/ | /g, ' ')), 'all 2500 expenses loaded despite the 1000-row API cap: ' + (txt.replace(/ | /g, ' ').match(/Dépenses variables\s*\n?\s*[^\n]*/)?.[0] ?? '').replace(/\n/g, ' '));

console.log(results.join('\n'));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no browser errors');
await b.close();
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
