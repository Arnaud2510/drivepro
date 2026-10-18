-- DrivePro — installation complète de la base (toutes les migrations, dans l'ordre).
-- Généré par `npm run db:setup-file` : ne pas modifier à la main.
-- À coller dans Supabase › SQL Editor › New query, puis Run. Une seule fois, sur un projet neuf.
-- ===== supabase/migrations/20261018000000_init.sql =====
-- DrivePro — initial schema
-- Conventions:
--   * monetary amounts: bigint in the minor unit of the owner's profile currency (EUR cents, XOF francs...)
--   * unit prices (per litre / kWh) and rates: numeric
--   * every user-owned row carries user_id and is protected by Row Level Security
--   * reference data is readable by everyone, writable only by platform admins
-- "users" is Supabase's auth.users table.


-- ---------------------------------------------------------------- helpers
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

-- Platform administrators. Writable only with the service role (never from the client).
create table public.platform_admins (
  user_id uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
create policy "admins read self" on public.platform_admins for select using (user_id = auth.uid());

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;

-- ---------------------------------------------------------------- reference data
create table public.currencies (
  code char(3) primary key,
  minor_digits smallint not null check (minor_digits between 0 and 4),
  symbol text not null
);

create table public.countries (
  code char(2) primary key,
  region text not null check (region in ('europe','africa','americas','asia','oceania')),
  currency char(3) not null references public.currencies,
  timezone text not null,
  default_language text not null,
  active boolean not null default true
);

create table public.cities (
  id uuid primary key default gen_random_uuid(),
  country_code char(2) not null references public.countries,
  name text not null,
  timezone text,
  unique (country_code, name)
);

create table public.transport_platforms (
  id text primary key,
  name text not null,
  kind text not null default 'ride_hailing' check (kind in ('ride_hailing','taxi','delivery','other'))
);

-- Where a platform is offered + an optional indicative commission with its source. Never invented.
create table public.platform_countries (
  platform_id text references public.transport_platforms on delete cascade,
  country_code char(2) references public.countries on delete cascade,
  indicative_commission_pct numeric(5,2) check (indicative_commission_pct between 0 and 100),
  source text,
  source_date date,
  primary key (platform_id, country_code),
  check (indicative_commission_pct is null or (source is not null and source_date is not null))
);

create table public.expense_categories (
  id text primary key,
  default_kind text not null check (default_kind in ('daily','occasional')),
  is_energy boolean not null default false,
  sort smallint not null default 0
);

create table public.fuel_prices (
  id uuid primary key default gen_random_uuid(),
  country_code char(2) not null references public.countries,
  city_id uuid references public.cities,
  fuel_type text not null check (fuel_type in ('petrol','diesel','lpg')),
  price numeric(12,4) not null check (price > 0),
  currency char(3) not null references public.currencies,
  valid_from date not null,
  source text not null,
  source_url text,
  created_at timestamptz not null default now()
);
create index on public.fuel_prices (country_code, fuel_type, valid_from desc);

create table public.energy_prices (
  id uuid primary key default gen_random_uuid(),
  country_code char(2) not null references public.countries,
  price_per_kwh numeric(12,4) not null check (price_per_kwh > 0),
  currency char(3) not null references public.currencies,
  tariff text not null default 'public_charging',
  valid_from date not null,
  source text not null,
  source_url text,
  created_at timestamptz not null default now()
);

create table public.subscription_plans (
  id text primary key check (id in ('free','pro','fleet')),
  features jsonb not null default '[]',
  limits jsonb not null default '{}',
  active boolean not null default true
);

create table public.translations_overrides (
  lang text not null,
  key text not null,
  value text not null,
  updated_at timestamptz not null default now(),
  primary key (lang, key)
);

-- reference data: public read, admin write
do $$
declare t text;
begin
  foreach t in array array['currencies','countries','cities','transport_platforms','platform_countries',
    'expense_categories','fuel_prices','energy_prices','subscription_plans','translations_overrides']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "public read" on public.%I for select using (true)', t);
    execute format('create policy "admin write" on public.%I for all using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- organisations (fleets)
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country_code char(2) references public.countries,
  currency char(3) references public.currencies,
  created_by uuid not null references auth.users,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid references public.organizations on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role text not null check (role in ('owner','manager','driver')),
  -- explicit, revocable consent from the driver to share their activity data with managers
  shares_data boolean not null default false,
  consent_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index on public.organization_members (user_id);

create or replace function public.is_org_manager(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members
                 where organization_id = org and user_id = auth.uid() and role in ('owner','manager'))
$$;

-- true when the caller manages a fleet in which `driver` has consented to share data
create or replace function public.can_view_driver(driver uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members d
    join public.organization_members m on m.organization_id = d.organization_id
    where d.user_id = driver and d.shares_data
      and m.user_id = auth.uid() and m.role in ('owner','manager'))
$$;

alter table public.organizations enable row level security;
create policy "members read org" on public.organizations for select
  using (created_by = auth.uid()
         or exists (select 1 from public.organization_members m
                    where m.organization_id = organizations.id and m.user_id = auth.uid()));
create policy "create org" on public.organizations for insert with check (created_by = auth.uid());
create policy "managers update org" on public.organizations for update using (public.is_org_manager(id));

alter table public.organization_members enable row level security;
create policy "read own memberships or managed org" on public.organization_members for select
  using (user_id = auth.uid() or public.is_org_manager(organization_id));
create policy "managers manage members" on public.organization_members for all
  using (public.is_org_manager(organization_id)) with check (public.is_org_manager(organization_id));
-- a driver can toggle their own consent, nothing else
create policy "driver updates own consent" on public.organization_members for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- ...enforced by a trigger so a driver cannot promote themselves
create or replace function public.guard_member_update() returns trigger language plpgsql as $$
begin
  if (new.role, new.organization_id, new.user_id) is distinct from (old.role, old.organization_id, old.user_id)
     and not public.is_org_manager(old.organization_id) then
    raise exception 'only managers can change roles';
  end if;
  if new.shares_data and not old.shares_data then new.consent_at = now(); end if;
  if new.shares_data is distinct from old.shares_data and new.user_id <> auth.uid() then
    raise exception 'only the driver can change their consent';
  end if;
  return new;
end $$;
create trigger trg_guard_member before update on public.organization_members
  for each row execute function public.guard_member_update();
create policy "creator becomes owner" on public.organization_members for insert
  with check (user_id = auth.uid() and role = 'owner'
              and exists (select 1 from public.organizations o where o.id = organization_id and o.created_by = auth.uid()));

-- ---------------------------------------------------------------- user data
create table public.user_profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default '',
  country_code char(2) references public.countries,
  city text not null default '',
  language text not null default 'fr' check (language in ('fr','en','es','pt','de','it')),
  currency char(3) not null default 'EUR' references public.currencies,
  timezone text not null default 'UTC',
  activities text[] not null default '{}',
  daily_goal bigint check (daily_goal >= 0),
  monthly_goal bigint check (monthly_goal >= 0),
  fixed_cost_method text not null default 'calendar_day' check (fixed_cost_method in ('calendar_day','worked_day','separate')),
  planned_work_days smallint not null default 22 check (planned_work_days between 1 and 31),
  default_energy_mode text not null default 'estimated' check (default_energy_mode in ('estimated','actual')),
  tax_provision_pct numeric(5,2) check (tax_provision_pct between 0 and 100),
  tax_note text not null default '',
  notification_prefs jsonb not null default '{}',
  onboarded boolean not null default false,
  privacy_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  organization_id uuid references public.organizations on delete set null,
  name text not null,
  make text not null default '',
  model text not null default '',
  year smallint check (year between 1950 and 2100),
  type text not null check (type in ('car','moto','scooter','van','other')),
  fuel_type text not null check (fuel_type in ('petrol','diesel','lpg','hybrid','electric','other')),
  consumption numeric(6,2) check (consumption >= 0),
  energy_price numeric(12,4) check (energy_price >= 0),
  tank_capacity numeric(6,1),
  odometer numeric(10,1) check (odometer >= 0),
  purchase_price bigint,
  financing text not null default 'owned' check (financing in ('owned','loan','lease','rental','other')),
  maintenance_interval_km integer,
  last_maintenance_km numeric(10,1),
  insurance_expiry date,
  documents_expiry date,
  notes text not null default '',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.vehicles (user_id);

create table public.user_platforms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  catalog_id text references public.transport_platforms,
  commission_pct numeric(5,2) check (commission_pct between 0 and 100),
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.user_platforms (user_id);

create table public.work_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  start_time text check (start_time ~ '^\d{2}:\d{2}$'),
  end_time text check (end_time ~ '^\d{2}:\d{2}$'),
  break_minutes integer not null default 0 check (break_minutes >= 0),
  hours_override numeric(5,2) check (hours_override >= 0 and hours_override <= 24),
  vehicle_id uuid references public.vehicles on delete set null,
  odo_start numeric(10,1),
  odo_end numeric(10,1),
  distance_km numeric(8,1) check (distance_km >= 0),
  personal_km numeric(8,1) not null default 0 check (personal_km >= 0),
  trips integer check (trips >= 0),
  deliveries integer check (deliveries >= 0),
  energy_mode text not null default 'estimated' check (energy_mode in ('estimated','actual')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);
create index on public.work_sessions (user_id, date desc);

create table public.platform_earnings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  work_session_id uuid not null references public.work_sessions on delete cascade,
  platform_id uuid references public.user_platforms on delete set null,
  label text not null default '',
  gross_known boolean not null default true,
  gross bigint check (gross >= 0),
  commission bigint,
  other_fees bigint not null default 0,
  bonus bigint not null default 0,
  bonus_included boolean not null default true,
  tips bigint not null default 0,
  tips_included boolean not null default true,
  net_paid bigint,
  payout_status text not null default 'pending' check (payout_status in ('estimated','pending','received')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (gross_known or net_paid is not null)
);
create index on public.platform_earnings (work_session_id);
create index on public.platform_earnings (user_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  category text not null,
  amount bigint not null check (amount >= 0),
  description text not null default '',
  vehicle_id uuid references public.vehicles on delete set null,
  payment_method text not null default 'cash' check (payment_method in ('cash','card','mobile_money','transfer','other')),
  kind text not null default 'daily' check (kind in ('daily','occasional')),
  receipt_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.expenses (user_id, date desc);

create table public.monthly_fixed_costs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  label text not null,
  category text not null,
  monthly_amount bigint not null check (monthly_amount >= 0),
  vehicle_id uuid references public.vehicles on delete set null,
  start_date date not null,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index on public.monthly_fixed_costs (user_id);

-- Per-vehicle view of fixed charges
create view public.vehicle_costs with (security_invoker = true) as
  select v.id as vehicle_id, v.user_id, f.id as fixed_cost_id, f.label, f.category, f.monthly_amount, f.start_date, f.end_date
  from public.vehicles v join public.monthly_fixed_costs f on f.vehicle_id = v.id;

create table public.financial_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  period text not null check (period in ('day','week','month','year')),
  target bigint not null check (target >= 0),
  starts_on date not null,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- User-configured provision rates. Never pre-filled with a national rate.
create table public.tax_estimates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  year smallint not null,
  rate_pct numeric(5,2) not null check (rate_pct between 0 and 100),
  status_note text not null default '',
  source text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, year)
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  organization_id uuid references public.organizations on delete cascade,
  plan_id text not null references public.subscription_plans,
  status text not null check (status in ('trialing','active','past_due','canceled')),
  provider text,              -- e.g. stripe, cinetpay... set ONLY by a verified server-side webhook
  provider_ref text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (user_id is not null or organization_id is not null)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text not null,
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);

create table public.report_exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  format text not null check (format in ('csv','pdf','xlsx')),
  period_from date not null,
  period_to date not null,
  storage_path text,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor uuid,
  action text not null,
  target_table text,
  target_id text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['organizations','user_profiles','vehicles','user_platforms','work_sessions','platform_earnings',
    'expenses','monthly_fixed_costs','financial_goals','tax_estimates','subscriptions']
  loop
    execute format('create trigger trg_%1$s_updated before update on public.%1$I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- RLS on user data
alter table public.user_profiles enable row level security;
create policy "own profile" on public.user_profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "fleet managers read consenting drivers" on public.user_profiles for select using (public.can_view_driver(id));

do $$
declare t text;
begin
  foreach t in array array['vehicles','user_platforms','work_sessions','platform_earnings','expenses',
    'monthly_fixed_costs','financial_goals','tax_estimates','report_exports']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "owner all" on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
  -- read-only access for fleet managers, limited to drivers who consented
  foreach t in array array['vehicles','work_sessions','platform_earnings','expenses','monthly_fixed_costs']
  loop
    execute format('create policy "fleet read" on public.%I for select using (public.can_view_driver(user_id))', t);
  end loop;
end $$;

-- Earnings must belong to a session of the same user
create or replace function public.check_earning_owner() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.work_sessions s where s.id = new.work_session_id and s.user_id = new.user_id) then
    raise exception 'work_session does not belong to user';
  end if;
  return new;
end $$;
create trigger trg_earning_owner before insert or update on public.platform_earnings
  for each row execute function public.check_earning_owner();

alter table public.subscriptions enable row level security;
create policy "read own subscription" on public.subscriptions for select
  using (user_id = auth.uid() or public.is_org_manager(organization_id));
-- no insert/update policy: subscriptions are written only by the server (service role) after payment verification

alter table public.notifications enable row level security;
create policy "own notifications" on public.notifications for select using (user_id = auth.uid());
create policy "mark read" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.audit_logs enable row level security;
create policy "admins read audit" on public.audit_logs for select using (public.is_admin());
-- Admins see aggregated stats only through dedicated functions, never raw driver finances.

-- ---------------------------------------------------------------- RPCs
-- Atomic save of a day and its earnings. SECURITY INVOKER: RLS applies to every statement.
create or replace function public.save_work_session(p_session jsonb, p_earnings jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare sid uuid := (p_session->>'id')::uuid;
begin
  if (p_session->>'user_id')::uuid is distinct from auth.uid() then raise exception 'forbidden'; end if;
  insert into work_sessions
    select * from jsonb_populate_record(null::work_sessions,
      '{"break_minutes":0,"personal_km":0,"energy_mode":"estimated","notes":""}'::jsonb
      || jsonb_strip_nulls(p_session) || jsonb_build_object('created_at', now(), 'updated_at', now()))
  on conflict (id) do update set
    date = excluded.date, start_time = excluded.start_time, end_time = excluded.end_time,
    break_minutes = excluded.break_minutes, hours_override = excluded.hours_override,
    vehicle_id = excluded.vehicle_id, odo_start = excluded.odo_start, odo_end = excluded.odo_end,
    distance_km = excluded.distance_km, personal_km = excluded.personal_km, trips = excluded.trips,
    deliveries = excluded.deliveries, energy_mode = excluded.energy_mode, notes = excluded.notes;
  delete from platform_earnings where work_session_id = sid;
  insert into platform_earnings
    select * from jsonb_populate_recordset(null::platform_earnings,
      (select coalesce(jsonb_agg('{"label":"","gross_known":true,"other_fees":0,"bonus":0,"bonus_included":true,"tips":0,"tips_included":true,"payout_status":"pending"}'::jsonb
         || jsonb_strip_nulls(e) || jsonb_build_object('work_session_id', sid, 'user_id', auth.uid(),
         'created_at', now(), 'updated_at', now())), '[]') from jsonb_array_elements(p_earnings) e));
  return sid;
end $$;

-- GDPR: erase every row of the caller, then the auth user (cascade).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  insert into audit_logs(actor, action, target_table, target_id) values (uid, 'delete_account', 'auth.users', uid::text);
  delete from storage.objects where bucket_id = 'receipts' and (storage.foldername(name))[1] = uid::text;
  delete from auth.users where id = uid;
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Aggregated, anonymous statistics for administrators (no per-driver finances).
create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'users', (select count(*) from user_profiles),
    'users_by_country', (select coalesce(jsonb_object_agg(country_code, n), '{}') from
        (select country_code, count(*) n from user_profiles group by 1) s),
    'work_sessions_30d', (select count(*) from work_sessions where date > current_date - 30)
  );
end $$;

-- Profile row on signup
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into user_profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- storage (receipts)
insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false) on conflict do nothing;
create policy "own receipts" on storage.objects for all
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------- seed (reference data only, no tariffs)
insert into public.currencies values
  ('EUR',2,'€'),('XOF',0,'F CFA'),('XAF',0,'FCFA'),('GNF',0,'FG'),('USD',2,'$'),('GBP',2,'£'),('CHF',2,'CHF'),('MAD',2,'MAD');

insert into public.countries values
  ('PT','europe','EUR','Europe/Lisbon','pt',true),('FR','europe','EUR','Europe/Paris','fr',true),
  ('DE','europe','EUR','Europe/Berlin','de',true),('BE','europe','EUR','Europe/Brussels','fr',true),
  ('ES','europe','EUR','Europe/Madrid','es',true),('IT','europe','EUR','Europe/Rome','it',true),
  ('CI','africa','XOF','Africa/Abidjan','fr',true),('CM','africa','XAF','Africa/Douala','fr',true),
  ('ML','africa','XOF','Africa/Bamako','fr',true),('BF','africa','XOF','Africa/Ouagadougou','fr',true),
  ('SN','africa','XOF','Africa/Dakar','fr',true),('GN','africa','GNF','Africa/Conakry','fr',true);

insert into public.transport_platforms (id, name, kind) values
  ('uber','Uber','ride_hailing'),('bolt','Bolt','ride_hailing'),('yango','Yango','ride_hailing'),
  ('heetch','Heetch','ride_hailing'),('freenow','FREENOW','ride_hailing'),('cabify','Cabify','ride_hailing'),
  ('gozem','Gozem','ride_hailing'),('uber_eats','Uber Eats','delivery'),('glovo','Glovo','delivery'),
  ('deliveroo','Deliveroo','delivery'),('wolt','Wolt','delivery'),('taxi','Taxi','taxi');

insert into public.expense_categories (id, default_kind, is_energy, sort) values
  ('fuel','daily',true,1),('charging','daily',true,2),('food','daily',false,3),('drinks','daily',false,4),
  ('cleaning','occasional',false,5),('carwash','occasional',false,6),('maintenance','occasional',false,7),
  ('repair','occasional',false,8),('tyres','occasional',false,9),('parking','daily',false,10),
  ('tolls','daily',false,11),('insurance','occasional',false,12),('rental','occasional',false,13),
  ('leasing','occasional',false,14),('phone','occasional',false,15),('admin','occasional',false,16),
  ('platform_fees','occasional',false,17),('misc','daily',false,18);

insert into public.subscription_plans (id, features) values
  ('free','["days","profit","dashboard","history90"]'),
  ('pro','["fullHistory","advancedStats","reports","compare","goals","multiVehicle"]'),
  ('fleet','["multiDriver","fleetVehicles","consolidated","access","fleetKpi"]');

-- ===== supabase/migrations/20261018120000_fleet_notifications_admin.sql =====
-- DrivePro — fleet management, notifications, administration console

-- =============================================================== FLEET
create table public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  email text not null check (email = lower(email) and position('@' in email) > 1),
  role text not null default 'driver' check (role in ('driver','manager')),
  token uuid not null unique default gen_random_uuid(),
  created_by uuid not null references auth.users on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users on delete set null
);
create index on public.organization_invites (organization_id);
alter table public.organization_invites enable row level security;
create policy "managers manage invites" on public.organization_invites for all
  using (public.is_org_manager(organization_id))
  with check (public.is_org_manager(organization_id) and created_by = auth.uid());

-- Managers manage memberships, but an owner row can only disappear with the organisation
-- or the owner's account (cascades bypass RLS).
drop policy "managers manage members" on public.organization_members;
create policy "managers add members" on public.organization_members for insert
  with check (public.is_org_manager(organization_id) and role <> 'owner');
create policy "managers update members" on public.organization_members for update
  using (public.is_org_manager(organization_id)) with check (public.is_org_manager(organization_id) and role <> 'owner');
create policy "managers remove members" on public.organization_members for delete
  using (public.is_org_manager(organization_id) and role <> 'owner');

-- Nobody can change an owner's role; consent stays the driver's own decision.
create or replace function public.guard_member_update() returns trigger language plpgsql as $$
begin
  if old.role = 'owner' and new.role <> 'owner' then raise exception 'the owner role cannot be changed'; end if;
  if (new.role, new.organization_id, new.user_id) is distinct from (old.role, old.organization_id, old.user_id)
     and not public.is_org_manager(old.organization_id) then
    raise exception 'only managers can change roles';
  end if;
  if new.shares_data is distinct from old.shares_data and new.user_id <> auth.uid() then
    raise exception 'only the driver can change their consent';
  end if;
  if new.shares_data and not old.shares_data then new.consent_at = now(); end if;
  return new;
end $$;

-- A member may leave an organisation (an owner must hand over first).
create policy "member leaves" on public.organization_members for delete
  using (user_id = auth.uid() and role <> 'owner');

-- Fleet managers need platform names to compare consenting drivers' platforms.
create policy "fleet read" on public.user_platforms for select using (public.can_view_driver(user_id));

-- What an invitation is about, before accepting it (no data about other members).
create or replace function public.invite_preview(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare i record;
begin
  select inv.*, o.name as org_name into i
  from organization_invites inv join organizations o on o.id = inv.organization_id
  where inv.token = p_token;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  return jsonb_build_object(
    'status', case when i.accepted_at is not null then 'used'
                   when i.expires_at < now() then 'expired'
                   when i.email <> lower(coalesce(auth.jwt()->>'email', '')) then 'wrong_email'
                   else 'valid' end,
    'organization', i.org_name, 'role', i.role, 'email', i.email);
end $$;

-- Joins the organisation. Data sharing is a separate, explicit choice of the driver.
create or replace function public.accept_invite(p_token uuid, p_share boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare i record;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into i from organization_invites where token = p_token for update;
  if not found or i.accepted_at is not null or i.expires_at < now() then raise exception 'invalid invitation'; end if;
  if i.email <> lower(coalesce(auth.jwt()->>'email', '')) then raise exception 'invitation issued for another e-mail'; end if;
  insert into organization_members (organization_id, user_id, role, shares_data, consent_at)
    values (i.organization_id, auth.uid(), i.role, p_share, case when p_share then now() end)
    on conflict (organization_id, user_id) do nothing;
  update organization_invites set accepted_at = now(), accepted_by = auth.uid() where id = i.id;
  insert into audit_logs(actor, action, target_table, target_id, details)
    values (auth.uid(), 'accept_invite', 'organizations', i.organization_id::text, jsonb_build_object('shares_data', p_share));
  return i.organization_id;
end $$;

-- Members of an organisation with their e-mail, for its managers only. No financial data.
create or replace function public.org_roster(p_org uuid)
returns table (user_id uuid, email text, display_name text, role text, shares_data boolean, consent_at timestamptz, joined_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_org_manager(p_org) then raise exception 'forbidden'; end if;
  return query
    select m.user_id, u.email::text, coalesce(p.display_name, ''), m.role, m.shares_data, m.consent_at, m.created_at
    from organization_members m
    join auth.users u on u.id = m.user_id
    left join user_profiles p on p.id = m.user_id
    where m.organization_id = p_org
    order by m.role, u.email;
end $$;

-- =============================================================== NOTIFICATIONS
alter table public.notifications
  add column dedupe_key text,
  add column tone text not null default 'info' check (tone in ('info','warn','gain','loss')),
  add column channel text not null default 'in_app' check (channel in ('in_app','push'));
create unique index notifications_dedupe on public.notifications (user_id, dedupe_key);
create policy "create own notifications" on public.notifications for insert with check (user_id = auth.uid());
create policy "delete own notifications" on public.notifications for delete using (user_id = auth.uid());

alter table public.user_profiles
  add column reminder_time text not null default '20:00' check (reminder_time ~ '^\d{2}:\d{2}$');

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  failures integer not null default 0
);
create index on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy "own push subscriptions" on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =============================================================== ADMINISTRATION
create table public.app_settings (
  key text primary key check (key ~ '^[a-z0-9_.]+$'),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users on delete set null default auth.uid()
);
alter table public.app_settings enable row level security;
create policy "public read" on public.app_settings for select using (true);
create policy "admin write" on public.app_settings for all using (public.is_admin()) with check (public.is_admin());
insert into public.app_settings (key, value) values
  ('support.email', '""'), ('signup.enabled', 'true'), ('maintenance.message', '""');

-- Every write on reference data is journaled.
create or replace function public.audit_reference_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_logs(actor, action, target_table, target_id, details)
  values (auth.uid(), lower(tg_op), tg_table_name,
          coalesce(to_jsonb(new), to_jsonb(old))->>(tg_argv[0]),
          jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new)));
  return coalesce(new, old);
end $$;

do $$
declare r record;
begin
  for r in select * from (values
      ('currencies','code'),('countries','code'),('cities','id'),('transport_platforms','id'),
      ('platform_countries','platform_id'),('expense_categories','id'),('fuel_prices','id'),
      ('energy_prices','id'),('subscription_plans','id'),('translations_overrides','key'),('app_settings','key')) t(tbl, pk)
  loop
    execute format('create trigger trg_audit_%1$s after insert or update or delete on public.%1$I
                    for each row execute function public.audit_reference_change(%2$L)', r.tbl, r.pk);
  end loop;
end $$;

-- Richer aggregated statistics. Still no individual financial data.
create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'users', (select count(*) from user_profiles),
    'onboarded', (select count(*) from user_profiles where onboarded),
    'active_7d', (select count(distinct user_id) from work_sessions where date > current_date - 7),
    'active_30d', (select count(distinct user_id) from work_sessions where date > current_date - 30),
    'work_sessions_30d', (select count(*) from work_sessions where date > current_date - 30),
    'organizations', (select count(*) from organizations),
    'push_devices', (select count(*) from push_subscriptions),
    'users_by_country', (select coalesce(jsonb_object_agg(coalesce(country_code, '—'), n), '{}') from
        (select country_code, count(*) n from user_profiles group by 1) s),
    'users_by_language', (select coalesce(jsonb_object_agg(language, n), '{}') from
        (select language, count(*) n from user_profiles group by 1) s),
    'subscriptions_by_plan', (select coalesce(jsonb_object_agg(plan_id, n), '{}') from
        (select plan_id, count(*) n from subscriptions where status in ('active','trialing') group by 1) s)
  );
end $$;

create or replace function public.admin_list_users(p_search text default '', p_limit int default 50, p_offset int default 0)
returns table (id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz, banned boolean,
               display_name text, country_code text, onboarded boolean, is_admin boolean, plan text, total bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
    select u.id, u.email::text, u.created_at, u.last_sign_in_at, coalesce(u.banned_until > now(), false),
           coalesce(p.display_name, ''), p.country_code::text, coalesce(p.onboarded, false),
           exists (select 1 from platform_admins a where a.user_id = u.id),
           (select s.plan_id from subscriptions s where s.user_id = u.id and s.status in ('active','trialing') order by s.created_at desc limit 1),
           count(*) over ()
    from auth.users u left join user_profiles p on p.id = u.id
    where p_search = '' or u.email ilike '%' || p_search || '%' or p.display_name ilike '%' || p_search || '%'
    order by u.created_at desc
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end $$;

create or replace function public.admin_set_role(p_user uuid, p_admin boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_user = auth.uid() and not p_admin then raise exception 'you cannot remove your own admin role'; end if;
  if p_admin then insert into platform_admins (user_id) values (p_user) on conflict do nothing;
  else delete from platform_admins where user_id = p_user; end if;
  insert into audit_logs(actor, action, target_table, target_id, details)
    values (auth.uid(), case when p_admin then 'grant_admin' else 'revoke_admin' end, 'platform_admins', p_user::text, '{}');
end $$;

-- Suspends sign-in (Supabase Auth honours banned_until) without touching the data.
create or replace function public.admin_set_suspended(p_user uuid, p_suspended boolean)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_user = auth.uid() then raise exception 'you cannot suspend yourself'; end if;
  -- A far-future date rather than 'infinity', which Supabase Auth cannot parse.
  update auth.users set banned_until = case when p_suspended then now() + interval '100 years' end where id = p_user;
  if p_suspended then delete from auth.refresh_tokens where user_id = p_user::text; end if;
  insert into audit_logs(actor, action, target_table, target_id, details)
    values (auth.uid(), case when p_suspended then 'suspend_user' else 'reactivate_user' end, 'auth.users', p_user::text, '{}');
end $$;

-- Manual plan grant (e.g. partner accounts). Paid plans come from a verified payment webhook.
create or replace function public.admin_set_plan(p_user uuid, p_plan text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update subscriptions set status = 'canceled', updated_at = now()
    where user_id = p_user and status in ('active','trialing') and provider = 'manual';
  if p_plan is not null and p_plan <> 'free' then
    insert into subscriptions (user_id, plan_id, status, provider) values (p_user, p_plan, 'active', 'manual');
  end if;
  insert into audit_logs(actor, action, target_table, target_id, details)
    values (auth.uid(), 'set_plan', 'subscriptions', p_user::text, jsonb_build_object('plan', p_plan));
end $$;

create or replace function public.admin_list_organizations()
returns table (id uuid, name text, country_code text, currency text, members bigint, sharing bigint, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
    select o.id, o.name, o.country_code::text, o.currency::text,
           (select count(*) from organization_members m where m.organization_id = o.id),
           (select count(*) from organization_members m where m.organization_id = o.id and m.shares_data),
           o.created_at
    from organizations o order by o.created_at desc;
end $$;

do $$
declare f text;
begin
  foreach f in array array['admin_list_users(text,int,int)','admin_set_role(uuid,boolean)','admin_set_suspended(uuid,boolean)',
    'admin_set_plan(uuid,text)','admin_list_organizations()','admin_stats()','org_roster(uuid)','accept_invite(uuid,boolean)','invite_preview(uuid)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Platforms commonly found per country (suggestions only, no rate).
insert into public.platform_countries (platform_id, country_code) values
  ('uber','PT'),('bolt','PT'),('freenow','PT'),('uber_eats','PT'),('glovo','PT'),('uber','FR'),('bolt','FR'),('heetch','FR'),('freenow','FR'),('uber_eats','FR'),('deliveroo','FR'),('uber','DE'),('bolt','DE'),('freenow','DE'),('uber_eats','DE'),('wolt','DE'),('uber','BE'),('bolt','BE'),('heetch','BE'),('deliveroo','BE'),('uber','ES'),('bolt','ES'),('cabify','ES'),('freenow','ES'),('glovo','ES'),('uber','IT'),('freenow','IT'),('glovo','IT'),('deliveroo','IT'),('yango','CI'),('uber','CI'),('heetch','CI'),('gozem','CI'),('glovo','CI'),('yango','CM'),('gozem','CM'),('heetch','CM'),('yango','ML'),('yango','BF'),('yango','SN'),('heetch','SN'),('uber','SN'),('yango','GN')
on conflict do nothing;

-- ===== supabase/migrations/20261018150000_security_hardening.sql =====
-- Security hardening suggested by the Supabase advisor.

-- Pin search_path on the remaining plpgsql helpers.
alter function public.set_updated_at() set search_path = public;
alter function public.guard_member_update() set search_path = public;
alter function public.check_earning_owner() set search_path = public;

-- Trigger functions are not part of the API: triggers still fire, but nobody can call them via /rpc.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.audit_reference_change() from public, anon, authenticated;
