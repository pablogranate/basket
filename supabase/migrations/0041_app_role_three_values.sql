-- 0041: shrink app_role to the three live values. 0016 folded the rows
-- (coordinator -> editor, viewer -> collaborator); this drops the labels.
-- Postgres cannot drop enum values, so the type is swapped. The column default
-- goes too: every write path sets role explicitly and must keep doing so.
-- Non-reversible on purpose: a down would re-add labels nobody uses.
do $$
begin
  if exists (
    select 1 from public.profiles where role::text in ('coordinator', 'viewer')
  ) then
    raise exception 'profiles still hold coordinator/viewer rows; run 0016 first';
  end if;
end $$;

create type public.app_role_next as enum ('admin', 'editor', 'collaborator');

alter table public.profiles
  alter column role drop default,
  alter column role type public.app_role_next
    using role::text::public.app_role_next;

drop type public.app_role;

alter type public.app_role_next rename to app_role;
