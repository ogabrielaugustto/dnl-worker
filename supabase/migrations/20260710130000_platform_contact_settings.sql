begin;

create table if not exists public.platform_settings (
  id boolean primary key default true check (id),
  contact_email text,
  contact_whatsapp text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger set_platform_settings_updated_at
before update on public.platform_settings
for each row execute function public.set_updated_at();

alter table public.platform_settings enable row level security;

create policy "platform_settings_select_system_admin"
on public.platform_settings
for select
to authenticated
using (public.is_admin_user());

create policy "platform_settings_manage_system_admin"
on public.platform_settings
for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

insert into public.platform_settings (id)
values (true)
on conflict (id) do nothing;

commit;
