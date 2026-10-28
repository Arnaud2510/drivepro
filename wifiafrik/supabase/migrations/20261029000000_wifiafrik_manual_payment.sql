-- Paiement manuel par Mobile Money : le client déclare son paiement, un administrateur le valide.
alter table public.orders
  add column if not exists payment_provider text not null default 'cinetpay'
    check (payment_provider in ('manual', 'cinetpay')),
  add column if not exists payment_method text check (char_length(payment_method) <= 40),
  add column if not exists payer_reference text check (char_length(payer_reference) <= 100),
  add column if not exists declared_at timestamptz;

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders
  add constraint orders_status_check check (status in ('pending', 'declared', 'paid', 'failed'));
