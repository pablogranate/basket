-- 0039: Club broadcast contact (Responsable de Transmisión) and registered
-- BasquetPass account, sourced from the Liga Metropolitana sheet. Idempotent.

alter table public.clubs
  add column if not exists broadcast_manager text,
  add column if not exists broadcast_phone text,
  add column if not exists bp_account text;
