begin;

alter table public.profiles
  add column if not exists phone text,
  add column if not exists profession text,
  add column if not exists postal_code text,
  add column if not exists address_number text,
  add column if not exists address_complement text;

alter table public.profiles
  add constraint profiles_phone_length_check
  check (
    phone is null
    or char_length(regexp_replace(phone, '\D', '', 'g')) between 10 and 13
  );

alter table public.profiles
  add constraint profiles_profession_length_check
  check (
    profession is null
    or char_length(trim(profession)) between 2 and 120
  );

alter table public.profiles
  add constraint profiles_postal_code_length_check
  check (
    postal_code is null
    or char_length(regexp_replace(postal_code, '\D', '', 'g')) = 8
  );

alter table public.profiles
  add constraint profiles_address_number_length_check
  check (
    address_number is null
    or char_length(trim(address_number)) between 1 and 40
  );

alter table public.organizations
  add column if not exists legal_name text,
  add column if not exists trade_name text,
  add column if not exists postal_code text,
  add column if not exists street text,
  add column if not exists number text,
  add column if not exists complement text,
  add column if not exists neighborhood text,
  add column if not exists city text,
  add column if not exists state text;

update public.organizations
set legal_name = coalesce(legal_name, name),
    trade_name = coalesce(trade_name, name)
where legal_name is null
   or trade_name is null;

alter table public.organizations
  add constraint organizations_legal_name_length_check
  check (
    legal_name is null
    or char_length(trim(legal_name)) between 2 and 160
  );

alter table public.organizations
  add constraint organizations_trade_name_length_check
  check (
    trade_name is null
    or char_length(trim(trade_name)) between 2 and 160
  );

alter table public.organizations
  add constraint organizations_postal_code_length_check
  check (
    postal_code is null
    or char_length(regexp_replace(postal_code, '\D', '', 'g')) = 8
  );

alter table public.organizations
  add constraint organizations_number_length_check
  check (
    number is null
    or char_length(trim(number)) between 1 and 40
  );

alter table public.organizations
  add constraint organizations_state_length_check
  check (
    state is null
    or char_length(trim(state)) between 2 and 8
  );

commit;
