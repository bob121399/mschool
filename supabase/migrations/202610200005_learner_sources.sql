begin;
-- Caller: employee (user-scoped). Approved excerpts linked to an OPEN lesson of own assignment
-- (citations in the player, spec 4.5). Rubric references are never included.
create function public.lesson_sources_for_learner(p_assignment uuid, p_lesson uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare ctx jsonb := public.lesson_context(p_assignment, p_lesson); result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('chunk_id',ch.id,'document_title',d.title,'page',ch.page,
      'excerpt',left(ch.content,600)) order by d.title, ch.page, ch.chunk_index),'[]'::jsonb)
    into result
  from public.lesson_sources s
  join public.document_chunks ch on ch.id = s.chunk_id and ch.tenant_id = s.tenant_id
  join public.documents d on d.id = ch.document_id and d.tenant_id = ch.tenant_id
  where s.lesson_id = p_lesson and s.tenant_id = (ctx->>'tenant_id')::uuid and d.status = 'approved';
  return result;
end;
$$;
revoke all on function public.lesson_sources_for_learner(uuid,uuid) from public, anon, authenticated;
grant execute on function public.lesson_sources_for_learner(uuid,uuid) to authenticated;

-- Optional parameters for partial tenant updates (PostgREST omits undefined arguments).
drop function public.admin_update_tenant(uuid,text,text,integer,text);
create function public.admin_update_tenant(p_tenant uuid, p_reason text, p_tier text default null,
  p_status text default null, p_max_daily_ai_calls integer default null)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.tenants;
begin
  if not private.is_superadmin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if length(coalesce(trim(p_reason),'')) < 10 then raise exception 'REASON_REQUIRED' using errcode = '22023'; end if;
  select * into t from public.tenants where id = p_tenant for update;
  if not found then raise exception 'NOT_FOUND' using errcode = '42501'; end if;
  update public.tenants set subscription_tier = coalesce(p_tier, subscription_tier),
      status = coalesce(p_status, status), max_daily_ai_calls = coalesce(p_max_daily_ai_calls, max_daily_ai_calls)
    where id = p_tenant;
  insert into public.admin_audit_logs(tenant_id,actor_id,action,object_type,object_id,redacted_diff)
    values(p_tenant,auth.uid(),'update_tenant','tenant',p_tenant,jsonb_build_object(
      'tier',jsonb_build_array(t.subscription_tier,coalesce(p_tier,t.subscription_tier)),
      'status',jsonb_build_array(t.status,coalesce(p_status,t.status)),
      'max_daily_ai_calls',jsonb_build_array(t.max_daily_ai_calls,coalesce(p_max_daily_ai_calls,t.max_daily_ai_calls)),
      'reason',left(p_reason,500)));
end;
$$;
revoke all on function public.admin_update_tenant(uuid,text,text,text,integer) from public, anon, authenticated;
grant execute on function public.admin_update_tenant(uuid,text,text,text,integer) to authenticated;
commit;
