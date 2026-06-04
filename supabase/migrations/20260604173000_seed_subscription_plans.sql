begin;

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
    'starter',
    'Starter',
    'Entry plan for small creators monitoring a limited catalog.',
    9900,
    'BRL',
    'monthly',
    100,
    3,
    'daily',
    true
  ),
  (
    'growth',
    'Growth',
    'Team plan with more monitored assets and team seats.',
    29900,
    'BRL',
    'monthly',
    500,
    10,
    'daily',
    true
  ),
  (
    'scale',
    'Scale',
    'Higher-volume monitoring for larger rights holders and agencies.',
    79900,
    'BRL',
    'monthly',
    2500,
    25,
    'daily',
    true
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
