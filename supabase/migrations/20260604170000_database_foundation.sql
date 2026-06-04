begin;

create extension if not exists pgcrypto;

create type public.organization_member_role as enum ('owner', 'admin', 'member');
create type public.system_role as enum ('user', 'admin', 'super_admin');
create type public.asset_status as enum ('draft', 'active', 'paused', 'archived');
create type public.monitoring_rule_frequency as enum ('hourly', 'daily', 'weekly', 'monthly');
create type public.scan_job_type as enum ('manual_scan', 'scheduled_scan', 'retry_scan');
create type public.scan_job_status as enum ('pending', 'processing', 'completed', 'failed', 'cancelled');
create type public.scan_run_status as enum ('started', 'vision_completed', 'evidence_pending', 'completed', 'failed');
create type public.detection_status as enum (
  'pending',
  'possible_infringement',
  'authorized',
  'unauthorized',
  'takedown_sent',
  'resolved',
  'ignored'
);
create type public.evidence_capture_status as enum ('pending', 'processing', 'captured', 'failed', 'skipped');
create type public.subscription_status as enum (
  'trialing',
  'active',
  'past_due',
  'cancelled',
  'expired',
  'paused'
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  system_role public.system_role not null default 'user',
  is_active boolean not null default true,
  last_signed_in_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document text,
  billing_email text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.organization_member_role not null default 'member',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, user_id)
);

create or replace function public.current_system_role()
returns public.system_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.system_role
      from public.profiles p
      where p.id = auth.uid()
    ),
    'user'::public.system_role
  );
$$;

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_system_role() in ('admin'::public.system_role, 'super_admin'::public.system_role);
$$;

create or replace function public.is_super_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_system_role() = 'super_admin'::public.system_role;
$$;

create or replace function public.is_active_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = target_organization_id
      and om.user_id = auth.uid()
      and om.is_active = true
  );
$$;

create or replace function public.has_org_role(
  target_organization_id uuid,
  allowed_roles public.organization_member_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = target_organization_id
      and om.user_id = auth.uid()
      and om.is_active = true
      and om.role = any(allowed_roles)
  );
$$;

create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  price_cents integer not null default 0 check (price_cents >= 0),
  currency text not null default 'BRL',
  billing_interval text not null default 'monthly',
  max_assets integer check (max_assets is null or max_assets > 0),
  max_team_members integer check (max_team_members is null or max_team_members > 0),
  scan_frequency_cap public.monitoring_rule_frequency,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (billing_interval in ('monthly', 'yearly'))
);

create table public.organization_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  status public.subscription_status not null default 'trialing',
  provider text not null default 'manual',
  provider_customer_id text,
  provider_subscription_id text,
  current_period_started_at timestamptz,
  current_period_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  seat_limit_snapshot integer check (seat_limit_snapshot is null or seat_limit_snapshot > 0),
  asset_limit_snapshot integer check (asset_limit_snapshot is null or asset_limit_snapshot > 0),
  scan_frequency_cap_snapshot public.monitoring_rule_frequency,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  title text not null,
  description text,
  author text,
  sku text,
  license_type text,
  status public.asset_status not null default 'active',
  archived_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (id, organization_id)
);

create table public.asset_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  asset_id uuid not null,
  storage_provider text not null default 'r2',
  storage_key text,
  public_url text,
  original_file_name text,
  hash_sha256 text,
  phash text,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  is_primary boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (id, organization_id),
  foreign key (asset_id, organization_id)
    references public.assets(id, organization_id)
    on delete cascade
);

create table public.monitoring_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  asset_id uuid,
  name text not null,
  frequency public.monitoring_rule_frequency not null,
  is_active boolean not null default true,
  next_run_at timestamptz,
  last_run_at timestamptz,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (id, organization_id),
  foreign key (asset_id, organization_id)
    references public.assets(id, organization_id)
    on delete restrict
);

create table public.scan_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  asset_id uuid not null,
  monitoring_rule_id uuid,
  requested_by_user_id uuid references public.profiles(id) on delete set null,
  type public.scan_job_type not null,
  status public.scan_job_status not null default 'pending',
  priority integer not null default 100,
  scheduled_at timestamptz not null default timezone('utc', now()),
  started_at timestamptz,
  finished_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts > 0),
  error_code text,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (id, organization_id),
  foreign key (asset_id, organization_id)
    references public.assets(id, organization_id)
    on delete restrict,
  foreign key (monitoring_rule_id, organization_id)
    references public.monitoring_rules(id, organization_id)
    on delete restrict
);

create table public.scan_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  scan_job_id uuid not null,
  asset_id uuid not null,
  status public.scan_run_status not null default 'started',
  attempt_number integer not null check (attempt_number > 0),
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  worker_id text,
  error_code text,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (scan_job_id, attempt_number),
  unique (id, organization_id),
  foreign key (scan_job_id, organization_id)
    references public.scan_jobs(id, organization_id)
    on delete cascade,
  foreign key (asset_id, organization_id)
    references public.assets(id, organization_id)
    on delete restrict
);

create table public.detections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  asset_id uuid not null,
  scan_job_id uuid,
  source_url text not null,
  canonical_source_url text not null,
  matched_image_url text,
  canonical_matched_image_url text not null default '',
  page_title text,
  domain text,
  confidence_score numeric(5, 4),
  vision_payload jsonb not null default '{}'::jsonb,
  status public.detection_status not null default 'pending',
  first_seen_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  last_scanned_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by_user_id uuid references public.profiles(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, asset_id, canonical_source_url, canonical_matched_image_url),
  unique (id, organization_id),
  foreign key (asset_id, organization_id)
    references public.assets(id, organization_id)
    on delete restrict,
  foreign key (scan_job_id, organization_id)
    references public.scan_jobs(id, organization_id)
    on delete restrict,
  check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1))
);

create table public.detection_evidences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  detection_id uuid not null,
  scan_run_id uuid,
  screenshot_storage_key text,
  screenshot_public_url text,
  pdf_storage_key text,
  html_snapshot_storage_key text,
  captured_at timestamptz,
  capture_status public.evidence_capture_status not null default 'pending',
  capture_error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (id, organization_id),
  foreign key (detection_id, organization_id)
    references public.detections(id, organization_id)
    on delete cascade,
  foreign key (scan_run_id, organization_id)
    references public.scan_runs(id, organization_id)
    on delete restrict
);

create table public.detection_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  detection_id uuid not null,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  from_status public.detection_status,
  to_status public.detection_status,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (id, organization_id),
  foreign key (detection_id, organization_id)
    references public.detections(id, organization_id)
    on delete cascade
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  entity text not null,
  entity_id uuid,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index idx_organization_members_user_id
  on public.organization_members (user_id);

create index idx_subscription_plans_active
  on public.subscription_plans (is_active)
  where is_active = true;

create index idx_organization_subscriptions_org_status
  on public.organization_subscriptions (organization_id, status);

create index idx_assets_org_status
  on public.assets (organization_id, status);

create unique index idx_asset_files_primary_per_asset
  on public.asset_files (asset_id)
  where is_primary = true;

create index idx_asset_files_org_asset
  on public.asset_files (organization_id, asset_id);

create index idx_monitoring_rules_org_next_run
  on public.monitoring_rules (organization_id, next_run_at)
  where is_active = true and archived_at is null;

create index idx_scan_jobs_status_scheduled_at
  on public.scan_jobs (status, scheduled_at);

create index idx_scan_jobs_org_status
  on public.scan_jobs (organization_id, status);

create index idx_scan_runs_job_status
  on public.scan_runs (scan_job_id, status);

create index idx_detections_org_asset_status
  on public.detections (organization_id, asset_id, status);

create index idx_detections_domain
  on public.detections (domain);

create index idx_detection_evidences_detection_created_at
  on public.detection_evidences (detection_id, created_at desc);

create index idx_detection_actions_detection_created_at
  on public.detection_actions (detection_id, created_at desc);

create index idx_audit_logs_org_created_at
  on public.audit_logs (organization_id, created_at desc);

create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create trigger set_organizations_updated_at
before update on public.organizations
for each row
execute function public.set_updated_at();

create trigger set_organization_members_updated_at
before update on public.organization_members
for each row
execute function public.set_updated_at();

create trigger set_subscription_plans_updated_at
before update on public.subscription_plans
for each row
execute function public.set_updated_at();

create trigger set_organization_subscriptions_updated_at
before update on public.organization_subscriptions
for each row
execute function public.set_updated_at();

create trigger set_assets_updated_at
before update on public.assets
for each row
execute function public.set_updated_at();

create trigger set_asset_files_updated_at
before update on public.asset_files
for each row
execute function public.set_updated_at();

create trigger set_monitoring_rules_updated_at
before update on public.monitoring_rules
for each row
execute function public.set_updated_at();

create trigger set_scan_jobs_updated_at
before update on public.scan_jobs
for each row
execute function public.set_updated_at();

create trigger set_scan_runs_updated_at
before update on public.scan_runs
for each row
execute function public.set_updated_at();

create trigger set_detections_updated_at
before update on public.detections
for each row
execute function public.set_updated_at();

create trigger set_detection_evidences_updated_at
before update on public.detection_evidences
for each row
execute function public.set_updated_at();

create or replace function public.sync_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, last_signed_in_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.last_sign_in_at
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    last_signed_in_at = excluded.last_signed_in_at,
    updated_at = timezone('utc', now());

  return new;
end;
$$;

create or replace function public.guard_profile_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if old.id <> auth.uid() and not public.is_admin_user() then
    raise exception 'You cannot update another user profile.';
  end if;

  if old.system_role is distinct from new.system_role and not public.is_admin_user() then
    raise exception 'Only admins can change system roles.';
  end if;

  if old.email is distinct from new.email and not public.is_admin_user() then
    raise exception 'Email must be updated through Supabase Auth.';
  end if;

  return new;
end;
$$;

create trigger guard_profile_updates
before update on public.profiles
for each row
execute function public.guard_profile_updates();

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_updated on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.sync_profile_from_auth_user();

create trigger on_auth_user_updated
after update of email, raw_user_meta_data, last_sign_in_at on auth.users
for each row
execute function public.sync_profile_from_auth_user();

insert into public.profiles (id, email, full_name, last_signed_in_at)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
  u.last_sign_in_at
from auth.users u
on conflict (id) do update
set
  email = excluded.email,
  full_name = coalesce(excluded.full_name, public.profiles.full_name),
  last_signed_in_at = excluded.last_signed_in_at,
  updated_at = timezone('utc', now());

create or replace function public.create_organization(
  organization_name text,
  organization_document text default null,
  organization_billing_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_organization_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  insert into public.organizations (name, document, billing_email)
  values (organization_name, organization_document, organization_billing_email)
  returning id into new_organization_id;

  insert into public.organization_members (organization_id, user_id, role, is_active)
  values (new_organization_id, auth.uid(), 'owner', true)
  on conflict (organization_id, user_id) do update
  set
    role = excluded.role,
    is_active = excluded.is_active,
    updated_at = timezone('utc', now());

  return new_organization_id;
end;
$$;

revoke all on function public.create_organization(text, text, text) from public;
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on function public.create_organization(text, text, text) to authenticated;
grant execute on function public.current_system_role() to authenticated;
grant execute on function public.is_active_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, public.organization_member_role[]) to authenticated;
grant execute on function public.is_admin_user() to authenticated;
grant execute on function public.is_super_admin_user() to authenticated;

alter default privileges in schema public
grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
grant all on tables to service_role;

alter default privileges in schema public
grant usage, select on sequences to authenticated, service_role;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.organization_subscriptions enable row level security;
alter table public.assets enable row level security;
alter table public.asset_files enable row level security;
alter table public.monitoring_rules enable row level security;
alter table public.scan_jobs enable row level security;
alter table public.scan_runs enable row level security;
alter table public.detections enable row level security;
alter table public.detection_evidences enable row level security;
alter table public.detection_actions enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles_select_self_or_admin"
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.is_admin_user());

create policy "profiles_update_self_or_admin"
on public.profiles
for update
to authenticated
using (id = auth.uid() or public.is_admin_user())
with check (id = auth.uid() or public.is_admin_user());

create policy "organizations_select_member_or_admin"
on public.organizations
for select
to authenticated
using (public.is_active_member(id) or public.is_admin_user());

create policy "organizations_insert_admin_only"
on public.organizations
for insert
to authenticated
with check (public.is_admin_user());

create policy "organizations_update_owner_admin_or_system_admin"
on public.organizations
for update
to authenticated
using (
  public.has_org_role(id, array['owner'::public.organization_member_role, 'admin'::public.organization_member_role])
  or public.is_admin_user()
)
with check (
  public.has_org_role(id, array['owner'::public.organization_member_role, 'admin'::public.organization_member_role])
  or public.is_admin_user()
);

create policy "organization_members_select_member_or_admin"
on public.organization_members
for select
to authenticated
using (public.is_active_member(organization_id) or public.is_admin_user());

create policy "organization_members_insert_owner_admin_or_system_admin"
on public.organization_members
for insert
to authenticated
with check (
  public.has_org_role(
    organization_id,
    array['owner'::public.organization_member_role, 'admin'::public.organization_member_role]
  )
  or public.is_admin_user()
);

create policy "organization_members_update_owner_admin_or_system_admin"
on public.organization_members
for update
to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner'::public.organization_member_role, 'admin'::public.organization_member_role]
  )
  or public.is_admin_user()
)
with check (
  public.has_org_role(
    organization_id,
    array['owner'::public.organization_member_role, 'admin'::public.organization_member_role]
  )
  or public.is_admin_user()
);

create policy "organization_members_delete_owner_admin_or_system_admin"
on public.organization_members
for delete
to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner'::public.organization_member_role, 'admin'::public.organization_member_role]
  )
  or public.is_admin_user()
);

create policy "subscription_plans_select_authenticated"
on public.subscription_plans
for select
to authenticated
using (true);

create policy "subscription_plans_manage_system_admin"
on public.subscription_plans
for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

create policy "organization_subscriptions_select_member_or_admin"
on public.organization_subscriptions
for select
to authenticated
using (public.is_active_member(organization_id) or public.is_admin_user());

create policy "organization_subscriptions_manage_system_admin"
on public.organization_subscriptions
for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

create policy "assets_select_member_or_admin"
on public.assets
for select
to authenticated
using (public.is_active_member(organization_id) or public.is_admin_user());

create policy "assets_manage_owner_admin_or_system_admin"
on public.assets
for all
to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner'::public.organization_member_role, 'admin'::public.organization_member_role]
  )
  or public.is_admin_user()
)
with check (
  public.has_org_role(
    organization_id,
    array['owner'::public.organization_member_role, 'admin'::public.organization_member_role]
  )
  or public.is_admin_user()
);

create policy "asset_files_select_member_or_admin"
on public.asset_files
for select
to authenticated
using (public.is_active_member(organization_id) or public.is_admin_user());

create policy "asset_files_manage_owner_admin_or_system_admin"
on public.asset_files
for all
to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner'::public.organization_member_role, 'admin'::public.organization_member_role]
  )
  or public.is_admin_user()
)
with check (
  public.has_org_role(
    organization_id,
    array['owner'::public.organization_member_role, 'admin'::public.organization_member_role]
  )
  or public.is_admin_user()
);

create policy "monitoring_rules_select_member_or_admin"
on public.monitoring_rules
for select
to authenticated
using (public.is_active_member(organization_id) or public.is_admin_user());

create policy "monitoring_rules_manage_owner_admin_or_system_admin"
on public.monitoring_rules
for all
to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner'::public.organization_member_role, 'admin'::public.organization_member_role]
  )
  or public.is_admin_user()
)
with check (
  public.has_org_role(
    organization_id,
    array['owner'::public.organization_member_role, 'admin'::public.organization_member_role]
  )
  or public.is_admin_user()
);

create policy "scan_jobs_select_member_or_admin"
on public.scan_jobs
for select
to authenticated
using (public.is_active_member(organization_id) or public.is_admin_user());

create policy "scan_jobs_manage_owner_admin_or_system_admin"
on public.scan_jobs
for all
to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner'::public.organization_member_role, 'admin'::public.organization_member_role]
  )
  or public.is_admin_user()
)
with check (
  public.has_org_role(
    organization_id,
    array['owner'::public.organization_member_role, 'admin'::public.organization_member_role]
  )
  or public.is_admin_user()
);

create policy "scan_runs_select_member_or_admin"
on public.scan_runs
for select
to authenticated
using (public.is_active_member(organization_id) or public.is_admin_user());

create policy "scan_runs_manage_owner_admin_or_system_admin"
on public.scan_runs
for all
to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner'::public.organization_member_role, 'admin'::public.organization_member_role]
  )
  or public.is_admin_user()
)
with check (
  public.has_org_role(
    organization_id,
    array['owner'::public.organization_member_role, 'admin'::public.organization_member_role]
  )
  or public.is_admin_user()
);

create policy "detections_select_member_or_admin"
on public.detections
for select
to authenticated
using (public.is_active_member(organization_id) or public.is_admin_user());

create policy "detections_manage_owner_admin_or_system_admin"
on public.detections
for all
to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner'::public.organization_member_role, 'admin'::public.organization_member_role]
  )
  or public.is_admin_user()
)
with check (
  public.has_org_role(
    organization_id,
    array['owner'::public.organization_member_role, 'admin'::public.organization_member_role]
  )
  or public.is_admin_user()
);

create policy "detection_evidences_select_member_or_admin"
on public.detection_evidences
for select
to authenticated
using (public.is_active_member(organization_id) or public.is_admin_user());

create policy "detection_evidences_manage_owner_admin_or_system_admin"
on public.detection_evidences
for all
to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner'::public.organization_member_role, 'admin'::public.organization_member_role]
  )
  or public.is_admin_user()
)
with check (
  public.has_org_role(
    organization_id,
    array['owner'::public.organization_member_role, 'admin'::public.organization_member_role]
  )
  or public.is_admin_user()
);

create policy "detection_actions_select_member_or_admin"
on public.detection_actions
for select
to authenticated
using (public.is_active_member(organization_id) or public.is_admin_user());

create policy "detection_actions_manage_owner_admin_or_system_admin"
on public.detection_actions
for all
to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner'::public.organization_member_role, 'admin'::public.organization_member_role]
  )
  or public.is_admin_user()
)
with check (
  public.has_org_role(
    organization_id,
    array['owner'::public.organization_member_role, 'admin'::public.organization_member_role]
  )
  or public.is_admin_user()
);

create policy "audit_logs_select_member_or_admin"
on public.audit_logs
for select
to authenticated
using (
  (organization_id is null and public.is_admin_user())
  or public.is_active_member(organization_id)
  or public.is_admin_user()
);

create policy "audit_logs_manage_system_admin"
on public.audit_logs
for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

commit;
