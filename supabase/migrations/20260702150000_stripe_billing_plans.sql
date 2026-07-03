begin;

alter type public.subscription_status add value if not exists 'incomplete';
alter type public.subscription_status add value if not exists 'unpaid';

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default timezone('utc', now()),
  payload jsonb not null default '{}'::jsonb
);

alter table public.stripe_webhook_events enable row level security;

grant select, insert, update, delete on public.stripe_webhook_events to authenticated;
grant all on public.stripe_webhook_events to service_role;

drop policy if exists "stripe_webhook_events_manage_system_admin" on public.stripe_webhook_events;
create policy "stripe_webhook_events_manage_system_admin"
on public.stripe_webhook_events
for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

update public.subscription_plans
set is_active = false,
    updated_at = timezone('utc', now())
where code in ('starter', 'growth', 'scale');

insert into public.subscription_plans (
  code,
  name,
  description,
  price_cents,
  currency,
  billing_interval,
  max_assets,
  max_team_members,
  scan_frequency_cap,
  is_active
)
values
  (
    'basic',
    'Basic',
    'Plano inicial da DNL para monitoramento assistido de imagens.',
    19700,
    'BRL',
    'monthly',
    null,
    null,
    'daily',
    true
  ),
  (
    'professional',
    'Profissional',
    'Plano profissional da DNL para operacoes com acompanhamento ampliado.',
    39700,
    'BRL',
    'monthly',
    null,
    null,
    'daily',
    true
  ),
  (
    'custom',
    'Custom',
    'Plano personalizado para operacoes com volume ou necessidades especificas.',
    0,
    'BRL',
    'monthly',
    null,
    null,
    'daily',
    false
  )
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  price_cents = excluded.price_cents,
  currency = excluded.currency,
  billing_interval = excluded.billing_interval,
  max_assets = excluded.max_assets,
  max_team_members = excluded.max_team_members,
  scan_frequency_cap = excluded.scan_frequency_cap,
  is_active = excluded.is_active,
  updated_at = timezone('utc', now());

commit;
