begin;

alter table public.monitored_sources
  add column if not exists sitemap_urls text[] not null default array[]::text[],
  add column if not exists crawl_window_days integer not null default 2 check (crawl_window_days > 0),
  add column if not exists max_pages_per_run integer not null default 50 check (max_pages_per_run > 0);

create table public.source_seed_urls (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.monitored_sources(id) on delete cascade,
  url text not null,
  canonical_url text not null,
  label text,
  is_active boolean not null default true,
  last_crawled_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (source_id, canonical_url)
);

create index idx_source_seed_urls_source_active
  on public.source_seed_urls (source_id, is_active);

create trigger set_source_seed_urls_updated_at
before update on public.source_seed_urls
for each row
execute function public.set_updated_at();

alter table public.source_seed_urls enable row level security;

create policy "source_seed_urls_select_admin"
on public.source_seed_urls
for select
to authenticated
using (public.is_admin_user());

create policy "source_seed_urls_manage_admin"
on public.source_seed_urls
for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

grant select, insert, update, delete on public.source_seed_urls to authenticated;
grant all on public.source_seed_urls to service_role;

update public.monitored_sources
set
  sitemap_urls = array[
    'https://casavogue.globo.com/sitemap/casavogue/sitemap.xml',
    'https://casavogue.globo.com/sitemap/casavogue/news.xml',
    'https://casavogue.globo.com/sitemap/home/casavogue/sitemap.xml',
    'https://casavogue.globo.com/sitemap/last-news.xml'
  ]::text[],
  crawl_window_days = 1200,
  max_pages_per_run = 200,
  updated_at = timezone('utc', now())
where domain = 'casavogue.globo.com';

insert into public.source_seed_urls (
  source_id,
  url,
  canonical_url,
  label,
  is_active
)
select
  id,
  'https://casavogue.globo.com/lazer-e-cultura/viagem/noticia/2023/10/paisagens-naturais-mais-lindas-brasil.ghtml',
  'https://casavogue.globo.com/lazer-e-cultura/viagem/noticia/2023/10/paisagens-naturais-mais-lindas-brasil.ghtml',
  'Paisagens naturais mais lindas do Brasil',
  true
from public.monitored_sources
where domain = 'casavogue.globo.com'
on conflict (source_id, canonical_url) do update
set
  url = excluded.url,
  label = excluded.label,
  is_active = excluded.is_active,
  updated_at = timezone('utc', now());

commit;
