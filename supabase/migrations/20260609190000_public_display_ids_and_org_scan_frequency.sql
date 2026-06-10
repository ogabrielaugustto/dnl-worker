begin;

create or replace function public.generate_numeric_public_id(
  target_table regclass,
  target_column text default 'public_id'
)
returns integer
language plpgsql
volatile
set search_path = public
as $$
declare
  candidate integer;
  exists_id boolean;
begin
  loop
    candidate := floor(random() * 90000000 + 10000000)::integer;

    execute format(
      'select exists (select 1 from %s where %I = $1)',
      target_table,
      target_column
    )
    into exists_id
    using candidate;

    if not exists_id then
      return candidate;
    end if;
  end loop;
end;
$$;

create or replace function public.normalize_detection_case_key(
  detection_asset_id uuid,
  detection_domain text,
  detection_source_url text,
  detection_canonical_source_url text
)
returns text
language sql
immutable
set search_path = public
as $$
  select concat_ws(
    ':',
    detection_asset_id::text,
    coalesce(
      nullif(regexp_replace(lower(trim(coalesce(detection_domain, ''))), '^www\.', ''), ''),
      nullif(
        regexp_replace(
          lower(
            split_part(
              regexp_replace(coalesce(detection_canonical_source_url, detection_source_url, ''), '^https?://', ''),
              '/',
              1
            )
          ),
          '^www\.',
          ''
        ),
        ''
      ),
      'site-nao-identificado'
    )
  );
$$;

alter table public.assets
  add column if not exists public_id integer;

alter table public.detections
  add column if not exists public_id integer,
  add column if not exists case_public_id integer;

alter table public.assets
  add constraint assets_public_id_unique unique (public_id);

alter table public.detections
  add constraint detections_public_id_unique unique (public_id);

create index if not exists idx_detections_case_public_id
  on public.detections (case_public_id);

create or replace function public.set_asset_public_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.public_id is null then
    new.public_id := public.generate_numeric_public_id('public.assets'::regclass);
  end if;

  return new;
end;
$$;

create or replace function public.set_detection_public_ids()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  current_case_key text;
  existing_case_public_id integer;
begin
  if new.public_id is null then
    new.public_id := public.generate_numeric_public_id('public.detections'::regclass);
  end if;

  if new.case_public_id is null then
    current_case_key := public.normalize_detection_case_key(
      new.asset_id,
      new.domain,
      new.source_url,
      new.canonical_source_url
    );

    select d.case_public_id
    into existing_case_public_id
    from public.detections d
    where d.organization_id = new.organization_id
      and d.asset_id = new.asset_id
      and d.case_public_id is not null
      and public.normalize_detection_case_key(
        d.asset_id,
        d.domain,
        d.source_url,
        d.canonical_source_url
      ) = current_case_key
    order by d.created_at asc
    limit 1;

    new.case_public_id := coalesce(
      existing_case_public_id,
      public.generate_numeric_public_id('public.detections'::regclass, 'case_public_id')
    );
  end if;

  return new;
end;
$$;

drop trigger if exists set_asset_public_id on public.assets;
create trigger set_asset_public_id
before insert on public.assets
for each row
execute function public.set_asset_public_id();

drop trigger if exists set_detection_public_ids on public.detections;
create trigger set_detection_public_ids
before insert on public.detections
for each row
execute function public.set_detection_public_ids();

with numbered_assets as (
  select
    id,
    10000000 + row_number() over (order by created_at, id) as generated_public_id
  from public.assets
  where public_id is null
)
update public.assets a
set public_id = numbered_assets.generated_public_id
from numbered_assets
where a.id = numbered_assets.id;

with numbered_detections as (
  select
    id,
    10000000 + row_number() over (order by created_at, id) as generated_public_id
  from public.detections
  where public_id is null
)
update public.detections d
set public_id = numbered_detections.generated_public_id
from numbered_detections
where d.id = numbered_detections.id;

create temporary table tmp_detection_case_public_ids as
select
  missing_cases.case_key,
  coalesce(
    existing.case_public_id,
    missing_cases.generated_case_public_id
  ) as case_public_id
from (
  select
    case_key,
    10000000 + row_number() over (order by case_key) as generated_case_public_id
  from (
    select distinct public.normalize_detection_case_key(
      d.asset_id,
      d.domain,
      d.source_url,
      d.canonical_source_url
    ) as case_key
    from public.detections d
    where d.case_public_id is null
  ) distinct_missing_cases
) missing_cases
left join lateral (
  select d2.case_public_id
  from public.detections d2
  where d2.case_public_id is not null
    and public.normalize_detection_case_key(
      d2.asset_id,
      d2.domain,
      d2.source_url,
      d2.canonical_source_url
    ) = missing_cases.case_key
  order by d2.created_at asc
  limit 1
) existing on true;

update public.detections d
set case_public_id = coalesce(
      d.case_public_id,
      generated.case_public_id
    )
from tmp_detection_case_public_ids generated
where generated.case_key = public.normalize_detection_case_key(
    d.asset_id,
    d.domain,
    d.source_url,
    d.canonical_source_url
  )
  and d.case_public_id is null;

drop table tmp_detection_case_public_ids;

alter table public.assets
  alter column public_id set not null;

alter table public.detections
  alter column public_id set not null,
  alter column case_public_id set not null;

grant execute on function public.generate_numeric_public_id(regclass, text) to service_role;
grant execute on function public.normalize_detection_case_key(uuid, text, text, text) to authenticated, service_role;

create or replace function public.worker_schedule_due_scan_jobs(
  run_at timestamptz default timezone('utc', now()),
  max_rules integer default 250
)
returns table (
  scan_job_id uuid,
  dedupe_key text,
  priority integer,
  organization_id uuid,
  asset_id uuid,
  monitoring_rule_id uuid,
  scheduled_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  scheduled_rule record;
  new_scan_job_id uuid;
  new_dedupe_key text;
  new_priority integer;
  dedupe_bucket text;
begin
  for scheduled_rule in
    select
      mr.id,
      mr.organization_id,
      mr.asset_id,
      coalesce(
        plan_snapshot.scan_frequency_cap_snapshot,
        plan_snapshot.scan_frequency_cap,
        mr.frequency
      ) as effective_frequency,
      coalesce(plan_snapshot.code, 'starter') as plan_code
    from public.monitoring_rules mr
    join public.assets a
      on a.id = mr.asset_id
     and a.organization_id = mr.organization_id
    join public.organizations o
      on o.id = mr.organization_id
    left join lateral (
      select
        os.scan_frequency_cap_snapshot,
        sp.scan_frequency_cap,
        sp.code
      from public.organization_subscriptions os
      join public.subscription_plans sp
        on sp.id = os.plan_id
      where os.organization_id = mr.organization_id
        and os.status in ('trialing', 'active', 'past_due', 'paused')
      order by os.created_at desc
      limit 1
    ) as plan_snapshot on true
    where mr.is_active = true
      and mr.archived_at is null
      and mr.asset_id is not null
      and mr.next_run_at is not null
      and mr.next_run_at <= run_at
      and a.status = 'active'
      and o.is_active = true
    order by mr.next_run_at asc
    limit max_rules
    for update of mr skip locked
  loop
    dedupe_bucket := case scheduled_rule.effective_frequency
      when 'hourly' then to_char(run_at at time zone 'utc', 'YYYY-MM-DD-HH24')
      else to_char(run_at at time zone 'utc', 'YYYY-MM-DD')
    end;

    new_dedupe_key := format(
      'scheduled:%s:%s',
      scheduled_rule.id::text,
      dedupe_bucket
    );

    new_priority := case scheduled_rule.plan_code
      when 'scale' then 50
      when 'growth' then 75
      else 100
    end;

    insert into public.scan_jobs (
      organization_id,
      asset_id,
      monitoring_rule_id,
      type,
      status,
      priority,
      scheduled_at,
      dedupe_key,
      queue_name,
      available_at
    )
    values (
      scheduled_rule.organization_id,
      scheduled_rule.asset_id,
      scheduled_rule.id,
      'scheduled_scan',
      'pending',
      new_priority,
      run_at,
      new_dedupe_key,
      'scan-jobs',
      run_at
    )
    on conflict on constraint scan_jobs_dedupe_key_unique do nothing
    returning id into new_scan_job_id;

    if new_scan_job_id is null then
      continue;
    end if;

    update public.monitoring_rules
    set
      frequency = scheduled_rule.effective_frequency,
      last_run_at = run_at,
      next_run_at = public.next_monitoring_rule_run_at(
        scheduled_rule.effective_frequency,
        run_at
      ),
      updated_at = timezone('utc', now())
    where id = scheduled_rule.id
      and organization_id = scheduled_rule.organization_id;

    scan_job_id := new_scan_job_id;
    dedupe_key := new_dedupe_key;
    priority := new_priority;
    organization_id := scheduled_rule.organization_id;
    asset_id := scheduled_rule.asset_id;
    monitoring_rule_id := scheduled_rule.id;
    scheduled_at := run_at;

    return next;
  end loop;

  return;
end;
$$;

grant execute on function public.worker_schedule_due_scan_jobs(timestamptz, integer) to service_role;

commit;
