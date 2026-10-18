// RLS & RPC checks of the migration on an in-process PostgreSQL (PGlite), with minimal stubs
// for Supabase's auth and storage schemas. Run: npm run test:db
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
const db = new PGlite();
const stub = `
create schema auth; create schema storage;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
create role anon; create role authenticated;
grant usage on schema public, auth, storage to authenticated;
`;
await db.exec(stub);
await db.exec(readFileSync(new URL('../migrations/20261018000000_init.sql', import.meta.url), 'utf8'));
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
await as(A, `select delete_my_account()`);
ok((await db.query(`select count(*)::int n from vehicles`)).rows[0].n === 0 && (await db.query(`select count(*)::int n from auth.users where id='${A}'`)).rows[0].n === 0, 'delete_my_account erases everything');

console.log(failed ? `${failed} check(s) failed` : 'All database checks passed');
process.exit(failed ? 1 : 0);
