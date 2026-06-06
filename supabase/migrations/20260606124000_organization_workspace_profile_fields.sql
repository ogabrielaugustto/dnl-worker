begin;

alter table public.organizations
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists website_url text,
  add column if not exists instagram_handle text;

update public.organizations
set contact_email = coalesce(contact_email, billing_email)
where contact_email is null
  and billing_email is not null;

alter table public.organizations
  add constraint organizations_contact_email_format_check
  check (
    contact_email is null
    or contact_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
  );

alter table public.organizations
  add constraint organizations_website_url_format_check
  check (
    website_url is null
    or website_url ~* '^https?://'
  );

alter table public.organizations
  add constraint organizations_instagram_handle_format_check
  check (
    instagram_handle is null
    or instagram_handle ~ '^[A-Za-z0-9._]+$'
  );

commit;
