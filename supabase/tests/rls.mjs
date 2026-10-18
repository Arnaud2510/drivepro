// RLS & RPC checks of the migration on an in-process PostgreSQL (PGlite), with minimal stubs
// for Supabase's auth and storage schemas. Run: npm run test:db
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'fs';
const db = new PGlite();
const stub = `
create schema auth; create schema storage;
create table auth.users (id uuid primary key, email text, created_at timestamptz default now(), last_sign_in_at timestamptz, banned_until timestamptz);
create table auth.refresh_tokens (id bigserial primary key, user_id varchar(255), token text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('sub', auth.uid(), 'email', (select email from auth.users where id = auth.uid())) $$;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
create role anon; create role authenticated;
grant usage on schema public, auth, storage to authenticated;
`;
await db.exec(stub);
const dir = new URL('../migrations/', import.meta.url);
for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) await db.exec(readFileSync(new URL(f, dir), 'utf8'));
await db.exec(`grant all on all tables in schema public to authenticated; grant usage on all sequences in schema public to authenticated; grant all on storage.objects to authenticated;`);
const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b', M = '00000000-0000-0000-0000-00000000000c';
await db.exec(`insert into auth.users values ('${A}','a@x'),('${B}','b@x'),('${M}','m@x')`);
const as = async (uid, sql, params) => {
  await db.exec(`reset role; set request.uid = '${uid}'; set role authenticated;`);
  try { return (await db.query(sql, params)).rows; } catch (e) { return 'ERR: ' + e.message; } finally { await db.exec('reset role'); }
};
let failed = 0;
const ok = (c, m) => { if (!c) failed++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
ok((await db.query('select count(*)::int n from user_profiles')).rows[0].n === 3, 'profiles auto-created on signup');
const V = '11111111-1111-1111-1111-111111111111';
await as(A, `insert into vehicles (id,user_id,name,type,fuel_type) values ('${V}','${A}','Car','car','diesel')`);
const P = '22222222-2222-2222-2222-222222222222';
await as(A, `insert into user_platforms (id,user_id,name,commission_pct) values ('${P}','${A}','Uber',25)`);
const sid = '33333333-3333-3333-3333-333333333333';
const r = await as(A, `select save_work_session($1::jsonb, $2::jsonb)`, [
  JSON.stringify({ id: sid, user_id: A, date: '2026-10-15', start_time: '08:00', end_time: '19:00', break_minutes: 60, vehicle_id: V, odo_start: 10000, odo_end: 10200, personal_km: 0, energy_mode: 'estimated', notes: '' }),
  JSON.stringify([{ id: '44444444-4444-4444-4444-444444444444', platform_id: P, label: '', gross_known: true, gross: 15000, commission: 3000, other_fees: 0, bonus: 0, bonus_included: true, tips: 0, tips_included: true, net_paid: null, payout_status: 'received', user_id: B }]),
]);
ok(typeof r !== 'string', 'save_work_session works: ' + JSON.stringify(r).slice(0, 120));
const again = await as(A, `select save_work_session($1::jsonb, '[]'::jsonb)`, [JSON.stringify({ id: sid, user_id: A, date: '2026-10-15', break_minutes: 30, personal_km: 0, energy_mode: 'actual', notes: 'upd' })]);
ok(typeof again !== 'string', 'save_work_session update');
ok((await as(A, `select energy_mode from work_sessions`))[0]?.energy_mode === 'actual', 'session updated');
await as(A, `select save_work_session($1::jsonb, $2::jsonb)`, [JSON.stringify({ id: sid, user_id: A, date: '2026-10-15', break_minutes: 30, personal_km: 0, energy_mode: 'estimated', notes: '' }), JSON.stringify([{ id: '44444444-4444-4444-4444-444444444444', platform_id: P, gross_known: true, gross: 15000, commission: 3000, other_fees: 0, bonus: 0, bonus_included: true, tips: 0, tips_included: true, payout_status: 'received', user_id: B }])]);
ok((await as(A, `select user_id from platform_earnings`))[0]?.user_id === A, 'earning user_id forced to caller (spoofed B ignored)');
ok((await as(B, `select * from vehicles`)).length === 0, 'B cannot read A vehicles');
ok((await as(B, `select * from work_sessions`)).length === 0, 'B cannot read A sessions');
ok((await as(B, `select * from platform_earnings`)).length === 0, 'B cannot read A earnings');
ok(String(await as(B, `insert into vehicles (user_id,name,type,fuel_type) values ('${A}','x','car','diesel')`)).startsWith('ERR'), 'B cannot insert for A');
await as(B, `update vehicles set name='hacked' where id='${V}'`);
ok((await as(A, `select name from vehicles`))[0].name === 'Car', 'B cannot update A vehicle');
ok(String(await as(B, `select save_work_session($1::jsonb,'[]')`, [JSON.stringify({ id: sid, user_id: A, date: '2026-10-16', personal_km: 0, energy_mode: 'estimated', notes: '' })])).startsWith('ERR'), 'B cannot save session as A');
ok(String(await as(A, `insert into subscriptions (user_id, plan_id, status) values ('${A}','pro','active')`)).startsWith('ERR'), 'user cannot grant themselves a subscription');
ok(String(await as(A, `insert into platform_admins values ('${A}')`)).startsWith('ERR'), 'user cannot make themselves admin');
ok(String(await as(A, `select admin_stats()`)).includes('forbidden'), 'admin_stats forbidden for non-admin');
// fleet
const O = '55555555-5555-5555-5555-555555555555';
await as(M, `insert into organizations (id,name,created_by) values ('${O}','Fleet','${M}')`);
ok(typeof (await as(M, `insert into organization_members (organization_id,user_id,role) values ('${O}','${M}','owner')`)) !== 'string', 'creator becomes owner');
await as(M, `insert into organization_members (organization_id,user_id,role) values ('${O}','${A}','driver')`);
ok((await as(M, `select * from work_sessions`)).length === 0, 'manager cannot see driver without consent');
ok(String(await as(A, `update organization_members set role='manager' where user_id='${A}'`)).startsWith('ERR'), 'driver cannot promote self');
ok(String(await as(M, `update organization_members set shares_data=true where user_id='${A}'`)).startsWith('ERR'), 'manager cannot consent on behalf of driver');
await as(A, `update organization_members set shares_data=true where user_id='${A}'`);
ok((await as(M, `select * from work_sessions`)).length === 1, 'manager sees driver after consent');
ok(String(await as(M, `update work_sessions set notes='x'`)) !== 'ERR' && (await as(A, `select notes from work_sessions`))[0].notes !== 'x', 'manager read-only');
ok((await as(B, `select * from work_sessions`)).length === 0, 'outsider still blocked');

// ---------- fleet invitations
const D = '00000000-0000-0000-0000-00000000000d';
await db.exec(`insert into auth.users (id, email) values ('${D}','d@x')`);
ok(String(await as(B, `insert into organization_invites (organization_id, email) values ('${O}','d@x')`)).startsWith('ERR'), 'non-manager cannot invite');
const inv = await as(M, `insert into organization_invites (organization_id, email) values ('${O}','d@x') returning token`);
ok(Array.isArray(inv) && inv.length === 1, 'manager invites by e-mail');
const tok = inv[0]?.token;
ok((await as(B, `select * from organization_invites`)).length === 0, 'invites invisible to others');
ok((await as(B, `select invite_preview($1)`, [tok]))[0].invite_preview.status === 'wrong_email', 'preview flags wrong e-mail');
ok(String(await as(B, `select accept_invite($1, true)`, [tok])).startsWith('ERR'), 'another user cannot use the invitation');
ok((await as(D, `select invite_preview($1)`, [tok]))[0].invite_preview.organization === 'Fleet', 'invitee previews organisation');
ok(typeof (await as(D, `select accept_invite($1, false)`, [tok])) !== 'string', 'invitee accepts without sharing');
ok(String(await as(D, `select accept_invite($1, false)`, [tok])).startsWith('ERR'), 'invitation is single-use');
const roster = await as(M, `select * from org_roster('${O}')`);
ok(Array.isArray(roster) && roster.some((r) => r.email === 'd@x' && r.shares_data === false), 'roster lists member and consent state');
ok(String(await as(D, `select * from org_roster('${O}')`)).startsWith('ERR'), 'drivers cannot list the roster');
await as(D, `insert into vehicles (user_id,name,type,fuel_type) values ('${D}','Moto','moto','petrol')`);
ok((await as(M, `select * from vehicles where user_id='${D}'`)).length === 0, 'no access before consent');
await as(D, `update organization_members set shares_data=true where user_id='${D}'`);
ok((await as(M, `select * from vehicles where user_id='${D}'`)).length === 1, 'access after consent');
ok((await as(M, `select consent_at from organization_members where user_id='${D}'`))[0]?.consent_at != null, 'consent is timestamped');
await as(D, `update organization_members set shares_data=false where user_id='${D}'`);
ok((await as(M, `select * from vehicles where user_id='${D}'`)).length === 0, 'consent can be withdrawn');
await as(D, `delete from organization_members where user_id='${D}'`);
ok((await db.query(`select count(*)::int n from organization_members where user_id='${D}'`)).rows[0].n === 0, 'driver can leave');
await as(M, `delete from organization_members where user_id='${M}'`);
ok((await db.query(`select count(*)::int n from organization_members where user_id='${M}'`)).rows[0].n === 1, 'owner cannot leave');

await db.exec(`insert into organization_members (organization_id,user_id,role) values ('${O}','${B}','manager')`);
ok(String(await as(B, `update organization_members set role='manager' where user_id='${M}'`)).startsWith('ERR') || (await db.query(`select role from organization_members where user_id='${M}'`)).rows[0].role === 'owner', 'a manager cannot demote the owner');
await db.exec(`delete from organization_members where user_id='${B}'`);

// ---------- notifications
ok(typeof (await as(B, `insert into notifications (user_id, kind, dedupe_key) values ('${B}','weekly','weekly:2026-10-05')`)) !== 'string', 'user stores own notification');
ok(String(await as(B, `insert into notifications (user_id, kind, dedupe_key) values ('${B}','weekly','weekly:2026-10-05')`)).startsWith('ERR'), 'dedupe key is unique per user');
ok(String(await as(B, `insert into notifications (user_id, kind) values ('${D}','x')`)).startsWith('ERR'), 'cannot notify someone else');
ok((await as(D, `select * from notifications`)).length === 0, 'notifications are private');
ok(typeof (await as(B, `insert into push_subscriptions (endpoint, p256dh, auth) values ('https://push/x','k','a')`)) !== 'string', 'user registers a push device');
ok((await as(D, `select * from push_subscriptions`)).length === 0, 'push devices are private');

// ---------- administration
for (const f of ['admin_list_users()', `admin_set_role('${B}', true)`, `admin_set_suspended('${B}', true)`, `admin_set_plan('${B}', 'pro')`, 'admin_list_organizations()'])
  ok(String(await as(B, `select * from ${f}`)).includes('forbidden'), `${f.split('(')[0]} forbidden for non-admin`);
ok(String(await as(B, `insert into countries values ('XX','africa','XOF','Africa/Lome','fr',true)`)).startsWith('ERR'), 'non-admin cannot edit reference data');
await db.exec(`insert into platform_admins values ('${M}')`);
const users = await as(M, `select * from admin_list_users('b@', 10, 0)`);
ok(Array.isArray(users) && users.length === 1 && users[0].email === 'b@x' && !('gross' in users[0]), 'admin lists users without financial data');
ok(typeof (await as(M, `insert into countries values ('TG','africa','XOF','Africa/Lome','fr',true)`)) !== 'string', 'admin adds a country');
ok(String(await as(M, `insert into fuel_prices (country_code, fuel_type, price, currency, valid_from) values ('TG','petrol',680,'XOF','2026-10-01')`)).startsWith('ERR'), 'fuel price requires a source');
ok(typeof (await as(M, `insert into fuel_prices (country_code, fuel_type, price, currency, valid_from, source) values ('TG','petrol',680,'XOF','2026-10-01','Arrêté interministériel')`)) !== 'string', 'sourced fuel price accepted');
ok(String(await as(M, `insert into platform_countries values ('uber','TG',25,null,null)`)).startsWith('ERR'), 'indicative commission requires source and date');
ok((await db.query(`select count(*)::int n from audit_logs where target_table in ('countries','fuel_prices') and actor='${M}'`)).rows[0].n === 2, 'reference changes are audited');
await as(M, `select admin_set_suspended('${B}', true)`);
ok((await db.query(`select banned_until from auth.users where id='${B}'`)).rows[0].banned_until !== null, 'admin suspends a user');
ok(String(await as(M, `select admin_set_suspended('${M}', true)`)).includes('yourself'), 'admin cannot suspend themselves');
ok(String(await as(M, `select admin_set_role('${M}', false)`)).includes('own admin'), 'admin cannot drop own role');
await as(M, `select admin_set_plan('${B}', 'pro')`);
ok((await db.query(`select plan_id from subscriptions where user_id='${B}' and status='active'`)).rows[0]?.plan_id === 'pro', 'admin grants a plan manually');
await as(B, `insert into expenses (user_id, date, category, amount) values ('${B}', '2026-10-15', 'food', 900)`);
ok((await as(M, `select * from expenses where user_id='${B}'`)).length === 0, 'admin role grants no access to a driver\'s finances');
ok((await as(M, `select admin_stats()`))[0].admin_stats.users >= 4, 'admin_stats aggregates');

await as(A, `select delete_my_account()`);
ok((await db.query(`select count(*)::int n from vehicles where user_id='${A}'`)).rows[0].n === 0 && (await db.query(`select count(*)::int n from auth.users where id='${A}'`)).rows[0].n === 0, 'delete_my_account erases everything');

console.log(failed ? `${failed} check(s) failed` : 'All database checks passed');
process.exit(failed ? 1 : 0);
