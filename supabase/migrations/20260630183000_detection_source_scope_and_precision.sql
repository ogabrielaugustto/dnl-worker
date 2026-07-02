begin;

alter table public.detections
  add column if not exists source_scope text not null default 'international',
  add column if not exists source_scope_confidence numeric(5, 4);

alter table public.detections
  drop constraint if exists detections_source_scope_check;

alter table public.detections
  add constraint detections_source_scope_check
  check (source_scope in ('national', 'international'));

alter table public.detections
  drop constraint if exists detections_source_scope_confidence_check;

alter table public.detections
  add constraint detections_source_scope_confidence_check
  check (
    source_scope_confidence is null
    or (source_scope_confidence >= 0 and source_scope_confidence <= 1)
  );

create index if not exists detections_source_scope_idx
  on public.detections (source_scope);

commit;
