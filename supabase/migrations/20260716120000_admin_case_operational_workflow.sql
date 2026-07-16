begin;

create table if not exists public.platform_legal_documents (
  id uuid primary key default gen_random_uuid(),
  document_kind text not null,
  title text not null,
  description text,
  storage_provider text not null default 'r2',
  storage_bucket text not null default 'evidence',
  storage_key text,
  public_url text,
  external_url text,
  status text not null default 'attached',
  version_label text,
  is_active boolean not null default true,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  updated_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (document_kind in ('dnl_cnpj', 'dnl_social_contract', 'other')),
  check (status in ('missing', 'draft', 'attached', 'signature_requested', 'signed', 'sent', 'rejected', 'expired')),
  check (storage_bucket in ('assets', 'evidence')),
  check (char_length(trim(title)) between 2 and 160)
);

create table if not exists public.case_workflows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  case_public_id integer not null check (case_public_id > 0),
  representative_detection_id uuid,
  stage text not null default 'documents',
  priority text not null default 'normal',
  assigned_to_user_id uuid references public.profiles(id) on delete set null,
  next_action text,
  next_action_due_at timestamptz,
  notified_name text,
  notified_email text,
  notified_phone text,
  notified_document text,
  notified_domain text,
  notified_website_url text,
  summary text,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  updated_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, case_public_id),
  foreign key (representative_detection_id, organization_id)
    references public.detections(id, organization_id)
    on delete set null,
  check (stage in (
    'intake',
    'documents',
    'first_notice',
    'documentation_notice',
    'treatment',
    'negotiation',
    'agreement_signature',
    'payment',
    'collections',
    'legal',
    'closed'
  )),
  check (priority in ('low', 'normal', 'high', 'urgent')),
  check (notified_email is null or char_length(trim(notified_email)) <= 254),
  check (next_action is null or char_length(trim(next_action)) <= 240)
);

create table if not exists public.case_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  case_public_id integer not null check (case_public_id > 0),
  workflow_id uuid references public.case_workflows(id) on delete cascade,
  detection_id uuid,
  rights_ownership_confirmation_id uuid references public.rights_ownership_confirmations(id) on delete set null,
  platform_legal_document_id uuid references public.platform_legal_documents(id) on delete set null,
  document_kind text not null,
  status text not null default 'missing',
  title text not null,
  notes text,
  storage_provider text not null default 'r2',
  storage_bucket text not null default 'evidence',
  storage_key text,
  file_name text,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  external_url text,
  provider text,
  external_envelope_id text,
  external_status text,
  signed_at timestamptz,
  sent_at timestamptz,
  expires_at timestamptz,
  is_current boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  updated_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (id, organization_id),
  foreign key (detection_id, organization_id)
    references public.detections(id, organization_id)
    on delete set null,
  check (document_kind in ('rhf', 'soa', 'dnl_cnpj', 'dnl_social_contract', 'proofdata', 'metadata', 'sra', 'receipt', 'other')),
  check (status in ('missing', 'draft', 'attached', 'signature_requested', 'signed', 'sent', 'rejected', 'expired')),
  check (storage_bucket in ('assets', 'evidence')),
  check (jsonb_typeof(metadata) = 'object'),
  check (char_length(trim(title)) between 2 and 180)
);

create table if not exists public.case_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  case_public_id integer not null check (case_public_id > 0),
  workflow_id uuid references public.case_workflows(id) on delete cascade,
  detection_id uuid,
  user_id uuid references public.profiles(id) on delete set null,
  event_kind text not null,
  direction text not null default 'internal',
  title text not null,
  body_snapshot text,
  notes text,
  communication_subject text,
  communication_body_snapshot text,
  occurred_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (id, organization_id),
  foreign key (detection_id, organization_id)
    references public.detections(id, organization_id)
    on delete set null,
  check (event_kind in (
    'first_notice',
    'documentation_notice',
    'c1',
    'c1p',
    'c2',
    'negotiation',
    'doubt',
    'debate',
    'follow_up',
    'call',
    'other',
    'legal',
    'note',
    'status_change',
    'payment',
    'document'
  )),
  check (direction in ('internal', 'outbound', 'inbound', 'system')),
  check (jsonb_typeof(metadata) = 'object'),
  check (char_length(trim(title)) between 2 and 180)
);

create table if not exists public.case_settlements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  case_public_id integer not null check (case_public_id > 0),
  workflow_id uuid references public.case_workflows(id) on delete cascade,
  status text not null default 'draft',
  proposed_amount_cents integer check (proposed_amount_cents is null or proposed_amount_cents >= 0),
  currency text not null default 'BRL',
  proposal_sent_at timestamptz,
  sra_document_id uuid references public.case_documents(id) on delete set null,
  payment_method text,
  payment_due_date date,
  payment_reference text,
  payment_url text,
  paid_amount_cents integer check (paid_amount_cents is null or paid_amount_cents >= 0),
  paid_at timestamptz,
  receipt_document_id uuid references public.case_documents(id) on delete set null,
  collections_started_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  updated_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, case_public_id),
  check (status in ('draft', 'proposal_sent', 'sra_signature_pending', 'sra_signed', 'payment_pending', 'paid', 'overdue', 'collections', 'cancelled')),
  check (currency = upper(currency) and char_length(currency) = 3),
  check (payment_method is null or payment_method in ('boleto', 'pix', 'transfer', 'other')),
  check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists idx_case_documents_current_kind
  on public.case_documents (organization_id, case_public_id, document_kind)
  where is_current = true and document_kind <> 'other';

create index if not exists idx_case_workflows_stage_due
  on public.case_workflows (stage, next_action_due_at);

create index if not exists idx_case_documents_org_case_created_at
  on public.case_documents (organization_id, case_public_id, created_at desc);

create index if not exists idx_case_events_org_case_occurred_at
  on public.case_events (organization_id, case_public_id, occurred_at desc);

create index if not exists idx_case_settlements_status_due
  on public.case_settlements (status, payment_due_date);

create trigger set_platform_legal_documents_updated_at
before update on public.platform_legal_documents
for each row
execute function public.set_updated_at();

create trigger set_case_workflows_updated_at
before update on public.case_workflows
for each row
execute function public.set_updated_at();

create trigger set_case_documents_updated_at
before update on public.case_documents
for each row
execute function public.set_updated_at();

create trigger set_case_settlements_updated_at
before update on public.case_settlements
for each row
execute function public.set_updated_at();

grant select, insert, update, delete on public.platform_legal_documents to authenticated;
grant select, insert, update, delete on public.case_workflows to authenticated;
grant select, insert, update, delete on public.case_documents to authenticated;
grant select, insert, update, delete on public.case_events to authenticated;
grant select, insert, update, delete on public.case_settlements to authenticated;

grant all on public.platform_legal_documents to service_role;
grant all on public.case_workflows to service_role;
grant all on public.case_documents to service_role;
grant all on public.case_events to service_role;
grant all on public.case_settlements to service_role;

alter table public.platform_legal_documents enable row level security;
alter table public.case_workflows enable row level security;
alter table public.case_documents enable row level security;
alter table public.case_events enable row level security;
alter table public.case_settlements enable row level security;

create policy "platform_legal_documents_select_admin"
on public.platform_legal_documents
for select
to authenticated
using (public.is_admin_user());

create policy "platform_legal_documents_manage_admin"
on public.platform_legal_documents
for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

create policy "case_workflows_select_admin"
on public.case_workflows
for select
to authenticated
using (public.is_admin_user());

create policy "case_workflows_manage_admin"
on public.case_workflows
for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

create policy "case_documents_select_admin"
on public.case_documents
for select
to authenticated
using (public.is_admin_user());

create policy "case_documents_manage_admin"
on public.case_documents
for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

create policy "case_events_select_admin"
on public.case_events
for select
to authenticated
using (public.is_admin_user());

create policy "case_events_manage_admin"
on public.case_events
for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

create policy "case_settlements_select_admin"
on public.case_settlements
for select
to authenticated
using (public.is_admin_user());

create policy "case_settlements_manage_admin"
on public.case_settlements
for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

commit;
