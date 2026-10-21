begin;
-- ERRATA E-SQL-01: SECURITY DEFINER helpers read FORCE-RLS tables. Without BYPASSRLS on the
-- migration owner the users policy would recurse through private.tenant_id().
do $$ begin
  if not exists (select 1 from pg_roles where rolname = current_user and (rolbypassrls or rolsuper)) then
    raise exception 'MIGRATION_OWNER_REQUIRES_BYPASSRLS';
  end if;
end $$;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create type public.app_role as enum ('superadmin','hr_admin','employee');
create type public.grade as enum ('junior','middle','senior','head');
create type public.progress_status as enum ('locked','in_progress','completed');

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 200),
  subscription_tier text not null default 'start'
    check (subscription_tier in ('start','growth','enterprise')),
  status text not null default 'trial'
    check (status in ('trial','active','suspended','archived')),
  timezone text not null default 'Asia/Tashkent',
  locale text not null default 'ru' check (locale in ('ru','uz-Latn','en')),
  is_demo boolean not null default false,
  max_daily_ai_calls integer not null default 5000 check (max_daily_ai_calls > 0),
  created_at timestamptz not null default now()
);
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  name text not null,
  unique (id, tenant_id), unique (tenant_id, name)
);
create table public.users (
  id uuid primary key references auth.users(id) on delete restrict,
  tenant_id uuid references public.tenants(id),
  email text not null check (email = lower(email)),
  role public.app_role not null default 'employee',
  grade public.grade,
  department_id uuid,
  status text not null default 'active' check (status in ('active','suspended')),
  full_name text not null default '' check (length(full_name) <= 200),
  is_service_account boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  check ((role = 'superadmin' and tenant_id is null and grade is null)
    or (role <> 'superadmin' and tenant_id is not null and grade is not null)),
  foreign key (department_id, tenant_id) references public.departments(id, tenant_id)
);
create unique index users_email_unique on public.users (lower(email));
create index users_tenant_idx on public.users (tenant_id, role, status);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  title text not null check (length(title) between 1 and 300),
  description text not null default '',
  target_grade public.grade not null,
  version integer not null default 1 check (version > 0),
  supersedes_id uuid,
  status text not null default 'draft' check (status in ('draft','published')),
  revision bigint not null default 0 check (revision >= 0),
  objectives jsonb not null default '[]'::jsonb check (jsonb_typeof(objectives) = 'array'),
  coverage_gaps jsonb not null default '[]'::jsonb check (jsonb_typeof(coverage_gaps) = 'array'),
  source_job_id uuid unique,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (supersedes_id, tenant_id) references public.courses(id, tenant_id),
  check (supersedes_id is null or supersedes_id <> id)
);
create table public.course_modules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  course_id uuid not null,
  title text not null,
  content jsonb not null default '{}'::jsonb,
  order_index integer not null check (order_index >= 0),
  unique (id, course_id, tenant_id),
  -- ERRATA E-SQL-16: deferrable to allow transactional reordering.
  unique (course_id, order_index) deferrable initially immediate,
  foreign key (course_id, tenant_id) references public.courses(id, tenant_id)
);
create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  course_id uuid not null,
  module_id uuid not null,
  title text not null,
  content text not null check (length(content) between 1 and 24000),
  assessment_question text not null default '' check (length(assessment_question) <= 6000),
  order_index integer not null check (order_index >= 0),
  requires_assessment boolean not null default true,
  learning_outcome text not null default '' check (length(learning_outcome) <= 2000),
  unique (id, tenant_id), unique (course_id, order_index) deferrable initially immediate,
  foreign key (course_id, tenant_id) references public.courses(id, tenant_id),
  foreign key (module_id, course_id, tenant_id)
    references public.course_modules(id, course_id, tenant_id)
);
create table public.assessment_rubrics (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  lesson_id uuid not null,
  criteria jsonb not null,
  passing_score integer not null default 80 check (passing_score between 1 and 100),
  version integer not null default 1 check (version > 0),
  unique (id, tenant_id), unique (lesson_id),
  unique (id, lesson_id, tenant_id),
  foreign key (lesson_id, tenant_id) references public.lessons(id, tenant_id)
);
create table public.quiz_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  lesson_id uuid not null,
  question text not null,
  options jsonb not null check (jsonb_typeof(options) = 'array'),
  correct_option_id text not null,
  explanation text not null,
  order_index integer not null check (order_index >= 0),
  unique (lesson_id, order_index) deferrable initially immediate,
  foreign key (lesson_id, tenant_id) references public.lessons(id, tenant_id)
);
create table public.tracks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  title text not null,
  target_grade public.grade not null,
  version integer not null default 1 check (version > 0),
  status text not null default 'draft' check (status in ('draft','published')),
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id), unique (tenant_id, title, target_grade, version)
);
create table public.track_courses (
  tenant_id uuid not null references public.tenants(id),
  track_id uuid not null,
  course_id uuid not null,
  order_index integer not null check (order_index >= 0),
  primary key (track_id, course_id), unique (track_id, order_index) deferrable initially immediate,
  foreign key (track_id, tenant_id) references public.tracks(id, tenant_id),
  foreign key (course_id, tenant_id) references public.courses(id, tenant_id)
);
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  user_id uuid not null,
  track_id uuid not null,
  status text not null default 'active'
    check (status in ('active','completed','cancelled')),
  assigned_at timestamptz not null default now(),
  due_at timestamptz,
  completed_at timestamptz,
  unique (id, user_id, tenant_id), unique (id, tenant_id),
  foreign key (user_id, tenant_id) references public.users(id, tenant_id),
  foreign key (track_id, tenant_id) references public.tracks(id, tenant_id)
);
create unique index one_active_assignment_per_user
  on public.assignments(user_id) where status = 'active';
-- ERRATA E-SQL-05: idempotency only among non-cancelled assignments.
create unique index one_live_assignment_per_track
  on public.assignments(user_id, track_id) where status <> 'cancelled';
create index assignments_tenant_idx on public.assignments(tenant_id, status, track_id);
create table public.progress (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  user_id uuid not null,
  assignment_id uuid not null,
  lesson_id uuid not null,
  status public.progress_status not null default 'locked',
  score integer check (score between 0 and 100),
  completed_at timestamptz,
  unique (assignment_id, lesson_id),
  foreign key (assignment_id, user_id, tenant_id)
    references public.assignments(id, user_id, tenant_id),
  foreign key (lesson_id, tenant_id) references public.lessons(id, tenant_id),
  check ((status = 'completed') = (completed_at is not null))
);
create index progress_tenant_user_idx on public.progress(tenant_id, user_id, status);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  title text not null,
  object_path text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  -- ERRATA E-SQL-31: needs_review added (section 2.4: password/corrupt/scan -> needs_review).
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
  check (object_path like tenant_id::text || '/' || id::text || '/%')
);
create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  document_id uuid not null,
  chunk_index integer not null check (chunk_index >= 0),
  page integer not null check (page > 0),
  content text not null check (length(content) between 1 and 6000),
  embedding extensions.vector(1536) not null,
  embedding_model text not null,
  unique (id, tenant_id), unique (document_id, chunk_index),
  foreign key (document_id, tenant_id) references public.documents(id, tenant_id)
);
create index chunks_tenant_document_idx on public.document_chunks(tenant_id, document_id);
create table public.lesson_sources (
  tenant_id uuid not null references public.tenants(id),
  lesson_id uuid not null,
  chunk_id uuid not null,
  primary key (lesson_id, chunk_id),
  foreign key (lesson_id, tenant_id) references public.lessons(id, tenant_id),
  foreign key (chunk_id, tenant_id) references public.document_chunks(id, tenant_id)
);
create table public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  user_id uuid not null,
  assignment_id uuid not null,
  lesson_id uuid not null,
  rubric_id uuid not null,
  request_key uuid not null,
  answer text not null check (length(answer) between 1 and 12000),
  answer_hash text not null,
  status text not null default 'running' check (status in ('running','succeeded','failed')),
  lease_token uuid not null default gen_random_uuid(),
  lease_until timestamptz not null default now() + interval '2 minutes',
  retry_count integer not null default 0,
  evaluation jsonb,
  result jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (id, tenant_id), unique (tenant_id, user_id, request_key),
  foreign key (assignment_id, user_id, tenant_id)
    references public.assignments(id, user_id, tenant_id),
  foreign key (lesson_id, tenant_id) references public.lessons(id, tenant_id),
  foreign key (rubric_id, lesson_id, tenant_id) references public.assessment_rubrics(id, lesson_id, tenant_id)
);
create index attempts_user_lesson_idx
  on public.assessment_attempts(tenant_id, user_id, lesson_id, created_at);
create table public.tutor_exchanges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  user_id uuid not null,
  assignment_id uuid not null,
  lesson_id uuid not null,
  question text not null check (length(question) between 1 and 2000),
  answer text not null check (length(answer) between 1 and 12000),
  citations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (assignment_id, user_id, tenant_id)
    references public.assignments(id, user_id, tenant_id),
  foreign key (lesson_id, tenant_id) references public.lessons(id, tenant_id)
);
create table public.agent_audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id),
  actor_id uuid references public.users(id),
  agent_type text not null check (agent_type in
    ('sales','support','product_analyst','course_creator','tutor','assessor','hr_analyst')),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  execution_time_ms integer not null check (execution_time_ms >= 0),
  created_at timestamptz not null default now()
);
create index audit_tenant_time_idx on public.agent_audit_logs(tenant_id, created_at desc);
create table public.agent_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id),
  actor_id uuid references public.users(id),
  -- ERRATA E-SQL-06: typed job kinds, durable result and heartbeat columns.
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
);
create index jobs_claim_idx on public.agent_jobs(status, available_at);
create table public.usage_daily (
  tenant_id uuid not null references public.tenants(id),
  user_id uuid not null,
  day date not null,
  agent_type text not null check (agent_type in ('tutor','assessor')),
  calls integer not null default 0 check (calls >= 0),
  minute_start timestamptz not null default date_trunc('minute',now()),
  minute_calls integer not null default 0 check (minute_calls >= 0),
  primary key (tenant_id, user_id, day, agent_type),
  foreign key (user_id, tenant_id) references public.users(id, tenant_id)
);
create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  user_id uuid not null,
  event_type text not null check (event_type in
    ('lesson_engaged','lesson_completed','assessment_submitted','tutor_question')),
  source_id uuid not null,
  occurred_at timestamptz not null default now(),
  unique (tenant_id, user_id, event_type, source_id),
  foreign key (user_id, tenant_id) references public.users(id, tenant_id)
);
create index activity_billing_idx on public.activity_events(tenant_id, occurred_at, user_id);
-- ERRATA E-SQL-14: one-time lesson session tokens for server-side engagement events.
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
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  status text not null check (status in ('trial','active','past_due','cancelled')),
  currency text not null check (currency in ('USD','UZS')),
  seat_price_minor bigint not null check (seat_price_minor >= 0),
  minimum_monthly_minor bigint not null check (minimum_monthly_minor >= 0),
  period_start date not null,
  period_end date not null check (period_end > period_start),
  billing_timezone text not null default 'Asia/Tashkent',
  tier text not null default 'start' check (tier in ('start','growth','enterprise')),
  grace_days integer not null default 14 check (grace_days between 0 and 90),
  contract_snapshot jsonb not null,
  unique (id, tenant_id), unique (tenant_id, period_start)
);
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  subscription_id uuid not null,
  period_start date not null,
  period_end date not null check (period_end > period_start),
  active_seats integer not null check (active_seats >= 0),
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null check (currency in ('USD','UZS')),
  status text not null check (status in ('draft','issued','paid','void')),
  paid_at timestamptz,
  payment_reference text,
  snapshot jsonb not null,
  unique (tenant_id, period_start, period_end),
  foreign key (subscription_id, tenant_id) references public.subscriptions(id, tenant_id)
);
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  user_id uuid not null,
  subject text not null,
  body text not null,
  status text not null default 'open' check (status in ('open','escalated','resolved')),
  resolution text,
  category text check (category in ('product','billing','access','security','assessment')),
  severity text check (severity in ('low','medium','high')),
  agent_reply jsonb,
  escalation_reason text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (user_id, tenant_id) references public.users(id, tenant_id)
);
create table public.hr_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  period_start date not null,
  period_end date not null check (period_end > period_start),
  metrics jsonb not null,
  narrative jsonb not null,
  report_version text not null default 'hr-report-1',
  source_job_id uuid unique,
  created_at timestamptz not null default now(),
  unique (tenant_id, period_start, period_end)
);
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  company_name text not null,
  qualification jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new','qualified','trial','closed')),
  tenant_id uuid references public.tenants(id),
  consent_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.assessment_appeals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  attempt_id uuid not null,
  user_id uuid not null,
  reason text not null check (length(reason) between 10 and 4000),
  status text not null default 'open' check (status in ('open','upheld','overturned')),
  reviewer_id uuid references public.users(id),
  decision text,
  created_at timestamptz not null default now(),
  unique (attempt_id),
  foreign key (attempt_id, tenant_id) references public.assessment_attempts(id, tenant_id),
  foreign key (user_id, tenant_id) references public.users(id, tenant_id)
);
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  email text not null check (email = lower(email)),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  invited_by uuid not null references public.users(id),
  target_grade public.grade not null default 'junior',
  department_id uuid,
  created_at timestamptz not null default now(),
  foreign key (department_id, tenant_id) references public.departments(id, tenant_id)
);
create unique index one_pending_invitation on public.invitations(tenant_id,email)
  where accepted_at is null;
create table public.assessment_overrides (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  attempt_id uuid not null,
  reviewer_id uuid not null references public.users(id),
  passed boolean not null,
  score integer not null check (score between 0 and 100),
  reason text not null check (length(reason) between 10 and 4000),
  created_at timestamptz not null default now(),
  foreign key (attempt_id, tenant_id) references public.assessment_attempts(id, tenant_id)
);
create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id),
  actor_id uuid not null references public.users(id),
  action text not null,
  object_type text not null,
  object_id uuid,
  redacted_diff jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- SECURITY DEFINER helpers owned by the trusted migration owner.
-- They read authoritative rows and never trust editable JWT metadata.
create function private.is_superadmin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.users
    where id = auth.uid() and role = 'superadmin' and status = 'active');
$$;
create function private.tenant_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select u.tenant_id from public.users u join public.tenants t on t.id = u.tenant_id
  where u.id = auth.uid() and u.status = 'active' and t.status in ('trial','active');
$$;
create function private.can_manage(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_superadmin() or exists (
    select 1 from public.users u join public.tenants x on x.id = u.tenant_id
    where u.id = auth.uid() and u.tenant_id = t and u.role = 'hr_admin'
      and u.status = 'active' and x.status in ('trial','active'));
$$;
create function private.course_visible(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.courses x where x.id = c and
    (private.can_manage(x.tenant_id) or (x.tenant_id = private.tenant_id()
     and x.status = 'published' and exists (
       select 1 from public.track_courses tc join public.assignments a
         on a.track_id = tc.track_id and a.tenant_id = tc.tenant_id
       where tc.course_id = x.id and a.user_id = auth.uid()
         and a.status in ('active','completed')))));
$$;
create function private.lesson_visible(l uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.lessons x where x.id = l and
    (private.can_manage(x.tenant_id) or (x.tenant_id = private.tenant_id() and exists (
      select 1 from public.progress p join public.assignments a on a.id = p.assignment_id
      where p.lesson_id = x.id and p.user_id = auth.uid()
        and p.status <> 'locked' and a.status in ('active','completed')))));
$$;
create function private.is_draft_course(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.courses
    where id = c and status = 'draft' and private.can_manage(tenant_id));
$$;
create function private.is_draft_lesson(l uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.lessons
    where id = l and private.is_draft_course(course_id));
$$;
create function private.is_draft_track(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.tracks
    where id = t and status = 'draft' and private.can_manage(tenant_id));
$$;

-- Published content is immutable even for application administrators.
create function private.guard_course() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP <> 'INSERT' and old.status = 'published' then
    raise exception 'PUBLISHED_IMMUTABLE' using errcode = '23514';
  end if;
  if TG_OP = 'DELETE' then return old; end if;
  if TG_OP = 'INSERT' and new.status <> 'draft' then
    raise exception 'CREATE_DRAFT_FIRST' using errcode = '23514';
  end if;
  if TG_OP = 'UPDATE' and (new.id <> old.id or new.tenant_id <> old.tenant_id) then
    raise exception 'IDENTITY_IMMUTABLE' using errcode = '23514';
  end if;
  if TG_OP = 'UPDATE' then
    new.revision := old.revision + 1;
    new.updated_at := now();
  end if;
  if new.status = 'published' then
    if not private.can_manage(new.tenant_id) then
      raise exception 'HUMAN_PUBLISH_REQUIRED' using errcode = '42501';
    end if;
    if not exists(select 1 from public.lessons where course_id = new.id) then
      raise exception 'EMPTY_COURSE' using errcode = '23514';
    end if;
    if exists(select 1 from public.lessons l where l.course_id = new.id
      and l.requires_assessment and (length(trim(l.assessment_question)) = 0 or not exists
        (select 1 from public.assessment_rubrics r where r.lesson_id = l.id))) then
      raise exception 'MISSING_RUBRIC' using errcode = '23514';
    end if;
    if exists(select 1 from public.lesson_sources s
      join public.lessons l on l.id = s.lesson_id
      join public.document_chunks ch on ch.id = s.chunk_id
      join public.documents d on d.id = ch.document_id
      where l.course_id = new.id and d.status <> 'approved') then
      raise exception 'UNAPPROVED_SOURCE' using errcode = '23514';
    end if;
    insert into public.admin_audit_logs(tenant_id,actor_id,action,object_type,object_id,redacted_diff)
      values(new.tenant_id,auth.uid(),'publish','course',new.id,
        jsonb_build_object('version',new.version,'status','published'));
  end if;
  return new;
end;
$$;
create trigger course_guard before insert or update or delete on public.courses
  for each row execute function private.guard_course();
create function private.guard_course_child() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb; parent_id uuid; parent_state text;
begin
  if TG_OP = 'UPDATE' and
    (to_jsonb(new)->>'tenant_id' is distinct from to_jsonb(old)->>'tenant_id'
     or to_jsonb(new)->>'course_id' is distinct from to_jsonb(old)->>'course_id'
     or to_jsonb(new)->>'lesson_id' is distinct from to_jsonb(old)->>'lesson_id') then
    raise exception 'PARENT_IMMUTABLE' using errcode = '23514';
  end if;
  r := case when TG_OP = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  if TG_TABLE_NAME in ('course_modules','lessons') then
    parent_id := (r->>'course_id')::uuid;
  else
    select course_id into parent_id from public.lessons where id = (r->>'lesson_id')::uuid;
  end if;
  select status into parent_state from public.courses where id = parent_id for update;
  if parent_state is distinct from 'draft' then
    raise exception 'PUBLISHED_IMMUTABLE' using errcode = '23514';
  end if;
  if TG_OP = 'DELETE' then return old; else return new; end if;
end;
$$;
create trigger modules_guard before insert or update or delete on public.course_modules
  for each row execute function private.guard_course_child();
create trigger lessons_guard before insert or update or delete on public.lessons
  for each row execute function private.guard_course_child();
create trigger rubrics_guard before insert or update or delete on public.assessment_rubrics
  for each row execute function private.guard_course_child();
create trigger lesson_sources_guard before insert or update or delete on public.lesson_sources
  for each row execute function private.guard_course_child();
create trigger quiz_guard before insert or update or delete on public.quiz_items
  for each row execute function private.guard_course_child();
create function private.validate_rubric() returns trigger
language plpgsql set search_path = '' as $$
declare item jsonb; total integer := 0; ids text[] := '{}'; n integer; m integer;
begin
  if jsonb_typeof(new.criteria) <> 'array' or jsonb_array_length(new.criteria) not between 1 and 20 then
    raise exception 'INVALID_RUBRIC' using errcode = '23514';
  end if;
  for item in select value from jsonb_array_elements(new.criteria) loop
    if jsonb_typeof(item) <> 'object' then raise exception 'INVALID_CRITERION' using errcode = '23514'; end if;
    if not (item ?& array['id','description','max_points','critical','min_points','reference'])
      or coalesce(length(item->>'id'),0) = 0
      or item->>'id' = any(ids)
      or jsonb_typeof(item->'critical') <> 'boolean'
      or jsonb_typeof(item->'max_points') <> 'number'
      or jsonb_typeof(item->'min_points') <> 'number' then
      raise exception 'INVALID_CRITERION' using errcode = '23514';
    end if;
    -- ERRATA E-SQL-02: verify integrality before the integer cast.
    if (item->>'max_points')::numeric <> trunc((item->>'max_points')::numeric)
      or (item->>'min_points')::numeric <> trunc((item->>'min_points')::numeric)
      or abs((item->>'max_points')::numeric) > 100 or abs((item->>'min_points')::numeric) > 100 then
      raise exception 'INVALID_POINTS' using errcode = '23514';
    end if;
    n := (item->>'max_points')::integer; m := (item->>'min_points')::integer;
    if n <= 0 or m < 0 or m > n
      or ((item->>'critical')::boolean and m = 0)
      or jsonb_typeof(item->'id') is distinct from 'string'
      or jsonb_typeof(item->'description') is distinct from 'string'
      or jsonb_typeof(item->'reference') is distinct from 'string'
      or coalesce(length(item->>'description'),0) = 0
      or coalesce(length(item->>'reference'),0) = 0 then
      raise exception 'INVALID_POINTS' using errcode = '23514';
    end if;
    ids := array_append(ids, item->>'id'); total := total + n;
  end loop;
  if total <> 100 then raise exception 'WEIGHTS_MUST_SUM_100' using errcode = '23514'; end if;
  return new;
end;
$$;
create trigger rubric_validation before insert or update on public.assessment_rubrics
  for each row execute function private.validate_rubric();
create function private.validate_quiz() returns trigger
language plpgsql set search_path = '' as $$
declare item jsonb; ids text[] := '{}';
begin
  if jsonb_typeof(new.options) is distinct from 'array'
    or jsonb_array_length(new.options) not between 2 and 6
    or length(new.question) not between 1 and 6000
    or length(new.explanation) not between 1 and 6000 then
    raise exception 'INVALID_QUIZ' using errcode = '23514';
  end if;
  for item in select value from jsonb_array_elements(new.options) loop
    -- ERRATA E-SQL-03: reject non-object options before using object operators.
    if jsonb_typeof(item) <> 'object' then raise exception 'INVALID_QUIZ_OPTION' using errcode = '23514'; end if;
    if jsonb_typeof(item->'id') is distinct from 'string'
      or jsonb_typeof(item->'label') is distinct from 'string'
      or length(item->>'id') not between 1 and 64
      or length(item->>'label') not between 1 and 2000
      or item->>'id' = any(ids) or (item - 'id' - 'label') <> '{}'::jsonb then
      raise exception 'INVALID_QUIZ_OPTION' using errcode = '23514';
    end if;
    ids := array_append(ids,item->>'id');
  end loop;
  if not (new.correct_option_id = any(ids)) then
    raise exception 'INVALID_QUIZ_KEY' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger quiz_validation before insert or update on public.quiz_items
  for each row execute function private.validate_quiz();
create function private.guard_track() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP <> 'INSERT' and old.status = 'published' then
    raise exception 'PUBLISHED_IMMUTABLE' using errcode = '23514';
  end if;
  if TG_OP = 'DELETE' then return old; end if;
  if TG_OP = 'INSERT' and new.status <> 'draft' then
    raise exception 'CREATE_DRAFT_FIRST' using errcode = '23514';
  end if;
  if TG_OP = 'UPDATE' and (new.id <> old.id or new.tenant_id <> old.tenant_id) then
    raise exception 'IDENTITY_IMMUTABLE' using errcode = '23514';
  end if;
  if TG_OP = 'UPDATE' then
    new.revision := old.revision + 1;
    new.updated_at := now();
  end if;
  if new.status = 'published' then
    if not private.can_manage(new.tenant_id) then
      raise exception 'HUMAN_PUBLISH_REQUIRED' using errcode = '42501';
    end if;
    if not exists(select 1 from public.track_courses where track_id = new.id)
      or exists(select 1 from public.track_courses tc
        join public.courses c on c.id = tc.course_id
        where tc.track_id = new.id and (c.status <> 'published' or c.target_grade <> new.target_grade)) then
      raise exception 'INVALID_TRACK' using errcode = '23514';
    end if;
    insert into public.admin_audit_logs(tenant_id,actor_id,action,object_type,object_id,redacted_diff)
      values(new.tenant_id,auth.uid(),'publish','track',new.id,
        jsonb_build_object('version',new.version,'status','published'));
  end if;
  return new;
end;
$$;
create trigger track_guard before insert or update or delete on public.tracks
  for each row execute function private.guard_track();
create function private.guard_track_course() returns trigger
language plpgsql security definer set search_path = '' as $$
declare tid uuid; st text;
begin
  if TG_OP = 'UPDATE' and (new.track_id <> old.track_id or new.tenant_id <> old.tenant_id) then
    raise exception 'PARENT_IMMUTABLE' using errcode = '23514';
  end if;
  tid := case when TG_OP = 'DELETE' then old.track_id else new.track_id end;
  select status into st from public.tracks where id = tid for update;
  if st is distinct from 'draft' then
    raise exception 'PUBLISHED_IMMUTABLE' using errcode = '23514';
  end if;
  if TG_OP = 'DELETE' then return old; else return new; end if;
end;
$$;
create trigger track_course_guard before insert or update or delete on public.track_courses
  for each row execute function private.guard_track_course();
create function private.guard_source() returns trigger
language plpgsql security definer set search_path = '' as $$
declare did uuid; st text;
begin
  if TG_TABLE_NAME = 'documents' then
    if TG_OP = 'INSERT' and new.status <> 'uploaded' then
      raise exception 'UPLOAD_FIRST' using errcode = '23514';
    end if;
    if TG_OP = 'UPDATE' and (new.id <> old.id or new.tenant_id <> old.tenant_id) then
      raise exception 'IDENTITY_IMMUTABLE' using errcode = '23514';
    end if;
    if old.status = 'approved' then raise exception 'SOURCE_IMMUTABLE' using errcode = '23514'; end if;
    if TG_OP = 'UPDATE' and new.status = 'approved' and not private.can_manage(new.tenant_id) then
      raise exception 'HUMAN_APPROVAL_REQUIRED' using errcode = '42501';
    end if;
    if TG_OP = 'UPDATE' and new.status = 'approved' then
      insert into public.admin_audit_logs(tenant_id,actor_id,action,object_type,object_id)
        values(new.tenant_id,auth.uid(),'approve','document',new.id);
    end if;
  else
    if TG_OP = 'UPDATE' and (new.document_id <> old.document_id or new.tenant_id <> old.tenant_id) then
      raise exception 'PARENT_IMMUTABLE' using errcode = '23514';
    end if;
    did := case when TG_OP = 'DELETE' then old.document_id else new.document_id end;
    select status into st from public.documents where id = did for update;
    if st = 'approved' then raise exception 'SOURCE_IMMUTABLE' using errcode = '23514'; end if;
  end if;
  if TG_OP = 'DELETE' then return old; else return new; end if;
end;
$$;
create trigger documents_guard before insert or update or delete on public.documents
  for each row execute function private.guard_source();
create trigger chunks_guard before insert or update or delete on public.document_chunks
  for each row execute function private.guard_source();

-- ENABLE + FORCE RLS on every application table; explicit grants below.
do $$
declare t text;
begin
  foreach t in array array['tenants','departments','users','courses','course_modules','lessons',
    'assessment_rubrics','tracks','track_courses','assignments','progress','documents','document_chunks',
    'lesson_sources','assessment_attempts','tutor_exchanges','agent_audit_logs','agent_jobs','usage_daily',
    'activity_events','subscriptions','invoices','support_tickets','hr_reports','leads','assessment_appeals',
    'quiz_items','invitations','assessment_overrides','admin_audit_logs','lesson_sessions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('create policy superadmin_global on public.%I for all to authenticated using (private.is_superadmin()) with check (private.is_superadmin())', t);
  end loop;
end;
$$;
create policy tenant_read on public.tenants for select to authenticated
  using (id = private.tenant_id());
create policy user_read on public.users for select to authenticated
  using ((id = auth.uid() and tenant_id = private.tenant_id()) or private.can_manage(tenant_id));
create policy department_read on public.departments for select to authenticated
  using (tenant_id = private.tenant_id());
create policy department_write on public.departments for all to authenticated
  using (private.can_manage(tenant_id)) with check (private.can_manage(tenant_id));
create policy course_read on public.courses for select to authenticated
  using (private.course_visible(id));
create policy course_write on public.courses for all to authenticated
  using (private.can_manage(tenant_id) and status = 'draft')
  with check (private.can_manage(tenant_id));
create policy module_read on public.course_modules for select to authenticated
  using (private.course_visible(course_id));
create policy module_write on public.course_modules for all to authenticated
  using (private.is_draft_course(course_id)) with check (private.is_draft_course(course_id));
create policy lesson_read on public.lessons for select to authenticated
  using (private.lesson_visible(id));
create policy lesson_write on public.lessons for all to authenticated
  using (private.is_draft_course(course_id)) with check (private.is_draft_course(course_id));
create policy rubric_read on public.assessment_rubrics for select to authenticated
  using (private.can_manage(tenant_id));
create policy rubric_write on public.assessment_rubrics for all to authenticated
  using (private.is_draft_lesson(lesson_id)) with check (private.is_draft_lesson(lesson_id));
create policy track_read on public.tracks for select to authenticated
  using (private.can_manage(tenant_id) or (tenant_id = private.tenant_id() and exists (
    select 1 from public.assignments a where a.track_id = tracks.id and a.user_id = auth.uid())));
create policy track_write on public.tracks for all to authenticated
  using (private.can_manage(tenant_id) and status = 'draft') with check (private.can_manage(tenant_id));
create policy track_course_read on public.track_courses for select to authenticated
  using (private.can_manage(tenant_id) or exists (
    select 1 from public.assignments a where a.track_id = track_courses.track_id and a.user_id = auth.uid()));
create policy track_course_write on public.track_courses for all to authenticated
  using (private.is_draft_track(track_id)) with check (private.is_draft_track(track_id));
create policy assignment_read on public.assignments for select to authenticated
  using (private.can_manage(tenant_id) or (tenant_id = private.tenant_id() and user_id = auth.uid()));
create policy progress_read on public.progress for select to authenticated
  using (private.can_manage(tenant_id) or (tenant_id = private.tenant_id() and user_id = auth.uid()));
create policy document_read on public.documents for select to authenticated
  using (private.can_manage(tenant_id));
create policy document_write on public.documents for all to authenticated
  using (private.can_manage(tenant_id)) with check (private.can_manage(tenant_id));
create policy chunk_read on public.document_chunks for select to authenticated
  using (private.can_manage(tenant_id));
create policy lesson_source_read on public.lesson_sources for select to authenticated
  using (private.can_manage(tenant_id));
create policy lesson_source_write on public.lesson_sources for all to authenticated
  using (private.is_draft_lesson(lesson_id)) with check (private.is_draft_lesson(lesson_id));
create policy attempt_read on public.assessment_attempts for select to authenticated
  using (private.can_manage(tenant_id) or (tenant_id = private.tenant_id() and user_id = auth.uid()));
create policy tutor_read on public.tutor_exchanges for select to authenticated
  using (tenant_id = private.tenant_id() and user_id = auth.uid());
create policy audit_read on public.agent_audit_logs for select to authenticated
  using (tenant_id is not null and private.can_manage(tenant_id));
create policy job_read on public.agent_jobs for select to authenticated
  using (tenant_id is not null and private.can_manage(tenant_id));
create policy usage_read on public.usage_daily for select to authenticated
  using (private.can_manage(tenant_id) or (tenant_id = private.tenant_id() and user_id = auth.uid()));
create policy activity_read on public.activity_events for select to authenticated
  using (private.can_manage(tenant_id));
create policy subscription_read on public.subscriptions for select to authenticated
  using (private.can_manage(tenant_id));
create policy invoice_read on public.invoices for select to authenticated
  using (private.can_manage(tenant_id));
create policy ticket_read on public.support_tickets for select to authenticated
  using (private.can_manage(tenant_id) or (tenant_id = private.tenant_id() and user_id = auth.uid()));
create policy report_read on public.hr_reports for select to authenticated
  using (private.can_manage(tenant_id));
create policy appeal_read on public.assessment_appeals for select to authenticated
  using (private.can_manage(tenant_id) or (tenant_id = private.tenant_id() and user_id = auth.uid()));
create policy quiz_read on public.quiz_items for select to authenticated
  using (private.can_manage(tenant_id));
create policy quiz_write on public.quiz_items for all to authenticated
  using (private.is_draft_lesson(lesson_id)) with check (private.is_draft_lesson(lesson_id));
create policy invitation_read on public.invitations for select to authenticated
  using (private.can_manage(tenant_id));
create policy override_read on public.assessment_overrides for select to authenticated
  using (private.can_manage(tenant_id) or exists(select 1 from public.assessment_attempts a
    where a.id = assessment_overrides.attempt_id and a.user_id = auth.uid() and a.tenant_id = private.tenant_id()));
create policy lesson_session_read on public.lesson_sessions for select to authenticated
  using (tenant_id = private.tenant_id() and user_id = auth.uid());
create policy admin_audit_read on public.admin_audit_logs for select to authenticated
  using (tenant_id is not null and private.can_manage(tenant_id));
grant insert, update, delete on public.departments, public.courses, public.course_modules,
  public.lessons, public.assessment_rubrics, public.tracks, public.track_courses,
  public.documents, public.lesson_sources, public.quiz_items to authenticated;

-- Trusted provisioning: only the server may call this after verified Auth email + consent.
create function public.provision_tenant(p_auth_user uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare t uuid; e text; confirmed timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_auth_user::text, 0));
  select tenant_id into t from public.users where id = p_auth_user;
  if found then
    if t is null then raise exception 'ROLE_CONFLICT'; end if;
    return t;
  end if;
  select lower(email), email_confirmed_at into e, confirmed from auth.users where id = p_auth_user;
  if e is null or confirmed is null then raise exception 'VERIFIED_EMAIL_REQUIRED'; end if;
  insert into public.tenants(name) values (p_name) returning id into t;
  insert into public.users(id, tenant_id, email, role, grade)
    values (p_auth_user, t, e, 'hr_admin', 'head');
  insert into public.agent_audit_logs(tenant_id, actor_id, agent_type, payload, execution_time_ms)
    values(t, p_auth_user, 'sales', '{"action":"trial_provisioned"}', 0);
  return t;
end;
$$;

create function private.unlock_next(p_assignment uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare next_id uuid;
begin
  perform 1 from public.assignments where id = p_assignment for update;
  select p.id into next_id from public.progress p
    join public.lessons l on l.id = p.lesson_id
    join public.course_modules m on m.id = l.module_id and m.tenant_id = l.tenant_id
    join public.assignments a on a.id = p.assignment_id
    join public.track_courses tc on tc.track_id = a.track_id and tc.course_id = l.course_id
    where p.assignment_id = p_assignment and p.status <> 'completed'
    order by tc.order_index, m.order_index, l.order_index limit 1;
  if next_id is null then
    update public.assignments set status = 'completed', completed_at = now()
      where id = p_assignment and status = 'active';
  else
    update public.progress set status = 'in_progress' where id = next_id and status = 'locked';
  end if;
end;
$$;
create function public.assign_track(p_user uuid, p_track uuid, p_due_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare u public.users; t public.tracks; a uuid;
begin
  select * into u from public.users where id = p_user for update;
  if not found or not private.can_manage(u.tenant_id) or u.role <> 'employee' or u.status <> 'active' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into t from public.tracks where id = p_track and tenant_id = u.tenant_id;
  if not found or t.status <> 'published' or t.target_grade <> u.grade then
    raise exception 'INVALID_TRACK' using errcode = '23514';
  end if;
  -- ERRATA E-SQL-05: idempotent only for a live (non-cancelled) assignment.
  select id into a from public.assignments where user_id = p_user and track_id = p_track
    and status <> 'cancelled';
  if found then return a; end if;
  if exists(select 1 from public.assignments where user_id = p_user and status = 'active') then
    raise exception 'ACTIVE_ASSIGNMENT_EXISTS' using errcode = '23514';
  end if;
  insert into public.assignments(tenant_id,user_id,track_id,due_at)
    values(u.tenant_id,p_user,p_track,p_due_at) returning id into a;
  insert into public.progress(tenant_id,user_id,assignment_id,lesson_id)
    select u.tenant_id,p_user,a,l.id from public.track_courses tc
      join public.lessons l on l.course_id = tc.course_id and l.tenant_id = tc.tenant_id
      where tc.track_id = p_track;
  perform private.unlock_next(a);
  -- ERRATA E-SQL-32: assignments are a human HR action and must be audited.
  insert into public.admin_audit_logs(tenant_id,actor_id,action,object_type,object_id,redacted_diff)
    values(u.tenant_id,auth.uid(),'assign','assignment',a,
      jsonb_build_object('track_id',p_track,'track_version',t.version,'user_id',p_user));
  return a;
end;
$$;
create function public.lesson_context(p_assignment uuid, p_lesson uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare context jsonb;
begin
  select jsonb_build_object('tenant_id',a.tenant_id,'user_id',a.user_id,
    'assignment_id',a.id,'lesson_id',l.id,'course_id',l.course_id,
    'grade',u.grade,'title',l.title,'content',l.content,'progress_status',p.status,
    'assessment_question',l.assessment_question,
    'requires_assessment',l.requires_assessment)
  into context from public.assignments a
  join public.users u on u.id = a.user_id
  join public.progress p on p.assignment_id = a.id and p.lesson_id = p_lesson
  join public.lessons l on l.id = p.lesson_id
  where a.id = p_assignment and a.user_id = auth.uid() and a.tenant_id = private.tenant_id()
    and a.status in ('active','completed') and p.status <> 'locked' and u.status = 'active';
  if context is null then raise exception 'NOT_FOUND' using errcode = '42501'; end if;
  return context;
end;
$$;
create function public.complete_reading(p_assignment uuid, p_lesson uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare ctx jsonb;
begin
  perform 1 from public.assignments where id = p_assignment for update;
  ctx := public.lesson_context(p_assignment,p_lesson);
  if (ctx->>'requires_assessment')::boolean then
    raise exception 'ASSESSMENT_REQUIRED' using errcode = '23514';
  end if;
  if ctx->>'progress_status' = 'completed' then return; end if;
  update public.progress set status = 'completed', completed_at = now()
    where assignment_id = p_assignment and lesson_id = p_lesson;
  insert into public.activity_events(tenant_id,user_id,event_type,source_id)
    values((ctx->>'tenant_id')::uuid,auth.uid(),'lesson_completed',p_lesson) on conflict do nothing;
  perform private.unlock_next(p_assignment);
end;
$$;
create function public.roadmap_manifest(p_assignment uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not exists(select 1 from public.assignments where id = p_assignment
    and user_id = auth.uid() and tenant_id = private.tenant_id()) then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'course_id',c.id,'course_title',c.title,'module_id',m.id,'module_title',m.title,
    'lesson_id',l.id,'lesson_title',l.title,'order_index',l.order_index,
    'module_order_index',m.order_index,'course_order_index',tc.order_index,
    'status',p.status,'score',p.score) order by tc.order_index,m.order_index,l.order_index),'[]'::jsonb)
  into result from public.assignments a
    join public.track_courses tc on tc.track_id = a.track_id and tc.tenant_id = a.tenant_id
    join public.courses c on c.id = tc.course_id and c.tenant_id = tc.tenant_id
    join public.lessons l on l.course_id = c.id and l.tenant_id = c.tenant_id
    join public.course_modules m on m.id = l.module_id and m.tenant_id = l.tenant_id
    join public.progress p on p.assignment_id = a.id and p.lesson_id = l.id
    where a.id = p_assignment;
  return result;
end;
$$;
create function public.practice_questions(p_assignment uuid,p_lesson uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  perform public.lesson_context(p_assignment,p_lesson);
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'question',question,'options',options)
    order by order_index),'[]'::jsonb) into result from public.quiz_items where lesson_id = p_lesson;
  return result;
end;
$$;
create function public.check_practice_answer(p_assignment uuid,p_lesson uuid,p_quiz uuid,p_option text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare q public.quiz_items;
begin
  perform public.lesson_context(p_assignment,p_lesson);
  select * into q from public.quiz_items where id = p_quiz and lesson_id = p_lesson
    and tenant_id = private.tenant_id();
  if not found then raise exception 'NOT_FOUND' using errcode = '42501'; end if;
  if not exists(select 1 from jsonb_array_elements(q.options) o where o->>'id' = p_option) then
    raise exception 'INVALID_OPTION' using errcode = '23514';
  end if;
  return jsonb_build_object('correct',q.correct_option_id = p_option,'explanation',q.explanation);
end;
$$;
create function public.consume_ai_quota(p_kind text) returns void
language plpgsql security definer set search_path = '' as $$
declare t uuid := private.tenant_id(); d date := (now() at time zone 'UTC')::date;
  total integer; personal integer; lim integer; minute_count integer; last_minute timestamptz;
begin
  if t is null or p_kind not in ('tutor','assessor') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(t::text || d::text, 0));
  select max_daily_ai_calls into lim from public.tenants where id = t;
  select coalesce(sum(calls),0) into total from public.usage_daily where tenant_id = t and day = d;
  select calls, minute_start, minute_calls into personal, last_minute, minute_count from public.usage_daily
    where tenant_id = t and user_id = auth.uid() and day = d and agent_type = p_kind;
  -- ERRATA E-SQL-11: CASE parenthesized inside the IF condition.
  if total >= lim or coalesce(personal,0) >= (case when p_kind = 'tutor' then 200 else 100 end)
    or (last_minute = date_trunc('minute',now())
        and minute_count >= (case when p_kind = 'tutor' then 10 else 3 end)) then
    raise exception 'RATE_LIMIT' using errcode = 'P0001';
  end if;
  insert into public.usage_daily(tenant_id,user_id,day,agent_type,calls,minute_calls)
    values(t,auth.uid(),d,p_kind,1,1)
    on conflict (tenant_id,user_id,day,agent_type)
    do update set calls = public.usage_daily.calls + 1,
      minute_calls = case when public.usage_daily.minute_start = date_trunc('minute',now())
        then public.usage_daily.minute_calls + 1 else 1 end,
      minute_start = date_trunc('minute',now());
end;
$$;

create function public.match_lesson_chunks(
  p_assignment uuid, p_lesson uuid, p_embedding extensions.vector(1536),
  p_model text, p_limit integer default 5)
returns table(chunk_id uuid, document_id uuid, title text, page integer, content text, similarity double precision)
language plpgsql stable security definer set search_path = '' as $$
declare ctx jsonb;
begin
  ctx := public.lesson_context(p_assignment,p_lesson);
  if p_limit not between 1 and 8 then raise exception 'INVALID_LIMIT'; end if;
  return query
    with permitted as materialized (
      select ch.id, ch.document_id, d.title, ch.page, ch.content, ch.embedding
      from public.lesson_sources s
      join public.document_chunks ch on ch.id = s.chunk_id and ch.tenant_id = s.tenant_id
      join public.documents d on d.id = ch.document_id and d.tenant_id = ch.tenant_id
      where s.lesson_id = p_lesson and s.tenant_id = (ctx->>'tenant_id')::uuid
        and d.status = 'approved' and ch.embedding_model = p_model
    )
    select x.id,x.document_id,x.title,x.page,x.content,
      1 - (x.embedding operator(extensions.<=>) p_embedding)
    from permitted x
    order by x.embedding operator(extensions.<=>) p_embedding limit p_limit;
end;
$$;
create function public.begin_assessment(
  p_assignment uuid, p_lesson uuid, p_request_key uuid, p_answer text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ctx jsonb; t uuid := private.tenant_id(); a public.assessment_attempts;
  rid uuid; h text; n integer;
begin
  if t is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if length(p_answer) not between 1 and 12000 then raise exception 'INVALID_ANSWER' using errcode = '23514'; end if;
  h := encode(extensions.digest(p_answer,'sha256'),'hex');
  -- All attempts for one learner are serialized, including idempotency lookup.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 1));
  select * into a from public.assessment_attempts
    where tenant_id = t and user_id = auth.uid() and request_key = p_request_key for update;
  if found then
    if a.answer_hash <> h or a.assignment_id <> p_assignment or a.lesson_id <> p_lesson then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    if a.status = 'succeeded' then return jsonb_build_object('state','succeeded','result',a.result); end if;
    if a.status = 'running' and a.lease_until > now() then
      raise exception 'IN_PROGRESS' using errcode = 'P0001';
    end if;
    if a.retry_count >= 3 then raise exception 'RETRY_EXHAUSTED' using errcode = 'P0001'; end if;
  end if;
  perform 1 from public.assignments where id = p_assignment for update;
  ctx := public.lesson_context(p_assignment,p_lesson);
  if ctx->>'progress_status' <> 'in_progress' or not (ctx->>'requires_assessment')::boolean then
    raise exception 'ASSESSMENT_NOT_AVAILABLE' using errcode = '23514';
  end if;
  if exists(select 1 from public.assessment_attempts x where x.user_id = auth.uid()
      and x.status = 'running' and x.lease_until > now()) then
    raise exception 'IN_PROGRESS' using errcode = 'P0001';
  end if;
  if a.id is null then
    select count(*) into n from public.assessment_attempts
      where user_id = auth.uid() and lesson_id = p_lesson
        and created_at >= now() - interval '24 hours';
    if n >= 5 then raise exception 'ATTEMPT_LIMIT' using errcode = 'P0001'; end if;
    if exists(select 1 from public.assessment_attempts where user_id = auth.uid()
      and lesson_id = p_lesson and created_at > now() - interval '30 seconds') then
      raise exception 'RATE_LIMIT' using errcode = 'P0001';
    end if;
  end if;
  perform public.consume_ai_quota('assessor');
  select id into rid from public.assessment_rubrics where lesson_id = p_lesson and tenant_id = t;
  if rid is null then raise exception 'MISSING_RUBRIC' using errcode = '23514'; end if;
  if a.id is null then
    insert into public.assessment_attempts(tenant_id,user_id,assignment_id,lesson_id,rubric_id,
      request_key,answer,answer_hash)
      values(t,auth.uid(),p_assignment,p_lesson,rid,p_request_key,p_answer,h) returning * into a;
    insert into public.activity_events(tenant_id,user_id,event_type,source_id)
      values(t,auth.uid(),'assessment_submitted',a.id);
  else
    update public.assessment_attempts set status = 'running', lease_token = gen_random_uuid(),
      lease_until = now() + interval '2 minutes', retry_count = retry_count + 1,
      error_code = null, finished_at = null where id = a.id returning * into a;
  end if;
  return jsonb_build_object('state','running','attempt_id',a.id,'lease_token',a.lease_token,
    'rubric_id',a.rubric_id,'tenant_id',a.tenant_id,'user_id',a.user_id);
end;
$$;

-- Server-only commit. Recomputes totals and critical gates from the stored rubric.
create function public.finish_assessment(
  p_attempt uuid, p_lease uuid, p_evaluation jsonb, p_meta jsonb, p_execution_ms integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.assessment_attempts; r public.assessment_rubrics;
  c jsonb; v jsonb; points integer; total integer := 0; passed boolean := true; v_result jsonb;
begin
  select * into a from public.assessment_attempts where id = p_attempt for update;
  if not found or a.lease_token <> p_lease then raise exception 'STALE_LEASE'; end if;
  if a.status = 'succeeded' then return a.result; end if;
  if a.status <> 'running' or a.lease_until <= now() then raise exception 'STALE_LEASE'; end if;
  perform 1 from public.assignments x
    join public.users u on u.id = x.user_id and u.tenant_id = x.tenant_id
    join public.tenants t on t.id = x.tenant_id
    where x.id = a.assignment_id and x.status = 'active' and u.status = 'active'
      and t.status in ('trial','active') for update of x;
  if not found then raise exception 'ASSIGNMENT_INACTIVE'; end if;
  perform 1 from public.progress where assignment_id = a.assignment_id
    and lesson_id = a.lesson_id and status = 'in_progress' for update;
  if not found then raise exception 'ASSESSMENT_NOT_AVAILABLE'; end if;
  select * into r from public.assessment_rubrics where id = a.rubric_id and tenant_id = a.tenant_id;
  if jsonb_typeof(p_evaluation->'criteria') is distinct from 'array'
    or jsonb_array_length(p_evaluation->'criteria') <> jsonb_array_length(r.criteria)
    or coalesce(length(p_evaluation->>'feedback'),0) not between 1 and 6000 then
    raise exception 'INVALID_EVALUATION';
  end if;
  for c in select value from jsonb_array_elements(r.criteria) loop
    if (select count(*) from jsonb_array_elements(p_evaluation->'criteria') e
      where e->>'id' = c->>'id') <> 1 then raise exception 'CRITERION_MISMATCH'; end if;
    select e into v from jsonb_array_elements(p_evaluation->'criteria') e where e->>'id' = c->>'id';
    if jsonb_typeof(v->'points') is distinct from 'number' then raise exception 'INVALID_POINTS'; end if;
    if (v->>'points')::numeric <> trunc((v->>'points')::numeric) then raise exception 'INVALID_POINTS'; end if;
    points := (v->>'points')::integer;
    if points < 0 or points > (c->>'max_points')::integer then raise exception 'INVALID_POINTS'; end if;
    total := total + points;
    if (c->>'critical')::boolean and points < (c->>'min_points')::integer then passed := false; end if;
  end loop;
  passed := passed and total >= r.passing_score;
  v_result := jsonb_build_object('passed',passed,'score',total,'feedback',p_evaluation->>'feedback');
  update public.assessment_attempts set status = 'succeeded',evaluation = p_evaluation,
    result = v_result,finished_at = now() where id = a.id;
  update public.progress set score = total,
    status = case when passed then 'completed'::public.progress_status else 'in_progress'::public.progress_status end,
    completed_at = case when passed then now() else null end
    where assignment_id = a.assignment_id and lesson_id = a.lesson_id;
  if passed then
    insert into public.activity_events(tenant_id,user_id,event_type,source_id)
      values(a.tenant_id,a.user_id,'lesson_completed',a.lesson_id) on conflict do nothing;
    perform private.unlock_next(a.assignment_id);
  end if;
  insert into public.agent_audit_logs(tenant_id,actor_id,agent_type,payload,execution_time_ms)
    values(a.tenant_id,a.user_id,'assessor',
      p_meta || jsonb_build_object('attempt_id',a.id,'status','succeeded','passed',passed,'score',total),
      greatest(0,p_execution_ms));
  return v_result;
end;
$$;
create function public.fail_assessment(p_attempt uuid, p_lease uuid, p_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.assessment_attempts;
begin
  update public.assessment_attempts set status = 'failed',error_code = left(p_code,80),finished_at = now()
    where id = p_attempt and lease_token = p_lease and status = 'running' returning * into a;
  if found then
    insert into public.agent_audit_logs(tenant_id,actor_id,agent_type,payload,execution_time_ms)
      values(a.tenant_id,a.user_id,'assessor',
        jsonb_build_object('attempt_id',a.id,'status','failed','error_code',left(p_code,80)),0);
  end if;
end;
$$;
create function public.record_tutor_exchange(
  p_tenant uuid,p_user uuid,p_assignment uuid,p_lesson uuid,p_question text,
  p_answer text,p_citations jsonb,p_meta jsonb,p_execution_ms integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare eid uuid;
begin
  perform 1 from public.assignments a
    join public.progress p on p.assignment_id = a.id and p.lesson_id = p_lesson
    join public.users u on u.id = a.user_id and u.tenant_id = a.tenant_id
    join public.tenants t on t.id = a.tenant_id
    where a.id = p_assignment and a.tenant_id = p_tenant and a.user_id = p_user
      and a.status in ('active','completed') and p.status <> 'locked'
      and u.status = 'active' and t.status in ('active','trial') for update of a;
  if not found then raise exception 'NOT_FOUND'; end if;
  insert into public.tutor_exchanges(tenant_id,user_id,assignment_id,lesson_id,question,answer,citations)
    values(p_tenant,p_user,p_assignment,p_lesson,p_question,p_answer,p_citations) returning id into eid;
  insert into public.activity_events(tenant_id,user_id,event_type,source_id)
    values(p_tenant,p_user,'tutor_question',eid);
  insert into public.agent_audit_logs(tenant_id,actor_id,agent_type,payload,execution_time_ms)
    values(p_tenant,p_user,'tutor',p_meta || jsonb_build_object('exchange_id',eid,'status','succeeded'),
      greatest(0,p_execution_ms));
  return eid;
end;
$$;

-- Raw sources remain private. Employees get approved excerpts through match_lesson_chunks.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('knowledge','knowledge',false,20971520,array['application/pdf','text/plain'])
  on conflict(id) do nothing;
create policy knowledge_read on storage.objects for select to authenticated using (
  bucket_id = 'knowledge' and exists(select 1 from public.documents d
    where d.object_path = name and private.can_manage(d.tenant_id)));
create policy knowledge_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'knowledge' and exists(select 1 from public.documents d
    where d.object_path = name and d.status = 'uploaded' and private.can_manage(d.tenant_id)));
create policy knowledge_delete on storage.objects for delete to authenticated using (
  bucket_id = 'knowledge' and exists(select 1 from public.documents d
    where d.object_path = name and d.status in ('uploaded','failed','needs_review') and private.can_manage(d.tenant_id)));
-- No UPDATE policy: no upsert overwrite of approved source bytes.

-- Revoke default function EXECUTE. New functions must declare grants explicitly.
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_superadmin(),private.tenant_id(),private.can_manage(uuid),
  private.course_visible(uuid),private.lesson_visible(uuid),private.is_draft_course(uuid),
  private.is_draft_lesson(uuid),private.is_draft_track(uuid) to authenticated;
revoke all on function public.provision_tenant(uuid,text),public.assign_track(uuid,uuid,timestamptz),
  public.lesson_context(uuid,uuid),public.complete_reading(uuid,uuid),public.consume_ai_quota(text),
  public.roadmap_manifest(uuid),public.practice_questions(uuid,uuid),
  public.check_practice_answer(uuid,uuid,uuid,text),
  public.match_lesson_chunks(uuid,uuid,extensions.vector,text,integer),
  public.begin_assessment(uuid,uuid,uuid,text),public.finish_assessment(uuid,uuid,jsonb,jsonb,integer),
  public.fail_assessment(uuid,uuid,text),
  public.record_tutor_exchange(uuid,uuid,uuid,uuid,text,text,jsonb,jsonb,integer)
  from public,anon,authenticated;
grant execute on function public.assign_track(uuid,uuid,timestamptz),public.lesson_context(uuid,uuid),
  public.complete_reading(uuid,uuid),public.consume_ai_quota(text),
  public.roadmap_manifest(uuid),public.practice_questions(uuid,uuid),
  public.check_practice_answer(uuid,uuid,uuid,text),
  public.match_lesson_chunks(uuid,uuid,extensions.vector,text,integer),
  public.begin_assessment(uuid,uuid,uuid,text) to authenticated;
grant execute on function public.provision_tenant(uuid,text),
  public.finish_assessment(uuid,uuid,jsonb,jsonb,integer),public.fail_assessment(uuid,uuid,text),
  public.record_tutor_exchange(uuid,uuid,uuid,uuid,text,text,jsonb,jsonb,integer) to service_role;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from public;
commit;
