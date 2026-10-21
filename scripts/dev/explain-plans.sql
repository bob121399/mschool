-- Query plans for retrieval and progress (spec 6 step 2.6). Run against a seeded local DB:
--   psql "$DB_URL" -f scripts/dev/explain-plans.sql
\set QUIET on
select lesson_id as l, tenant_id as t from public.lesson_sources limit 1 \gset
\echo '== retrieval: pre-filtered permitted chunks, exact cosine (no HNSW)'
explain (costs off)
with permitted as materialized (
  select ch.id, ch.embedding from public.lesson_sources s
  join public.document_chunks ch on ch.id = s.chunk_id and ch.tenant_id = s.tenant_id
  join public.documents d on d.id = ch.document_id and d.tenant_id = ch.tenant_id
  where s.lesson_id = :'l' and s.tenant_id = :'t' and d.status = 'approved'
    and ch.embedding_model = 'test-hash-embedding-v1')
select id from permitted
order by embedding operator(extensions.<=>) (select embedding from public.document_chunks limit 1) limit 5;
select id as u from public.users where tenant_id = :'t' and role = 'employee' limit 1 \gset
\echo '== progress by tenant/user/status'
explain (costs off) select status from public.progress where tenant_id = :'t' and user_id = :'u' and status = 'completed';
\echo '== attempts per learner/lesson (rate limits)'
explain (costs off) select count(*) from public.assessment_attempts
  where tenant_id = :'t' and user_id = :'u' and created_at > now() - interval '24 hours';
\echo '== billing activity window'
explain (costs off) select count(distinct user_id) from public.activity_events
  where tenant_id = :'t' and occurred_at >= '2026-09-01' and occurred_at < '2026-10-01';
