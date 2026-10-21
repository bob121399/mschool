begin;
-- A superadmin (tenant_id IS NULL) must be able to read only its own profile row before MFA, so the
-- proxy can route it to /mfa instead of treating it as "no profile". Global access still needs AAL2.
alter policy user_read on public.users
  using ((id = auth.uid() and (tenant_id = private.tenant_id() or tenant_id is null)) or private.can_manage(tenant_id));
commit;
