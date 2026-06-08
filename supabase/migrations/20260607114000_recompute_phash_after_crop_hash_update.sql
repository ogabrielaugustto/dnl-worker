begin;

update public.asset_files
set
  phash = null,
  updated_at = timezone('utc', now())
where phash is not null;

update public.discovered_images
set
  phash = null,
  updated_at = timezone('utc', now())
where phash is not null;

commit;
