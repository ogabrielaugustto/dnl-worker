alter table public.detection_site_intel_investigations
  add column if not exists registered_domain text,
  add column if not exists rdap_entities jsonb not null default '[]'::jsonb,
  add column if not exists domain_owner_name text,
  add column if not exists domain_owner_organization text,
  add column if not exists domain_owner_document text,
  add column if not exists domain_owner_email text,
  add column if not exists domain_owner_source_type text,
  add column if not exists domain_owner_source_url text,
  add column if not exists domain_owner_contact_status text,
  add column if not exists domain_owner_candidates jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'detection_site_intel_domain_owner_source_type_check'
  ) then
    alter table public.detection_site_intel_investigations
      add constraint detection_site_intel_domain_owner_source_type_check
      check (
        domain_owner_source_type is null
        or domain_owner_source_type in ('rdap', 'public_site', 'none')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'detection_site_intel_domain_owner_contact_status_check'
  ) then
    alter table public.detection_site_intel_investigations
      add constraint detection_site_intel_domain_owner_contact_status_check
      check (
        domain_owner_contact_status is null
        or domain_owner_contact_status in ('found', 'fallback', 'missing')
      );
  end if;
end $$;

create index if not exists idx_detection_site_intel_domain_owner_email
  on public.detection_site_intel_investigations (domain_owner_email)
  where domain_owner_email is not null;

create index if not exists idx_detection_site_intel_registered_domain
  on public.detection_site_intel_investigations (registered_domain)
  where registered_domain is not null;
