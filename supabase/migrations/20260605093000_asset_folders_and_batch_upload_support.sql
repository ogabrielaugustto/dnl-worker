begin;

create table public.asset_folders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (id, organization_id),
  unique (organization_id, name)
);

alter table public.assets
  add column if not exists folder_id uuid;

alter table public.assets
  add constraint assets_folder_id_organization_id_fkey
  foreign key (folder_id, organization_id)
  references public.asset_folders(id, organization_id)
  on delete restrict;

create index idx_asset_folders_org_created_at
  on public.asset_folders (organization_id, created_at desc);

create index idx_assets_org_folder
  on public.assets (organization_id, folder_id);

create trigger set_asset_folders_updated_at
before update on public.asset_folders
for each row
execute function public.set_updated_at();

grant select, insert, update, delete on public.asset_folders to authenticated;
grant all on public.asset_folders to service_role;

alter table public.asset_folders enable row level security;

create policy "asset_folders_select_member_or_admin"
on public.asset_folders
for select
to authenticated
using (public.is_active_member(organization_id) or public.is_admin_user());

create policy "asset_folders_manage_owner_admin_or_system_admin"
on public.asset_folders
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

commit;
