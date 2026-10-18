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
