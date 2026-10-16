# MSchool — iteration 01

Backend foundation for an independent multi-tenant corporate-learning SaaS. The published private site is an architecture/code workspace, not a simulated LMS. No real customer data or model results are fabricated.

## Stack and deployment

TypeScript strict, Next.js App Router conventions, Tailwind, Supabase PostgreSQL/Auth, Vercel AI SDK 6 + OpenAI provider. Sites deploys through its supported **Vinext / Cloudflare Workers** runtime, not the native Next.js server. Preserve the Sites Vite integration. For a separate native Next.js deployment, keep app/ and lib/ and replace the Sites build scripts with native Next.js scripts in a separate deployment configuration; that target has not been tested here.

## Files

- `supabase/migrations/202610160001_core.sql`: executable migration, RLS, registry seeds, quotas, analytics and deterministic assessment RPCs.
- `app/api/agents/router/route.ts`: actual authenticated endpoint, no mocked DB calls.
- `lib/contracts.ts`: request and model-output runtime schemas.
- `lib/database.types.ts`: explicit schema-aligned database types. Regenerate from your Supabase schema after future migrations with the Supabase CLI.
- `lib/prompts.ts`: all seven system prompts, including Course Creator and HR Analyst.
- `tests/rls.test.mjs`: PostgreSQL/PGlite execution of the migration and isolation assertions.

## Setup

1. Create a Supabase project. Apply the migration once using the SQL editor or the Supabase CLI migration workflow. Do not run this initial migration against an already populated schema with these names.
2. Create users through Supabase Auth admin tooling. Insert matching profiles into public.users through a trusted provisioning flow. Seed a SuperAdmin profile with null tenant_id and department_id. Create a tenant and departments, then HR/Manager/Employee profiles. No auth signup trigger assigns privileges. Missing, inactive or unprovisioned profiles are denied.
3. Configure server environment variables from `.env.example`. Put secrets in Sites runtime settings, not source, hosting.json, browser bundles or chat. A Supabase user JWT is separate from the outer Sites private-access session. This iteration adds no second browser login flow; API integration clients supply a Supabase access token.
4. Run the checks below, then deploy a new version to apply environment changes. Configure a provider model supported by your account with OPENAI_MODEL. Default gpt-4.1-mini can be changed without source edits.
5. HR creates a course with a fixed grade and inserts extracted document_chunks linked to it. For assessments, publish the course with `rubric={"pass_score":70,"criteria":[{"criterion":"Accuracy","max_score":100}]}`. A trusted enrollment workflow creates progress records. HR must explicitly review generated drafts before publication.

## API contract

POST /api/agents/router, Content-Type: application/json, Authorization: Bearer <Supabase access token>.

```json
{"task":"methodist","courseId":"<source course UUID>","grade":"Junior","message":"Создай вводный курс по загруженным регламентам"}
```

The methodist creates a new draft in the caller's tenant; it does not publish or overwrite the source. Grade must match the source course. Draft creation and source copying happen in one database transaction; source IDs are remapped to the new course's chunks. HR must set the rubric, review and publish the draft before enrollment.

```json
{"task":"tutor","courseId":"<assigned course UUID>","message":"Как оформляется доступ?"}
```

```json
{"task":"assessor","courseId":"<assigned course UUID>","message":"Ответ сотрудника на открытое задание"}
```

```json
{"task":"hr_analyst","message":"Подготовь сводку по доступной команде"}
```

Other tasks: support, sales, product_analyst; each accepts message. Request objects are strict: role, tenant_id, actor_id and unknown fields are rejected. Server derives the actor from Supabase getUser(token) and its database profile; model routing is deterministic and enforced by the agent registry.

Success: `{requestId,runId,agent,result}`. Assessment result is exactly `{passed:boolean,feedback:string,score:number}`. HTTP errors: 400 invalid body, 401 auth, 403 permissions, 404 inaccessible course, 409 grade/rubric conflict, 413 oversized body, 415 wrong media type, 422 missing/oversized context, 429 distributed quota, 502 AI failure, 503 configuration/database failure. No secrets or provider errors are returned.

## Security model

- A user belongs to exactly one company in this MVP; SuperAdmin belongs to no tenant. Multi-company membership is intentionally not inferred from client input.
- Every tenant relation carries tenant_id; composite foreign keys prevent cross-company relationships even with an otherwise valid foreign ID.
- Manager reads progress only for the same department. Employee reads only own progress and assigned published courses. HR can manage courses and document chunks for its tenant, but cannot self-promote, forge scores or write audit history.
- SuperAdmin cannot read tenant courses, chunks, employee profiles or progress through user-scoped APIs. Product metrics use a fixed privileged aggregate function, suppressing groups with fewer than 3 tenants or 10 enrollments. This is a privacy threshold, not a formal differential-privacy guarantee.
- Data queries use the user's JWT and RLS. The service key is only used for the audit/quota channel and assessment commit RPC. It is an administrative secret and must remain server-only.
- Durable run record is written before model spend. Per-actor advisory-lock quota: 10 requests/minute and one active request within a two-minute lease. Provider timeout: 60 seconds. Abandoned running rows expire for quota purposes after two minutes; operational reconciliation is a follow-up job.
- Audit records store identity, agent, prompt version, status, model, token usage and sanitized error code. Raw documents, employee answers and generated text are not duplicated into audit logs. A completed data mutation followed by an audit-update outage can return 503 despite the mutation committing; reconcile by run logs and DB state before retrying. Exactly-once jobs/idempotency are a follow-up before financial/provisioning side effects.
- RAG is bounded PostgreSQL full-text retrieval, not semantic embeddings: maximum 6 matching chunks. If retrieval has no evidence, fail closed. The methodist uses at most 20 chunks and refuses oversized source batches rather than silently truncating. Context limited to 60,000 characters; request body to 20,000 bytes. Analytics rejects more than 1,000 visible records rather than falsely presenting partial metrics as complete.
- External AI calls send only selected authorized context. Provider retention, contractual data-processing terms and per-tenant consent/region controls must be resolved before customer production data is connected.
- Prompt instructions are one layer, not a substitute for authorization. Model source IDs are checked against retrieved IDs. Assessment criterion identities and score bounds are validated on the server, and pass/fail is computed deterministically from the company rubric. SQL checks that the rubric has not changed during inference.
- Passing makes the next fixed grade eligible in progress. It does not alter an employee's job title, role or department; enrollment in the next course is a separate explicit HR workflow. At Head of Department there is no next grade.

## Scope of the seven agents

Methodist: structured draft generation persisted in DB. Tutor: source-grounded answers. Assessor: rubric evaluation persisted in progress. HR analyst: authorized snapshot summary. Product analyst: anonymous aggregate summary. Sales: qualification draft only; no tenant provisioning or outbound messages. Support: product guidance and needsHuman flag only; no payment mutations or ticket creation. No model can execute arbitrary SQL.

Deferred product slices: PDF upload/parsing and Storage policies, source versioning, enrollment/admin UI, assignments/rubric authoring UI, production ingestion workers, vector retrieval, billing, automatic tenant provisioning, actual ticket escalation, weekly scheduler/email, module-level funnel events and durable idempotent queues. Scope is explicit rather than implemented with fake adapters.

## Validation

```sh
node node_modules/typescript/bin/tsc --noEmit
node tests/rls.test.mjs
node /absolute/path/to/sites/scripts/build-site.mjs
```

The migration executes in PostgreSQL through PGlite with a test Supabase auth.uid() function. Tests cover cross-tenant reads/writes, composite FK protection, manager department scoping, employee privilege escalation and grade tampering, audit protection, RAG scope, superadmin separation, quotas, assessment rubric mismatch and tenant suspension. This is not a live Supabase/Storage/PostgREST integration test. Live credentials, AI E2E and browser QA are not available in this session. Run those on staging before onboarding customers.

## Sources

- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/reference/javascript/auth-getuser
- https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text
- https://ai-sdk.dev/docs/reference/ai-sdk-core/output
