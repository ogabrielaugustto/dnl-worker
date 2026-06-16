create table public.detection_wayback_captures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  detection_id uuid not null,
  scan_run_id uuid,
  source_url text not null,
  canonical_source_url text not null,
  capture_status text not null default 'queued'
    check (capture_status in ('queued', 'processing', 'submitted', 'captured', 'unavailable', 'failed')),
  save_job_id text,
  save_http_status integer,
  save_requested_at timestamptz not null default timezone('utc', now()),
  save_completed_at timestamptz,
  availability_checked_at timestamptz,
  latest_snapshot_url text,
  latest_snapshot_timestamp text,
  latest_snapshot_at timestamptz,
  latest_snapshot_status text,
  error_message text,
  timeline jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (detection_id),
  unique (id, organization_id),
  foreign key (detection_id, organization_id)
    references public.detections(id, organization_id)
    on delete cascade,
  foreign key (scan_run_id, organization_id)
    references public.scan_runs(id, organization_id)
    on delete restrict
);

create index idx_detection_wayback_captures_detection
  on public.detection_wayback_captures (detection_id);

create index idx_detection_wayback_captures_status
  on public.detection_wayback_captures (capture_status, save_requested_at desc);

create trigger set_detection_wayback_captures_updated_at
before update on public.detection_wayback_captures
for each row
execute function public.set_updated_at();

alter table public.detection_wayback_captures enable row level security;

create policy "detection_wayback_captures_select_member_or_admin"
on public.detection_wayback_captures
for select
to authenticated
using (public.is_active_member(organization_id) or public.is_admin_user());

create policy "detection_wayback_captures_manage_owner_admin_or_system_admin"
on public.detection_wayback_captures
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

grant select, insert, update, delete on table public.detection_wayback_captures to authenticated;
grant all on table public.detection_wayback_captures to service_role;
