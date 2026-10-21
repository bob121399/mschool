begin;
-- Caller: any authenticated user (proxy). Distinguishes "no profile yet" (onboarding/invitation)
-- from a suspended user or an inactive tenant, which RLS deliberately hides as "no row".
-- Returns only a state label for the caller's own account; no other data.
create function public.my_access_state()
returns text language sql stable security definer set search_path = '' as $$
  select case
    when u.id is null then 'no_profile'
    when u.status <> 'active' then 'user_suspended'
    when u.role <> 'superadmin' and coalesce(t.status, '') not in ('trial','active') then 'tenant_inactive'
    else 'ok' end
  from (select auth.uid() as uid) x
  left join public.users u on u.id = x.uid
  left join public.tenants t on t.id = u.tenant_id;
$$;
revoke all on function public.my_access_state() from public, anon, authenticated;
grant execute on function public.my_access_state() to authenticated;
commit;
