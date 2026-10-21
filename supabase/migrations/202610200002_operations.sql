-- MSchool operational RPCs (spec 2.3, 5.4, 6 step 2).
-- Every function header documents: caller, tenant scope, privileges, locks, idempotency, audit.
begin;

-- ---------------------------------------------------------------------------------------------
-- Superadmin requires MFA (AAL2) at the database layer, not only in the proxy (SEC-10, 5.3).
-- A password-only superadmin session therefore has no global RLS access via the Data API.
-- ---------------------------------------------------------------------------------------------
create or replace function private.is_superadmin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt()->>'aal', '') = 'aal2' and exists(select 1 from public.users
    where id = auth.uid() and role = 'superadmin' and status = 'active');
$$;

-- Caller: any helper. Raises unless the caller manages tenant p_tenant (HR of it or MFA superadmin).
create function private.require_manage(p_tenant uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_tenant is null or not private.can_manage(p_tenant) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
end;
$$;

-- Resolves the tenant an HR/superadmin request acts on. HR: always own tenant (p_tenant must be
-- null or equal). Superadmin: explicit tenant required.
create function private.acting_tenant(p_tenant uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare own uuid := private.tenant_id();
begin
  if private.is_superadmin() then
    if p_tenant is null then raise exception 'TENANT_REQUIRED' using errcode = '22023'; end if;
    perform private.require_manage(p_tenant);
    return p_tenant;
  end if;
  if own is null or (p_tenant is not null and p_tenant <> own) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  perform private.require_manage(own);
  return own;
end;
$$;

create function private.random_token() returns text
language sql volatile security definer set search_path = '' as $$
  select encode(extensions.gen_random_bytes(32), 'hex');
$$;
create function private.sha256_hex(p text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(p, 'sha256'), 'hex');
$$;

-- Audit helper for SECURITY INVOKER RPCs: callers have no direct INSERT on admin_audit_logs.
-- Only records for a tenant the caller manages, with actor = auth.uid().
create function private.audit(p_tenant uuid, p_action text, p_object_type text, p_object uuid, p_diff jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_manage(p_tenant);
  insert into public.admin_audit_logs(tenant_id,actor_id,action,object_type,object_id,redacted_diff)
    values(p_tenant,auth.uid(),p_action,p_object_type,p_object,coalesce(p_diff,'{}'::jsonb));
end;
$$;

create unique index invoices_payment_reference_unique on public.invoices(payment_reference)
  where payment_reference is not null;
create index agent_jobs_tenant_idx on public.agent_jobs(tenant_id, created_at desc);
create index tickets_tenant_idx on public.support_tickets(tenant_id, created_at desc);
create index appeals_tenant_idx on public.assessment_appeals(tenant_id, status, created_at desc);
create index documents_tenant_idx on public.documents(tenant_id, created_at desc);

-- ---------------------------------------------------------------------------------------------
-- Invitations (2.3). Caller: HR of tenant or MFA superadmin via user-scoped client.
-- Lock: pending row (tenant,email). Idempotency: one pending invitation per tenant/email; a repeat
-- rotates the token hash and invalidates the previous link. Audit: admin_audit_logs 'invite'.
-- Returns the raw token exactly once to the trusted server, which sends the Auth invite.
-- ---------------------------------------------------------------------------------------------
create function public.create_invitation(p_tenant uuid, p_email text, p_grade public.grade,
  p_department uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t uuid := private.acting_tenant(p_tenant); e text := lower(trim(p_email));
  tok text := private.random_token(); inv public.invitations;
begin
  if e is null or length(e) > 254 or e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_EMAIL' using errcode = '22023';
  end if;
  if exists(select 1 from public.users where lower(email) = e) then
    raise exception 'USER_EXISTS' using errcode = '23505';
  end if;
  if p_department is not null and not exists(select 1 from public.departments
      where id = p_department and tenant_id = t) then
    raise exception 'INVALID_DEPARTMENT' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(t::text || e, 2));
  update public.invitations set token_hash = private.sha256_hex(tok),
      expires_at = now() + interval '72 hours', target_grade = p_grade,
      department_id = p_department, invited_by = auth.uid()
    where tenant_id = t and email = e and accepted_at is null returning * into inv;
  if not found then
    insert into public.invitations(tenant_id,email,token_hash,expires_at,invited_by,target_grade,department_id)
      values(t,e,private.sha256_hex(tok),now() + interval '72 hours',auth.uid(),p_grade,p_department)
      returning * into inv;
  end if;
  insert into public.admin_audit_logs(tenant_id,actor_id,action,object_type,object_id,redacted_diff)
    values(t,auth.uid(),'invite','invitation',inv.id,
      jsonb_build_object('grade',p_grade,'department_id',p_department));
  return jsonb_build_object('invitation_id',inv.id,'email',inv.email,'token',tok,
    'expires_at',inv.expires_at,'tenant_id',t);
end;
$$;

-- Caller: freshly verified Auth user (user-scoped client) holding the one-time token.
-- Lock: advisory on auth uid + invitation row. Idempotency: repeat by the same user returns tenant.
-- Role is always employee; tenant/grade come from the invitation row, never from the browser.
create function public.accept_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); inv public.invitations; e text; confirmed timestamptz; existing uuid;
begin
  if uid is null then raise exception 'UNAUTHENTICATED' using errcode = '42501'; end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_INVITATION' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  select tenant_id into existing from public.users where id = uid;
  if found then
    if exists(select 1 from public.invitations where token_hash = private.sha256_hex(p_token)
        and tenant_id = existing and accepted_at is not null) then
      return existing;
    end if;
    raise exception 'ROLE_CONFLICT' using errcode = '23505';
  end if;
  select * into inv from public.invitations where token_hash = private.sha256_hex(p_token) for update;
  if not found or inv.accepted_at is not null or inv.expires_at <= now() then
    raise exception 'INVALID_INVITATION' using errcode = '22023';
  end if;
  select lower(email), email_confirmed_at into e, confirmed from auth.users where id = uid;
  if e is distinct from inv.email or confirmed is null then
    raise exception 'INVITATION_EMAIL_MISMATCH' using errcode = '42501';
  end if;
  if not exists(select 1 from public.tenants where id = inv.tenant_id and status in ('trial','active')) then
    raise exception 'TENANT_INACTIVE' using errcode = '42501';
  end if;
  insert into public.users(id,tenant_id,email,role,grade,department_id)
    values(uid,inv.tenant_id,e,'employee',inv.target_grade,inv.department_id);
  update public.invitations set accepted_at = now() where id = inv.id;
  insert into public.admin_audit_logs(tenant_id,actor_id,action,object_type,object_id,redacted_diff)
    values(inv.tenant_id,uid,'accept_invitation','invitation',inv.id,'{}'::jsonb);
  return inv.tenant_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Employee changes (2.3). Caller: HR of tenant / MFA superadmin. Lock: user row.
-- Grade change cancels the active assignment first; a new published track must be assigned
-- explicitly. Tenant and role cannot be changed here. Audit: 'update_employee' with diff.
-- ---------------------------------------------------------------------------------------------
create function public.update_employee(p_user uuid, p_grade public.grade default null,
  p_department uuid default null, p_clear_department boolean default false, p_status text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u public.users; cancelled integer := 0; diff jsonb := '{}'::jsonb;
begin
  select * into u from public.users where id = p_user for update;
  if not found or u.role <> 'employee' or not private.can_manage(u.tenant_id) then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('active','suspended') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;
  if p_department is not null and not exists(select 1 from public.departments
      where id = p_department and tenant_id = u.tenant_id) then
    raise exception 'INVALID_DEPARTMENT' using errcode = '22023';
  end if;
  if p_grade is not null and p_grade <> u.grade then
    update public.assignments set status = 'cancelled'
      where user_id = u.id and tenant_id = u.tenant_id and status = 'active';
    get diagnostics cancelled = row_count;
    diff := diff || jsonb_build_object('grade',jsonb_build_object('from',u.grade,'to',p_grade),
      'cancelled_assignments',cancelled);
  end if;
  if p_status is not null and p_status <> u.status then
    diff := diff || jsonb_build_object('status',jsonb_build_object('from',u.status,'to',p_status));
  end if;
  if p_clear_department or (p_department is not null and p_department is distinct from u.department_id) then
    diff := diff || jsonb_build_object('department',jsonb_build_object('from',u.department_id,
      'to',case when p_clear_department then null else p_department end));
  end if;
  update public.users set grade = coalesce(p_grade, grade), status = coalesce(p_status, status),
      department_id = case when p_clear_department then null else coalesce(p_department, department_id) end
    where id = u.id;
  insert into public.admin_audit_logs(tenant_id,actor_id,action,object_type,object_id,redacted_diff)
    values(u.tenant_id,auth.uid(),'update_employee','user',u.id,diff);
  return jsonb_build_object('user_id',u.id,'cancelled_assignments',cancelled);
end;
$$;

-- Role changes (2.3). Caller: MFA superadmin only. Lock: all HR rows of the tenant.
-- Guard: the last active HR of a tenant cannot be demoted. Audit: 'set_role' with reason.
create function public.set_user_role(p_user uuid, p_role public.app_role, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare u public.users; remaining integer;
begin
  if not private.is_superadmin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_role = 'superadmin' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if length(coalesce(trim(p_reason),'')) < 10 then raise exception 'REASON_REQUIRED' using errcode = '22023'; end if;
  select * into u from public.users where id = p_user for update;
  if not found or u.role = 'superadmin' then raise exception 'NOT_FOUND' using errcode = '42501'; end if;
  if u.role = p_role then return; end if;
  perform 1 from public.users where tenant_id = u.tenant_id and role = 'hr_admin' for update;
  if u.role = 'hr_admin' then
    select count(*) into remaining from public.users where tenant_id = u.tenant_id
      and role = 'hr_admin' and status = 'active' and id <> u.id;
    if remaining = 0 then raise exception 'LAST_HR' using errcode = '23514'; end if;
  end if;
  update public.users set role = p_role where id = u.id;
  insert into public.admin_audit_logs(tenant_id,actor_id,action,object_type,object_id,redacted_diff)
    values(u.tenant_id,auth.uid(),'set_role','user',u.id,
      jsonb_build_object('from',u.role,'to',p_role,'reason',left(p_reason,500)));
end;
$$;

create function public.create_department(p_name text, p_tenant uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t uuid := private.acting_tenant(p_tenant); d uuid;
begin
  if length(coalesce(trim(p_name),'')) not between 1 and 120 then
    raise exception 'INVALID_NAME' using errcode = '22023';
  end if;
  insert into public.departments(tenant_id,name) values(t,trim(p_name))
    on conflict (tenant_id,name) do update set name = excluded.name returning id into d;
  return d;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Course drafts. SECURITY INVOKER: caller's grants + RLS + immutable triggers apply unchanged.
-- private.write_course_children replaces all children of a draft in one transaction. New IDs are
-- generated on every save (drafts never carry progress/attempts), so no stale FK can survive.
-- ---------------------------------------------------------------------------------------------
create function private.write_course_children(p_course uuid, p_tenant uuid, p_modules jsonb,
  p_allowed_documents uuid[] default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare m jsonb; l jsonb; q jsonb; c text; mid uuid; lid uuid; mi integer := 0; li integer := 0;
  qi integer; lessons_total integer := 0; out_modules jsonb := '[]'::jsonb; out_lessons jsonb;
begin
  if jsonb_typeof(p_modules) is distinct from 'array' or jsonb_array_length(p_modules) not between 1 and 12 then
    raise exception 'INVALID_MODULES' using errcode = '22023';
  end if;
  delete from public.quiz_items where lesson_id in (select id from public.lessons where course_id = p_course);
  delete from public.assessment_rubrics where lesson_id in (select id from public.lessons where course_id = p_course);
  delete from public.lesson_sources where lesson_id in (select id from public.lessons where course_id = p_course);
  delete from public.lessons where course_id = p_course;
  delete from public.course_modules where course_id = p_course;
  for m in select value from jsonb_array_elements(p_modules) loop
    if jsonb_typeof(m) <> 'object' or jsonb_typeof(m->'lessons') is distinct from 'array'
      or jsonb_array_length(m->'lessons') = 0 then
      raise exception 'INVALID_MODULE' using errcode = '22023';
    end if;
    insert into public.course_modules(tenant_id,course_id,title,content,order_index)
      values(p_tenant,p_course,left(coalesce(m->>'title',''),300),
        jsonb_build_object('description',left(coalesce(m->>'description',''),4000)),mi)
      returning id into mid;
    out_lessons := '[]'::jsonb;
    for l in select value from jsonb_array_elements(m->'lessons') loop
      lessons_total := lessons_total + 1;
      if lessons_total > 60 then raise exception 'TOO_MANY_LESSONS' using errcode = '22023'; end if;
      if jsonb_typeof(l) <> 'object' then raise exception 'INVALID_LESSON' using errcode = '22023'; end if;
      insert into public.lessons(tenant_id,course_id,module_id,title,content,assessment_question,
          order_index,requires_assessment,learning_outcome)
        values(p_tenant,p_course,mid,left(coalesce(l->>'title',''),300),coalesce(l->>'content',''),
          coalesce(l->>'assessment_question',''),li,coalesce((l->>'requires_assessment')::boolean,true),
          left(coalesce(l->>'learning_outcome',''),2000))
        returning id into lid;
      li := li + 1;
      if jsonb_typeof(l->'source_chunk_ids') = 'array' then
        for c in select value from jsonb_array_elements_text(l->'source_chunk_ids') loop
          if p_allowed_documents is not null and not exists(select 1 from public.document_chunks ch
              where ch.id = c::uuid and ch.tenant_id = p_tenant and ch.document_id = any(p_allowed_documents)) then
            raise exception 'SOURCE_NOT_ALLOWED' using errcode = '42501';
          end if;
          insert into public.lesson_sources(tenant_id,lesson_id,chunk_id) values(p_tenant,lid,c::uuid)
            on conflict do nothing;
        end loop;
      end if;
      if jsonb_typeof(l->'rubric') = 'object' then
        insert into public.assessment_rubrics(tenant_id,lesson_id,criteria,passing_score)
          values(p_tenant,lid,l->'rubric'->'criteria',coalesce((l->'rubric'->>'passing_score')::integer,80));
      end if;
      qi := 0;
      if jsonb_typeof(l->'quiz') = 'array' then
        for q in select value from jsonb_array_elements(l->'quiz') loop
          insert into public.quiz_items(tenant_id,lesson_id,question,options,correct_option_id,explanation,order_index)
            values(p_tenant,lid,coalesce(q->>'question',''),coalesce(q->'options','[]'::jsonb),
              coalesce(q->>'correct_option_id',''),coalesce(q->>'explanation',''),qi);
          qi := qi + 1;
        end loop;
      end if;
      out_lessons := out_lessons || jsonb_build_array(lid);
    end loop;
    out_modules := out_modules || jsonb_build_array(jsonb_build_object('module_id',mid,'lesson_ids',out_lessons));
    mi := mi + 1;
  end loop;
  return out_modules;
end;
$$;

-- Caller: HR / MFA superadmin (user-scoped). Creates an empty draft shell.
create function public.create_course_draft(p_title text, p_grade public.grade,
  p_description text default '', p_tenant uuid default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare t uuid := private.acting_tenant(p_tenant); cid uuid;
begin
  insert into public.courses(tenant_id,title,description,target_grade)
    values(t,trim(p_title),coalesce(p_description,''),p_grade) returning id into cid;
  return cid;
end;
$$;

-- Caller: HR (user-scoped, INVOKER). Compare-and-swap on courses.revision: the UPDATE row lock
-- serializes concurrent editors; a stale expected revision raises REVISION_CONFLICT (409).
create function public.save_course_draft(p_course uuid, p_expected_revision bigint, p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare c public.courses; structure jsonb;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'INVALID_PAYLOAD' using errcode = '22023'; end if;
  update public.courses set
      title = coalesce(nullif(trim(p_payload->>'title'),''), title),
      description = coalesce(p_payload->>'description', description),
      target_grade = coalesce((p_payload->>'target_grade')::public.grade, target_grade),
      objectives = coalesce(p_payload->'objectives', objectives),
      coverage_gaps = coalesce(p_payload->'coverage_gaps', coverage_gaps)
    where id = p_course and revision = p_expected_revision and status = 'draft'
    returning * into c;
  if not found then
    if exists(select 1 from public.courses where id = p_course and status = 'draft') then
      raise exception 'REVISION_CONFLICT' using errcode = '40001';
    elsif exists(select 1 from public.courses where id = p_course) then
      raise exception 'PUBLISHED_IMMUTABLE' using errcode = '23514';
    end if;
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if p_payload ? 'modules' then
    structure := private.write_course_children(c.id, c.tenant_id, p_payload->'modules', null);
  end if;
  return jsonb_build_object('course_id',c.id,'revision',c.revision,'structure',coalesce(structure,'null'::jsonb));
end;
$$;

-- Caller: HR (INVOKER). Human publish gate is the course trigger (can_manage + validators + audit).
create function public.publish_course(p_course uuid, p_expected_revision bigint)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare c public.courses;
begin
  update public.courses set status = 'published'
    where id = p_course and revision = p_expected_revision and status = 'draft' returning * into c;
  if not found then
    if exists(select 1 from public.courses where id = p_course and status = 'draft') then
      raise exception 'REVISION_CONFLICT' using errcode = '40001';
    end if;
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  return jsonb_build_object('course_id',c.id,'version',c.version,'revision',c.revision);
end;
$$;

-- Caller: HR (INVOKER). Copies a published course into a new draft version with new IDs for
-- modules/lessons/rubrics/quiz; source links point to the same approved chunks. Idempotent:
-- an existing draft that supersedes the same course is returned.
create function public.clone_course(p_course uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare src public.courses; nid uuid; m record; l record; mid uuid; lid uuid; v integer;
begin
  select * into src from public.courses where id = p_course;
  if not found or not private.can_manage(src.tenant_id) then raise exception 'NOT_FOUND' using errcode = '42501'; end if;
  select id into nid from public.courses where supersedes_id = src.id and status = 'draft' limit 1;
  if nid is not null then return nid; end if;
  perform pg_advisory_xact_lock(hashtextextended(src.id::text, 3));
  with recursive chain as (
    select id, supersedes_id, version from public.courses where id = src.id
    union all
    select c.id, c.supersedes_id, c.version from public.courses c join chain on c.id = chain.supersedes_id
  ) select max(version) into v from chain;
  select greatest(v, coalesce(max(version),0)) into v from public.courses where supersedes_id = src.id;
  insert into public.courses(tenant_id,title,description,target_grade,version,supersedes_id,objectives,coverage_gaps)
    values(src.tenant_id,src.title,src.description,src.target_grade,v + 1,src.id,src.objectives,src.coverage_gaps)
    returning id into nid;
  for m in select * from public.course_modules where course_id = src.id order by order_index loop
    insert into public.course_modules(tenant_id,course_id,title,content,order_index)
      values(src.tenant_id,nid,m.title,m.content,m.order_index) returning id into mid;
    for l in select * from public.lessons where module_id = m.id order by order_index loop
      insert into public.lessons(tenant_id,course_id,module_id,title,content,assessment_question,
          order_index,requires_assessment,learning_outcome)
        values(src.tenant_id,nid,mid,l.title,l.content,l.assessment_question,l.order_index,
          l.requires_assessment,l.learning_outcome) returning id into lid;
      insert into public.assessment_rubrics(tenant_id,lesson_id,criteria,passing_score,version)
        select src.tenant_id,lid,r.criteria,r.passing_score,r.version + 1
        from public.assessment_rubrics r where r.lesson_id = l.id;
      insert into public.quiz_items(tenant_id,lesson_id,question,options,correct_option_id,explanation,order_index)
        select src.tenant_id,lid,q.question,q.options,q.correct_option_id,q.explanation,q.order_index
        from public.quiz_items q where q.lesson_id = l.id;
      insert into public.lesson_sources(tenant_id,lesson_id,chunk_id)
        select src.tenant_id,lid,s.chunk_id from public.lesson_sources s where s.lesson_id = l.id;
    end loop;
  end loop;
  perform private.audit(src.tenant_id,'clone','course',nid,jsonb_build_object('supersedes',src.id,'version',v + 1));
  return nid;
end;
$$;

-- Tracks (INVOKER). Fixed ordered list of course versions; publish validated by track trigger.
create function public.create_track_draft(p_title text, p_grade public.grade, p_course_ids uuid[],
  p_tenant uuid default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare t uuid := private.acting_tenant(p_tenant); tid uuid; v integer; i integer;
begin
  if coalesce(array_length(p_course_ids,1),0) not between 1 and 50 then
    raise exception 'INVALID_TRACK' using errcode = '22023';
  end if;
  select coalesce(max(version),0) + 1 into v from public.tracks
    where tenant_id = t and title = trim(p_title) and target_grade = p_grade;
  insert into public.tracks(tenant_id,title,target_grade,version) values(t,trim(p_title),p_grade,v)
    returning id into tid;
  for i in 1..array_length(p_course_ids,1) loop
    insert into public.track_courses(tenant_id,track_id,course_id,order_index)
      values(t,tid,p_course_ids[i],i - 1);
  end loop;
  return tid;
end;
$$;

create function public.publish_track(p_track uuid, p_expected_revision bigint)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare t public.tracks;
begin
  update public.tracks set status = 'published'
    where id = p_track and revision = p_expected_revision and status = 'draft' returning * into t;
  if not found then
    if exists(select 1 from public.tracks where id = p_track and status = 'draft') then
      raise exception 'REVISION_CONFLICT' using errcode = '40001';
    end if;
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  return jsonb_build_object('track_id',t.id,'version',t.version);
end;
$$;

-- Caller: HR (INVOKER). Human approval gate is the documents trigger.
create function public.approve_document(p_document uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.documents set status = 'approved' where id = p_document and status = 'review';
  if not found then raise exception 'DOCUMENT_NOT_REVIEWABLE' using errcode = '23514'; end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Learning activity (2.3). Server-issued one-time lesson session; engagement after >= 30 s.
-- Caller: employee (user-scoped). Idempotency: token consumed once; event keyed by session id.
-- ---------------------------------------------------------------------------------------------
create function public.start_lesson_session(p_assignment uuid, p_lesson uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ctx jsonb := public.lesson_context(p_assignment,p_lesson); tok text := private.random_token(); sid uuid;
begin
  if (select count(*) from public.lesson_sessions where user_id = auth.uid()
      and started_at > now() - interval '1 hour') >= 120 then
    raise exception 'RATE_LIMIT' using errcode = 'P0001';
  end if;
  insert into public.lesson_sessions(tenant_id,user_id,assignment_id,lesson_id,token_hash)
    values((ctx->>'tenant_id')::uuid,auth.uid(),p_assignment,p_lesson,private.sha256_hex(tok))
    returning id into sid;
  return jsonb_build_object('session_id',sid,'token',tok,'min_seconds',30);
end;
$$;

create function public.record_lesson_engagement(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.lesson_sessions;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'NOT_FOUND' using errcode = '42501'; end if;
  select * into s from public.lesson_sessions where token_hash = private.sha256_hex(p_token) for update;
  if not found or s.user_id is distinct from auth.uid() then raise exception 'NOT_FOUND' using errcode = '42501'; end if;
  if s.consumed_at is not null then return jsonb_build_object('recorded',false,'reason','already_recorded'); end if;
  if s.expires_at <= now() then raise exception 'SESSION_EXPIRED' using errcode = '22023'; end if;
  if now() - s.started_at < interval '30 seconds' then raise exception 'TOO_EARLY' using errcode = '22023'; end if;
  perform public.lesson_context(s.assignment_id, s.lesson_id);
  update public.lesson_sessions set consumed_at = now() where id = s.id;
  insert into public.activity_events(tenant_id,user_id,event_type,source_id)
    values(s.tenant_id,s.user_id,'lesson_engaged',s.id) on conflict do nothing;
  return jsonb_build_object('recorded',true);
end;
$$;

-- Caller: employee. Public status of own attempt by request key (no lease/rubric/raw evaluation).
create function public.attempt_status(p_request_key uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('attempt_id',a.id,'status',
      case when a.status = 'running' and a.lease_until <= now() then 'failed' else a.status end,
      'result',a.result,'error_code',a.error_code,'lesson_id',a.lesson_id,'assignment_id',a.assignment_id,
      'retry_count',a.retry_count,'created_at',a.created_at,
      'appeal',(select jsonb_build_object('id',ap.id,'status',ap.status,'decision',ap.decision)
        from public.assessment_appeals ap where ap.attempt_id = a.id),
      'override',(select jsonb_build_object('passed',o.passed,'score',o.score,'reason',o.reason)
        from public.assessment_overrides o where o.attempt_id = a.id order by o.created_at desc limit 1))
  from public.assessment_attempts a
  where a.request_key = p_request_key and a.user_id = auth.uid() and a.tenant_id = private.tenant_id();
$$;

-- ---------------------------------------------------------------------------------------------
-- Appeals (2.3). Employee: only own succeeded attempt; idempotent by unique(attempt_id).
-- HR resolve: original result preserved; override is a separate row with reviewer and reason;
-- progress/unlock in the same transaction; admin audit (human decision, not agent audit).
-- ---------------------------------------------------------------------------------------------
create function public.create_appeal(p_attempt uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.assessment_attempts; ap public.assessment_appeals;
begin
  select * into a from public.assessment_attempts where id = p_attempt
    and user_id = auth.uid() and tenant_id = private.tenant_id() for update;
  if not found or a.status <> 'succeeded' then raise exception 'NOT_FOUND' using errcode = '42501'; end if;
  select * into ap from public.assessment_appeals where attempt_id = a.id;
  if found then return jsonb_build_object('appeal_id',ap.id,'status',ap.status,'created',false); end if;
  if length(coalesce(trim(p_reason),'')) not between 10 and 4000 then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  insert into public.assessment_appeals(tenant_id,attempt_id,user_id,reason)
    values(a.tenant_id,a.id,a.user_id,trim(p_reason)) returning * into ap;
  return jsonb_build_object('appeal_id',ap.id,'status',ap.status,'created',true);
end;
$$;

create function public.resolve_appeal(p_appeal uuid, p_decision text, p_reason text,
  p_override_passed boolean default null, p_override_score integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ap public.assessment_appeals; a public.assessment_attempts; p public.progress;
begin
  select * into ap from public.assessment_appeals where id = p_appeal for update;
  if not found or not private.can_manage(ap.tenant_id) then raise exception 'NOT_FOUND' using errcode = '42501'; end if;
  if ap.status <> 'open' then raise exception 'APPEAL_CLOSED' using errcode = '23514'; end if;
  if p_decision not in ('upheld','overturned') then raise exception 'INVALID_DECISION' using errcode = '22023'; end if;
  if length(coalesce(trim(p_reason),'')) not between 10 and 4000 then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  select * into a from public.assessment_attempts where id = ap.attempt_id;
  perform 1 from public.assignments where id = a.assignment_id for update;
  if p_decision = 'overturned' then
    if p_override_passed is null or p_override_score is null or p_override_score not between 0 and 100 then
      raise exception 'OVERRIDE_REQUIRED' using errcode = '22023';
    end if;
    select * into p from public.progress where assignment_id = a.assignment_id and lesson_id = a.lesson_id for update;
    if p.status = 'completed' and not p_override_passed then
      raise exception 'OVERRIDE_DOWNGRADE_NOT_SUPPORTED' using errcode = '23514';
    end if;
    insert into public.assessment_overrides(tenant_id,attempt_id,reviewer_id,passed,score,reason)
      values(ap.tenant_id,a.id,auth.uid(),p_override_passed,p_override_score,trim(p_reason));
    if p_override_passed and p.status <> 'completed' then
      update public.progress set status = 'completed', score = p_override_score, completed_at = now()
        where id = p.id;
      insert into public.activity_events(tenant_id,user_id,event_type,source_id)
        values(a.tenant_id,a.user_id,'lesson_completed',a.lesson_id) on conflict do nothing;
      perform private.unlock_next(a.assignment_id);
    end if;
  end if;
  update public.assessment_appeals set status = p_decision, reviewer_id = auth.uid(), decision = trim(p_reason)
    where id = ap.id;
  insert into public.admin_audit_logs(tenant_id,actor_id,action,object_type,object_id,redacted_diff)
    values(ap.tenant_id,auth.uid(),'resolve_appeal','assessment_appeal',ap.id,
      jsonb_build_object('decision',p_decision,'override_passed',p_override_passed,'override_score',p_override_score));
  return jsonb_build_object('appeal_id',ap.id,'status',p_decision);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Durable jobs (3.9). Request side: user-scoped SECURITY DEFINER with explicit can_manage checks;
-- dedup by deduplication_key. Worker side: service_role only; claim uses FOR UPDATE SKIP LOCKED,
-- lease 90 s, heartbeat, max attempts with backoff. Side effects require a matching lease and a
-- currently active tenant/actor (SEC-12).
-- ---------------------------------------------------------------------------------------------
create function private.enqueue_job(p_tenant uuid, p_type text, p_key text, p_payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare j public.agent_jobs;
begin
  insert into public.agent_jobs(tenant_id,actor_id,agent_type,deduplication_key,payload)
    values(p_tenant,auth.uid(),p_type,p_key,p_payload)
    on conflict (deduplication_key) do nothing returning * into j;
  if found then return j.id; end if;
  select * into j from public.agent_jobs where deduplication_key = p_key for update;
  if j.status = 'failed' then
    update public.agent_jobs set status = 'queued', attempts = 0, available_at = now(), last_error_code = null,
      lease_token = null, lease_until = null, actor_id = coalesce(auth.uid(), actor_id), updated_at = now(),
      finished_at = null, payload = p_payload
      where id = j.id;
  end if;
  return j.id;
end;
$$;

create function public.request_document_processing(p_document uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare d public.documents;
begin
  select * into d from public.documents where id = p_document for update;
  if not found or not private.can_manage(d.tenant_id) then raise exception 'NOT_FOUND' using errcode = '42501'; end if;
  if d.status not in ('uploaded','failed','needs_review') then raise exception 'DOCUMENT_NOT_PROCESSABLE' using errcode = '23514'; end if;
  return private.enqueue_job(d.tenant_id,'ingestion','ingestion:' || d.id || ':' || d.sha256,
    jsonb_build_object('document_id',d.id,'sha256',d.sha256));
end;
$$;

create function public.request_course_generation(p_document_ids uuid[], p_grade public.grade, p_title text,
  p_limits jsonb, p_prompt_version text, p_tenant uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t uuid := private.acting_tenant(p_tenant); hashes text; n integer; mods integer; les integer;
begin
  n := coalesce(array_length(p_document_ids,1),0);
  if n not between 1 and 10 then raise exception 'INVALID_SOURCES' using errcode = '22023'; end if;
  if length(coalesce(trim(p_title),'')) not between 1 and 300 or p_prompt_version !~ '^[a-z_]+-[0-9]+$' then
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;
  mods := coalesce((p_limits->>'max_modules')::integer, 4);
  les := coalesce((p_limits->>'max_lessons')::integer, 12);
  if mods not between 1 and 12 or les not between 1 and 60 then
    raise exception 'INVALID_LIMITS' using errcode = '22023';
  end if;
  select count(*), string_agg(sha256, ',' order by sha256) into n, hashes from public.documents
    where id = any(p_document_ids) and tenant_id = t and status = 'approved';
  if n <> array_length(p_document_ids,1) then raise exception 'SOURCE_NOT_APPROVED' using errcode = '23514'; end if;
  return private.enqueue_job(t,'course_creator',
    'course:' || t || ':' || private.sha256_hex(hashes) || ':' || p_grade || ':' || p_prompt_version
      || ':' || private.sha256_hex(lower(trim(p_title)) || mods || ':' || les),
    jsonb_build_object('document_ids',to_jsonb(p_document_ids),'grade',p_grade,'title',trim(p_title),
      'max_modules',mods,'max_lessons',les,'prompt_version',p_prompt_version));
end;
$$;

-- Weekly HR report: period is a full Monday-Monday week in tenant timezone, already ended.
create function public.request_hr_report(p_period_start date, p_tenant uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t uuid := private.acting_tenant(p_tenant); tz text;
begin
  select timezone into tz from public.tenants where id = t;
  if extract(isodow from p_period_start) <> 1 then raise exception 'PERIOD_NOT_MONDAY' using errcode = '22023'; end if;
  if (p_period_start + 7) > (now() at time zone tz)::date then
    raise exception 'PERIOD_NOT_CLOSED' using errcode = '22023';
  end if;
  return private.enqueue_job(t,'hr_analyst',
    'hr_report:' || t || ':' || p_period_start || ':' || (p_period_start + 7) || ':hr-report-1',
    jsonb_build_object('period_start',p_period_start,'period_end',p_period_start + 7,'timezone',tz,
      'report_version','hr-report-1'));
end;
$$;

create function public.request_analytics(p_template text, p_start date, p_end date)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_superadmin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_template not in ('course_funnel','cohort_completion','time_to_first_lesson',
      'ai_cost_per_completed_lesson','trial_to_paid','active_seat_expansion')
    or p_end <= p_start or p_end - p_start > 400 then
    raise exception 'INVALID_TEMPLATE' using errcode = '22023';
  end if;
  return private.enqueue_job(null,'product_analyst',
    'analytics:' || p_template || ':' || p_start || ':' || p_end || ':' || to_char(now(),'YYYYMMDDHH24MI'),
    jsonb_build_object('template_id',p_template,'period_start',p_start,'period_end',p_end));
end;
$$;

create function public.request_lead_qualification(p_lead uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_superadmin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if not exists(select 1 from public.leads where id = p_lead) then raise exception 'NOT_FOUND' using errcode = '42501'; end if;
  return private.enqueue_job(null,'sales','sales:' || p_lead || ':' || to_char(now(),'YYYYMMDDHH24MI'),
    jsonb_build_object('lead_id',p_lead));
end;
$$;

create function public.create_support_ticket(p_subject text, p_body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t uuid := private.tenant_id(); tid uuid; jid uuid;
begin
  if t is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if length(coalesce(trim(p_subject),'')) not between 3 and 200 or length(coalesce(trim(p_body),'')) not between 10 and 6000 then
    raise exception 'INVALID_TICKET' using errcode = '22023';
  end if;
  if (select count(*) from public.support_tickets where user_id = auth.uid()
      and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'RATE_LIMIT' using errcode = 'P0001';
  end if;
  insert into public.support_tickets(tenant_id,user_id,subject,body)
    values(t,auth.uid(),trim(p_subject),trim(p_body)) returning id into tid;
  jid := private.enqueue_job(t,'support','support:' || tid, jsonb_build_object('ticket_id',tid));
  return jsonb_build_object('ticket_id',tid,'job_id',jid);
end;
$$;

-- Worker: claim. Expired running jobs that exhausted attempts are failed first.
create function public.claim_job(p_types text[])
returns setof public.agent_jobs language plpgsql security definer set search_path = '' as $$
begin
  update public.agent_jobs set status = 'failed', last_error_code = 'LEASE_EXPIRED_RETRIES_EXHAUSTED',
      finished_at = now(), updated_at = now(), lease_token = null
    where status = 'running' and lease_until < now() and attempts >= max_attempts;
  return query
  with c as (
    select id from public.agent_jobs
    where agent_type = any(p_types) and ((status = 'queued' and available_at <= now())
      or (status = 'running' and lease_until < now()))
    order by available_at, created_at
    for update skip locked limit 1
  )
  update public.agent_jobs j set status = 'running', lease_token = gen_random_uuid(),
      lease_until = now() + interval '90 seconds', heartbeat_at = now(), attempts = j.attempts + 1,
      updated_at = now()
    from c where j.id = c.id returning j.*;
end;
$$;

create function public.heartbeat_job(p_job uuid, p_lease uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.agent_jobs set lease_until = now() + interval '90 seconds', heartbeat_at = now(), updated_at = now()
    where id = p_job and lease_token = p_lease and status = 'running';
  return found;
end;
$$;

-- Raises unless job holds the lease and its tenant (if any) and actor are still active.
create function private.assert_job(p_job uuid, p_lease uuid) returns public.agent_jobs
language plpgsql security definer set search_path = '' as $$
declare j public.agent_jobs;
begin
  select * into j from public.agent_jobs where id = p_job for update;
  if not found or j.lease_token is distinct from p_lease or j.status <> 'running' or j.lease_until <= now() then
    raise exception 'STALE_LEASE';
  end if;
  if j.tenant_id is not null and not exists(select 1 from public.tenants where id = j.tenant_id
      and status in ('trial','active')) then
    raise exception 'TENANT_INACTIVE';
  end if;
  if j.actor_id is not null and not exists(select 1 from public.users where id = j.actor_id and status = 'active'
      and (role = 'superadmin' or tenant_id = j.tenant_id)) then
    raise exception 'ACTOR_INACTIVE';
  end if;
  return j;
end;
$$;

create function public.finish_job(p_job uuid, p_lease uuid, p_status text, p_result jsonb, p_error text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('succeeded','needs_review','failed') then raise exception 'INVALID_STATUS'; end if;
  update public.agent_jobs set status = p_status, result = p_result, last_error_code = left(p_error,80),
      lease_token = null, lease_until = null, finished_at = now(), updated_at = now()
    where id = p_job and lease_token = p_lease and status = 'running';
  return found;
end;
$$;

create function public.retry_job(p_job uuid, p_lease uuid, p_error text, p_delay_seconds integer)
returns text language plpgsql security definer set search_path = '' as $$
declare j public.agent_jobs;
begin
  select * into j from public.agent_jobs where id = p_job and lease_token = p_lease and status = 'running' for update;
  if not found then return 'stale'; end if;
  if j.attempts >= j.max_attempts then
    update public.agent_jobs set status = 'failed', last_error_code = left(p_error,80), lease_token = null,
      lease_until = null, finished_at = now(), updated_at = now() where id = j.id;
    return 'failed';
  end if;
  update public.agent_jobs set status = 'queued', last_error_code = left(p_error,80), lease_token = null,
      lease_until = null, available_at = now() + make_interval(secs => greatest(1,least(p_delay_seconds,3600))),
      updated_at = now() where id = j.id;
  return 'queued';
end;
$$;

-- Ingestion side effects.
create function public.set_document_status(p_job uuid, p_lease uuid, p_document uuid, p_status text, p_error text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare j public.agent_jobs := private.assert_job(p_job,p_lease);
begin
  if p_status not in ('processing','failed','needs_review') then raise exception 'INVALID_STATUS'; end if;
  update public.documents set status = p_status, error_code = left(p_error,80)
    where id = p_document and tenant_id = j.tenant_id and status <> 'approved';
  if not found then raise exception 'NOT_FOUND'; end if;
end;
$$;

create function public.store_document_chunks(p_job uuid, p_lease uuid, p_document uuid, p_chunks jsonb,
  p_page_count integer, p_char_count integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare j public.agent_jobs := private.assert_job(p_job,p_lease); c jsonb; n integer := 0;
begin
  if (j.payload->>'document_id')::uuid is distinct from p_document then raise exception 'FORBIDDEN'; end if;
  perform 1 from public.documents where id = p_document and tenant_id = j.tenant_id and status = 'processing' for update;
  if not found then raise exception 'DOCUMENT_NOT_PROCESSING'; end if;
  if jsonb_typeof(p_chunks) <> 'array' or jsonb_array_length(p_chunks) not between 1 and 5000 then
    raise exception 'INVALID_CHUNKS';
  end if;
  delete from public.document_chunks where document_id = p_document;
  for c in select value from jsonb_array_elements(p_chunks) loop
    insert into public.document_chunks(tenant_id,document_id,chunk_index,page,content,embedding,embedding_model)
      values(j.tenant_id,p_document,n,(c->>'page')::integer,c->>'content',
        (c->>'embedding')::extensions.vector,c->>'embedding_model');
    n := n + 1;
  end loop;
  update public.documents set status = 'review', page_count = p_page_count, char_count = p_char_count,
    error_code = null where id = p_document;
  return n;
end;
$$;

-- Course generation side effect: idempotent by courses.source_job_id. Sources restricted to the
-- job's approved documents of the same tenant. Creates a DRAFT only; publication stays human.
create function public.create_generated_course(p_job uuid, p_lease uuid, p_payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare j public.agent_jobs := private.assert_job(p_job,p_lease); cid uuid; docs uuid[];
begin
  select id into cid from public.courses where source_job_id = j.id;
  if found then return cid; end if;
  select array_agg(value::uuid) into docs from jsonb_array_elements_text(j.payload->'document_ids');
  if exists(select 1 from unnest(docs) d where not exists(select 1 from public.documents x
      where x.id = d and x.tenant_id = j.tenant_id and x.status = 'approved')) then
    raise exception 'SOURCE_NOT_APPROVED';
  end if;
  insert into public.courses(tenant_id,title,description,target_grade,objectives,coverage_gaps,source_job_id)
    values(j.tenant_id,left(coalesce(p_payload->>'course_title',j.payload->>'title'),300),
      coalesce(p_payload->>'description',''),(j.payload->>'grade')::public.grade,
      coalesce(p_payload->'objectives','[]'::jsonb),coalesce(p_payload->'coverage_gaps','[]'::jsonb),j.id)
    returning id into cid;
  perform private.write_course_children(cid,j.tenant_id,p_payload->'modules',docs);
  return cid;
end;
$$;

-- HR analyst deterministic metrics for one tenant and [p_start,p_end) in UTC instants.
create function public.hr_report_metrics(p_tenant uuid, p_start timestamptz, p_end timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  with emp as (
    select u.id, u.department_id from public.users u
    where u.tenant_id = p_tenant and u.role = 'employee' and not u.is_service_account
  ), asg as (
    select a.* from public.assignments a join emp on emp.id = a.user_id
    where a.tenant_id = p_tenant and a.assigned_at < p_end
  ), first_attempts as (
    select distinct on (x.user_id, x.lesson_id) x.user_id, x.lesson_id, (x.result->>'passed')::boolean as passed
    from public.assessment_attempts x
    where x.tenant_id = p_tenant and x.status = 'succeeded' and x.created_at >= p_start and x.created_at < p_end
    order by x.user_id, x.lesson_id, x.created_at
  ), dept as (
    select coalesce(d.id::text,'none') as department_id, coalesce(d.name,'Без подразделения') as name,
      count(distinct emp.id) as employees,
      count(p.id) filter (where p.status = 'locked') as locked,
      count(p.id) filter (where p.status = 'in_progress') as in_progress,
      count(p.id) filter (where p.status = 'completed') as completed
    from emp left join public.departments d on d.id = emp.department_id
      left join public.assignments a on a.user_id = emp.id and a.status = 'active'
      left join public.progress p on p.assignment_id = a.id
    group by 1,2
  )
  select jsonb_build_object(
    'period',jsonb_build_object('start',p_start,'end',p_end),
    'employees',(select count(*) from emp),
    'assigned',(select count(*) from asg where assigned_at >= p_start),
    'active_learners',(select count(distinct e.user_id) from public.activity_events e
      where e.tenant_id = p_tenant and e.occurred_at >= p_start and e.occurred_at < p_end
        and e.user_id in (select id from emp)),
    'started',(select count(*) from asg where exists(select 1 from public.activity_events e
      where e.user_id = asg.user_id and e.tenant_id = p_tenant and e.occurred_at >= asg.assigned_at
        and e.occurred_at < p_end)),
    'completed',(select count(*) from asg where status = 'completed' and completed_at >= p_start and completed_at < p_end),
    'overdue',(select count(*) from asg where status <> 'cancelled' and due_at is not null and due_at < p_end
      and (completed_at is null or completed_at > due_at)),
    'median_hours_to_completion',(select round((percentile_cont(0.5) within group (order by
      extract(epoch from completed_at - assigned_at) / 3600))::numeric, 1)
      from asg where status = 'completed' and completed_at >= p_start and completed_at < p_end),
    'first_attempt_pass_rate',jsonb_build_object(
      'numerator',(select count(*) from first_attempts where passed),
      'denominator',(select count(*) from first_attempts)),
    'appeals',jsonb_build_object(
      'numerator',(select count(*) from public.assessment_appeals ap where ap.tenant_id = p_tenant
        and ap.created_at >= p_start and ap.created_at < p_end),
      'denominator',(select count(*) from public.assessment_attempts x where x.tenant_id = p_tenant
        and x.status = 'succeeded' and x.created_at >= p_start and x.created_at < p_end)),
    'ai_errors',(select count(*) from public.assessment_attempts x where x.tenant_id = p_tenant
      and x.status = 'failed' and x.created_at >= p_start and x.created_at < p_end),
    'departments',coalesce((select jsonb_agg(jsonb_build_object('department_id',department_id,'name',name,
      'employees',employees,'suppressed',employees < 5,
      'locked',case when employees < 5 then null else locked end,
      'in_progress',case when employees < 5 then null else in_progress end,
      'completed',case when employees < 5 then null else completed end) order by name) from dept),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create function public.store_hr_report(p_job uuid, p_lease uuid, p_metrics jsonb, p_narrative jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare j public.agent_jobs := private.assert_job(p_job,p_lease); rid uuid;
begin
  insert into public.hr_reports(tenant_id,period_start,period_end,metrics,narrative,report_version,source_job_id)
    values(j.tenant_id,(j.payload->>'period_start')::date,(j.payload->>'period_end')::date,p_metrics,p_narrative,
      coalesce(j.payload->>'report_version','hr-report-1'),j.id)
    on conflict (tenant_id,period_start,period_end) do nothing returning id into rid;
  if rid is null then
    select id into rid from public.hr_reports where tenant_id = j.tenant_id
      and period_start = (j.payload->>'period_start')::date and period_end = (j.payload->>'period_end')::date;
  end if;
  return rid;
end;
$$;

create function public.record_support_reply(p_job uuid, p_lease uuid, p_reply jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare j public.agent_jobs := private.assert_job(p_job,p_lease); escalate boolean := coalesce((p_reply->>'escalate')::boolean,true);
begin
  update public.support_tickets set agent_reply = p_reply, category = p_reply->>'category',
      severity = p_reply->>'severity', status = case when escalate then 'escalated' else status end,
      escalation_reason = nullif(p_reply->>'escalation_reason',''), updated_at = now()
    where id = (j.payload->>'ticket_id')::uuid and tenant_id = j.tenant_id;
  if not found then raise exception 'NOT_FOUND'; end if;
end;
$$;

create function public.save_lead_qualification(p_job uuid, p_lease uuid, p_dto jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare j public.agent_jobs := private.assert_job(p_job,p_lease);
begin
  update public.leads set qualification = p_dto,
      status = case when p_dto->>'qualification' = 'qualified' and status = 'new' then 'qualified' else status end
    where id = (j.payload->>'lead_id')::uuid;
  if not found then raise exception 'NOT_FOUND'; end if;
end;
$$;

-- Worker / route agent audit record (service only).
create function public.record_agent_run(p_tenant uuid, p_actor uuid, p_agent text, p_payload jsonb, p_ms integer)
returns void language sql security definer set search_path = '' as $$
  insert into public.agent_audit_logs(tenant_id,actor_id,agent_type,payload,execution_time_ms)
    values(p_tenant,p_actor,p_agent,p_payload,greatest(0,p_ms));
$$;

-- Product analytics allowlist (3.4). Service only; parameters typed; 5 s timeout; <=1000 rows;
-- cross-tenant aggregates only, groups < 5 suppressed, demo tenants excluded.
create function public.analytics_template(p_template text, p_start date, p_end date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare rows jsonb;
begin
  set local statement_timeout = '5s';
  if p_template = 'cohort_completion' then
    select coalesce(jsonb_agg(r order by r.cohort_week),'[]'::jsonb) into rows from (
      select date_trunc('week', a.assigned_at at time zone 'UTC')::date as cohort_week,
        count(*) as assigned, count(*) filter (where a.status = 'completed') as completed,
        round(100.0 * count(*) filter (where a.status = 'completed') / nullif(count(*),0), 2) as completion_pct
      from public.assignments a join public.tenants t on t.id = a.tenant_id and not t.is_demo
      where a.assigned_at >= p_start::timestamptz and a.assigned_at < p_end::timestamptz
      group by 1 having count(*) >= 5 order by 1 limit 1000) r;
  elsif p_template = 'course_funnel' then
    select jsonb_build_array(jsonb_build_object(
      'assigned',count(distinct a.id),
      'started',count(distinct a.id) filter (where exists(select 1 from public.activity_events e
        where e.user_id = a.user_id and e.occurred_at >= a.assigned_at)),
      'completed',count(distinct a.id) filter (where a.status = 'completed'))) into rows
    from public.assignments a join public.tenants t on t.id = a.tenant_id and not t.is_demo
    where a.assigned_at >= p_start::timestamptz and a.assigned_at < p_end::timestamptz;
  elsif p_template = 'time_to_first_lesson' then
    select jsonb_build_array(jsonb_build_object('n',count(*),'median_hours',
      round((percentile_cont(0.5) within group (order by h))::numeric,1))) into rows from (
      select extract(epoch from min(e.occurred_at) - a.assigned_at)/3600 as h
      from public.assignments a join public.tenants t on t.id = a.tenant_id and not t.is_demo
      join public.activity_events e on e.user_id = a.user_id and e.occurred_at >= a.assigned_at
      where a.assigned_at >= p_start::timestamptz and a.assigned_at < p_end::timestamptz
      group by a.id, a.assigned_at) x;
  elsif p_template = 'ai_cost_per_completed_lesson' then
    select jsonb_build_array(jsonb_build_object(
      'input_tokens',coalesce(sum((l.payload->'usage'->>'input_tokens')::bigint),0),
      'output_tokens',coalesce(sum((l.payload->'usage'->>'output_tokens')::bigint),0),
      'calls_without_usage',count(*) filter (where l.payload->'usage' is null or l.payload->'usage' = 'null'::jsonb),
      'completed_lessons',(select count(*) from public.progress p join public.tenants t2 on t2.id = p.tenant_id
        and not t2.is_demo where p.completed_at >= p_start::timestamptz and p.completed_at < p_end::timestamptz)))
      into rows
    from public.agent_audit_logs l left join public.tenants t on t.id = l.tenant_id
    where (t.id is null or not t.is_demo) and l.created_at >= p_start::timestamptz and l.created_at < p_end::timestamptz;
  elsif p_template = 'trial_to_paid' then
    select jsonb_build_array(jsonb_build_object(
      'trials_created',count(*),
      'paid',count(*) filter (where exists(select 1 from public.invoices i where i.tenant_id = t.id and i.status = 'paid')))) into rows
    from public.tenants t where not t.is_demo and t.created_at >= p_start::timestamptz and t.created_at < p_end::timestamptz;
  elsif p_template = 'active_seat_expansion' then
    select coalesce(jsonb_agg(r order by r.period_start),'[]'::jsonb) into rows from (
      select i.period_start, i.currency, count(*) as invoices, sum(i.active_seats) as active_seats
      from public.invoices i join public.tenants t on t.id = i.tenant_id and not t.is_demo
      where i.period_start >= p_start and i.period_start < p_end and i.status in ('issued','paid')
      group by 1,2 having count(*) >= 5 order by 1 limit 1000) r;
  else
    raise exception 'INVALID_TEMPLATE';
  end if;
  return jsonb_build_object('template_id',p_template,'period_start',p_start,'period_end',p_end,'rows',rows,
    'min_group_size',5);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Billing (1.2). Active seat = unique non-service, non-superadmin user with a server activity
-- event in the billing month (tenant billing timezone). Invoice idempotent per tenant/period.
-- ---------------------------------------------------------------------------------------------
create function private.active_seats(p_tenant uuid, p_start date, p_end date, p_tz text)
returns integer language sql stable security definer set search_path = '' as $$
  select count(distinct e.user_id)::integer from public.activity_events e
    join public.users u on u.id = e.user_id and u.tenant_id = e.tenant_id
  where e.tenant_id = p_tenant and u.role <> 'superadmin' and not u.is_service_account
    and e.occurred_at >= (p_start::timestamp at time zone p_tz)
    and e.occurred_at < (p_end::timestamp at time zone p_tz);
$$;

-- Caller: worker (service_role) or MFA superadmin. Only closed months.
create function public.generate_invoice(p_tenant uuid, p_period_start date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.subscriptions; pend date := (p_period_start + interval '1 month')::date; seats integer;
  amount bigint; iid uuid;
begin
  if auth.role() <> 'service_role' and not private.is_superadmin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if extract(day from p_period_start) <> 1 then raise exception 'PERIOD_NOT_MONTH_START' using errcode = '22023'; end if;
  select * into s from public.subscriptions where tenant_id = p_tenant and period_start <= p_period_start
    and period_end > p_period_start and status in ('active','past_due','trial') order by period_start desc limit 1;
  if not found then raise exception 'NO_SUBSCRIPTION' using errcode = '23514'; end if;
  if pend > (now() at time zone s.billing_timezone)::date then
    raise exception 'PERIOD_NOT_CLOSED' using errcode = '22023';
  end if;
  select id into iid from public.invoices where tenant_id = p_tenant and period_start = p_period_start and period_end = pend;
  if found then return iid; end if;
  seats := private.active_seats(p_tenant, p_period_start, pend, s.billing_timezone);
  amount := case when s.tier = 'enterprise' then s.minimum_monthly_minor
    else greatest(seats * s.seat_price_minor, s.minimum_monthly_minor) end;
  insert into public.invoices(tenant_id,subscription_id,period_start,period_end,active_seats,amount_minor,currency,status,snapshot)
    values(p_tenant,s.id,p_period_start,pend,seats,amount,s.currency,'issued',
      jsonb_build_object('tier',s.tier,'seat_price_minor',s.seat_price_minor,'minimum_monthly_minor',
        s.minimum_monthly_minor,'billing_timezone',s.billing_timezone,'contract',s.contract_snapshot,
        'seat_definition','server activity events; superadmin/service accounts excluded','generated_at',now()))
    on conflict (tenant_id,period_start,period_end) do nothing returning id into iid;
  if iid is null then
    select id into iid from public.invoices where tenant_id = p_tenant and period_start = p_period_start and period_end = pend;
  end if;
  return iid;
end;
$$;

-- Caller: MFA superadmin (user-scoped). Human payment confirmation; unique reference; audit.
create function public.mark_invoice_paid(p_invoice uuid, p_reference text, p_paid_at timestamptz, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare i public.invoices;
begin
  if not private.is_superadmin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if length(coalesce(trim(p_reference),'')) not between 3 and 120 or length(coalesce(trim(p_reason),'')) < 10 then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  if p_paid_at is null or p_paid_at > now() + interval '1 day' then raise exception 'INVALID_DATE' using errcode = '22023'; end if;
  select * into i from public.invoices where id = p_invoice for update;
  if not found then raise exception 'NOT_FOUND' using errcode = '42501'; end if;
  if i.status = 'paid' then
    if i.payment_reference = trim(p_reference) then return; end if;
    raise exception 'ALREADY_PAID' using errcode = '23514';
  end if;
  if i.status <> 'issued' then raise exception 'INVOICE_NOT_PAYABLE' using errcode = '23514'; end if;
  update public.invoices set status = 'paid', paid_at = p_paid_at, payment_reference = trim(p_reference)
    where id = i.id;
  update public.subscriptions set status = 'active' where id = i.subscription_id and status in ('trial','past_due');
  update public.tenants set status = 'active' where id = i.tenant_id and status = 'trial';
  insert into public.admin_audit_logs(tenant_id,actor_id,action,object_type,object_id,redacted_diff)
    values(i.tenant_id,auth.uid(),'mark_paid','invoice',i.id,
      jsonb_build_object('reason',left(p_reason,500),'paid_at',p_paid_at));
end;
$$;

create function public.admin_update_tenant(p_tenant uuid, p_tier text, p_status text,
  p_max_daily_ai_calls integer, p_reason text)
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

create function public.admin_create_subscription(p_tenant uuid, p_tier text, p_currency text,
  p_seat_price_minor bigint, p_minimum_minor bigint, p_period_start date, p_period_end date,
  p_contract jsonb, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  if not private.is_superadmin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if length(coalesce(trim(p_reason),'')) < 10 then raise exception 'REASON_REQUIRED' using errcode = '22023'; end if;
  if p_tier = 'enterprise' and p_seat_price_minor <> 0 then raise exception 'ENTERPRISE_FIXED_FEE' using errcode = '22023'; end if;
  insert into public.subscriptions(tenant_id,status,currency,seat_price_minor,minimum_monthly_minor,
      period_start,period_end,tier,contract_snapshot)
    values(p_tenant,'active',p_currency,p_seat_price_minor,p_minimum_minor,p_period_start,p_period_end,p_tier,
      coalesce(p_contract,'{}'::jsonb)) returning id into sid;
  insert into public.admin_audit_logs(tenant_id,actor_id,action,object_type,object_id,redacted_diff)
    values(p_tenant,auth.uid(),'create_subscription','subscription',sid,
      jsonb_build_object('tier',p_tier,'currency',p_currency,'reason',left(p_reason,500)));
  return sid;
end;
$$;

-- Scheduler (service only): weekly HR report jobs per tenant timezone and monthly invoices.
create function public.schedule_periodic_jobs()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t record; ws date; created integer := 0; invoices integer := 0; ms date; jid uuid;
begin
  for t in select id, timezone from public.tenants where status in ('trial','active') loop
    ws := date_trunc('week', (now() at time zone t.timezone))::date - 7;
    insert into public.agent_jobs(tenant_id,agent_type,deduplication_key,payload)
      values(t.id,'hr_analyst','hr_report:' || t.id || ':' || ws || ':' || (ws + 7) || ':hr-report-1',
        jsonb_build_object('period_start',ws,'period_end',ws + 7,'timezone',t.timezone,'report_version','hr-report-1'))
      on conflict (deduplication_key) do nothing returning id into jid;
    if jid is not null then created := created + 1; end if;
    ms := (date_trunc('month', (now() at time zone t.timezone)) - interval '1 month')::date;
    if exists(select 1 from public.subscriptions s where s.tenant_id = t.id and s.period_start <= ms
        and s.period_end > ms and s.status in ('active','past_due','trial'))
      and not exists(select 1 from public.invoices i where i.tenant_id = t.id and i.period_start = ms) then
      perform public.generate_invoice(t.id, ms);
      invoices := invoices + 1;
    end if;
  end loop;
  return jsonb_build_object('report_jobs',created,'invoices',invoices);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Privileges: deny by default, grant explicitly.
-- ---------------------------------------------------------------------------------------------
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_superadmin(),private.tenant_id(),private.can_manage(uuid),
  private.course_visible(uuid),private.lesson_visible(uuid),private.is_draft_course(uuid),
  private.is_draft_lesson(uuid),private.is_draft_track(uuid),private.require_manage(uuid),
  private.acting_tenant(uuid),private.write_course_children(uuid,uuid,jsonb,uuid[]),
  private.audit(uuid,text,text,uuid,jsonb) to authenticated;
grant execute on function private.write_course_children(uuid,uuid,jsonb,uuid[]) to service_role;

revoke all on function
  public.create_invitation(uuid,text,public.grade,uuid), public.accept_invitation(text),
  public.update_employee(uuid,public.grade,uuid,boolean,text), public.set_user_role(uuid,public.app_role,text),
  public.create_department(text,uuid), public.create_course_draft(text,public.grade,text,uuid),
  public.save_course_draft(uuid,bigint,jsonb), public.publish_course(uuid,bigint), public.clone_course(uuid),
  public.create_track_draft(text,public.grade,uuid[],uuid), public.publish_track(uuid,bigint),
  public.approve_document(uuid), public.start_lesson_session(uuid,uuid), public.record_lesson_engagement(text),
  public.attempt_status(uuid), public.create_appeal(uuid,text),
  public.resolve_appeal(uuid,text,text,boolean,integer), public.request_document_processing(uuid),
  public.request_course_generation(uuid[],public.grade,text,jsonb,text,uuid), public.request_hr_report(date,uuid),
  public.request_analytics(text,date,date), public.request_lead_qualification(uuid),
  public.create_support_ticket(text,text), public.claim_job(text[]), public.heartbeat_job(uuid,uuid),
  public.finish_job(uuid,uuid,text,jsonb,text), public.retry_job(uuid,uuid,text,integer),
  public.set_document_status(uuid,uuid,uuid,text,text),
  public.store_document_chunks(uuid,uuid,uuid,jsonb,integer,integer),
  public.create_generated_course(uuid,uuid,jsonb), public.hr_report_metrics(uuid,timestamptz,timestamptz),
  public.store_hr_report(uuid,uuid,jsonb,jsonb), public.record_support_reply(uuid,uuid,jsonb),
  public.save_lead_qualification(uuid,uuid,jsonb), public.record_agent_run(uuid,uuid,text,jsonb,integer),
  public.analytics_template(text,date,date), public.generate_invoice(uuid,date),
  public.mark_invoice_paid(uuid,text,timestamptz,text),
  public.admin_update_tenant(uuid,text,text,integer,text),
  public.admin_create_subscription(uuid,text,text,bigint,bigint,date,date,jsonb,text),
  public.schedule_periodic_jobs()
  from public, anon, authenticated;

grant execute on function
  public.create_invitation(uuid,text,public.grade,uuid), public.accept_invitation(text),
  public.update_employee(uuid,public.grade,uuid,boolean,text), public.set_user_role(uuid,public.app_role,text),
  public.create_department(text,uuid), public.create_course_draft(text,public.grade,text,uuid),
  public.save_course_draft(uuid,bigint,jsonb), public.publish_course(uuid,bigint), public.clone_course(uuid),
  public.create_track_draft(text,public.grade,uuid[],uuid), public.publish_track(uuid,bigint),
  public.approve_document(uuid), public.start_lesson_session(uuid,uuid), public.record_lesson_engagement(text),
  public.attempt_status(uuid), public.create_appeal(uuid,text),
  public.resolve_appeal(uuid,text,text,boolean,integer), public.request_document_processing(uuid),
  public.request_course_generation(uuid[],public.grade,text,jsonb,text,uuid), public.request_hr_report(date,uuid),
  public.request_analytics(text,date,date), public.request_lead_qualification(uuid),
  public.create_support_ticket(text,text), public.generate_invoice(uuid,date),
  public.mark_invoice_paid(uuid,text,timestamptz,text),
  public.admin_update_tenant(uuid,text,text,integer,text),
  public.admin_create_subscription(uuid,text,text,bigint,bigint,date,date,jsonb,text)
  to authenticated;

grant execute on function
  public.claim_job(text[]), public.heartbeat_job(uuid,uuid), public.finish_job(uuid,uuid,text,jsonb,text),
  public.retry_job(uuid,uuid,text,integer), public.set_document_status(uuid,uuid,uuid,text,text),
  public.store_document_chunks(uuid,uuid,uuid,jsonb,integer,integer),
  public.create_generated_course(uuid,uuid,jsonb), public.hr_report_metrics(uuid,timestamptz,timestamptz),
  public.store_hr_report(uuid,uuid,jsonb,jsonb), public.record_support_reply(uuid,uuid,jsonb),
  public.save_lead_qualification(uuid,uuid,jsonb), public.record_agent_run(uuid,uuid,text,jsonb,integer),
  public.analytics_template(text,date,date), public.generate_invoice(uuid,date), public.schedule_periodic_jobs()
  to service_role;
commit;
