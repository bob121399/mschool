-- Self-service display name. Caller: any active user (user-scoped). Touches only full_name.
begin;
create function public.set_own_name(p_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED' using errcode = '42501'; end if;
  if length(coalesce(trim(p_name),'')) > 200 then raise exception 'INVALID_NAME' using errcode = '22023'; end if;
  update public.users set full_name = trim(p_name) where id = auth.uid() and status = 'active';
end;
$$;
revoke all on function public.set_own_name(text) from public, anon, authenticated;
grant execute on function public.set_own_name(text) to authenticated;
commit;
