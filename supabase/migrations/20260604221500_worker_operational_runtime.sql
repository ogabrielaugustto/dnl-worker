begin;

alter table public.scan_jobs
  add column if not exists dedupe_key text,
  add column if not exists queue_name text not null default 'scan-jobs',
  add column if not exists available_at timestamptz not null default timezone('utc', now()),
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text,
  add column if not exists completed_run_id uuid;

update public.scan_jobs
set dedupe_key = concat('legacy:', id::text)
where dedupe_key is null;

alter table public.scan_jobs
  alter column dedupe_key set not null;

create unique index if not exists idx_scan_jobs_dedupe_key
  on public.scan_jobs (dedupe_key);

alter table public.scan_jobs
  add constraint scan_jobs_completed_run_id_fkey
  foreign key (completed_run_id)
  references public.scan_runs(id)
  on delete set null;

alter table public.scan_runs
  add column if not exists context jsonb not null default '{}'::jsonb;

alter table public.detection_evidences
  add column if not exists source_url_snapshot text;

create or replace function public.next_monitoring_rule_run_at(
  frequency public.monitoring_rule_frequency,
  base_time timestamptz
)
returns timestamptz
language sql
immutable
set search_path = public
as $$
  select case frequency
    when 'hourly' then base_time + interval '1 hour'
    when 'daily' then base_time + interval '1 day'
    when 'weekly' then base_time + interval '7 days'
    when 'monthly' then base_time + interval '1 month'
  end;
$$;

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
begin
  for scheduled_rule in
    select
      mr.id,
      mr.organization_id,
      mr.asset_id,
      mr.frequency,
      coalesce(plan_snapshot.code, 'starter') as plan_code
    from public.monitoring_rules mr
    join public.assets a
      on a.id = mr.asset_id
     and a.organization_id = mr.organization_id
    join public.organizations o
      on o.id = mr.organization_id
    left join lateral (
      select sp.code
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
    new_dedupe_key := format(
      'scheduled:%s:%s',
      scheduled_rule.id::text,
      to_char(run_at at time zone 'utc', 'YYYY-MM-DD')
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
    on conflict (dedupe_key) do nothing
    returning id into new_scan_job_id;

    if new_scan_job_id is null then
      continue;
    end if;

    update public.monitoring_rules
    set
      last_run_at = run_at,
      next_run_at = public.next_monitoring_rule_run_at(scheduled_rule.frequency, run_at),
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
grant execute on function public.next_monitoring_rule_run_at(public.monitoring_rule_frequency, timestamptz) to service_role;

commit;
