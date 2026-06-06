begin;

alter table public.detection_evidences
  add column if not exists matched_image_storage_key text,
  add column if not exists matched_image_url_snapshot text;

commit;
