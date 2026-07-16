begin;

alter table public.platform_settings
  add column if not exists trade_name text,
  add column if not exists legal_name text,
  add column if not exists cnpj text,
  add column if not exists institutional_email text,
  add column if not exists institutional_phone text,
  add column if not exists postal_code text,
  add column if not exists address_line text,
  add column if not exists address_number text,
  add column if not exists address_complement text,
  add column if not exists district text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists about text,
  add column if not exists legal_representative_name text,
  add column if not exists legal_representative_document text,
  add column if not exists legal_representative_role text,
  add column if not exists legal_representative_phone text,
  add column if not exists legal_representative_email text;

commit;
