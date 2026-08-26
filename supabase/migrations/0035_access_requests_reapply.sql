-- A resolved request must not lock the email out: revoking access (or deleting
-- the person) has to leave a way back in, and self-signup is the only door.
-- Uniqueness therefore applies to PENDING rows only, so the history of every
-- past decision is kept while at most one request per person awaits a decision.

drop index if exists public.access_requests_email_lower_key;
drop index if exists public.access_requests_auth_user_id_key;

create unique index if not exists access_requests_pending_email_key
  on public.access_requests (lower(email))
  where status = 'pendiente';

create unique index if not exists access_requests_pending_auth_user_key
  on public.access_requests (auth_user_id)
  where status = 'pendiente';

-- Still wanted for the lookups that resolve an applicant's latest request.
create index if not exists access_requests_email_lower_idx
  on public.access_requests (lower(email));

create index if not exists access_requests_auth_user_id_idx
  on public.access_requests (auth_user_id);
