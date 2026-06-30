alter table public.scan_jobs
  add column if not exists summary_email_sent_at timestamptz;
