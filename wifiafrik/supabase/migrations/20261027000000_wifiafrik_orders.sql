-- Commandes WifiAfrik. Écrites et lues uniquement par le serveur (clé service_role) :
-- RLS activée sans aucune politique, donc aucun accès avec la clé anon/authenticated.
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  merchant_transaction_id text not null unique check (char_length(merchant_transaction_id) <= 30),
  plan_id text not null,
  amount integer not null check (amount > 0),
  currency text not null check (currency in ('XOF', 'XAF')),
  country text not null check (char_length(country) = 2),
  customer_first_name text not null,
  customer_last_name text not null,
  customer_email text not null,
  customer_phone text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  cinetpay_transaction_id text unique,
  notify_token text,
  payment_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists orders_status_created_at_idx on public.orders (status, created_at desc);

alter table public.orders enable row level security;
revoke all on public.orders from anon, authenticated;

create or replace function public.orders_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.orders_set_updated_at();
