begin;

update public.monitored_sources
set
  last_crawled_at = null,
  updated_at = timezone('utc', now())
where id in (
  select distinct source_id
  from public.source_seed_urls
  where is_active = true
);

commit;
