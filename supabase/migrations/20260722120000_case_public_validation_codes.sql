create table if not exists public.case_public_validation_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  case_public_id integer not null check (case_public_id > 0),
  code_hash text not null,
  code_hint text not null,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (code_hash)
);

create index if not exists idx_case_public_validation_codes_lookup
  on public.case_public_validation_codes (case_public_id, code_hash)
  where revoked_at is null;

create index if not exists idx_case_public_validation_codes_org_case_created_at
  on public.case_public_validation_codes (organization_id, case_public_id, created_at desc);

grant select, insert, update, delete on public.case_public_validation_codes to authenticated;
grant all on public.case_public_validation_codes to service_role;

alter table public.case_public_validation_codes enable row level security;

create policy "case_public_validation_codes_select_admin"
on public.case_public_validation_codes
for select
to authenticated
using (public.is_admin_user());

create policy "case_public_validation_codes_manage_admin"
on public.case_public_validation_codes
for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());
