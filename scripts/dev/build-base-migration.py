"""Builds supabase/migrations/202610200001_mschool.sql from the spec listing (section 2.2)
plus documented errata (docs/spec-errata.md). Every replacement must match exactly once."""
import sys, pathlib
src, dst = sys.argv[1], sys.argv[2]
s = pathlib.Path(src).read_text()

def rep(old, new, label):
    global s
    n = s.count(old)
    if n != 1:
        raise SystemExit(f"{label}: expected 1 match, got {n}")
    s = s.replace(old, new)

# E-SQL-01: helpers are SECURITY DEFINER over FORCE RLS tables; owner must bypass RLS or the
# users policy recurses through private.tenant_id().
rep("begin;\n", """begin;
-- ERRATA E-SQL-01: SECURITY DEFINER helpers read FORCE-RLS tables. Without BYPASSRLS on the
-- migration owner the users policy would recurse through private.tenant_id().
do $$ begin
  if not exists (select 1 from pg_roles where rolname = current_user and (rolbypassrls or rolsuper)) then
    raise exception 'MIGRATION_OWNER_REQUIRES_BYPASSRLS';
  end if;
end $$;
""", "E-SQL-01")

# Extra profile fields required by UI/billing (service accounts excluded from seats).
rep("""  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now(),
  unique (id, tenant_id),""", """  status text not null default 'active' check (status in ('active','suspended')),
  full_name text not null default '' check (length(full_name) <= 200),
  is_service_account boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, tenant_id),""", "users fields")

# Course-level generated metadata + job link for dedup (E-SQL-06).
rep("""  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (supersedes_id, tenant_id) references public.courses(id, tenant_id),""",
"""  revision bigint not null default 0 check (revision >= 0),
  objectives jsonb not null default '[]'::jsonb check (jsonb_typeof(objectives) = 'array'),
  coverage_gaps jsonb not null default '[]'::jsonb check (jsonb_typeof(coverage_gaps) = 'array'),
  source_job_id uuid unique,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (supersedes_id, tenant_id) references public.courses(id, tenant_id),""", "courses fields")

# E-SQL-16: order uniqueness deferrable so reorder works without temporary offsets.
rep("""  unique (id, course_id, tenant_id),
  unique (course_id, order_index),""", """  unique (id, course_id, tenant_id),
  -- ERRATA E-SQL-16: deferrable to allow transactional reordering.
  unique (course_id, order_index) deferrable initially immediate,""", "modules order")
rep("""  requires_assessment boolean not null default true,
  unique (id, tenant_id), unique (course_id, order_index),""", """  requires_assessment boolean not null default true,
  learning_outcome text not null default '' check (length(learning_outcome) <= 2000),
  unique (id, tenant_id), unique (course_id, order_index) deferrable initially immediate,""", "lessons order")
rep("""  order_index integer not null check (order_index >= 0),
  unique (lesson_id, order_index),""", """  order_index integer not null check (order_index >= 0),
  unique (lesson_id, order_index) deferrable initially immediate,""", "quiz order")
rep("""  primary key (track_id, course_id), unique (track_id, order_index),""",
    """  primary key (track_id, course_id), unique (track_id, order_index) deferrable initially immediate,""", "track order")

# E-SQL-05: unique(user_id, track_id) made a cancelled assignment block re-assignment forever and
# assign_track silently returned the cancelled row.
rep("""  unique (id, user_id, tenant_id), unique (id, tenant_id),
  unique (user_id, track_id),""", """  unique (id, user_id, tenant_id), unique (id, tenant_id),""", "assignments unique")
rep("""create unique index one_active_assignment_per_user
  on public.assignments(user_id) where status = 'active';""", """create unique index one_active_assignment_per_user
  on public.assignments(user_id) where status = 'active';
-- ERRATA E-SQL-05: idempotency only among non-cancelled assignments.
create unique index one_live_assignment_per_track
  on public.assignments(user_id, track_id) where status <> 'cancelled';
create index assignments_tenant_idx on public.assignments(tenant_id, status, track_id);""", "assignments index")

# E-SQL-31: documents need needs_review (2.4) and upload metadata for UI/limits.
rep("""  status text not null default 'uploaded'
    check (status in ('uploaded','processing','review','approved','failed')),
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  check (object_path like""", """  -- ERRATA E-SQL-31: needs_review added (section 2.4: password/corrupt/scan -> needs_review).
  status text not null default 'uploaded'
    check (status in ('uploaded','processing','review','approved','failed','needs_review')),
  original_filename text not null default '' check (length(original_filename) <= 255),
  mime_type text not null default 'application/pdf' check (mime_type in ('application/pdf','text/plain')),
  size_bytes bigint not null default 0 check (size_bytes between 0 and 20971520),
  page_count integer check (page_count between 0 and 300),
  char_count integer check (char_count between 0 and 1000000),
  error_code text,
  uploaded_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  check (object_path like""", "documents fields")

# E-SQL-06: durable job results, heartbeat and typed agent_type.
rep("""  agent_type text not null,
  deduplication_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued','running','needs_review','succeeded','failed')),
  attempts integer not null default 0,
  lease_token uuid,
  lease_until timestamptz,
  available_at timestamptz not null default now(),
  last_error_code text,
  created_at timestamptz not null default now()
);""", """  -- ERRATA E-SQL-06: typed job kinds, durable result and heartbeat columns.
  agent_type text not null check (agent_type in ('ingestion','course_creator','hr_analyst',
    'product_analyst','support','sales','billing')),
  deduplication_key text not null unique,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  status text not null default 'queued'
    check (status in ('queued','running','needs_review','succeeded','failed')),
  attempts integer not null default 0,
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  lease_token uuid,
  lease_until timestamptz,
  heartbeat_at timestamptz,
  available_at timestamptz not null default now(),
  last_error_code text,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);""", "agent_jobs")

# E-SQL-14: lesson_engaged needs one-time server session tokens; source_id = session id so a new
# month's engagement is countable for billing (unique key would otherwise block it forever).
rep("""create table public.subscriptions (""", """-- ERRATA E-SQL-14: one-time lesson session tokens for server-side engagement events.
create table public.lesson_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  user_id uuid not null,
  assignment_id uuid not null,
  lesson_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '4 hours',
  consumed_at timestamptz,
  foreign key (assignment_id, user_id, tenant_id) references public.assignments(id, user_id, tenant_id),
  foreign key (lesson_id, tenant_id) references public.lessons(id, tenant_id)
);
create index lesson_sessions_user_idx on public.lesson_sessions(user_id, started_at desc);
create table public.subscriptions (""", "lesson_sessions")

rep("""  billing_timezone text not null default 'Asia/Tashkent',
  contract_snapshot jsonb not null,
  unique (id, tenant_id), unique (tenant_id, period_start)
);""", """  billing_timezone text not null default 'Asia/Tashkent',
  tier text not null default 'start' check (tier in ('start','growth','enterprise')),
  grace_days integer not null default 14 check (grace_days between 0 and 90),
  contract_snapshot jsonb not null,
  unique (id, tenant_id), unique (tenant_id, period_start)
);""", "subscriptions")

rep("""  status text not null default 'open' check (status in ('open','escalated','resolved')),
  resolution text,
  created_at timestamptz not null default now(),""", """  status text not null default 'open' check (status in ('open','escalated','resolved')),
  resolution text,
  category text check (category in ('product','billing','access','security','assessment')),
  severity text check (severity in ('low','medium','high')),
  agent_reply jsonb,
  escalation_reason text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),""", "support_tickets")
rep("""  metrics jsonb not null,
  narrative jsonb not null,
  created_at timestamptz not null default now(),""", """  metrics jsonb not null,
  narrative jsonb not null,
  report_version text not null default 'hr-report-1',
  source_job_id uuid unique,
  created_at timestamptz not null default now(),""", "hr_reports")

# E-SQL-02: cast to integer only after the integrality check (2.5 produced 22P02, not INVALID_POINTS).
rep("""    n := (item->>'max_points')::integer; m := (item->>'min_points')::integer;
    if (item->>'max_points')::numeric <> trunc((item->>'max_points')::numeric)
      or (item->>'min_points')::numeric <> trunc((item->>'min_points')::numeric)
      or n <= 0""", """    -- ERRATA E-SQL-02: verify integrality before the integer cast.
    if (item->>'max_points')::numeric <> trunc((item->>'max_points')::numeric)
      or (item->>'min_points')::numeric <> trunc((item->>'min_points')::numeric)
      or abs((item->>'max_points')::numeric) > 100 or abs((item->>'min_points')::numeric) > 100 then
      raise exception 'INVALID_POINTS' using errcode = '23514';
    end if;
    n := (item->>'max_points')::integer; m := (item->>'min_points')::integer;
    if n <= 0""", "validate_rubric")
rep("""  for item in select value from jsonb_array_elements(new.criteria) loop
    if not (item ?& """, """  for item in select value from jsonb_array_elements(new.criteria) loop
    if jsonb_typeof(item) <> 'object' then raise exception 'INVALID_CRITERION' using errcode = '23514'; end if;
    if not (item ?& """, "rubric object check")
# E-SQL-03: `item - 'id'` raises on non-object items.
rep("""  for item in select value from jsonb_array_elements(new.options) loop
    if jsonb_typeof(item->'id')""", """  for item in select value from jsonb_array_elements(new.options) loop
    -- ERRATA E-SQL-03: reject non-object options before using object operators.
    if jsonb_typeof(item) <> 'object' then raise exception 'INVALID_QUIZ_OPTION' using errcode = '23514'; end if;
    if jsonb_typeof(item->'id')""", "validate_quiz")

# Storage delete also for needs_review.
rep("""d.status in ('uploaded','failed') and private.can_manage""", """d.status in ('uploaded','failed','needs_review') and private.can_manage""", "storage delete")

# RLS loop includes lesson_sessions.
rep("""'quiz_items','invitations','assessment_overrides','admin_audit_logs'] loop""",
    """'quiz_items','invitations','assessment_overrides','admin_audit_logs','lesson_sessions'] loop""", "rls loop")
rep("""create policy admin_audit_read on public.admin_audit_logs""", """create policy lesson_session_read on public.lesson_sessions for select to authenticated
  using (tenant_id = private.tenant_id() and user_id = auth.uid());
create policy admin_audit_read on public.admin_audit_logs""", "lesson_session policy")

# E-SQL-05 (function part).
rep("""  select id into a from public.assignments where user_id = p_user and track_id = p_track;
  if found then return a; end if;""", """  -- ERRATA E-SQL-05: idempotent only for a live (non-cancelled) assignment.
  select id into a from public.assignments where user_id = p_user and track_id = p_track
    and status <> 'cancelled';
  if found then return a; end if;""", "assign_track")
rep("""  perform private.unlock_next(a);
  return a;
end;""", """  perform private.unlock_next(a);
  -- ERRATA E-SQL-32: assignments are a human HR action and must be audited.
  insert into public.admin_audit_logs(tenant_id,actor_id,action,object_type,object_id,redacted_diff)
    values(u.tenant_id,auth.uid(),'assign','assignment',a,
      jsonb_build_object('track_id',p_track,'track_version',t.version,'user_id',p_user));
  return a;
end;""", "assign audit")

# E-SQL-11: PL/pgSQL reads an IF condition up to the first THEN, so an unparenthesized
# CASE WHEN ... THEN inside IF fails to compile ("syntax error at end of input").
rep("""  if total >= lim or coalesce(personal,0) >= case when p_kind = 'tutor' then 200 else 100 end
    or (last_minute = date_trunc('minute',now()) and minute_count >= case when p_kind = 'tutor' then 10 else 3 end) then""",
"""  -- ERRATA E-SQL-11: CASE parenthesized inside the IF condition.
  if total >= lim or coalesce(personal,0) >= (case when p_kind = 'tutor' then 200 else 100 end)
    or (last_minute = date_trunc('minute',now())
        and minute_count >= (case when p_kind = 'tutor' then 10 else 3 end)) then""", "consume_ai_quota")

pathlib.Path(dst).write_text(s)
print("ok", len(s))
