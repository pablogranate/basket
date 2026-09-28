-- 0042: expand step of dropping profiles.role (basket#189). The portal reads
-- its role from the portal Acceso in the Auth DB (ADR 0010), and #189's code
-- stops writing the column, so new Cuentas leave it empty. Run before
-- deploying #189: the old build still writes it and works either way.
alter table public.profiles
  alter column role drop not null;
