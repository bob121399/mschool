begin;
-- Caller: HR of the ticket's tenant or MFA superadmin (user-scoped). Human resolution of a ticket;
-- agent replies are never treated as resolution. Audit: admin_audit_logs.
create function public.update_ticket_status(p_ticket uuid, p_status text, p_resolution text)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.support_tickets;
begin
  select * into t from public.support_tickets where id = p_ticket for update;
  if not found or not private.can_manage(t.tenant_id) then raise exception 'NOT_FOUND' using errcode = '42501'; end if;
  if p_status not in ('open','escalated','resolved') then raise exception 'INVALID_STATUS' using errcode = '22023'; end if;
  if p_status = 'resolved' and length(coalesce(trim(p_resolution),'')) < 3 then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  update public.support_tickets set status = p_status, resolution = nullif(trim(p_resolution),''), updated_at = now()
    where id = t.id;
  insert into public.admin_audit_logs(tenant_id,actor_id,action,object_type,object_id,redacted_diff)
    values(t.tenant_id,auth.uid(),'ticket_status','support_ticket',t.id,jsonb_build_object('from',t.status,'to',p_status));
end;
$$;

-- Caller: MFA superadmin. Global investigation of a tenant requires an explicit reason and is logged.
create function public.log_superadmin_view(p_tenant uuid, p_reason text, p_scope text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_superadmin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if length(coalesce(trim(p_reason),'')) < 10 then raise exception 'REASON_REQUIRED' using errcode = '22023'; end if;
  if not exists(select 1 from public.tenants where id = p_tenant) then raise exception 'NOT_FOUND' using errcode = '42501'; end if;
  insert into public.admin_audit_logs(tenant_id,actor_id,action,object_type,object_id,redacted_diff)
    values(p_tenant,auth.uid(),'view_tenant','tenant',p_tenant,
      jsonb_build_object('reason',left(trim(p_reason),500),'scope',left(coalesce(p_scope,'details'),40)));
end;
$$;

revoke all on function public.update_ticket_status(uuid,text,text), public.log_superadmin_view(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.update_ticket_status(uuid,text,text), public.log_superadmin_view(uuid,text,text)
  to authenticated;
commit;
