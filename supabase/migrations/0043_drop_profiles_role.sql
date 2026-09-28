-- 0043: contract step of dropping profiles.role (basket#189). Run after #189
-- is deployed and `pnpm db:auth:seed-portal` has given every Cuenta an
-- identity and a portal Acceso. The app_role type stays: the portal's catalog
-- role keys and the AppRole type still name the same three values.
-- Non-reversible on purpose: the Auth DB is the only source of the role now.
alter table public.profiles
  drop column role;
