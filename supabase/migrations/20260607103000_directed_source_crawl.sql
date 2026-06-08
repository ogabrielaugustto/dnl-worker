begin;

create table public.monitored_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domain text not null,
  base_url text not null,
  source_type text not null default 'portal',
  priority text not null default 'medium',
  crawl_frequency_hours integer not null default 24 check (crawl_frequency_hours > 0),
  discovery_modes text[] not null default array['sitemap']::text[],
  is_active boolean not null default true,
  last_crawled_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (domain),
  check (priority in ('high', 'medium', 'low')),
  check (source_type in ('portal', 'blog', 'ecommerce', 'government', 'marketplace', 'other'))
);

create table public.source_crawl_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.monitored_sources(id) on delete cascade,
  status text not null default 'processing',
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  pages_discovered integer not null default 0 check (pages_discovered >= 0),
  pages_crawled integer not null default 0 check (pages_crawled >= 0),
  images_discovered integer not null default 0 check (images_discovered >= 0),
  matches_created integer not null default 0 check (matches_created >= 0),
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (status in ('processing', 'completed', 'failed'))
);

create table public.crawled_pages (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.monitored_sources(id) on delete cascade,
  crawl_run_id uuid references public.source_crawl_runs(id) on delete set null,
  url text not null,
  canonical_url text not null,
  domain text,
  title text,
  status_code integer check (status_code is null or status_code >= 100),
  content_hash text,
  crawled_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (source_id, canonical_url)
);

create table public.discovered_images (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.monitored_sources(id) on delete cascade,
  crawled_page_id uuid not null references public.crawled_pages(id) on delete cascade,
  crawl_run_id uuid references public.source_crawl_runs(id) on delete set null,
  page_url text not null,
  image_url text not null,
  normalized_url text not null,
  domain text,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  content_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  phash text,
  alt_text text,
  metadata jsonb not null default '{}'::jsonb,
  collected_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (crawled_page_id, normalized_url)
);

create index idx_monitored_sources_active_due
  on public.monitored_sources (is_active, last_crawled_at);

create index idx_source_crawl_runs_source_created_at
  on public.source_crawl_runs (source_id, created_at desc);

create index idx_crawled_pages_source_crawled_at
  on public.crawled_pages (source_id, crawled_at desc);

create index idx_discovered_images_source_collected_at
  on public.discovered_images (source_id, collected_at desc);

create index idx_discovered_images_phash
  on public.discovered_images (phash)
  where phash is not null;

create trigger set_monitored_sources_updated_at
before update on public.monitored_sources
for each row
execute function public.set_updated_at();

create trigger set_source_crawl_runs_updated_at
before update on public.source_crawl_runs
for each row
execute function public.set_updated_at();

create trigger set_crawled_pages_updated_at
before update on public.crawled_pages
for each row
execute function public.set_updated_at();

create trigger set_discovered_images_updated_at
before update on public.discovered_images
for each row
execute function public.set_updated_at();

alter table public.monitored_sources enable row level security;
alter table public.source_crawl_runs enable row level security;
alter table public.crawled_pages enable row level security;
alter table public.discovered_images enable row level security;

create policy "monitored_sources_select_admin"
on public.monitored_sources
for select
to authenticated
using (public.is_admin_user());

create policy "monitored_sources_manage_admin"
on public.monitored_sources
for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

create policy "source_crawl_runs_select_admin"
on public.source_crawl_runs
for select
to authenticated
using (public.is_admin_user());

create policy "crawled_pages_select_admin"
on public.crawled_pages
for select
to authenticated
using (public.is_admin_user());

create policy "discovered_images_select_admin"
on public.discovered_images
for select
to authenticated
using (public.is_admin_user());

grant select, insert, update, delete on public.monitored_sources to authenticated;
grant select on public.source_crawl_runs to authenticated;
grant select on public.crawled_pages to authenticated;
grant select on public.discovered_images to authenticated;

grant all on public.monitored_sources to service_role;
grant all on public.source_crawl_runs to service_role;
grant all on public.crawled_pages to service_role;
grant all on public.discovered_images to service_role;

commit;
