begin;

drop table if exists public.source_seed_urls cascade;
drop table if exists public.discovered_images cascade;
drop table if exists public.crawled_pages cascade;
drop table if exists public.source_crawl_runs cascade;
drop table if exists public.monitored_sources cascade;

alter table if exists public.asset_files
  drop column if exists phash;

commit;
