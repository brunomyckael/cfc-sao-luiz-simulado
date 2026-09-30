-- FASE 8 — acesso pago por 30 dias
-- Banco PostgreSQL / Supabase
-- Não contém chaves, tokens ou dados de pagamento sensíveis.

create extension if not exists pgcrypto;

create table if not exists public.free_trials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  claimed_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(10,2) not null check (amount = 4.99),
  currency text not null default 'BRL' check (currency = 'BRL'),
  product_code text not null default 'cfc-pro-30d',
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','cancelled','refunded','charged_back','in_process')),
  mp_preference_id text,
  mp_payment_id text unique,
  external_reference text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists orders_one_pending_per_user
  on public.orders(user_id)
  where status in ('pending','in_process');

create table if not exists public.access_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  payment_id text unique,
  status text not null default 'active'
    check (status in ('active','expired','refunded','charged_back','revoked')),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > starts_at)
);

create index if not exists access_grants_user_active_idx
  on public.access_grants(user_id, status, expires_at);

create or replace function public.claim_free_trial(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.free_trials(user_id) values (p_user_id)
  on conflict (user_id) do nothing;
  return found;
end;
$$;

create or replace function public.get_access_state(p_user_id uuid)
returns table (active boolean, expires_at timestamptz, trial_available boolean)
language sql
security definer
set search_path = public
as $$
  select
    exists(
      select 1 from public.access_grants g
      where g.user_id = p_user_id and g.status = 'active' and g.expires_at > now()
    ) as active,
    (
      select max(g.expires_at) from public.access_grants g
      where g.user_id = p_user_id and g.status = 'active' and g.expires_at > now()
    ) as expires_at,
    not exists(
      select 1 from public.free_trials t where t.user_id = p_user_id
    ) as trial_available;
$$;

create or replace function public.apply_payment_event(
  p_order_id uuid,
  p_payment_id text,
  p_status text,
  p_amount numeric,
  p_currency text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_base timestamptz;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then return false; end if;

  if p_amount <> 4.99 or p_currency <> 'BRL' then
    raise exception 'Pagamento incompatível com o produto';
  end if;

  update public.orders
     set status = p_status,
         mp_payment_id = coalesce(p_payment_id, mp_payment_id),
         updated_at = now()
   where id = p_order_id;

  if p_status = 'approved' and p_payment_id is not null then
    if not exists (select 1 from public.access_grants where payment_id = p_payment_id) then
      select greatest(now(), coalesce(max(g.expires_at), now()))
        into v_base
        from public.access_grants g
       where g.user_id = v_order.user_id
         and g.status = 'active'
         and g.expires_at > now();

      insert into public.access_grants(
        user_id, order_id, payment_id, status, starts_at, expires_at
      )
      values (
        v_order.user_id, v_order.id, p_payment_id, 'active',
        v_base, v_base + interval '30 days'
      );
    end if;
  elsif p_status in ('refunded','charged_back','cancelled') then
    update public.access_grants
       set status = p_status, updated_at = now()
     where payment_id = p_payment_id;
  end if;

  return true;
end;
$$;

alter table public.free_trials enable row level security;
alter table public.orders enable row level security;
alter table public.access_grants enable row level security;

revoke all on public.free_trials from anon, authenticated;
revoke all on public.orders from anon, authenticated;
revoke all on public.access_grants from anon, authenticated;

revoke all on function public.claim_free_trial(uuid) from public;
revoke all on function public.get_access_state(uuid) from public;
revoke all on function public.apply_payment_event(uuid,text,text,numeric,text) from public;

grant execute on function public.claim_free_trial(uuid) to service_role;
grant execute on function public.get_access_state(uuid) to service_role;
grant execute on function public.apply_payment_event(uuid,text,text,numeric,text) to service_role;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at
before update on public.orders for each row execute function public.touch_updated_at();

drop trigger if exists grants_touch_updated_at on public.access_grants;
create trigger grants_touch_updated_at
before update on public.access_grants for each row execute function public.touch_updated_at();
