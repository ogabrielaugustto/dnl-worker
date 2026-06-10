begin;

do $$
declare
  target_table text;
  target_tables text[] := array[
    'assets',
    'asset_files',
    'monitoring_rules',
    'scan_jobs',
    'scan_runs',
    'detections',
    'detection_evidences'
  ];
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    foreach target_table in array target_tables loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = target_table
      ) then
        execute format(
          'alter publication supabase_realtime add table public.%I',
          target_table
        );
      end if;
    end loop;
  end if;
end;
$$;

alter table public.assets replica identity full;
alter table public.asset_files replica identity full;
alter table public.monitoring_rules replica identity full;
alter table public.scan_jobs replica identity full;
alter table public.scan_runs replica identity full;
alter table public.detections replica identity full;
alter table public.detection_evidences replica identity full;

commit;
