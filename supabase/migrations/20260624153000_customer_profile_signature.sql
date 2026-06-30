begin;

alter table public.profiles
  add column if not exists signature_mode text,
  add column if not exists signature_payload jsonb,
  add column if not exists signature_svg text,
  add column if not exists signature_signed_name text,
  add column if not exists signature_updated_at timestamptz;

alter table public.profiles
  add constraint profiles_signature_mode_check
  check (
    signature_mode is null
    or signature_mode in ('draw', 'type')
  );

alter table public.profiles
  add constraint profiles_signature_payload_object_check
  check (
    signature_payload is null
    or jsonb_typeof(signature_payload) = 'object'
  );

alter table public.profiles
  add constraint profiles_signature_signed_name_length_check
  check (
    signature_signed_name is null
    or char_length(signature_signed_name) between 3 and 120
  );

alter table public.profiles
  add constraint profiles_signature_consistency_check
  check (
    (
      signature_mode is null
      and signature_payload is null
      and signature_svg is null
      and signature_signed_name is null
      and signature_updated_at is null
    )
    or (
      signature_mode is not null
      and signature_payload is not null
      and signature_svg is not null
      and signature_signed_name is not null
      and signature_updated_at is not null
    )
  );

commit;
