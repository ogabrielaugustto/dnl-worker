begin;

alter table public.profiles
  add column if not exists cpf text,
  add column if not exists signer_role text,
  add column if not exists signing_city text;

alter table public.profiles
  add constraint profiles_cpf_length_check
  check (
    cpf is null
    or char_length(regexp_replace(cpf, '\D', '', 'g')) = 11
  );

alter table public.profiles
  add constraint profiles_signer_role_length_check
  check (
    signer_role is null
    or char_length(trim(signer_role)) between 2 and 120
  );

alter table public.profiles
  add constraint profiles_signing_city_length_check
  check (
    signing_city is null
    or char_length(trim(signing_city)) between 2 and 120
  );

create table if not exists public.rights_ownership_confirmations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  detection_id uuid not null,
  user_id uuid references public.profiles(id) on delete set null,
  document_type text not null default 'rights_ownership_confirmation',
  asset_public_id integer not null check (asset_public_id > 0),
  case_public_id integer not null check (case_public_id > 0),
  signer_full_name text not null,
  signer_cpf text not null,
  signer_role text not null,
  signing_city text not null,
  statement_date date not null,
  signature_mode text not null,
  signature_payload jsonb not null,
  signature_svg text not null,
  template_version text not null,
  body_snapshot text not null,
  template_snapshot_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (id, organization_id),
  foreign key (detection_id, organization_id)
    references public.detections(id, organization_id)
    on delete cascade,
  check (document_type = 'rights_ownership_confirmation'),
  check (signature_mode in ('draw', 'type')),
  check (jsonb_typeof(signature_payload) = 'object'),
  check (jsonb_typeof(template_snapshot_json) = 'object'),
  check (char_length(trim(signer_full_name)) between 3 and 120),
  check (char_length(regexp_replace(signer_cpf, '\D', '', 'g')) = 11),
  check (char_length(trim(signer_role)) between 2 and 120),
  check (char_length(trim(signing_city)) between 2 and 120)
);

create index if not exists idx_rights_ownership_confirmations_detection_created_at
  on public.rights_ownership_confirmations (detection_id, created_at desc);

create index if not exists idx_rights_ownership_confirmations_org_case_created_at
  on public.rights_ownership_confirmations (organization_id, case_public_id, created_at desc);

alter table public.rights_ownership_confirmations enable row level security;

create policy "rights_ownership_confirmations_select_member_or_admin"
on public.rights_ownership_confirmations
for select
to authenticated
using (public.is_active_member(organization_id) or public.is_admin_user());

create policy "rights_ownership_confirmations_insert_owner_admin_or_system_admin"
on public.rights_ownership_confirmations
for insert
to authenticated
with check (
  public.has_org_role(
    organization_id,
    array['owner'::public.organization_member_role, 'admin'::public.organization_member_role]
  )
  or public.is_admin_user()
);

commit;
