create table public.detection_site_intel_investigations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  detection_id uuid not null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed', 'skipped')),
  requested_at timestamptz not null default timezone('utc', now()),
  started_at timestamptz,
  completed_at timestamptz,
  source_url text not null,
  final_url text,
  domain text,
  rdap_payload jsonb not null default '{}'::jsonb,
  page_findings jsonb not null default '[]'::jsonb,
  contact_candidates jsonb not null default '[]'::jsonb,
  primary_email text,
  primary_phone text,
  primary_cnpj text,
  primary_contact_page_url text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (detection_id),
  unique (id, organization_id),
  foreign key (detection_id, organization_id)
    references public.detections(id, organization_id)
    on delete cascade
);

create index idx_detection_site_intel_investigations_detection
  on public.detection_site_intel_investigations (detection_id);

create index idx_detection_site_intel_investigations_status
  on public.detection_site_intel_investigations (status, requested_at desc);

create trigger set_detection_site_intel_investigations_updated_at
before update on public.detection_site_intel_investigations
for each row
execute function public.set_updated_at();

alter table public.detection_site_intel_investigations enable row level security;

create policy "detection_site_intel_investigations_select_member_or_admin"
on public.detection_site_intel_investigations
for select
to authenticated
using (public.is_active_member(organization_id) or public.is_admin_user());

create policy "detection_site_intel_investigations_manage_owner_admin_or_system_admin"
on public.detection_site_intel_investigations
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

grant select, insert, update, delete on table public.detection_site_intel_investigations to authenticated;
grant all on table public.detection_site_intel_investigations to service_role;
