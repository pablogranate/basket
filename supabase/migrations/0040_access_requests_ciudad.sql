-- 0040: City declared on the access request form. Nullable because existing
-- rows predate the field. Idempotent.

alter table public.access_requests
  add column if not exists ciudad text;
