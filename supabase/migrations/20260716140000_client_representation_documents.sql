begin;

create table if not exists public.client_representation_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_kind text not null,
  status text not null default 'signature_requested',
  provider text not null default 'clicksign',
  provider_environment text not null,
  template_key text not null,
  signer_user_id uuid references public.profiles(id) on delete set null,
  signer_name text not null,
  signer_email text not null,
  signer_document text not null,
  signer_marital_status text,
  signer_address text,
  provider_envelope_id text,
  provider_document_id text,
  provider_signer_id text,
  provider_qualification_requirement_id text,
  provider_authentication_requirement_id text,
  provider_notification_id text,
  template_data jsonb not null default '{}'::jsonb,
  provider_payload jsonb not null default '{}'::jsonb,
  webhook_payload jsonb not null default '{}'::jsonb,
  last_event_name text,
  last_event_at timestamptz,
  requested_at timestamptz not null default timezone('utc', now()),
  signed_at timestamptz,
  expires_at timestamptz,
  is_current boolean not null default true,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  updated_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (document_kind in ('soa', 'sra')),
  check (status in ('signature_requested', 'signed', 'rejected', 'expired', 'cancelled', 'failed')),
  check (provider = 'clicksign'),
  check (provider_environment in ('sandbox', 'production')),
  check (char_length(trim(template_key)) > 0),
  check (char_length(trim(signer_name)) between 3 and 120),
  check (signer_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'),
  check (char_length(regexp_replace(signer_document, '\D', '', 'g')) = 11)
);

create unique index if not exists idx_client_representation_documents_current_kind
  on public.client_representation_documents (organization_id, document_kind)
  where is_current = true;

create index if not exists idx_client_representation_documents_org_kind_status
  on public.client_representation_documents (organization_id, document_kind, status);

create index if not exists idx_client_representation_documents_provider_envelope
  on public.client_representation_documents (provider_envelope_id)
  where provider_envelope_id is not null;

create index if not exists idx_client_representation_documents_provider_document
  on public.client_representation_documents (provider_document_id)
  where provider_document_id is not null;

create trigger set_client_representation_documents_updated_at
before update on public.client_representation_documents
for each row
execute function public.set_updated_at();

grant select, insert, update on public.client_representation_documents to authenticated;
grant all on public.client_representation_documents to service_role;

alter table public.client_representation_documents enable row level security;

create policy "client_representation_documents_select_org_or_admin"
on public.client_representation_documents
for select
to authenticated
using (public.is_active_member(organization_id) or public.is_admin_user());

create policy "client_representation_documents_insert_owner_admin"
on public.client_representation_documents
for insert
to authenticated
with check (
  public.has_org_role(
    organization_id,
    array['owner'::public.organization_member_role, 'admin'::public.organization_member_role]
  )
  or public.is_admin_user()
);

create policy "client_representation_documents_update_owner_admin"
on public.client_representation_documents
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

commit;
