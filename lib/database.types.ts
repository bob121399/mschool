
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "activity_events": {
                  Row: {
                    "event_type": string,"id": string,"occurred_at": string,"source_id": string,"tenant_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "event_type": string,"id"?: string,"occurred_at"?: string,"source_id": string,"tenant_id": string,"user_id": string
                  }
                  Update: {
                    "event_type"?: string,"id"?: string,"occurred_at"?: string,"source_id"?: string,"tenant_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "activity_events_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_events_user_id_tenant_id_fkey"
      columns: ["user_id","tenant_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id","tenant_id"]
    }
                  ]
                },"admin_audit_logs": {
                  Row: {
                    "action": string,"actor_id": string,"created_at": string,"id": string,"object_id": string | null,"object_type": string,"redacted_diff": NonNullable<Json>,"tenant_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id": string,"created_at"?: string,"id"?: string,"object_id"?: string | null,"object_type": string,"redacted_diff"?: NonNullable<Json>,"tenant_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string,"created_at"?: string,"id"?: string,"object_id"?: string | null,"object_type"?: string,"redacted_diff"?: NonNullable<Json>,"tenant_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "admin_audit_logs_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "admin_audit_logs_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"agent_audit_logs": {
                  Row: {
                    "actor_id": string | null,"agent_type": string,"created_at": string,"execution_time_ms": number,"id": string,"payload": NonNullable<Json>,"tenant_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"agent_type": string,"created_at"?: string,"execution_time_ms": number,"id"?: string,"payload"?: NonNullable<Json>,"tenant_id"?: string | null
                  }
                  Update: {
                    "actor_id"?: string | null,"agent_type"?: string,"created_at"?: string,"execution_time_ms"?: number,"id"?: string,"payload"?: NonNullable<Json>,"tenant_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_audit_logs_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_audit_logs_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"agent_jobs": {
                  Row: {
                    "actor_id": string | null,"agent_type": string,"attempts": number,"available_at": string,"created_at": string,"deduplication_key": string,"finished_at": string | null,"heartbeat_at": string | null,"id": string,"last_error_code": string | null,"lease_token": string | null,"lease_until": string | null,"max_attempts": number,"payload": NonNullable<Json>,"result": Json | null,"status": string,"tenant_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"agent_type": string,"attempts"?: number,"available_at"?: string,"created_at"?: string,"deduplication_key": string,"finished_at"?: string | null,"heartbeat_at"?: string | null,"id"?: string,"last_error_code"?: string | null,"lease_token"?: string | null,"lease_until"?: string | null,"max_attempts"?: number,"payload"?: NonNullable<Json>,"result"?: Json | null,"status"?: string,"tenant_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "actor_id"?: string | null,"agent_type"?: string,"attempts"?: number,"available_at"?: string,"created_at"?: string,"deduplication_key"?: string,"finished_at"?: string | null,"heartbeat_at"?: string | null,"id"?: string,"last_error_code"?: string | null,"lease_token"?: string | null,"lease_until"?: string | null,"max_attempts"?: number,"payload"?: NonNullable<Json>,"result"?: Json | null,"status"?: string,"tenant_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_jobs_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_jobs_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"assessment_appeals": {
                  Row: {
                    "attempt_id": string,"created_at": string,"decision": string | null,"id": string,"reason": string,"reviewer_id": string | null,"status": string,"tenant_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt_id": string,"created_at"?: string,"decision"?: string | null,"id"?: string,"reason": string,"reviewer_id"?: string | null,"status"?: string,"tenant_id": string,"user_id": string
                  }
                  Update: {
                    "attempt_id"?: string,"created_at"?: string,"decision"?: string | null,"id"?: string,"reason"?: string,"reviewer_id"?: string | null,"status"?: string,"tenant_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "assessment_appeals_attempt_id_tenant_id_fkey"
      columns: ["attempt_id","tenant_id"]
isOneToOne: false
      referencedRelation: "assessment_attempts"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "assessment_appeals_reviewer_id_fkey"
      columns: ["reviewer_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "assessment_appeals_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "assessment_appeals_user_id_tenant_id_fkey"
      columns: ["user_id","tenant_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id","tenant_id"]
    }
                  ]
                },"assessment_attempts": {
                  Row: {
                    "answer": string,"answer_hash": string,"assignment_id": string,"created_at": string,"error_code": string | null,"evaluation": Json | null,"finished_at": string | null,"id": string,"lease_token": string,"lease_until": string,"lesson_id": string,"request_key": string,"result": Json | null,"retry_count": number,"rubric_id": string,"status": string,"tenant_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answer": string,"answer_hash": string,"assignment_id": string,"created_at"?: string,"error_code"?: string | null,"evaluation"?: Json | null,"finished_at"?: string | null,"id"?: string,"lease_token"?: string,"lease_until"?: string,"lesson_id": string,"request_key": string,"result"?: Json | null,"retry_count"?: number,"rubric_id": string,"status"?: string,"tenant_id": string,"user_id": string
                  }
                  Update: {
                    "answer"?: string,"answer_hash"?: string,"assignment_id"?: string,"created_at"?: string,"error_code"?: string | null,"evaluation"?: Json | null,"finished_at"?: string | null,"id"?: string,"lease_token"?: string,"lease_until"?: string,"lesson_id"?: string,"request_key"?: string,"result"?: Json | null,"retry_count"?: number,"rubric_id"?: string,"status"?: string,"tenant_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "assessment_attempts_assignment_id_user_id_tenant_id_fkey"
      columns: ["assignment_id","user_id","tenant_id"]
isOneToOne: false
      referencedRelation: "assignments"
      referencedColumns: ["id","user_id","tenant_id"]
    },{
      foreignKeyName: "assessment_attempts_lesson_id_tenant_id_fkey"
      columns: ["lesson_id","tenant_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "assessment_attempts_rubric_id_lesson_id_tenant_id_fkey"
      columns: ["rubric_id","lesson_id","tenant_id"]
isOneToOne: false
      referencedRelation: "assessment_rubrics"
      referencedColumns: ["id","lesson_id","tenant_id"]
    },{
      foreignKeyName: "assessment_attempts_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"assessment_overrides": {
                  Row: {
                    "attempt_id": string,"created_at": string,"id": string,"passed": boolean,"reason": string,"reviewer_id": string,"score": number,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt_id": string,"created_at"?: string,"id"?: string,"passed": boolean,"reason": string,"reviewer_id": string,"score": number,"tenant_id": string
                  }
                  Update: {
                    "attempt_id"?: string,"created_at"?: string,"id"?: string,"passed"?: boolean,"reason"?: string,"reviewer_id"?: string,"score"?: number,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "assessment_overrides_attempt_id_tenant_id_fkey"
      columns: ["attempt_id","tenant_id"]
isOneToOne: false
      referencedRelation: "assessment_attempts"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "assessment_overrides_reviewer_id_fkey"
      columns: ["reviewer_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "assessment_overrides_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"assessment_rubrics": {
                  Row: {
                    "criteria": NonNullable<Json>,"id": string,"lesson_id": string,"passing_score": number,"tenant_id": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "criteria": NonNullable<Json>,"id"?: string,"lesson_id": string,"passing_score"?: number,"tenant_id": string,"version"?: number
                  }
                  Update: {
                    "criteria"?: NonNullable<Json>,"id"?: string,"lesson_id"?: string,"passing_score"?: number,"tenant_id"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "assessment_rubrics_lesson_id_tenant_id_fkey"
      columns: ["lesson_id","tenant_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "assessment_rubrics_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"assignments": {
                  Row: {
                    "assigned_at": string,"completed_at": string | null,"due_at": string | null,"id": string,"status": string,"tenant_id": string,"track_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_at"?: string,"completed_at"?: string | null,"due_at"?: string | null,"id"?: string,"status"?: string,"tenant_id": string,"track_id": string,"user_id": string
                  }
                  Update: {
                    "assigned_at"?: string,"completed_at"?: string | null,"due_at"?: string | null,"id"?: string,"status"?: string,"tenant_id"?: string,"track_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "assignments_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "assignments_track_id_tenant_id_fkey"
      columns: ["track_id","tenant_id"]
isOneToOne: false
      referencedRelation: "tracks"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "assignments_user_id_tenant_id_fkey"
      columns: ["user_id","tenant_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id","tenant_id"]
    }
                  ]
                },"course_modules": {
                  Row: {
                    "content": NonNullable<Json>,"course_id": string,"id": string,"order_index": number,"tenant_id": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content"?: NonNullable<Json>,"course_id": string,"id"?: string,"order_index": number,"tenant_id": string,"title": string
                  }
                  Update: {
                    "content"?: NonNullable<Json>,"course_id"?: string,"id"?: string,"order_index"?: number,"tenant_id"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "course_modules_course_id_tenant_id_fkey"
      columns: ["course_id","tenant_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "course_modules_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"courses": {
                  Row: {
                    "coverage_gaps": NonNullable<Json>,"created_at": string,"description": string,"id": string,"objectives": NonNullable<Json>,"revision": number,"source_job_id": string | null,"status": string,"supersedes_id": string | null,"target_grade": Database["public"]['Enums']["grade"],"tenant_id": string,"title": string,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "coverage_gaps"?: NonNullable<Json>,"created_at"?: string,"description"?: string,"id"?: string,"objectives"?: NonNullable<Json>,"revision"?: number,"source_job_id"?: string | null,"status"?: string,"supersedes_id"?: string | null,"target_grade": Database["public"]['Enums']["grade"],"tenant_id": string,"title": string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "coverage_gaps"?: NonNullable<Json>,"created_at"?: string,"description"?: string,"id"?: string,"objectives"?: NonNullable<Json>,"revision"?: number,"source_job_id"?: string | null,"status"?: string,"supersedes_id"?: string | null,"target_grade"?: Database["public"]['Enums']["grade"],"tenant_id"?: string,"title"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "courses_supersedes_id_tenant_id_fkey"
      columns: ["supersedes_id","tenant_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "courses_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"departments": {
                  Row: {
                    "id": string,"name": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"name": string,"tenant_id": string
                  }
                  Update: {
                    "id"?: string,"name"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "departments_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"document_chunks": {
                  Row: {
                    "chunk_index": number,"content": string,"document_id": string,"embedding": string,"embedding_model": string,"id": string,"page": number,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chunk_index": number,"content": string,"document_id": string,"embedding": string,"embedding_model": string,"id"?: string,"page": number,"tenant_id": string
                  }
                  Update: {
                    "chunk_index"?: number,"content"?: string,"document_id"?: string,"embedding"?: string,"embedding_model"?: string,"id"?: string,"page"?: number,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "document_chunks_document_id_tenant_id_fkey"
      columns: ["document_id","tenant_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "document_chunks_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"documents": {
                  Row: {
                    "char_count": number | null,"created_at": string,"error_code": string | null,"id": string,"mime_type": string,"object_path": string,"original_filename": string,"page_count": number | null,"sha256": string,"size_bytes": number,"status": string,"tenant_id": string,"title": string,"uploaded_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "char_count"?: number | null,"created_at"?: string,"error_code"?: string | null,"id"?: string,"mime_type"?: string,"object_path": string,"original_filename"?: string,"page_count"?: number | null,"sha256": string,"size_bytes"?: number,"status"?: string,"tenant_id": string,"title": string,"uploaded_by"?: string | null
                  }
                  Update: {
                    "char_count"?: number | null,"created_at"?: string,"error_code"?: string | null,"id"?: string,"mime_type"?: string,"object_path"?: string,"original_filename"?: string,"page_count"?: number | null,"sha256"?: string,"size_bytes"?: number,"status"?: string,"tenant_id"?: string,"title"?: string,"uploaded_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "documents_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "documents_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"hr_reports": {
                  Row: {
                    "created_at": string,"id": string,"metrics": NonNullable<Json>,"narrative": NonNullable<Json>,"period_end": string,"period_start": string,"report_version": string,"source_job_id": string | null,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"metrics": NonNullable<Json>,"narrative": NonNullable<Json>,"period_end": string,"period_start": string,"report_version"?: string,"source_job_id"?: string | null,"tenant_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"metrics"?: NonNullable<Json>,"narrative"?: NonNullable<Json>,"period_end"?: string,"period_start"?: string,"report_version"?: string,"source_job_id"?: string | null,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "hr_reports_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"invitations": {
                  Row: {
                    "accepted_at": string | null,"created_at": string,"department_id": string | null,"email": string,"expires_at": string,"id": string,"invited_by": string,"target_grade": Database["public"]['Enums']["grade"],"tenant_id": string,"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"created_at"?: string,"department_id"?: string | null,"email": string,"expires_at": string,"id"?: string,"invited_by": string,"target_grade"?: Database["public"]['Enums']["grade"],"tenant_id": string,"token_hash": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"created_at"?: string,"department_id"?: string | null,"email"?: string,"expires_at"?: string,"id"?: string,"invited_by"?: string,"target_grade"?: Database["public"]['Enums']["grade"],"tenant_id"?: string,"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitations_department_id_tenant_id_fkey"
      columns: ["department_id","tenant_id"]
isOneToOne: false
      referencedRelation: "departments"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "invitations_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"invoices": {
                  Row: {
                    "active_seats": number,"amount_minor": number,"currency": string,"id": string,"paid_at": string | null,"payment_reference": string | null,"period_end": string,"period_start": string,"snapshot": NonNullable<Json>,"status": string,"subscription_id": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active_seats": number,"amount_minor": number,"currency": string,"id"?: string,"paid_at"?: string | null,"payment_reference"?: string | null,"period_end": string,"period_start": string,"snapshot": NonNullable<Json>,"status": string,"subscription_id": string,"tenant_id": string
                  }
                  Update: {
                    "active_seats"?: number,"amount_minor"?: number,"currency"?: string,"id"?: string,"paid_at"?: string | null,"payment_reference"?: string | null,"period_end"?: string,"period_start"?: string,"snapshot"?: NonNullable<Json>,"status"?: string,"subscription_id"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoices_subscription_id_tenant_id_fkey"
      columns: ["subscription_id","tenant_id"]
isOneToOne: false
      referencedRelation: "subscriptions"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "invoices_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"leads": {
                  Row: {
                    "company_name": string,"consent_at": string | null,"created_at": string,"email": string,"id": string,"qualification": NonNullable<Json>,"status": string,"tenant_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_name": string,"consent_at"?: string | null,"created_at"?: string,"email": string,"id"?: string,"qualification"?: NonNullable<Json>,"status"?: string,"tenant_id"?: string | null
                  }
                  Update: {
                    "company_name"?: string,"consent_at"?: string | null,"created_at"?: string,"email"?: string,"id"?: string,"qualification"?: NonNullable<Json>,"status"?: string,"tenant_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "leads_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"lesson_sessions": {
                  Row: {
                    "assignment_id": string,"consumed_at": string | null,"expires_at": string,"id": string,"lesson_id": string,"started_at": string,"tenant_id": string,"token_hash": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assignment_id": string,"consumed_at"?: string | null,"expires_at"?: string,"id"?: string,"lesson_id": string,"started_at"?: string,"tenant_id": string,"token_hash": string,"user_id": string
                  }
                  Update: {
                    "assignment_id"?: string,"consumed_at"?: string | null,"expires_at"?: string,"id"?: string,"lesson_id"?: string,"started_at"?: string,"tenant_id"?: string,"token_hash"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lesson_sessions_assignment_id_user_id_tenant_id_fkey"
      columns: ["assignment_id","user_id","tenant_id"]
isOneToOne: false
      referencedRelation: "assignments"
      referencedColumns: ["id","user_id","tenant_id"]
    },{
      foreignKeyName: "lesson_sessions_lesson_id_tenant_id_fkey"
      columns: ["lesson_id","tenant_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "lesson_sessions_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"lesson_sources": {
                  Row: {
                    "chunk_id": string,"lesson_id": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chunk_id": string,"lesson_id": string,"tenant_id": string
                  }
                  Update: {
                    "chunk_id"?: string,"lesson_id"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lesson_sources_chunk_id_tenant_id_fkey"
      columns: ["chunk_id","tenant_id"]
isOneToOne: false
      referencedRelation: "document_chunks"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "lesson_sources_lesson_id_tenant_id_fkey"
      columns: ["lesson_id","tenant_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "lesson_sources_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"lessons": {
                  Row: {
                    "assessment_question": string,"content": string,"course_id": string,"id": string,"learning_outcome": string,"module_id": string,"order_index": number,"requires_assessment": boolean,"tenant_id": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assessment_question"?: string,"content": string,"course_id": string,"id"?: string,"learning_outcome"?: string,"module_id": string,"order_index": number,"requires_assessment"?: boolean,"tenant_id": string,"title": string
                  }
                  Update: {
                    "assessment_question"?: string,"content"?: string,"course_id"?: string,"id"?: string,"learning_outcome"?: string,"module_id"?: string,"order_index"?: number,"requires_assessment"?: boolean,"tenant_id"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lessons_course_id_tenant_id_fkey"
      columns: ["course_id","tenant_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "lessons_module_id_course_id_tenant_id_fkey"
      columns: ["module_id","course_id","tenant_id"]
isOneToOne: false
      referencedRelation: "course_modules"
      referencedColumns: ["id","course_id","tenant_id"]
    },{
      foreignKeyName: "lessons_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"progress": {
                  Row: {
                    "assignment_id": string,"completed_at": string | null,"id": string,"lesson_id": string,"score": number | null,"status": Database["public"]['Enums']["progress_status"],"tenant_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assignment_id": string,"completed_at"?: string | null,"id"?: string,"lesson_id": string,"score"?: number | null,"status"?: Database["public"]['Enums']["progress_status"],"tenant_id": string,"user_id": string
                  }
                  Update: {
                    "assignment_id"?: string,"completed_at"?: string | null,"id"?: string,"lesson_id"?: string,"score"?: number | null,"status"?: Database["public"]['Enums']["progress_status"],"tenant_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "progress_assignment_id_user_id_tenant_id_fkey"
      columns: ["assignment_id","user_id","tenant_id"]
isOneToOne: false
      referencedRelation: "assignments"
      referencedColumns: ["id","user_id","tenant_id"]
    },{
      foreignKeyName: "progress_lesson_id_tenant_id_fkey"
      columns: ["lesson_id","tenant_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "progress_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"quiz_items": {
                  Row: {
                    "correct_option_id": string,"explanation": string,"id": string,"lesson_id": string,"options": NonNullable<Json>,"order_index": number,"question": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "correct_option_id": string,"explanation": string,"id"?: string,"lesson_id": string,"options": NonNullable<Json>,"order_index": number,"question": string,"tenant_id": string
                  }
                  Update: {
                    "correct_option_id"?: string,"explanation"?: string,"id"?: string,"lesson_id"?: string,"options"?: NonNullable<Json>,"order_index"?: number,"question"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "quiz_items_lesson_id_tenant_id_fkey"
      columns: ["lesson_id","tenant_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "quiz_items_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"subscriptions": {
                  Row: {
                    "billing_timezone": string,"contract_snapshot": NonNullable<Json>,"currency": string,"grace_days": number,"id": string,"minimum_monthly_minor": number,"period_end": string,"period_start": string,"seat_price_minor": number,"status": string,"tenant_id": string,"tier": string
                  }
                  ComputedFields: never
                  Insert: {
                    "billing_timezone"?: string,"contract_snapshot": NonNullable<Json>,"currency": string,"grace_days"?: number,"id"?: string,"minimum_monthly_minor": number,"period_end": string,"period_start": string,"seat_price_minor": number,"status": string,"tenant_id": string,"tier"?: string
                  }
                  Update: {
                    "billing_timezone"?: string,"contract_snapshot"?: NonNullable<Json>,"currency"?: string,"grace_days"?: number,"id"?: string,"minimum_monthly_minor"?: number,"period_end"?: string,"period_start"?: string,"seat_price_minor"?: number,"status"?: string,"tenant_id"?: string,"tier"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscriptions_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"support_tickets": {
                  Row: {
                    "agent_reply": Json | null,"body": string,"category": string | null,"created_at": string,"escalation_reason": string | null,"id": string,"resolution": string | null,"severity": string | null,"status": string,"subject": string,"tenant_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_reply"?: Json | null,"body": string,"category"?: string | null,"created_at"?: string,"escalation_reason"?: string | null,"id"?: string,"resolution"?: string | null,"severity"?: string | null,"status"?: string,"subject": string,"tenant_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "agent_reply"?: Json | null,"body"?: string,"category"?: string | null,"created_at"?: string,"escalation_reason"?: string | null,"id"?: string,"resolution"?: string | null,"severity"?: string | null,"status"?: string,"subject"?: string,"tenant_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "support_tickets_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "support_tickets_user_id_tenant_id_fkey"
      columns: ["user_id","tenant_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id","tenant_id"]
    }
                  ]
                },"tenants": {
                  Row: {
                    "created_at": string,"id": string,"is_demo": boolean,"locale": string,"max_daily_ai_calls": number,"name": string,"status": string,"subscription_tier": string,"timezone": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_demo"?: boolean,"locale"?: string,"max_daily_ai_calls"?: number,"name": string,"status"?: string,"subscription_tier"?: string,"timezone"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_demo"?: boolean,"locale"?: string,"max_daily_ai_calls"?: number,"name"?: string,"status"?: string,"subscription_tier"?: string,"timezone"?: string
                  }
                  Relationships: [
                    
                  ]
                },"track_courses": {
                  Row: {
                    "course_id": string,"order_index": number,"tenant_id": string,"track_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "course_id": string,"order_index": number,"tenant_id": string,"track_id": string
                  }
                  Update: {
                    "course_id"?: string,"order_index"?: number,"tenant_id"?: string,"track_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "track_courses_course_id_tenant_id_fkey"
      columns: ["course_id","tenant_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "track_courses_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "track_courses_track_id_tenant_id_fkey"
      columns: ["track_id","tenant_id"]
isOneToOne: false
      referencedRelation: "tracks"
      referencedColumns: ["id","tenant_id"]
    }
                  ]
                },"tracks": {
                  Row: {
                    "id": string,"revision": number,"status": string,"target_grade": Database["public"]['Enums']["grade"],"tenant_id": string,"title": string,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"revision"?: number,"status"?: string,"target_grade": Database["public"]['Enums']["grade"],"tenant_id": string,"title": string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "id"?: string,"revision"?: number,"status"?: string,"target_grade"?: Database["public"]['Enums']["grade"],"tenant_id"?: string,"title"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "tracks_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"tutor_exchanges": {
                  Row: {
                    "answer": string,"assignment_id": string,"citations": NonNullable<Json>,"created_at": string,"id": string,"lesson_id": string,"question": string,"tenant_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answer": string,"assignment_id": string,"citations"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"lesson_id": string,"question": string,"tenant_id": string,"user_id": string
                  }
                  Update: {
                    "answer"?: string,"assignment_id"?: string,"citations"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"lesson_id"?: string,"question"?: string,"tenant_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tutor_exchanges_assignment_id_user_id_tenant_id_fkey"
      columns: ["assignment_id","user_id","tenant_id"]
isOneToOne: false
      referencedRelation: "assignments"
      referencedColumns: ["id","user_id","tenant_id"]
    },{
      foreignKeyName: "tutor_exchanges_lesson_id_tenant_id_fkey"
      columns: ["lesson_id","tenant_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "tutor_exchanges_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"usage_daily": {
                  Row: {
                    "agent_type": string,"calls": number,"day": string,"minute_calls": number,"minute_start": string,"tenant_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_type": string,"calls"?: number,"day": string,"minute_calls"?: number,"minute_start"?: string,"tenant_id": string,"user_id": string
                  }
                  Update: {
                    "agent_type"?: string,"calls"?: number,"day"?: string,"minute_calls"?: number,"minute_start"?: string,"tenant_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "usage_daily_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "usage_daily_user_id_tenant_id_fkey"
      columns: ["user_id","tenant_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id","tenant_id"]
    }
                  ]
                },"users": {
                  Row: {
                    "created_at": string,"department_id": string | null,"email": string,"full_name": string,"grade": Database["public"]['Enums']["grade"] | null,"id": string,"is_service_account": boolean,"role": Database["public"]['Enums']["app_role"],"status": string,"tenant_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"department_id"?: string | null,"email": string,"full_name"?: string,"grade"?: Database["public"]['Enums']["grade"] | null,"id": string,"is_service_account"?: boolean,"role"?: Database["public"]['Enums']["app_role"],"status"?: string,"tenant_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"department_id"?: string | null,"email"?: string,"full_name"?: string,"grade"?: Database["public"]['Enums']["grade"] | null,"id"?: string,"is_service_account"?: boolean,"role"?: Database["public"]['Enums']["app_role"],"status"?: string,"tenant_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "users_department_id_tenant_id_fkey"
      columns: ["department_id","tenant_id"]
isOneToOne: false
      referencedRelation: "departments"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "users_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_invitation":
{ Args: { "p_token": string }; Returns: string
                           },
"admin_create_subscription":
{ Args: { "p_contract": Json,"p_currency": string,"p_minimum_minor": number,"p_period_end": string,"p_period_start": string,"p_reason": string,"p_seat_price_minor": number,"p_tenant": string,"p_tier": string }; Returns: string
                           },
"admin_update_tenant":
{ Args: { "p_max_daily_ai_calls": number,"p_reason": string,"p_status": string,"p_tenant": string,"p_tier": string }; Returns: undefined
                           },
"analytics_template":
{ Args: { "p_end": string,"p_start": string,"p_template": string }; Returns: Json
                           },
"approve_document":
{ Args: { "p_document": string }; Returns: undefined
                           },
"assign_track":
{ Args: { "p_due_at"?: string,"p_track": string,"p_user": string }; Returns: string
                           },
"attempt_status":
{ Args: { "p_request_key": string }; Returns: Json
                           },
"begin_assessment":
{ Args: { "p_answer": string,"p_assignment": string,"p_lesson": string,"p_request_key": string }; Returns: Json
                           },
"check_practice_answer":
{ Args: { "p_assignment": string,"p_lesson": string,"p_option": string,"p_quiz": string }; Returns: Json
                           },
"claim_job":
{ Args: { "p_types": (string)[] }; Returns: {
              "actor_id": string | null,
"agent_type": string,
"attempts": number,
"available_at": string,
"created_at": string,
"deduplication_key": string,
"finished_at": string | null,
"heartbeat_at": string | null,
"id": string,
"last_error_code": string | null,
"lease_token": string | null,
"lease_until": string | null,
"max_attempts": number,
"payload": NonNullable<Json>,
"result": Json | null,
"status": string,
"tenant_id": string | null,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "agent_jobs"
        isOneToOne: false
        isSetofReturn: true
      } },
"clone_course":
{ Args: { "p_course": string }; Returns: string
                           },
"complete_reading":
{ Args: { "p_assignment": string,"p_lesson": string }; Returns: undefined
                           },
"consume_ai_quota":
{ Args: { "p_kind": string }; Returns: undefined
                           },
"create_appeal":
{ Args: { "p_attempt": string,"p_reason": string }; Returns: Json
                           },
"create_course_draft":
{ Args: { "p_description"?: string,"p_grade": Database["public"]['Enums']["grade"],"p_tenant"?: string,"p_title": string }; Returns: string
                           },
"create_department":
{ Args: { "p_name": string,"p_tenant"?: string }; Returns: string
                           },
"create_generated_course":
{ Args: { "p_job": string,"p_lease": string,"p_payload": Json }; Returns: string
                           },
"create_invitation":
{ Args: { "p_department"?: string,"p_email": string,"p_grade": Database["public"]['Enums']["grade"],"p_tenant": string }; Returns: Json
                           },
"create_support_ticket":
{ Args: { "p_body": string,"p_subject": string }; Returns: Json
                           },
"create_track_draft":
{ Args: { "p_course_ids": (string)[],"p_grade": Database["public"]['Enums']["grade"],"p_tenant"?: string,"p_title": string }; Returns: string
                           },
"fail_assessment":
{ Args: { "p_attempt": string,"p_code": string,"p_lease": string }; Returns: undefined
                           },
"finish_assessment":
{ Args: { "p_attempt": string,"p_evaluation": Json,"p_execution_ms": number,"p_lease": string,"p_meta": Json }; Returns: Json
                           },
"finish_job":
{ Args: { "p_error"?: string,"p_job": string,"p_lease": string,"p_result": Json,"p_status": string }; Returns: boolean
                           },
"generate_invoice":
{ Args: { "p_period_start": string,"p_tenant": string }; Returns: string
                           },
"heartbeat_job":
{ Args: { "p_job": string,"p_lease": string }; Returns: boolean
                           },
"hr_report_metrics":
{ Args: { "p_end": string,"p_start": string,"p_tenant": string }; Returns: Json
                           },
"lesson_context":
{ Args: { "p_assignment": string,"p_lesson": string }; Returns: Json
                           },
"mark_invoice_paid":
{ Args: { "p_invoice": string,"p_paid_at": string,"p_reason": string,"p_reference": string }; Returns: undefined
                           },
"match_lesson_chunks":
{ Args: { "p_assignment": string,"p_embedding": string,"p_lesson": string,"p_limit"?: number,"p_model": string }; Returns: {
              "chunk_id": string,"content": string,"document_id": string,"page": number,"similarity": number,"title": string
            }[]
                           },
"practice_questions":
{ Args: { "p_assignment": string,"p_lesson": string }; Returns: Json
                           },
"provision_tenant":
{ Args: { "p_auth_user": string,"p_name": string }; Returns: string
                           },
"publish_course":
{ Args: { "p_course": string,"p_expected_revision": number }; Returns: Json
                           },
"publish_track":
{ Args: { "p_expected_revision": number,"p_track": string }; Returns: Json
                           },
"record_agent_run":
{ Args: { "p_actor": string,"p_agent": string,"p_ms": number,"p_payload": Json,"p_tenant": string }; Returns: undefined
                           },
"record_lesson_engagement":
{ Args: { "p_token": string }; Returns: Json
                           },
"record_support_reply":
{ Args: { "p_job": string,"p_lease": string,"p_reply": Json }; Returns: undefined
                           },
"record_tutor_exchange":
{ Args: { "p_answer": string,"p_assignment": string,"p_citations": Json,"p_execution_ms": number,"p_lesson": string,"p_meta": Json,"p_question": string,"p_tenant": string,"p_user": string }; Returns: string
                           },
"request_analytics":
{ Args: { "p_end": string,"p_start": string,"p_template": string }; Returns: string
                           },
"request_course_generation":
{ Args: { "p_document_ids": (string)[],"p_grade": Database["public"]['Enums']["grade"],"p_limits": Json,"p_prompt_version": string,"p_tenant"?: string,"p_title": string }; Returns: string
                           },
"request_document_processing":
{ Args: { "p_document": string }; Returns: string
                           },
"request_hr_report":
{ Args: { "p_period_start": string,"p_tenant"?: string }; Returns: string
                           },
"request_lead_qualification":
{ Args: { "p_lead": string }; Returns: string
                           },
"resolve_appeal":
{ Args: { "p_appeal": string,"p_decision": string,"p_override_passed"?: boolean,"p_override_score"?: number,"p_reason": string }; Returns: Json
                           },
"retry_job":
{ Args: { "p_delay_seconds": number,"p_error": string,"p_job": string,"p_lease": string }; Returns: string
                           },
"roadmap_manifest":
{ Args: { "p_assignment": string }; Returns: Json
                           },
"save_course_draft":
{ Args: { "p_course": string,"p_expected_revision": number,"p_payload": Json }; Returns: Json
                           },
"save_lead_qualification":
{ Args: { "p_dto": Json,"p_job": string,"p_lease": string }; Returns: undefined
                           },
"schedule_periodic_jobs":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"set_document_status":
{ Args: { "p_document": string,"p_error"?: string,"p_job": string,"p_lease": string,"p_status": string }; Returns: undefined
                           },
"set_user_role":
{ Args: { "p_reason": string,"p_role": Database["public"]['Enums']["app_role"],"p_user": string }; Returns: undefined
                           },
"start_lesson_session":
{ Args: { "p_assignment": string,"p_lesson": string }; Returns: Json
                           },
"store_document_chunks":
{ Args: { "p_char_count": number,"p_chunks": Json,"p_document": string,"p_job": string,"p_lease": string,"p_page_count": number }; Returns: number
                           },
"store_hr_report":
{ Args: { "p_job": string,"p_lease": string,"p_metrics": Json,"p_narrative": Json }; Returns: string
                           },
"update_employee":
{ Args: { "p_clear_department"?: boolean,"p_department"?: string,"p_grade"?: Database["public"]['Enums']["grade"],"p_status"?: string,"p_user": string }; Returns: Json
                           }
          }
          Enums: {
            "app_role": "superadmin"|"hr_admin"|"employee","grade": "junior"|"middle"|"senior"|"head","progress_status": "locked"|"in_progress"|"completed"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "app_role": ["superadmin", "hr_admin", "employee"],"grade": ["junior", "middle", "senior", "head"],"progress_status": ["locked", "in_progress", "completed"]
          }
        }
} as const
