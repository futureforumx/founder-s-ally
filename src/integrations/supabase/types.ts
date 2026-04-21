export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      _prisma_migrations: {
        Row: {
          applied_steps_count: number
          checksum: string
          finished_at: string | null
          id: string
          logs: string | null
          migration_name: string
          rolled_back_at: string | null
          started_at: string
        }
        Insert: {
          applied_steps_count?: number
          checksum: string
          finished_at?: string | null
          id: string
          logs?: string | null
          migration_name: string
          rolled_back_at?: string | null
          started_at?: string
        }
        Update: {
          applied_steps_count?: number
          checksum?: string
          finished_at?: string | null
          id?: string
          logs?: string | null
          migration_name?: string
          rolled_back_at?: string | null
          started_at?: string
        }
        Relationships: []
      }
      backfill_runs: {
        Row: {
          duration_ms: number | null
          error_message: string | null
          fields_written: string[] | null
          finished_at: string | null
          firm_id: string | null
          firm_name: string | null
          id: string
          source: string | null
          started_at: string
          status: string | null
        }
        Insert: {
          duration_ms?: number | null
          error_message?: string | null
          fields_written?: string[] | null
          finished_at?: string | null
          firm_id?: string | null
          firm_name?: string | null
          id?: string
          source?: string | null
          started_at?: string
          status?: string | null
        }
        Update: {
          duration_ms?: number | null
          error_message?: string | null
          fields_written?: string[] | null
          finished_at?: string | null
          firm_id?: string | null
          firm_name?: string | null
          id?: string
          source?: string | null
          started_at?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "backfill_runs_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backfill_runs_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "investor_directory_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          created_at: string
          description: string | null
          ends_at: string | null
          external_id: string
          id: string
          is_all_day: boolean
          location: string | null
          metadata: Json
          organizer_email: string | null
          owner_context_id: string
          source_record_id: string | null
          starts_at: string | null
          status: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          ends_at?: string | null
          external_id: string
          id?: string
          is_all_day?: boolean
          location?: string | null
          metadata?: Json
          organizer_email?: string | null
          owner_context_id: string
          source_record_id?: string | null
          starts_at?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          ends_at?: string | null
          external_id?: string
          id?: string
          is_all_day?: boolean
          location?: string | null
          metadata?: Json
          organizer_email?: string | null
          owner_context_id?: string
          source_record_id?: string | null
          starts_at?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_owner_context_id_fkey"
            columns: ["owner_context_id"]
            isOneToOne: false
            referencedRelation: "owner_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_source_record_id_fkey"
            columns: ["source_record_id"]
            isOneToOne: false
            referencedRelation: "connector_source_records"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_capital_event_evidence: {
        Row: {
          candidate_capital_event_id: string
          created_at: string
          excerpt: string | null
          headline: string
          id: string
          published_at: string | null
          publisher: string | null
          raw_payload: Json
          raw_text: string | null
          score: number
          source_type: string
          source_url: string
        }
        Insert: {
          candidate_capital_event_id: string
          created_at?: string
          excerpt?: string | null
          headline: string
          id?: string
          published_at?: string | null
          publisher?: string | null
          raw_payload?: Json
          raw_text?: string | null
          score?: number
          source_type: string
          source_url: string
        }
        Update: {
          candidate_capital_event_id?: string
          created_at?: string
          excerpt?: string | null
          headline?: string
          id?: string
          published_at?: string | null
          publisher?: string | null
          raw_payload?: Json
          raw_text?: string | null
          score?: number
          source_type?: string
          source_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_capital_event_evidenc_candidate_capital_event_id_fkey"
            columns: ["candidate_capital_event_id"]
            isOneToOne: false
            referencedRelation: "candidate_capital_events"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_capital_events: {
        Row: {
          announced_date: string | null
          candidate_headline: string | null
          canonical_vc_fund_id: string | null
          cluster_key: string | null
          confidence_breakdown: Json
          confidence_score: number
          created_at: string
          event_type_guess: string | null
          evidence_count: number
          excerpt: string | null
          firm_record_id: string | null
          first_seen_at: string
          fund_sequence_number: number | null
          id: string
          latest_seen_at: string
          metadata: Json
          normalized_firm_name: string | null
          normalized_fund_label: string | null
          official_source_present: boolean
          promoted_at: string | null
          published_at: string | null
          publisher: string | null
          raw_firm_name: string | null
          raw_text: string | null
          review_reason: string | null
          size_amount: number | null
          size_currency: string | null
          source_diversity: number
          source_type: string
          source_url: string
          status: string
          updated_at: string
          verification_started_at: string | null
          verified_at: string | null
          vintage_year: number | null
        }
        Insert: {
          announced_date?: string | null
          candidate_headline?: string | null
          canonical_vc_fund_id?: string | null
          cluster_key?: string | null
          confidence_breakdown?: Json
          confidence_score?: number
          created_at?: string
          event_type_guess?: string | null
          evidence_count?: number
          excerpt?: string | null
          firm_record_id?: string | null
          first_seen_at?: string
          fund_sequence_number?: number | null
          id?: string
          latest_seen_at?: string
          metadata?: Json
          normalized_firm_name?: string | null
          normalized_fund_label?: string | null
          official_source_present?: boolean
          promoted_at?: string | null
          published_at?: string | null
          publisher?: string | null
          raw_firm_name?: string | null
          raw_text?: string | null
          review_reason?: string | null
          size_amount?: number | null
          size_currency?: string | null
          source_diversity?: number
          source_type: string
          source_url: string
          status?: string
          updated_at?: string
          verification_started_at?: string | null
          verified_at?: string | null
          vintage_year?: number | null
        }
        Update: {
          announced_date?: string | null
          candidate_headline?: string | null
          canonical_vc_fund_id?: string | null
          cluster_key?: string | null
          confidence_breakdown?: Json
          confidence_score?: number
          created_at?: string
          event_type_guess?: string | null
          evidence_count?: number
          excerpt?: string | null
          firm_record_id?: string | null
          first_seen_at?: string
          fund_sequence_number?: number | null
          id?: string
          latest_seen_at?: string
          metadata?: Json
          normalized_firm_name?: string | null
          normalized_fund_label?: string | null
          official_source_present?: boolean
          promoted_at?: string | null
          published_at?: string | null
          publisher?: string | null
          raw_firm_name?: string | null
          raw_text?: string | null
          review_reason?: string | null
          size_amount?: number | null
          size_currency?: string | null
          source_diversity?: number
          source_type?: string
          source_url?: string
          status?: string
          updated_at?: string
          verification_started_at?: string | null
          verified_at?: string | null
          vintage_year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "candidate_capital_events_canonical_vc_fund_id_fkey"
            columns: ["canonical_vc_fund_id"]
            isOneToOne: false
            referencedRelation: "vc_funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_capital_events_firm_record_id_fkey"
            columns: ["firm_record_id"]
            isOneToOne: false
            referencedRelation: "firm_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_capital_events_firm_record_id_fkey"
            columns: ["firm_record_id"]
            isOneToOne: false
            referencedRelation: "investor_directory_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      cap_table: {
        Row: {
          amount: number
          created_at: string
          date: string | null
          entity_type: string
          id: string
          instrument: string
          investor_name: string
          notes: string | null
          ownership_pct: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          date?: string | null
          entity_type?: string
          id?: string
          instrument?: string
          investor_name?: string
          notes?: string | null
          ownership_pct?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          date?: string | null
          entity_type?: string
          id?: string
          instrument?: string
          investor_name?: string
          notes?: string | null
          ownership_pct?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      community_events: {
        Row: {
          created_at: string
          creator_id: string
          description: string | null
          event_date: string
          event_type: string
          id: string
          location: string
          max_attendees: number | null
          sector: string | null
          stage: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          description?: string | null
          event_date: string
          event_type?: string
          id?: string
          location?: string
          max_attendees?: number | null
          sector?: string | null
          stage?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          description?: string | null
          event_date?: string
          event_type?: string
          id?: string
          location?: string
          max_attendees?: number | null
          sector?: string | null
          stage?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_analyses: {
        Row: {
          burn_rate: string | null
          cac: string | null
          claimed_by: string | null
          company_name: string
          created_at: string
          deck_file_path: string | null
          deck_text: string | null
          executive_summary: string | null
          health_score: number | null
          id: string
          is_claimed: boolean | null
          logo_url: string | null
          ltv: string | null
          mrr: string | null
          raw_ai_response: Json | null
          runway: string | null
          scraped_header: string | null
          scraped_pricing: string | null
          scraped_value_prop: string | null
          sector: string | null
          stage: string | null
          updated_at: string
          user_id: string
          website_url: string | null
        }
        Insert: {
          burn_rate?: string | null
          cac?: string | null
          claimed_by?: string | null
          company_name?: string
          created_at?: string
          deck_file_path?: string | null
          deck_text?: string | null
          executive_summary?: string | null
          health_score?: number | null
          id?: string
          is_claimed?: boolean | null
          logo_url?: string | null
          ltv?: string | null
          mrr?: string | null
          raw_ai_response?: Json | null
          runway?: string | null
          scraped_header?: string | null
          scraped_pricing?: string | null
          scraped_value_prop?: string | null
          sector?: string | null
          stage?: string | null
          updated_at?: string
          user_id: string
          website_url?: string | null
        }
        Update: {
          burn_rate?: string | null
          cac?: string | null
          claimed_by?: string | null
          company_name?: string
          created_at?: string
          deck_file_path?: string | null
          deck_text?: string | null
          executive_summary?: string | null
          health_score?: number | null
          id?: string
          is_claimed?: boolean | null
          logo_url?: string | null
          ltv?: string | null
          mrr?: string | null
          raw_ai_response?: Json | null
          runway?: string | null
          scraped_header?: string | null
          scraped_pricing?: string | null
          scraped_value_prop?: string | null
          sector?: string | null
          stage?: string | null
          updated_at?: string
          user_id?: string
          website_url?: string | null
        }
        Relationships: []
      }
      company_approval_codes: {
        Row: {
          code: string
          company_id: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          is_active: boolean
        }
        Insert: {
          code?: string
          company_id: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "company_approval_codes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      company_competitors: {
        Row: {
          competitor_id: string
          created_at: string
          id: string
          notes: string | null
          status: string
          updated_at: string
          user_defined_advantage: string | null
          user_id: string
        }
        Insert: {
          competitor_id: string
          created_at?: string
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          user_defined_advantage?: string | null
          user_id: string
        }
        Update: {
          competitor_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          user_defined_advantage?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_competitors_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
        ]
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      company_pitch_decks: {
        Row: {
          file_name: string
          file_size_bytes: number | null
          file_url: string
          id: string
          is_active: boolean
          slide_count: number | null
          uploaded_at: string
          user_id: string
        }
        Insert: {
          file_name: string
          file_size_bytes?: number | null
          file_url: string
          id?: string
          is_active?: boolean
          slide_count?: number | null
          uploaded_at?: string
          user_id: string
        }
        Update: {
          file_name?: string
          file_size_bytes?: number | null
          file_url?: string
          id?: string
          is_active?: boolean
          slide_count?: number | null
          uploaded_at?: string
          user_id?: string
        }
        Relationships: []
      }
      competitors: {
        Row: {
          created_at: string
          description: string | null
          employee_count: string | null
          funding: string | null
          id: string
          industry_tags: string[]
          logo_url: string | null
          name: string
          stage: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          employee_count?: string | null
          funding?: string | null
          id?: string
          industry_tags?: string[]
          logo_url?: string | null
          name: string
          stage?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          employee_count?: string | null
          funding?: string | null
          id?: string
          industry_tags?: string[]
          logo_url?: string | null
          name?: string
          stage?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      connected_accounts: {
        Row: {
          account_email: string | null
          created_at: string
          external_account_id: string | null
          id: string
          last_synced_at: string | null
          metadata: Json
          owner_context_id: string
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          account_email?: string | null
          created_at?: string
          external_account_id?: string | null
          id?: string
          last_synced_at?: string | null
          metadata?: Json
          owner_context_id: string
          provider: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_email?: string | null
          created_at?: string
          external_account_id?: string | null
          id?: string
          last_synced_at?: string | null
          metadata?: Json
          owner_context_id?: string
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connected_accounts_owner_context_id_fkey"
            columns: ["owner_context_id"]
            isOneToOne: false
            referencedRelation: "owner_contexts"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_source_records: {
        Row: {
          created_at: string
          external_id: string
          id: string
          owner_context_id: string
          processed_at: string | null
          provider: string
          raw_data: Json
          record_type: string
          staged_at: string
          sync_run_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_id: string
          id?: string
          owner_context_id: string
          processed_at?: string | null
          provider: string
          raw_data?: Json
          record_type: string
          staged_at?: string
          sync_run_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_id?: string
          id?: string
          owner_context_id?: string
          processed_at?: string | null
          provider?: string
          raw_data?: Json
          record_type?: string
          staged_at?: string
          sync_run_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connector_source_records_owner_context_id_fkey"
            columns: ["owner_context_id"]
            isOneToOne: false
            referencedRelation: "owner_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connector_source_records_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      context_entity_notes: {
        Row: {
          created_at: string
          custom_tags: string[] | null
          fit_score: number | null
          id: string
          notes: string | null
          organization_id: string | null
          owner_context_id: string
          person_id: string | null
          pipeline_stage: string | null
          subject_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_tags?: string[] | null
          fit_score?: number | null
          id?: string
          notes?: string | null
          organization_id?: string | null
          owner_context_id: string
          person_id?: string | null
          pipeline_stage?: string | null
          subject_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_tags?: string[] | null
          fit_score?: number | null
          id?: string
          notes?: string | null
          organization_id?: string | null
          owner_context_id?: string
          person_id?: string | null
          pipeline_stage?: string | null
          subject_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "context_entity_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "context_entity_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_org_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "context_entity_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_person_signals"
            referencedColumns: ["primary_org_id"]
          },
          {
            foreignKeyName: "context_entity_notes_owner_context_id_fkey"
            columns: ["owner_context_id"]
            isOneToOne: false
            referencedRelation: "owner_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "context_entity_notes_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "context_entity_notes_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_cross_company_operators"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "context_entity_notes_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_person_signals"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "context_entity_notes_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_repeat_founders"
            referencedColumns: ["person_id"]
          },
        ]
      }
      crm_activities: {
        Row: {
          activity_type: string
          body: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string
          external_id: string | null
          id: string
          metadata: Json
          occurred_at: string | null
          owner_context_id: string
          source_record_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          activity_type: string
          body?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          metadata?: Json
          occurred_at?: string | null
          owner_context_id: string
          source_record_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          activity_type?: string
          body?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          metadata?: Json
          occurred_at?: string | null
          owner_context_id?: string
          source_record_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_owner_context_id_fkey"
            columns: ["owner_context_id"]
            isOneToOne: false
            referencedRelation: "owner_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_source_record_id_fkey"
            columns: ["source_record_id"]
            isOneToOne: false
            referencedRelation: "connector_source_records"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_companies: {
        Row: {
          created_at: string
          description: string | null
          domain: string | null
          employee_count: number | null
          external_id: string | null
          id: string
          industry: string | null
          metadata: Json
          name: string
          organization_id: string | null
          owner_context_id: string
          source_record_id: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          domain?: string | null
          employee_count?: number | null
          external_id?: string | null
          id?: string
          industry?: string | null
          metadata?: Json
          name: string
          organization_id?: string | null
          owner_context_id: string
          source_record_id?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          domain?: string | null
          employee_count?: number | null
          external_id?: string | null
          id?: string
          industry?: string | null
          metadata?: Json
          name?: string
          organization_id?: string | null
          owner_context_id?: string
          source_record_id?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_companies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_companies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_org_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_companies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_person_signals"
            referencedColumns: ["primary_org_id"]
          },
          {
            foreignKeyName: "crm_companies_owner_context_id_fkey"
            columns: ["owner_context_id"]
            isOneToOne: false
            referencedRelation: "owner_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_companies_source_record_id_fkey"
            columns: ["source_record_id"]
            isOneToOne: false
            referencedRelation: "connector_source_records"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_contacts: {
        Row: {
          company: string | null
          created_at: string
          email: string | null
          external_id: string | null
          first_name: string | null
          id: string
          last_name: string | null
          linkedin_url: string | null
          metadata: Json
          notes: string | null
          owner_context_id: string
          person_id: string | null
          phone: string | null
          source_record_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          email?: string | null
          external_id?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          linkedin_url?: string | null
          metadata?: Json
          notes?: string | null
          owner_context_id: string
          person_id?: string | null
          phone?: string | null
          source_record_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string | null
          external_id?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          linkedin_url?: string | null
          metadata?: Json
          notes?: string | null
          owner_context_id?: string
          person_id?: string | null
          phone?: string | null
          source_record_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_contacts_owner_context_id_fkey"
            columns: ["owner_context_id"]
            isOneToOne: false
            referencedRelation: "owner_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contacts_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contacts_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_cross_company_operators"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "crm_contacts_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_person_signals"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "crm_contacts_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_repeat_founders"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "crm_contacts_source_record_id_fkey"
            columns: ["source_record_id"]
            isOneToOne: false
            referencedRelation: "connector_source_records"
            referencedColumns: ["id"]
          },
        ]
      }
      email_messages: {
        Row: {
          body_html: string | null
          body_text: string | null
          created_at: string
          external_id: string
          from_email: string | null
          from_name: string | null
          id: string
          is_inbound: boolean | null
          labels: string[]
          metadata: Json
          owner_context_id: string
          received_at: string | null
          sent_at: string | null
          source_record_id: string | null
          subject: string | null
          thread_id: string | null
          updated_at: string
        }
        Insert: {
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          external_id: string
          from_email?: string | null
          from_name?: string | null
          id?: string
          is_inbound?: boolean | null
          labels?: string[]
          metadata?: Json
          owner_context_id: string
          received_at?: string | null
          sent_at?: string | null
          source_record_id?: string | null
          subject?: string | null
          thread_id?: string | null
          updated_at?: string
        }
        Update: {
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          external_id?: string
          from_email?: string | null
          from_name?: string | null
          id?: string
          is_inbound?: boolean | null
          labels?: string[]
          metadata?: Json
          owner_context_id?: string
          received_at?: string | null
          sent_at?: string | null
          source_record_id?: string | null
          subject?: string | null
          thread_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_owner_context_id_fkey"
            columns: ["owner_context_id"]
            isOneToOne: false
            referencedRelation: "owner_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_source_record_id_fkey"
            columns: ["source_record_id"]
            isOneToOne: false
            referencedRelation: "connector_source_records"
            referencedColumns: ["id"]
          },
        ]
      }
      enrich_social_state: {
        Row: {
          int_value: number
          key: string
          updated_at: string | null
        }
        Insert: {
          int_value?: number
          key: string
          updated_at?: string | null
        }
        Update: {
          int_value?: number
          key?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      enrichment_candidate_values: {
        Row: {
          candidate_value: string
          confidence_score: number | null
          created_at: string | null
          current_value: string | null
          entity_id: string
          entity_type: string
          field_name: string
          id: string
          raw_snippet: string | null
          reason: string | null
          resolved_at: string | null
          resolved_by: string | null
          source_platform: string
          source_url: string | null
          status: string | null
        }
        Insert: {
          candidate_value: string
          confidence_score?: number | null
          created_at?: string | null
          current_value?: string | null
          entity_id: string
          entity_type: string
          field_name: string
          id?: string
          raw_snippet?: string | null
          reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source_platform: string
          source_url?: string | null
          status?: string | null
        }
        Update: {
          candidate_value?: string
          confidence_score?: number | null
          created_at?: string | null
          current_value?: string | null
          entity_id?: string
          entity_type?: string
          field_name?: string
          id?: string
          raw_snippet?: string | null
          reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source_platform?: string
          source_url?: string | null
          status?: string | null
        }
        Relationships: []
      }
      enrichment_field_provenance: {
        Row: {
          auto_applied: boolean | null
          confidence_score: number | null
          corroborating_sources: string[] | null
          created_at: string | null
          entity_id: string
          entity_type: string
          extraction_method: string | null
          field_name: string
          id: string
          last_verified_at: string | null
          match_method: string | null
          new_value: string | null
          old_value: string | null
          raw_snippet: string | null
          reviewer_required: boolean | null
          scraped_at: string | null
          source_platform: string
          source_url: string | null
        }
        Insert: {
          auto_applied?: boolean | null
          confidence_score?: number | null
          corroborating_sources?: string[] | null
          created_at?: string | null
          entity_id: string
          entity_type: string
          extraction_method?: string | null
          field_name: string
          id?: string
          last_verified_at?: string | null
          match_method?: string | null
          new_value?: string | null
          old_value?: string | null
          raw_snippet?: string | null
          reviewer_required?: boolean | null
          scraped_at?: string | null
          source_platform: string
          source_url?: string | null
        }
        Update: {
          auto_applied?: boolean | null
          confidence_score?: number | null
          corroborating_sources?: string[] | null
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          extraction_method?: string | null
          field_name?: string
          id?: string
          last_verified_at?: string | null
          match_method?: string | null
          new_value?: string | null
          old_value?: string | null
          raw_snippet?: string | null
          reviewer_required?: boolean | null
          scraped_at?: string | null
          source_platform?: string
          source_url?: string | null
        }
        Relationships: []
      }
      enrichment_match_failures: {
        Row: {
          candidate_names: string[] | null
          candidate_urls: string[] | null
          created_at: string | null
          entity_id: string
          entity_name: string
          entity_type: string
          failure_reason: string
          html_snippet: string | null
          id: string
          run_id: string | null
          screenshot_path: string | null
          search_query: string | null
          source_platform: string
        }
        Insert: {
          candidate_names?: string[] | null
          candidate_urls?: string[] | null
          created_at?: string | null
          entity_id: string
          entity_name: string
          entity_type: string
          failure_reason: string
          html_snippet?: string | null
          id?: string
          run_id?: string | null
          screenshot_path?: string | null
          search_query?: string | null
          source_platform: string
        }
        Update: {
          candidate_names?: string[] | null
          candidate_urls?: string[] | null
          created_at?: string | null
          entity_id?: string
          entity_name?: string
          entity_type?: string
          failure_reason?: string
          html_snippet?: string | null
          id?: string
          run_id?: string | null
          screenshot_path?: string | null
          search_query?: string | null
          source_platform?: string
        }
        Relationships: []
      }
      enrichment_review_queue: {
        Row: {
          created_at: string | null
          entity_id: string
          entity_type: Database["public"]["Enums"]["review_entity_type"]
          firm_id: string | null
          id: string
          reason: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          review_data: Json | null
          status: Database["public"]["Enums"]["review_status"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          entity_id: string
          entity_type: Database["public"]["Enums"]["review_entity_type"]
          firm_id?: string | null
          id?: string
          reason: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          review_data?: Json | null
          status?: Database["public"]["Enums"]["review_status"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["review_entity_type"]
          firm_id?: string | null
          id?: string
          reason?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          review_data?: Json | null
          status?: Database["public"]["Enums"]["review_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrichment_review_queue_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrichment_review_queue_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "investor_directory_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      enrichment_scrape_checkpoints: {
        Row: {
          created_at: string | null
          entity_type: string
          error_message: string | null
          id: string
          last_entity_id: string
          last_entity_name: string | null
          metadata: Json | null
          records_failed: number | null
          records_processed: number | null
          records_skipped: number | null
          records_updated: number | null
          run_id: string
          source_platform: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          entity_type: string
          error_message?: string | null
          id?: string
          last_entity_id: string
          last_entity_name?: string | null
          metadata?: Json | null
          records_failed?: number | null
          records_processed?: number | null
          records_skipped?: number | null
          records_updated?: number | null
          run_id: string
          source_platform: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          entity_type?: string
          error_message?: string | null
          id?: string
          last_entity_id?: string
          last_entity_name?: string | null
          metadata?: Json | null
          records_failed?: number | null
          records_processed?: number | null
          records_skipped?: number | null
          records_updated?: number | null
          run_id?: string
          source_platform?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      enrichment_scrape_runs: {
        Row: {
          created_at: string | null
          duplicates_avoided: number | null
          errors: number | null
          fields_queued_review: number | null
          fields_updated: number | null
          finished_at: string | null
          firms_processed: number | null
          firms_updated: number | null
          id: string
          investors_processed: number | null
          investors_updated: number | null
          mode: string | null
          run_id: string
          sources: string[] | null
          started_at: string | null
          status: string | null
          summary: Json | null
        }
        Insert: {
          created_at?: string | null
          duplicates_avoided?: number | null
          errors?: number | null
          fields_queued_review?: number | null
          fields_updated?: number | null
          finished_at?: string | null
          firms_processed?: number | null
          firms_updated?: number | null
          id?: string
          investors_processed?: number | null
          investors_updated?: number | null
          mode?: string | null
          run_id: string
          sources?: string[] | null
          started_at?: string | null
          status?: string | null
          summary?: Json | null
        }
        Update: {
          created_at?: string | null
          duplicates_avoided?: number | null
          errors?: number | null
          fields_queued_review?: number | null
          fields_updated?: number | null
          finished_at?: string | null
          firms_processed?: number | null
          firms_updated?: number | null
          id?: string
          investors_processed?: number | null
          investors_updated?: number | null
          mode?: string | null
          run_id?: string
          sources?: string[] | null
          started_at?: string | null
          status?: string | null
          summary?: Json | null
        }
        Relationships: []
      }
      event_rsvps: {
        Row: {
          created_at: string
          event_id: string
          id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "community_events"
            referencedColumns: ["id"]
          },
        ]
      }
      export_audit_logs: {
        Row: {
          created_at: string
          export_type: string
          id: string
          intent: string | null
          row_count: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          export_type?: string
          id?: string
          intent?: string | null
          row_count?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          export_type?: string
          id?: string
          intent?: string | null
          row_count?: number | null
          user_id?: string
        }
        Relationships: []
      }
      extraction_logs: {
        Row: {
          created_at: string
          funding_deal_id: string | null
          id: string
          level: string
          message: string
          payload_json: Json | null
          run_id: string | null
          source_article_id: string | null
        }
        Insert: {
          created_at?: string
          funding_deal_id?: string | null
          id: string
          level: string
          message: string
          payload_json?: Json | null
          run_id?: string | null
          source_article_id?: string | null
        }
        Update: {
          created_at?: string
          funding_deal_id?: string | null
          id?: string
          level?: string
          message?: string
          payload_json?: Json | null
          run_id?: string | null
          source_article_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "extraction_logs_funding_deal_id_fkey"
            columns: ["funding_deal_id"]
            isOneToOne: false
            referencedRelation: "funding_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extraction_logs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extraction_logs_source_article_id_fkey"
            columns: ["source_article_id"]
            isOneToOne: false
            referencedRelation: "source_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      fi_deal_investors: {
        Row: {
          created_at: string
          deal_id: string
          id: string
          name_normalized: string
          name_raw: string
          role: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          deal_id: string
          id?: string
          name_normalized: string
          name_raw: string
          role?: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          deal_id?: string
          id?: string
          name_normalized?: string
          name_raw?: string
          role?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "fi_deal_investors_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "fi_deals_canonical"
            referencedColumns: ["id"]
          },
        ]
      }
      fi_deal_source_links: {
        Row: {
          canonical_deal_id: string
          confidence_score: number
          contributed_fields: string[]
          created_at: string
          id: string
          press_url: string | null
          raw_deal_id: string | null
          source_id: string
          source_name: string
          source_type: string
          source_url: string | null
        }
        Insert: {
          canonical_deal_id: string
          confidence_score?: number
          contributed_fields?: string[]
          created_at?: string
          id?: string
          press_url?: string | null
          raw_deal_id?: string | null
          source_id: string
          source_name: string
          source_type?: string
          source_url?: string | null
        }
        Update: {
          canonical_deal_id?: string
          confidence_score?: number
          contributed_fields?: string[]
          created_at?: string
          id?: string
          press_url?: string | null
          raw_deal_id?: string | null
          source_id?: string
          source_name?: string
          source_type?: string
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fi_deal_source_links_canonical_deal_id_fkey"
            columns: ["canonical_deal_id"]
            isOneToOne: false
            referencedRelation: "fi_deals_canonical"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fi_deal_source_links_raw_deal_id_fkey"
            columns: ["raw_deal_id"]
            isOneToOne: false
            referencedRelation: "fi_deals_raw"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fi_deal_source_links_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "fi_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      fi_deals_canonical: {
        Row: {
          amount_minor_units: number | null
          amount_raw: string | null
          announced_date: string | null
          co_investors: string[]
          company_domain: string | null
          company_linkedin_url: string | null
          company_location: string | null
          company_name: string
          company_website: string | null
          confidence_score: number
          created_at: string
          currency: string
          dedupe_key: string | null
          duplicate_of_deal_id: string | null
          extracted_summary: string | null
          extraction_method: string
          id: string
          is_rumor: boolean
          lead_investor: string | null
          lead_investor_normalized: string | null
          needs_review: boolean
          normalized_company_name: string
          primary_press_url: string | null
          primary_source_name: string | null
          primary_source_url: string | null
          review_reason: string | null
          round_type_normalized: string | null
          round_type_raw: string | null
          sector_normalized: string | null
          sector_raw: string | null
          source_count: number
          source_type: string
          updated_at: string
        }
        Insert: {
          amount_minor_units?: number | null
          amount_raw?: string | null
          announced_date?: string | null
          co_investors?: string[]
          company_domain?: string | null
          company_linkedin_url?: string | null
          company_location?: string | null
          company_name: string
          company_website?: string | null
          confidence_score?: number
          created_at?: string
          currency?: string
          dedupe_key?: string | null
          duplicate_of_deal_id?: string | null
          extracted_summary?: string | null
          extraction_method?: string
          id?: string
          is_rumor?: boolean
          lead_investor?: string | null
          lead_investor_normalized?: string | null
          needs_review?: boolean
          normalized_company_name: string
          primary_press_url?: string | null
          primary_source_name?: string | null
          primary_source_url?: string | null
          review_reason?: string | null
          round_type_normalized?: string | null
          round_type_raw?: string | null
          sector_normalized?: string | null
          sector_raw?: string | null
          source_count?: number
          source_type?: string
          updated_at?: string
        }
        Update: {
          amount_minor_units?: number | null
          amount_raw?: string | null
          announced_date?: string | null
          co_investors?: string[]
          company_domain?: string | null
          company_linkedin_url?: string | null
          company_location?: string | null
          company_name?: string
          company_website?: string | null
          confidence_score?: number
          created_at?: string
          currency?: string
          dedupe_key?: string | null
          duplicate_of_deal_id?: string | null
          extracted_summary?: string | null
          extraction_method?: string
          id?: string
          is_rumor?: boolean
          lead_investor?: string | null
          lead_investor_normalized?: string | null
          needs_review?: boolean
          normalized_company_name?: string
          primary_press_url?: string | null
          primary_source_name?: string | null
          primary_source_url?: string | null
          review_reason?: string | null
          round_type_normalized?: string | null
          round_type_raw?: string | null
          sector_normalized?: string | null
          sector_raw?: string | null
          source_count?: number
          source_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fi_deals_canonical_duplicate_of_deal_id_fkey"
            columns: ["duplicate_of_deal_id"]
            isOneToOne: false
            referencedRelation: "fi_deals_canonical"
            referencedColumns: ["id"]
          },
        ]
      }
      fi_deals_raw: {
        Row: {
          amount_raw: string | null
          announced_date_raw: string | null
          article_url: string | null
          canonical_deal_id: string | null
          co_investors_raw: string[] | null
          company_domain_raw: string | null
          company_location_raw: string | null
          company_name_raw: string | null
          company_website_raw: string | null
          confidence_score: number
          created_at: string
          currency_raw: string | null
          document_id: string
          extracted_summary: string | null
          extraction_metadata: Json
          extraction_method: string
          fetch_run_id: string | null
          id: string
          is_rumor: boolean
          lead_investor_raw: string | null
          normalization_error: string | null
          normalization_status: string
          press_url: string | null
          round_type_raw: string | null
          sector_raw: string | null
          slot_index: number
          source_id: string
          source_type: string
          updated_at: string
        }
        Insert: {
          amount_raw?: string | null
          announced_date_raw?: string | null
          article_url?: string | null
          canonical_deal_id?: string | null
          co_investors_raw?: string[] | null
          company_domain_raw?: string | null
          company_location_raw?: string | null
          company_name_raw?: string | null
          company_website_raw?: string | null
          confidence_score?: number
          created_at?: string
          currency_raw?: string | null
          document_id: string
          extracted_summary?: string | null
          extraction_metadata?: Json
          extraction_method?: string
          fetch_run_id?: string | null
          id?: string
          is_rumor?: boolean
          lead_investor_raw?: string | null
          normalization_error?: string | null
          normalization_status?: string
          press_url?: string | null
          round_type_raw?: string | null
          sector_raw?: string | null
          slot_index?: number
          source_id: string
          source_type?: string
          updated_at?: string
        }
        Update: {
          amount_raw?: string | null
          announced_date_raw?: string | null
          article_url?: string | null
          canonical_deal_id?: string | null
          co_investors_raw?: string[] | null
          company_domain_raw?: string | null
          company_location_raw?: string | null
          company_name_raw?: string | null
          company_website_raw?: string | null
          confidence_score?: number
          created_at?: string
          currency_raw?: string | null
          document_id?: string
          extracted_summary?: string | null
          extraction_metadata?: Json
          extraction_method?: string
          fetch_run_id?: string | null
          id?: string
          is_rumor?: boolean
          lead_investor_raw?: string | null
          normalization_error?: string | null
          normalization_status?: string
          press_url?: string | null
          round_type_raw?: string | null
          sector_raw?: string | null
          slot_index?: number
          source_id?: string
          source_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fi_deals_raw_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "fi_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fi_deals_raw_fetch_run_id_fkey"
            columns: ["fetch_run_id"]
            isOneToOne: false
            referencedRelation: "fi_fetch_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fi_deals_raw_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "fi_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      fi_documents: {
        Row: {
          content_hash: string | null
          content_type: string | null
          created_at: string
          doc_kind: string
          fetch_run_id: string | null
          fetched_at: string
          http_status: number | null
          id: string
          parse_error: string | null
          parse_status: string
          parsed_payload: Json | null
          parser_version: string
          raw_html: string | null
          source_id: string
          updated_at: string
          url: string
          url_hash: string
        }
        Insert: {
          content_hash?: string | null
          content_type?: string | null
          created_at?: string
          doc_kind?: string
          fetch_run_id?: string | null
          fetched_at?: string
          http_status?: number | null
          id?: string
          parse_error?: string | null
          parse_status?: string
          parsed_payload?: Json | null
          parser_version?: string
          raw_html?: string | null
          source_id: string
          updated_at?: string
          url: string
          url_hash: string
        }
        Update: {
          content_hash?: string | null
          content_type?: string | null
          created_at?: string
          doc_kind?: string
          fetch_run_id?: string | null
          fetched_at?: string
          http_status?: number | null
          id?: string
          parse_error?: string | null
          parse_status?: string
          parsed_payload?: Json | null
          parser_version?: string
          raw_html?: string | null
          source_id?: string
          updated_at?: string
          url?: string
          url_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "fi_documents_fetch_run_id_fkey"
            columns: ["fetch_run_id"]
            isOneToOne: false
            referencedRelation: "fi_fetch_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fi_documents_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "fi_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      fi_errors: {
        Row: {
          created_at: string
          document_id: string | null
          error_code: string | null
          error_detail: Json | null
          error_message: string
          error_stage: string
          fetch_run_id: string | null
          id: string
          retryable: boolean
          source_id: string | null
          url: string | null
        }
        Insert: {
          created_at?: string
          document_id?: string | null
          error_code?: string | null
          error_detail?: Json | null
          error_message: string
          error_stage: string
          fetch_run_id?: string | null
          id?: string
          retryable?: boolean
          source_id?: string | null
          url?: string | null
        }
        Update: {
          created_at?: string
          document_id?: string | null
          error_code?: string | null
          error_detail?: Json | null
          error_message?: string
          error_stage?: string
          fetch_run_id?: string | null
          id?: string
          retryable?: boolean
          source_id?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fi_errors_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "fi_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fi_errors_fetch_run_id_fkey"
            columns: ["fetch_run_id"]
            isOneToOne: false
            referencedRelation: "fi_fetch_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fi_errors_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "fi_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      fi_fetch_runs: {
        Row: {
          completed_at: string | null
          deals_raw: number
          deals_upserted: number
          docs_fetched: number
          docs_parsed: number
          error_count: number
          error_summary: string | null
          id: string
          metadata: Json
          run_mode: string
          source_id: string
          started_at: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          deals_raw?: number
          deals_upserted?: number
          docs_fetched?: number
          docs_parsed?: number
          error_count?: number
          error_summary?: string | null
          id?: string
          metadata?: Json
          run_mode?: string
          source_id: string
          started_at?: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          deals_raw?: number
          deals_upserted?: number
          docs_fetched?: number
          docs_parsed?: number
          error_count?: number
          error_summary?: string | null
          id?: string
          metadata?: Json
          run_mode?: string
          source_id?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fi_fetch_runs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "fi_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      fi_sources: {
        Row: {
          active: boolean
          adapter_key: string
          base_url: string
          created_at: string
          credibility_score: number
          id: string
          last_fetched_at: string | null
          metadata: Json
          name: string
          poll_interval_minutes: number
          slug: string
          source_type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          adapter_key: string
          base_url: string
          created_at?: string
          credibility_score?: number
          id?: string
          last_fetched_at?: string | null
          metadata?: Json
          name: string
          poll_interval_minutes?: number
          slug: string
          source_type?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          adapter_key?: string
          base_url?: string
          created_at?: string
          credibility_score?: number
          id?: string
          last_fetched_at?: string | null
          metadata?: Json
          name?: string
          poll_interval_minutes?: number
          slug?: string
          source_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      firm_data_qa_flags: {
        Row: {
          confidence_score: number
          created_at: string
          current_value: string | null
          field_name: string | null
          firm_id: string
          flag_key: string
          flag_type: string
          suggested_value: string | null
        }
        Insert: {
          confidence_score?: number
          created_at?: string
          current_value?: string | null
          field_name?: string | null
          firm_id: string
          flag_key: string
          flag_type: string
          suggested_value?: string | null
        }
        Update: {
          confidence_score?: number
          created_at?: string
          current_value?: string | null
          field_name?: string | null
          firm_id?: string
          flag_key?: string
          flag_type?: string
          suggested_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "firm_data_qa_flags_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_data_qa_flags_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "investor_directory_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_enrichment_runs: {
        Row: {
          commit_mode: boolean
          config_json: Json | null
          created_at: string
          failed_count: number
          finished_at: string | null
          id: string
          limit_count: number | null
          mode: string
          offset_count: number
          processed_count: number
          report_path: string | null
          review_count: number
          skipped_count: number
          started_at: string
          status: string
          updated_at: string
          updated_count: number
        }
        Insert: {
          commit_mode?: boolean
          config_json?: Json | null
          created_at?: string
          failed_count?: number
          finished_at?: string | null
          id?: string
          limit_count?: number | null
          mode: string
          offset_count?: number
          processed_count?: number
          report_path?: string | null
          review_count?: number
          skipped_count?: number
          started_at?: string
          status?: string
          updated_at?: string
          updated_count?: number
        }
        Update: {
          commit_mode?: boolean
          config_json?: Json | null
          created_at?: string
          failed_count?: number
          finished_at?: string | null
          id?: string
          limit_count?: number | null
          mode?: string
          offset_count?: number
          processed_count?: number
          report_path?: string | null
          review_count?: number
          skipped_count?: number
          started_at?: string
          status?: string
          updated_at?: string
          updated_count?: number
        }
        Relationships: []
      }
      firm_field_sources: {
        Row: {
          confidence_score: number
          extracted_at: string
          extracted_value_json: Json
          field_name: string
          firm_id: string
          id: string
          source_name: string
          source_record_id: string | null
          source_url: string | null
          updated_at: string
        }
        Insert: {
          confidence_score?: number
          extracted_at?: string
          extracted_value_json: Json
          field_name: string
          firm_id: string
          id?: string
          source_name: string
          source_record_id?: string | null
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          confidence_score?: number
          extracted_at?: string
          extracted_value_json?: Json
          field_name?: string
          firm_id?: string
          id?: string
          source_name?: string
          source_record_id?: string | null
          source_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "firm_field_sources_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_field_sources_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "investor_directory_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_field_values: {
        Row: {
          confidence_score: number
          created_at: string
          field_name: string
          firm_id: string
          id: string
          is_winner: boolean
          normalized_value_json: Json
          run_id: string | null
          source_type: string
          source_url: string | null
        }
        Insert: {
          confidence_score: number
          created_at?: string
          field_name: string
          firm_id: string
          id?: string
          is_winner?: boolean
          normalized_value_json: Json
          run_id?: string | null
          source_type: string
          source_url?: string | null
        }
        Update: {
          confidence_score?: number
          created_at?: string
          field_name?: string
          firm_id?: string
          id?: string
          is_winner?: boolean
          normalized_value_json?: Json
          run_id?: string | null
          source_type?: string
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "firm_field_values_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_field_values_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "investor_directory_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_field_values_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "firm_enrichment_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_investors: {
        Row: {
          alternate_names: string[] | null
          articles: Json | null
          avatar_confidence: number | null
          avatar_last_verified_at: string | null
          avatar_needs_review: boolean
          avatar_source_type: string | null
          avatar_source_url: string | null
          avatar_url: string | null
          avg_deal_size: string | null
          background_summary: string | null
          bio: string | null
          blog_posts: Json | null
          board_seats: string[] | null
          capital_freshness_boost_score: number | null
          check_size_max: number | null
          check_size_min: number | null
          city: string | null
          co_investors: Json | null
          cold_outreach_ok: boolean
          completeness_score: number
          country: string | null
          created_at: string
          current_areas_of_interest: string[] | null
          deleted_at: string | null
          domain_expertise: string[] | null
          education_summary: string | null
          email: string | null
          enrichment_status: string
          facebook_url: string | null
          firm_bio_page_url: string | null
          firm_id: string
          first_name: string | null
          founder_background: string | null
          full_name: string
          geographic_concentration: string[] | null
          geographic_focus: string[] | null
          headshot_url: string | null
          id: string
          instagram_url: string | null
          interviews: Json | null
          investing_themes: string[] | null
          investment_pace: string | null
          investment_style: string | null
          investor_type: string | null
          is_active: boolean
          is_actively_investing: boolean
          last_3_investments: Json | null
          last_5_investments: Json | null
          last_active_date: string | null
          last_capital_signal_at: string | null
          last_enriched_at: string | null
          last_name: string | null
          lead_vs_follow: string | null
          linkedin_url: string | null
          match_score: number | null
          medium_url: string | null
          needs_review: boolean
          network_strength: number | null
          networks: string[] | null
          notable_investments: string[] | null
          operator_background: string | null
          past_investments: Json | null
          personal_thesis_tags: string[] | null
          personal_website: string | null
          phone: string | null
          podcasts: Json | null
          portfolio_companies: string[] | null
          preferred_name: string | null
          prior_firm_associations: string[] | null
          prior_firms: string[] | null
          prior_roles: Json | null
          prisma_person_id: string | null
          ready_for_live: boolean
          recent_deal_count: number | null
          recent_focus: string | null
          recent_investments: Json | null
          recent_news: Json | null
          reputation_score: number | null
          responsiveness_score: number | null
          sector_focus: string[] | null
          seniority: string | null
          short_summary: string | null
          slug: string | null
          source_count: number
          stage_concentration: string[] | null
          stage_focus: string[] | null
          state: string | null
          sub_sectors: string[] | null
          substack_url: string | null
          sweet_spot: number | null
          thematic_concentration: string[] | null
          tiktok_url: string | null
          timezone: string | null
          title: string | null
          total_known_investments: number | null
          tracxn_url: string | null
          updated_at: string
          value_add_score: number | null
          warm_intro_preferred: boolean
          website_url: string | null
          x_url: string | null
          youtube_url: string | null
        }
        Insert: {
          alternate_names?: string[] | null
          articles?: Json | null
          avatar_confidence?: number | null
          avatar_last_verified_at?: string | null
          avatar_needs_review?: boolean
          avatar_source_type?: string | null
          avatar_source_url?: string | null
          avatar_url?: string | null
          avg_deal_size?: string | null
          background_summary?: string | null
          bio?: string | null
          blog_posts?: Json | null
          board_seats?: string[] | null
          capital_freshness_boost_score?: number | null
          check_size_max?: number | null
          check_size_min?: number | null
          city?: string | null
          co_investors?: Json | null
          cold_outreach_ok?: boolean
          completeness_score?: number
          country?: string | null
          created_at?: string
          current_areas_of_interest?: string[] | null
          deleted_at?: string | null
          domain_expertise?: string[] | null
          education_summary?: string | null
          email?: string | null
          enrichment_status?: string
          facebook_url?: string | null
          firm_bio_page_url?: string | null
          firm_id: string
          first_name?: string | null
          founder_background?: string | null
          full_name: string
          geographic_concentration?: string[] | null
          geographic_focus?: string[] | null
          headshot_url?: string | null
          id?: string
          instagram_url?: string | null
          interviews?: Json | null
          investing_themes?: string[] | null
          investment_pace?: string | null
          investment_style?: string | null
          investor_type?: string | null
          is_active?: boolean
          is_actively_investing?: boolean
          last_3_investments?: Json | null
          last_5_investments?: Json | null
          last_active_date?: string | null
          last_capital_signal_at?: string | null
          last_enriched_at?: string | null
          last_name?: string | null
          lead_vs_follow?: string | null
          linkedin_url?: string | null
          match_score?: number | null
          medium_url?: string | null
          needs_review?: boolean
          network_strength?: number | null
          networks?: string[] | null
          notable_investments?: string[] | null
          operator_background?: string | null
          past_investments?: Json | null
          personal_thesis_tags?: string[] | null
          personal_website?: string | null
          phone?: string | null
          podcasts?: Json | null
          portfolio_companies?: string[] | null
          preferred_name?: string | null
          prior_firm_associations?: string[] | null
          prior_firms?: string[] | null
          prior_roles?: Json | null
          prisma_person_id?: string | null
          ready_for_live?: boolean
          recent_deal_count?: number | null
          recent_focus?: string | null
          recent_investments?: Json | null
          recent_news?: Json | null
          reputation_score?: number | null
          responsiveness_score?: number | null
          sector_focus?: string[] | null
          seniority?: string | null
          short_summary?: string | null
          slug?: string | null
          source_count?: number
          stage_concentration?: string[] | null
          stage_focus?: string[] | null
          state?: string | null
          sub_sectors?: string[] | null
          substack_url?: string | null
          sweet_spot?: number | null
          thematic_concentration?: string[] | null
          tiktok_url?: string | null
          timezone?: string | null
          title?: string | null
          total_known_investments?: number | null
          tracxn_url?: string | null
          updated_at?: string
          value_add_score?: number | null
          warm_intro_preferred?: boolean
          website_url?: string | null
          x_url?: string | null
          youtube_url?: string | null
        }
        Update: {
          alternate_names?: string[] | null
          articles?: Json | null
          avatar_confidence?: number | null
          avatar_last_verified_at?: string | null
          avatar_needs_review?: boolean
          avatar_source_type?: string | null
          avatar_source_url?: string | null
          avatar_url?: string | null
          avg_deal_size?: string | null
          background_summary?: string | null
          bio?: string | null
          blog_posts?: Json | null
          board_seats?: string[] | null
          capital_freshness_boost_score?: number | null
          check_size_max?: number | null
          check_size_min?: number | null
          city?: string | null
          co_investors?: Json | null
          cold_outreach_ok?: boolean
          completeness_score?: number
          country?: string | null
          created_at?: string
          current_areas_of_interest?: string[] | null
          deleted_at?: string | null
          domain_expertise?: string[] | null
          education_summary?: string | null
          email?: string | null
          enrichment_status?: string
          facebook_url?: string | null
          firm_bio_page_url?: string | null
          firm_id?: string
          first_name?: string | null
          founder_background?: string | null
          full_name?: string
          geographic_concentration?: string[] | null
          geographic_focus?: string[] | null
          headshot_url?: string | null
          id?: string
          instagram_url?: string | null
          interviews?: Json | null
          investing_themes?: string[] | null
          investment_pace?: string | null
          investment_style?: string | null
          investor_type?: string | null
          is_active?: boolean
          is_actively_investing?: boolean
          last_3_investments?: Json | null
          last_5_investments?: Json | null
          last_active_date?: string | null
          last_capital_signal_at?: string | null
          last_enriched_at?: string | null
          last_name?: string | null
          lead_vs_follow?: string | null
          linkedin_url?: string | null
          match_score?: number | null
          medium_url?: string | null
          needs_review?: boolean
          network_strength?: number | null
          networks?: string[] | null
          notable_investments?: string[] | null
          operator_background?: string | null
          past_investments?: Json | null
          personal_thesis_tags?: string[] | null
          personal_website?: string | null
          phone?: string | null
          podcasts?: Json | null
          portfolio_companies?: string[] | null
          preferred_name?: string | null
          prior_firm_associations?: string[] | null
          prior_firms?: string[] | null
          prior_roles?: Json | null
          prisma_person_id?: string | null
          ready_for_live?: boolean
          recent_deal_count?: number | null
          recent_focus?: string | null
          recent_investments?: Json | null
          recent_news?: Json | null
          reputation_score?: number | null
          responsiveness_score?: number | null
          sector_focus?: string[] | null
          seniority?: string | null
          short_summary?: string | null
          slug?: string | null
          source_count?: number
          stage_concentration?: string[] | null
          stage_focus?: string[] | null
          state?: string | null
          sub_sectors?: string[] | null
          substack_url?: string | null
          sweet_spot?: number | null
          thematic_concentration?: string[] | null
          tiktok_url?: string | null
          timezone?: string | null
          title?: string | null
          total_known_investments?: number | null
          tracxn_url?: string | null
          updated_at?: string
          value_add_score?: number | null
          warm_intro_preferred?: boolean
          website_url?: string | null
          x_url?: string | null
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investor_partners_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_partners_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "investor_directory_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_recent_deals: {
        Row: {
          amount: string | null
          canonical_company_id: string | null
          company_name: string
          created_at: string
          date_announced: string | null
          firm_id: string
          id: string
          investment_status: string | null
          is_notable: boolean | null
          normalized_company_name: string | null
          portfolio_company_linkedin: string | null
          portfolio_company_slug: string | null
          portfolio_company_website: string | null
          raw_payload: Json | null
          source_confidence: number | null
          source_firm_name: string | null
          source_name: string | null
          source_url: string | null
          stage: string | null
          updated_at: string | null
        }
        Insert: {
          amount?: string | null
          canonical_company_id?: string | null
          company_name: string
          created_at?: string
          date_announced?: string | null
          firm_id: string
          id?: string
          investment_status?: string | null
          is_notable?: boolean | null
          normalized_company_name?: string | null
          portfolio_company_linkedin?: string | null
          portfolio_company_slug?: string | null
          portfolio_company_website?: string | null
          raw_payload?: Json | null
          source_confidence?: number | null
          source_firm_name?: string | null
          source_name?: string | null
          source_url?: string | null
          stage?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: string | null
          canonical_company_id?: string | null
          company_name?: string
          created_at?: string
          date_announced?: string | null
          firm_id?: string
          id?: string
          investment_status?: string | null
          is_notable?: boolean | null
          normalized_company_name?: string | null
          portfolio_company_linkedin?: string | null
          portfolio_company_slug?: string | null
          portfolio_company_website?: string | null
          raw_payload?: Json | null
          source_confidence?: number | null
          source_firm_name?: string | null
          source_name?: string | null
          source_url?: string | null
          stage?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "firm_recent_deals_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_recent_deals_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "investor_directory_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_records: {
        Row: {
          acquisition_exits: number | null
          active_fund_count: number
          active_fund_vintage: number | null
          active_portfolio_count: number | null
          address: string | null
          adviser_crd_number: string | null
          aliases: string[]
          alternate_names: string[] | null
          angellist_url: string | null
          aum: string | null
          aum_usd: number | null
          avg_check_size: string | null
          beehiiv_url: string | null
          blog_url: string | null
          breakout_companies: string[] | null
          business_model_focus: string | null
          ca_sb54_compliant: boolean | null
          capital_freshness_boost_score: number | null
          careers_page_url: string | null
          cb_insights_url: string | null
          co_investor_patterns: string[] | null
          community_rating: number | null
          company_type_focus: string | null
          completeness_score: number
          contact_page_url: string | null
          countries_invested_in: string[] | null
          created_at: string
          crunchbase_url: string | null
          current_fund_name: string | null
          current_fund_size: string | null
          current_fund_vintage_year: number | null
          data_confidence_score: number | null
          deals_last_24m: number | null
          deleted_at: string | null
          description: string | null
          dry_powder: string | null
          elevator_pitch: string | null
          email: string | null
          email_source: string | null
          enrichment_status: string
          entity_type: Database["public"]["Enums"]["entity_type"] | null
          estimated_check_range_json: Json
          evidence_urls: string[] | null
          exited_portfolio_count: number | null
          extraction_confidence: number | null
          facebook_url: string | null
          firm_blog_url: string | null
          firm_name: string
          firm_type: string | null
          first_investment_date: string | null
          focus_enriched_at: string | null
          founded_year: number | null
          founder_reputation_score: number | null
          fresh_capital_priority_score: number | null
          freshness_synced_at: string | null
          freshness_verified_at: string | null
          fund_status: string | null
          general_partner_count: number | null
          general_partner_names: string[] | null
          geo_focus: string[] | null
          has_fresh_capital: boolean
          headcount: string | null
          hiring_signals: Json | null
          hq_city: string | null
          hq_country: string | null
          hq_region: Database["public"]["Enums"]["us_region"] | null
          hq_state: string | null
          hq_zip_code: string | null
          id: string
          impact_orientation:
            | Database["public"]["Enums"]["impact_orientation"]
            | null
          industry_reputation: number | null
          instagram_url: string | null
          interviews: Json | null
          investing_team_count: number | null
          investment_pace: string | null
          investment_philosophy: string | null
          investment_themes: string[] | null
          ipo_count: number | null
          is_actively_deploying: boolean | null
          is_popular: boolean | null
          is_recent: boolean | null
          is_trending: boolean | null
          last_5_investments: Json | null
          last_capital_signal_at: string | null
          last_enriched_at: string | null
          last_fund_announcement_date: string | null
          last_verified_at: string | null
          latest_fund_announcement_date: string | null
          latest_fund_close: string | null
          latest_fund_name: string | null
          latest_fund_size_usd: number | null
          latest_verified_vc_fund_id: string | null
          lead_follow_behavior: string | null
          lead_investments_count: number | null
          lead_or_follow: string | null
          lead_partner: string | null
          legal_name: string | null
          likely_actively_deploying: boolean | null
          linkedin_url: string | null
          location: string | null
          locations: Json | null
          logo_url: string | null
          major_announcements: Json | null
          manual_review_status: string | null
          market_sentiment: string | null
          match_score: number | null
          max_check_size: number | null
          medium_url: string | null
          min_check_size: number | null
          missing_column_name: string | null
          most_recent_investment_date: string | null
          needs_review: boolean
          network_strength: number | null
          news_sentiment_score: number | null
          newsletters: string | null
          next_update_scheduled_at: string | null
          notable_misses: string[] | null
          num_funds: number | null
          office_count: number | null
          office_locations: Json | null
          openvc_url: string | null
          operating_partners: string[] | null
          ownership_type: string | null
          partner_names: string[] | null
          pct_deployed: string | null
          phone: string | null
          pitchbook_url: string | null
          podcasts: Json | null
          portfolio_highlights: string[] | null
          preferred_stage: string | null
          prisma_firm_id: string | null
          ready_for_live: boolean
          recent_capital_signal_count: number
          recent_deals: string[] | null
          recent_focus: string | null
          recent_news: Json | null
          regions_invested_in: string[] | null
          reputation_score: number | null
          reputation_updated_at: string | null
          reserve_strategy: string | null
          responsiveness_score: number | null
          sec_file_number: string | null
          sector_classification:
            | Database["public"]["Enums"]["sector_classification"]
            | null
          sector_embedding: string | null
          sector_focus: string[] | null
          sector_scope: Database["public"]["Enums"]["sector_scope_enum"] | null
          sentiment_detail: string | null
          signal_nfx_url: string | null
          slug: string | null
          social_sentiment_score: number | null
          source_count: number
          stage_classification:
            | Database["public"]["Enums"]["stage_classification"]
            | null
          stage_focus: Database["public"]["Enums"]["stage_focus_enum"][] | null
          stage_max: Database["public"]["Enums"]["stage_focus_enum"] | null
          stage_min: Database["public"]["Enums"]["stage_focus_enum"] | null
          startups_gallery_url: string | null
          status: string | null
          strategy_classifications: string[] | null
          structure_classification:
            | Database["public"]["Enums"]["structure_classification"]
            | null
          sub_sectors: string[] | null
          substack_url: string | null
          tagline: string | null
          theme_classification:
            | Database["public"]["Enums"]["theme_classification"]
            | null
          thesis_orientation:
            | Database["public"]["Enums"]["thesis_orientation"]
            | null
          thesis_verticals: string[]
          thought_leadership_links: string[] | null
          tiktok_url: string | null
          total_headcount: number | null
          total_investors: number | null
          total_partners: number | null
          tracxn_url: string | null
          trustfinta_url: string | null
          underrepresented_founders_focus: boolean | null
          underrepresented_founders_focus_label: string | null
          underrepresented_founders_focus_rationale: string | null
          unicorns: string[] | null
          updated_at: string | null
          value_add_score: number | null
          vcsheet_url: string | null
          verification_status: string | null
          volatility_score: number | null
          website_url: string | null
          wellfound_url: string | null
          x_url: string | null
          youtube_url: string | null
        }
        Insert: {
          acquisition_exits?: number | null
          active_fund_count?: number
          active_fund_vintage?: number | null
          active_portfolio_count?: number | null
          address?: string | null
          adviser_crd_number?: string | null
          aliases?: string[]
          alternate_names?: string[] | null
          angellist_url?: string | null
          aum?: string | null
          aum_usd?: number | null
          avg_check_size?: string | null
          beehiiv_url?: string | null
          blog_url?: string | null
          breakout_companies?: string[] | null
          business_model_focus?: string | null
          ca_sb54_compliant?: boolean | null
          capital_freshness_boost_score?: number | null
          careers_page_url?: string | null
          cb_insights_url?: string | null
          co_investor_patterns?: string[] | null
          community_rating?: number | null
          company_type_focus?: string | null
          completeness_score?: number
          contact_page_url?: string | null
          countries_invested_in?: string[] | null
          created_at?: string
          crunchbase_url?: string | null
          current_fund_name?: string | null
          current_fund_size?: string | null
          current_fund_vintage_year?: number | null
          data_confidence_score?: number | null
          deals_last_24m?: number | null
          deleted_at?: string | null
          description?: string | null
          dry_powder?: string | null
          elevator_pitch?: string | null
          email?: string | null
          email_source?: string | null
          enrichment_status?: string
          entity_type?: Database["public"]["Enums"]["entity_type"] | null
          estimated_check_range_json?: Json
          evidence_urls?: string[] | null
          exited_portfolio_count?: number | null
          extraction_confidence?: number | null
          facebook_url?: string | null
          firm_blog_url?: string | null
          firm_name: string
          firm_type?: string | null
          first_investment_date?: string | null
          focus_enriched_at?: string | null
          founded_year?: number | null
          founder_reputation_score?: number | null
          fresh_capital_priority_score?: number | null
          freshness_synced_at?: string | null
          freshness_verified_at?: string | null
          fund_status?: string | null
          general_partner_count?: number | null
          general_partner_names?: string[] | null
          geo_focus?: string[] | null
          has_fresh_capital?: boolean
          headcount?: string | null
          hiring_signals?: Json | null
          hq_city?: string | null
          hq_country?: string | null
          hq_region?: Database["public"]["Enums"]["us_region"] | null
          hq_state?: string | null
          hq_zip_code?: string | null
          id?: string
          impact_orientation?:
            | Database["public"]["Enums"]["impact_orientation"]
            | null
          industry_reputation?: number | null
          instagram_url?: string | null
          interviews?: Json | null
          investing_team_count?: number | null
          investment_pace?: string | null
          investment_philosophy?: string | null
          investment_themes?: string[] | null
          ipo_count?: number | null
          is_actively_deploying?: boolean | null
          is_popular?: boolean | null
          is_recent?: boolean | null
          is_trending?: boolean | null
          last_5_investments?: Json | null
          last_capital_signal_at?: string | null
          last_enriched_at?: string | null
          last_fund_announcement_date?: string | null
          last_verified_at?: string | null
          latest_fund_announcement_date?: string | null
          latest_fund_close?: string | null
          latest_fund_name?: string | null
          latest_fund_size_usd?: number | null
          latest_verified_vc_fund_id?: string | null
          lead_follow_behavior?: string | null
          lead_investments_count?: number | null
          lead_or_follow?: string | null
          lead_partner?: string | null
          legal_name?: string | null
          likely_actively_deploying?: boolean | null
          linkedin_url?: string | null
          location?: string | null
          locations?: Json | null
          logo_url?: string | null
          major_announcements?: Json | null
          manual_review_status?: string | null
          market_sentiment?: string | null
          match_score?: number | null
          max_check_size?: number | null
          medium_url?: string | null
          min_check_size?: number | null
          missing_column_name?: string | null
          most_recent_investment_date?: string | null
          needs_review?: boolean
          network_strength?: number | null
          news_sentiment_score?: number | null
          newsletters?: string | null
          next_update_scheduled_at?: string | null
          notable_misses?: string[] | null
          num_funds?: number | null
          office_count?: number | null
          office_locations?: Json | null
          openvc_url?: string | null
          operating_partners?: string[] | null
          ownership_type?: string | null
          partner_names?: string[] | null
          pct_deployed?: string | null
          phone?: string | null
          pitchbook_url?: string | null
          podcasts?: Json | null
          portfolio_highlights?: string[] | null
          preferred_stage?: string | null
          prisma_firm_id?: string | null
          ready_for_live?: boolean
          recent_capital_signal_count?: number
          recent_deals?: string[] | null
          recent_focus?: string | null
          recent_news?: Json | null
          regions_invested_in?: string[] | null
          reputation_score?: number | null
          reputation_updated_at?: string | null
          reserve_strategy?: string | null
          responsiveness_score?: number | null
          sec_file_number?: string | null
          sector_classification?:
            | Database["public"]["Enums"]["sector_classification"]
            | null
          sector_embedding?: string | null
          sector_focus?: string[] | null
          sector_scope?: Database["public"]["Enums"]["sector_scope_enum"] | null
          sentiment_detail?: string | null
          signal_nfx_url?: string | null
          slug?: string | null
          social_sentiment_score?: number | null
          source_count?: number
          stage_classification?:
            | Database["public"]["Enums"]["stage_classification"]
            | null
          stage_focus?: Database["public"]["Enums"]["stage_focus_enum"][] | null
          stage_max?: Database["public"]["Enums"]["stage_focus_enum"] | null
          stage_min?: Database["public"]["Enums"]["stage_focus_enum"] | null
          startups_gallery_url?: string | null
          status?: string | null
          strategy_classifications?: string[] | null
          structure_classification?:
            | Database["public"]["Enums"]["structure_classification"]
            | null
          sub_sectors?: string[] | null
          substack_url?: string | null
          tagline?: string | null
          theme_classification?:
            | Database["public"]["Enums"]["theme_classification"]
            | null
          thesis_orientation?:
            | Database["public"]["Enums"]["thesis_orientation"]
            | null
          thesis_verticals?: string[]
          thought_leadership_links?: string[] | null
          tiktok_url?: string | null
          total_headcount?: number | null
          total_investors?: number | null
          total_partners?: number | null
          tracxn_url?: string | null
          trustfinta_url?: string | null
          underrepresented_founders_focus?: boolean | null
          underrepresented_founders_focus_label?: string | null
          underrepresented_founders_focus_rationale?: string | null
          unicorns?: string[] | null
          updated_at?: string | null
          value_add_score?: number | null
          vcsheet_url?: string | null
          verification_status?: string | null
          volatility_score?: number | null
          website_url?: string | null
          wellfound_url?: string | null
          x_url?: string | null
          youtube_url?: string | null
        }
        Update: {
          acquisition_exits?: number | null
          active_fund_count?: number
          active_fund_vintage?: number | null
          active_portfolio_count?: number | null
          address?: string | null
          adviser_crd_number?: string | null
          aliases?: string[]
          alternate_names?: string[] | null
          angellist_url?: string | null
          aum?: string | null
          aum_usd?: number | null
          avg_check_size?: string | null
          beehiiv_url?: string | null
          blog_url?: string | null
          breakout_companies?: string[] | null
          business_model_focus?: string | null
          ca_sb54_compliant?: boolean | null
          capital_freshness_boost_score?: number | null
          careers_page_url?: string | null
          cb_insights_url?: string | null
          co_investor_patterns?: string[] | null
          community_rating?: number | null
          company_type_focus?: string | null
          completeness_score?: number
          contact_page_url?: string | null
          countries_invested_in?: string[] | null
          created_at?: string
          crunchbase_url?: string | null
          current_fund_name?: string | null
          current_fund_size?: string | null
          current_fund_vintage_year?: number | null
          data_confidence_score?: number | null
          deals_last_24m?: number | null
          deleted_at?: string | null
          description?: string | null
          dry_powder?: string | null
          elevator_pitch?: string | null
          email?: string | null
          email_source?: string | null
          enrichment_status?: string
          entity_type?: Database["public"]["Enums"]["entity_type"] | null
          estimated_check_range_json?: Json
          evidence_urls?: string[] | null
          exited_portfolio_count?: number | null
          extraction_confidence?: number | null
          facebook_url?: string | null
          firm_blog_url?: string | null
          firm_name?: string
          firm_type?: string | null
          first_investment_date?: string | null
          focus_enriched_at?: string | null
          founded_year?: number | null
          founder_reputation_score?: number | null
          fresh_capital_priority_score?: number | null
          freshness_synced_at?: string | null
          freshness_verified_at?: string | null
          fund_status?: string | null
          general_partner_count?: number | null
          general_partner_names?: string[] | null
          geo_focus?: string[] | null
          has_fresh_capital?: boolean
          headcount?: string | null
          hiring_signals?: Json | null
          hq_city?: string | null
          hq_country?: string | null
          hq_region?: Database["public"]["Enums"]["us_region"] | null
          hq_state?: string | null
          hq_zip_code?: string | null
          id?: string
          impact_orientation?:
            | Database["public"]["Enums"]["impact_orientation"]
            | null
          industry_reputation?: number | null
          instagram_url?: string | null
          interviews?: Json | null
          investing_team_count?: number | null
          investment_pace?: string | null
          investment_philosophy?: string | null
          investment_themes?: string[] | null
          ipo_count?: number | null
          is_actively_deploying?: boolean | null
          is_popular?: boolean | null
          is_recent?: boolean | null
          is_trending?: boolean | null
          last_5_investments?: Json | null
          last_capital_signal_at?: string | null
          last_enriched_at?: string | null
          last_fund_announcement_date?: string | null
          last_verified_at?: string | null
          latest_fund_announcement_date?: string | null
          latest_fund_close?: string | null
          latest_fund_name?: string | null
          latest_fund_size_usd?: number | null
          latest_verified_vc_fund_id?: string | null
          lead_follow_behavior?: string | null
          lead_investments_count?: number | null
          lead_or_follow?: string | null
          lead_partner?: string | null
          legal_name?: string | null
          likely_actively_deploying?: boolean | null
          linkedin_url?: string | null
          location?: string | null
          locations?: Json | null
          logo_url?: string | null
          major_announcements?: Json | null
          manual_review_status?: string | null
          market_sentiment?: string | null
          match_score?: number | null
          max_check_size?: number | null
          medium_url?: string | null
          min_check_size?: number | null
          missing_column_name?: string | null
          most_recent_investment_date?: string | null
          needs_review?: boolean
          network_strength?: number | null
          news_sentiment_score?: number | null
          newsletters?: string | null
          next_update_scheduled_at?: string | null
          notable_misses?: string[] | null
          num_funds?: number | null
          office_count?: number | null
          office_locations?: Json | null
          openvc_url?: string | null
          operating_partners?: string[] | null
          ownership_type?: string | null
          partner_names?: string[] | null
          pct_deployed?: string | null
          phone?: string | null
          pitchbook_url?: string | null
          podcasts?: Json | null
          portfolio_highlights?: string[] | null
          preferred_stage?: string | null
          prisma_firm_id?: string | null
          ready_for_live?: boolean
          recent_capital_signal_count?: number
          recent_deals?: string[] | null
          recent_focus?: string | null
          recent_news?: Json | null
          regions_invested_in?: string[] | null
          reputation_score?: number | null
          reputation_updated_at?: string | null
          reserve_strategy?: string | null
          responsiveness_score?: number | null
          sec_file_number?: string | null
          sector_classification?:
            | Database["public"]["Enums"]["sector_classification"]
            | null
          sector_embedding?: string | null
          sector_focus?: string[] | null
          sector_scope?: Database["public"]["Enums"]["sector_scope_enum"] | null
          sentiment_detail?: string | null
          signal_nfx_url?: string | null
          slug?: string | null
          social_sentiment_score?: number | null
          source_count?: number
          stage_classification?:
            | Database["public"]["Enums"]["stage_classification"]
            | null
          stage_focus?: Database["public"]["Enums"]["stage_focus_enum"][] | null
          stage_max?: Database["public"]["Enums"]["stage_focus_enum"] | null
          stage_min?: Database["public"]["Enums"]["stage_focus_enum"] | null
          startups_gallery_url?: string | null
          status?: string | null
          strategy_classifications?: string[] | null
          structure_classification?:
            | Database["public"]["Enums"]["structure_classification"]
            | null
          sub_sectors?: string[] | null
          substack_url?: string | null
          tagline?: string | null
          theme_classification?:
            | Database["public"]["Enums"]["theme_classification"]
            | null
          thesis_orientation?:
            | Database["public"]["Enums"]["thesis_orientation"]
            | null
          thesis_verticals?: string[]
          thought_leadership_links?: string[] | null
          tiktok_url?: string | null
          total_headcount?: number | null
          total_investors?: number | null
          total_partners?: number | null
          tracxn_url?: string | null
          trustfinta_url?: string | null
          underrepresented_founders_focus?: boolean | null
          underrepresented_founders_focus_label?: string | null
          underrepresented_founders_focus_rationale?: string | null
          unicorns?: string[] | null
          updated_at?: string | null
          value_add_score?: number | null
          vcsheet_url?: string | null
          verification_status?: string | null
          volatility_score?: number | null
          website_url?: string | null
          wellfound_url?: string | null
          x_url?: string | null
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "firm_records_latest_verified_vc_fund_id_fkey"
            columns: ["latest_verified_vc_fund_id"]
            isOneToOne: false
            referencedRelation: "vc_funds"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_source_evidence: {
        Row: {
          confidence_score: number
          created_at: string
          field_name: string
          firm_id: string
          id: string
          quote_or_snippet: string
          run_id: string | null
          source_title: string | null
          source_type: string
          source_url: string
          value_json: Json
        }
        Insert: {
          confidence_score: number
          created_at?: string
          field_name: string
          firm_id: string
          id?: string
          quote_or_snippet: string
          run_id?: string | null
          source_title?: string | null
          source_type: string
          source_url: string
          value_json: Json
        }
        Update: {
          confidence_score?: number
          created_at?: string
          field_name?: string
          firm_id?: string
          id?: string
          quote_or_snippet?: string
          run_id?: string | null
          source_title?: string | null
          source_type?: string
          source_url?: string
          value_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "firm_source_evidence_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_source_evidence_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "investor_directory_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_source_evidence_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "firm_enrichment_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_source_url_candidates: {
        Row: {
          candidate_key: string
          candidate_url: string
          confidence_score: number
          discovered_at: string
          discovery_method: string
          firm_id: string
          source_name: string
          status: string
          updated_at: string
        }
        Insert: {
          candidate_key: string
          candidate_url: string
          confidence_score?: number
          discovered_at?: string
          discovery_method: string
          firm_id: string
          source_name: string
          status?: string
          updated_at?: string
        }
        Update: {
          candidate_key?: string
          candidate_url?: string
          confidence_score?: number
          discovered_at?: string
          discovery_method?: string
          firm_id?: string
          source_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "firm_source_url_candidates_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_source_url_candidates_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "investor_directory_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_tag_links: {
        Row: {
          confidence: number | null
          created_at: string
          firm_id: string
          id: string
          namespace: string
          source: string | null
          tag_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          firm_id: string
          id?: string
          namespace: string
          source?: string | null
          tag_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          firm_id?: string
          id?: string
          namespace?: string
          source?: string | null
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "firm_tag_links_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_tag_links_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "investor_directory_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_tag_links_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "firm_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_tags: {
        Row: {
          created_at: string
          id: string
          namespace: string
          slug: string | null
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          namespace: string
          slug?: string | null
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          namespace?: string
          slug?: string | null
          value?: string
        }
        Relationships: []
      }
      firm_website_candidates: {
        Row: {
          candidate_url: string
          competing_score: number | null
          competing_url: string | null
          confidence: string
          created_at: string | null
          domain: string
          fetch_method: string | null
          firm_id: string
          id: string
          reason: string | null
          score: number
          source: string
        }
        Insert: {
          candidate_url: string
          competing_score?: number | null
          competing_url?: string | null
          confidence?: string
          created_at?: string | null
          domain: string
          fetch_method?: string | null
          firm_id: string
          id?: string
          reason?: string | null
          score: number
          source: string
        }
        Update: {
          candidate_url?: string
          competing_score?: number | null
          competing_url?: string | null
          confidence?: string
          created_at?: string | null
          domain?: string
          fetch_method?: string | null
          firm_id?: string
          id?: string
          reason?: string | null
          score?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "firm_website_candidates_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_website_candidates_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "investor_directory_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      founder_vc_interactions: {
        Row: {
          action_type: string
          created_at: string
          firm_id: string
          founder_id: string
          id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          firm_id: string
          founder_id: string
          id?: string
        }
        Update: {
          action_type?: string
          created_at?: string
          firm_id?: string
          founder_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "founder_vc_interactions_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "founder_vc_interactions_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "investor_directory_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_aliases: {
        Row: {
          alias_value: string
          confidence: number | null
          created_at: string | null
          fund_id: string
          id: string
          normalized_value: string
          notes: string | null
          source: string | null
          updated_at: string | null
        }
        Insert: {
          alias_value: string
          confidence?: number | null
          created_at?: string | null
          fund_id: string
          id?: string
          normalized_value: string
          notes?: string | null
          source?: string | null
          updated_at?: string | null
        }
        Update: {
          alias_value?: string
          confidence?: number | null
          created_at?: string | null
          fund_id?: string
          id?: string
          normalized_value?: string
          notes?: string | null
          source?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fund_aliases_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "fund_records"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_data: {
        Row: {
          amount_sold_usd: number | null
          cbinsights_raw: Json | null
          created_at: string
          edgar_accession_number: string | null
          edgar_cik: string | null
          edgar_entity_name: string | null
          edgar_filing_date: string | null
          edgar_filing_url: string | null
          edgar_form_type: string | null
          edgar_industry_group: string | null
          edgar_raw: Json | null
          edgar_state: string | null
          firm_name: string
          firm_slug: string | null
          fund_name: string | null
          fund_number: number | null
          fund_status: string | null
          geographies: string[] | null
          id: string
          investment_pace: string | null
          nfx_raw: Json | null
          pct_deployed: number | null
          portfolio_companies: Json | null
          portfolio_count: number | null
          sectors: string[] | null
          sources: string[] | null
          stages: string[] | null
          themes: string[] | null
          total_amount_usd: number | null
          updated_at: string
          vintage_year: number | null
        }
        Insert: {
          amount_sold_usd?: number | null
          cbinsights_raw?: Json | null
          created_at?: string
          edgar_accession_number?: string | null
          edgar_cik?: string | null
          edgar_entity_name?: string | null
          edgar_filing_date?: string | null
          edgar_filing_url?: string | null
          edgar_form_type?: string | null
          edgar_industry_group?: string | null
          edgar_raw?: Json | null
          edgar_state?: string | null
          firm_name: string
          firm_slug?: string | null
          fund_name?: string | null
          fund_number?: number | null
          fund_status?: string | null
          geographies?: string[] | null
          id?: string
          investment_pace?: string | null
          nfx_raw?: Json | null
          pct_deployed?: number | null
          portfolio_companies?: Json | null
          portfolio_count?: number | null
          sectors?: string[] | null
          sources?: string[] | null
          stages?: string[] | null
          themes?: string[] | null
          total_amount_usd?: number | null
          updated_at?: string
          vintage_year?: number | null
        }
        Update: {
          amount_sold_usd?: number | null
          cbinsights_raw?: Json | null
          created_at?: string
          edgar_accession_number?: string | null
          edgar_cik?: string | null
          edgar_entity_name?: string | null
          edgar_filing_date?: string | null
          edgar_filing_url?: string | null
          edgar_form_type?: string | null
          edgar_industry_group?: string | null
          edgar_raw?: Json | null
          edgar_state?: string | null
          firm_name?: string
          firm_slug?: string | null
          fund_name?: string | null
          fund_number?: number | null
          fund_status?: string | null
          geographies?: string[] | null
          id?: string
          investment_pace?: string | null
          nfx_raw?: Json | null
          pct_deployed?: number | null
          portfolio_companies?: Json | null
          portfolio_count?: number | null
          sectors?: string[] | null
          sources?: string[] | null
          stages?: string[] | null
          themes?: string[] | null
          total_amount_usd?: number | null
          updated_at?: string
          vintage_year?: number | null
        }
        Relationships: []
      }
      fund_records: {
        Row: {
          actively_deploying: boolean | null
          adviser_crd_number: string | null
          adviser_is_subadviser: boolean | null
          adviser_legal_name: string | null
          adviser_sec_file_number: string | null
          approximate_beneficial_owner_count: number | null
          auditor_name: string | null
          aum_usd: number | null
          avg_check_size_max: number | null
          avg_check_size_min: number | null
          canonical_freshness_synced_at: string | null
          canonical_vc_fund_id: string | null
          close_date: string | null
          committed_capital: number | null
          confidence: number | null
          created_at: string | null
          currency: string | null
          current_gross_asset_value_usd: number | null
          deleted_at: string | null
          deployed_pct: number | null
          final_close_size_usd: number | null
          firm_id: string | null
          form_d_file_number: string | null
          fund_category: string | null
          fund_name: string
          fund_number: number | null
          fund_organization_jurisdiction: string | null
          fund_status: Database["public"]["Enums"]["fund_status_enum"] | null
          fund_type: string | null
          geo_focus: string[] | null
          gp_commit_usd: number | null
          id: string
          last_verified_at: string | null
          marketer_name: string | null
          minimum_investment_commitment_usd: number | null
          normalized_fund_name: string | null
          open_date: string | null
          other_advisers: boolean | null
          percent_owned_by_funds_of_funds: number | null
          percent_owned_by_non_us_persons: number | null
          percent_owned_by_related_persons: number | null
          prime_broker_name: string | null
          prisma_fund_id: string | null
          private_fund_identification_number: string | null
          regulation_d_relied_on: boolean | null
          sector_focus: string[] | null
          size_usd: number | null
          solicited_to_invest: boolean | null
          source_filed_at: string | null
          source_filing_type: string | null
          source_url: string | null
          stage_focus: string[] | null
          strategy: string | null
          target_size_usd: number | null
          themes: string[] | null
          updated_at: string | null
          verification_status: string | null
          vintage_year: number | null
        }
        Insert: {
          actively_deploying?: boolean | null
          adviser_crd_number?: string | null
          adviser_is_subadviser?: boolean | null
          adviser_legal_name?: string | null
          adviser_sec_file_number?: string | null
          approximate_beneficial_owner_count?: number | null
          auditor_name?: string | null
          aum_usd?: number | null
          avg_check_size_max?: number | null
          avg_check_size_min?: number | null
          canonical_freshness_synced_at?: string | null
          canonical_vc_fund_id?: string | null
          close_date?: string | null
          committed_capital?: number | null
          confidence?: number | null
          created_at?: string | null
          currency?: string | null
          current_gross_asset_value_usd?: number | null
          deleted_at?: string | null
          deployed_pct?: number | null
          final_close_size_usd?: number | null
          firm_id?: string | null
          form_d_file_number?: string | null
          fund_category?: string | null
          fund_name: string
          fund_number?: number | null
          fund_organization_jurisdiction?: string | null
          fund_status?: Database["public"]["Enums"]["fund_status_enum"] | null
          fund_type?: string | null
          geo_focus?: string[] | null
          gp_commit_usd?: number | null
          id?: string
          last_verified_at?: string | null
          marketer_name?: string | null
          minimum_investment_commitment_usd?: number | null
          normalized_fund_name?: string | null
          open_date?: string | null
          other_advisers?: boolean | null
          percent_owned_by_funds_of_funds?: number | null
          percent_owned_by_non_us_persons?: number | null
          percent_owned_by_related_persons?: number | null
          prime_broker_name?: string | null
          prisma_fund_id?: string | null
          private_fund_identification_number?: string | null
          regulation_d_relied_on?: boolean | null
          sector_focus?: string[] | null
          size_usd?: number | null
          solicited_to_invest?: boolean | null
          source_filed_at?: string | null
          source_filing_type?: string | null
          source_url?: string | null
          stage_focus?: string[] | null
          strategy?: string | null
          target_size_usd?: number | null
          themes?: string[] | null
          updated_at?: string | null
          verification_status?: string | null
          vintage_year?: number | null
        }
        Update: {
          actively_deploying?: boolean | null
          adviser_crd_number?: string | null
          adviser_is_subadviser?: boolean | null
          adviser_legal_name?: string | null
          adviser_sec_file_number?: string | null
          approximate_beneficial_owner_count?: number | null
          auditor_name?: string | null
          aum_usd?: number | null
          avg_check_size_max?: number | null
          avg_check_size_min?: number | null
          canonical_freshness_synced_at?: string | null
          canonical_vc_fund_id?: string | null
          close_date?: string | null
          committed_capital?: number | null
          confidence?: number | null
          created_at?: string | null
          currency?: string | null
          current_gross_asset_value_usd?: number | null
          deleted_at?: string | null
          deployed_pct?: number | null
          final_close_size_usd?: number | null
          firm_id?: string | null
          form_d_file_number?: string | null
          fund_category?: string | null
          fund_name?: string
          fund_number?: number | null
          fund_organization_jurisdiction?: string | null
          fund_status?: Database["public"]["Enums"]["fund_status_enum"] | null
          fund_type?: string | null
          geo_focus?: string[] | null
          gp_commit_usd?: number | null
          id?: string
          last_verified_at?: string | null
          marketer_name?: string | null
          minimum_investment_commitment_usd?: number | null
          normalized_fund_name?: string | null
          open_date?: string | null
          other_advisers?: boolean | null
          percent_owned_by_funds_of_funds?: number | null
          percent_owned_by_non_us_persons?: number | null
          percent_owned_by_related_persons?: number | null
          prime_broker_name?: string | null
          prisma_fund_id?: string | null
          private_fund_identification_number?: string | null
          regulation_d_relied_on?: boolean | null
          sector_focus?: string[] | null
          size_usd?: number | null
          solicited_to_invest?: boolean | null
          source_filed_at?: string | null
          source_filing_type?: string | null
          source_url?: string | null
          stage_focus?: string[] | null
          strategy?: string | null
          target_size_usd?: number | null
          themes?: string[] | null
          updated_at?: string | null
          verification_status?: string | null
          vintage_year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fund_records_canonical_vc_fund_id_fkey"
            columns: ["canonical_vc_fund_id"]
            isOneToOne: false
            referencedRelation: "vc_funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_records_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_records_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "investor_directory_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_source_evidence: {
        Row: {
          created_at: string | null
          discovered_at: string | null
          evidence_quote: string | null
          field_name: string
          fund_id: string
          id: string
          raw_payload: Json | null
          source_confidence: number
          source_type: Database["public"]["Enums"]["fund_source_type"]
          source_url: string | null
        }
        Insert: {
          created_at?: string | null
          discovered_at?: string | null
          evidence_quote?: string | null
          field_name?: string
          fund_id: string
          id?: string
          raw_payload?: Json | null
          source_confidence?: number
          source_type: Database["public"]["Enums"]["fund_source_type"]
          source_url?: string | null
        }
        Update: {
          created_at?: string | null
          discovered_at?: string | null
          evidence_quote?: string | null
          field_name?: string
          fund_id?: string
          id?: string
          raw_payload?: Json | null
          source_confidence?: number
          source_type?: Database["public"]["Enums"]["fund_source_type"]
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fund_source_evidence_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "fund_records"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_deal_investors: {
        Row: {
          funding_deal_id: string
          id: string
          name_normalized: string
          name_raw: string
          role: Database["public"]["Enums"]["FundingDealInvestorRole"]
          sort_order: number
        }
        Insert: {
          funding_deal_id: string
          id: string
          name_normalized: string
          name_raw: string
          role: Database["public"]["Enums"]["FundingDealInvestorRole"]
          sort_order?: number
        }
        Update: {
          funding_deal_id?: string
          id?: string
          name_normalized?: string
          name_raw?: string
          role?: Database["public"]["Enums"]["FundingDealInvestorRole"]
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "funding_deal_investors_funding_deal_id_fkey"
            columns: ["funding_deal_id"]
            isOneToOne: false
            referencedRelation: "funding_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_deals: {
        Row: {
          amount_minor_units: number | null
          amount_raw: string | null
          announced_date: string | null
          company_hq: string | null
          company_name: string
          company_name_normalized: string
          company_website: string | null
          created_at: string
          currency: string
          deal_summary: string | null
          duplicate_of_deal_id: string | null
          existing_investors_mentioned: string[]
          extraction_confidence: number
          extraction_method: string
          founders_mentioned: string[]
          id: string
          needs_review: boolean
          raw_extraction_json: Json | null
          review_reason: string | null
          round_type_normalized: string | null
          round_type_raw: string | null
          sector_normalized: string | null
          sector_raw: string | null
          slot_index: number
          source_article_id: string
          updated_at: string
        }
        Insert: {
          amount_minor_units?: number | null
          amount_raw?: string | null
          announced_date?: string | null
          company_hq?: string | null
          company_name: string
          company_name_normalized: string
          company_website?: string | null
          created_at?: string
          currency?: string
          deal_summary?: string | null
          duplicate_of_deal_id?: string | null
          existing_investors_mentioned?: string[]
          extraction_confidence: number
          extraction_method: string
          founders_mentioned?: string[]
          id: string
          needs_review?: boolean
          raw_extraction_json?: Json | null
          review_reason?: string | null
          round_type_normalized?: string | null
          round_type_raw?: string | null
          sector_normalized?: string | null
          sector_raw?: string | null
          slot_index?: number
          source_article_id: string
          updated_at: string
        }
        Update: {
          amount_minor_units?: number | null
          amount_raw?: string | null
          announced_date?: string | null
          company_hq?: string | null
          company_name?: string
          company_name_normalized?: string
          company_website?: string | null
          created_at?: string
          currency?: string
          deal_summary?: string | null
          duplicate_of_deal_id?: string | null
          existing_investors_mentioned?: string[]
          extraction_confidence?: number
          extraction_method?: string
          founders_mentioned?: string[]
          id?: string
          needs_review?: boolean
          raw_extraction_json?: Json | null
          review_reason?: string | null
          round_type_normalized?: string | null
          round_type_raw?: string | null
          sector_normalized?: string | null
          sector_raw?: string | null
          slot_index?: number
          source_article_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "funding_deals_duplicate_of_deal_id_fkey"
            columns: ["duplicate_of_deal_id"]
            isOneToOne: false
            referencedRelation: "funding_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_deals_source_article_id_fkey"
            columns: ["source_article_id"]
            isOneToOne: false
            referencedRelation: "source_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      identity_links: {
        Row: {
          confidence: number
          created_at: string
          id: string
          owner_context_id: string
          person_id: string
          source: string | null
        }
        Insert: {
          confidence?: number
          created_at?: string
          id?: string
          owner_context_id: string
          person_id: string
          source?: string | null
        }
        Update: {
          confidence?: number
          created_at?: string
          id?: string
          owner_context_id?: string
          person_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "identity_links_owner_context_id_fkey"
            columns: ["owner_context_id"]
            isOneToOne: false
            referencedRelation: "owner_contexts"
            referencedColumns: ["id"]
          },
        ]
      }
      identity_rejections: {
        Row: {
          created_at: string
          id: string
          owner_context_id: string
          person_id: string
          reason: string | null
          rejected_by: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_context_id: string
          person_id: string
          reason?: string | null
          rejected_by: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_context_id?: string
          person_id?: string
          reason?: string | null
          rejected_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "identity_rejections_owner_context_id_fkey"
            columns: ["owner_context_id"]
            isOneToOne: false
            referencedRelation: "owner_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identity_rejections_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_jobs: {
        Row: {
          completedAt: string | null
          createdAt: string | null
          error: string | null
          id: string
          sourceAdapter: string
          startedAt: string | null
          stats: Json | null
          status: string
          triggeredBy: string | null
          updatedAt: string | null
        }
        Insert: {
          completedAt?: string | null
          createdAt?: string | null
          error?: string | null
          id?: string
          sourceAdapter: string
          startedAt?: string | null
          stats?: Json | null
          status?: string
          triggeredBy?: string | null
          updatedAt?: string | null
        }
        Update: {
          completedAt?: string | null
          createdAt?: string | null
          error?: string | null
          id?: string
          sourceAdapter?: string
          startedAt?: string | null
          stats?: Json | null
          status?: string
          triggeredBy?: string | null
          updatedAt?: string | null
        }
        Relationships: []
      }
      ingestion_runs: {
        Row: {
          error_message: string | null
          finished_at: string | null
          id: string
          pacific_date: string | null
          started_at: string
          status: string
          summary_json: Json | null
          trigger_kind: string | null
        }
        Insert: {
          error_message?: string | null
          finished_at?: string | null
          id: string
          pacific_date?: string | null
          started_at?: string
          status: string
          summary_json?: Json | null
          trigger_kind?: string | null
        }
        Update: {
          error_message?: string | null
          finished_at?: string | null
          id?: string
          pacific_date?: string | null
          started_at?: string
          status?: string
          summary_json?: Json | null
          trigger_kind?: string | null
        }
        Relationships: []
      }
      ingestion_source_checkpoints: {
        Row: {
          cursor_json: Json | null
          id: string
          last_article_published_at: string | null
          last_run_id: string | null
          last_success_at: string | null
          source_key: Database["public"]["Enums"]["FundingIngestSourceKey"]
          updated_at: string
        }
        Insert: {
          cursor_json?: Json | null
          id: string
          last_article_published_at?: string | null
          last_run_id?: string | null
          last_success_at?: string | null
          source_key: Database["public"]["Enums"]["FundingIngestSourceKey"]
          updated_at: string
        }
        Update: {
          cursor_json?: Json | null
          id?: string
          last_article_published_at?: string | null
          last_run_id?: string | null
          last_success_at?: string | null
          source_key?: Database["public"]["Enums"]["FundingIngestSourceKey"]
          updated_at?: string
        }
        Relationships: []
      }
      intelligence_alerts: {
        Row: {
          alert_type: string
          created_at: string
          event_id: string | null
          id: string
          status: string
          user_id: string
          watchlist_id: string | null
        }
        Insert: {
          alert_type?: string
          created_at?: string
          event_id?: string | null
          id?: string
          status?: string
          user_id: string
          watchlist_id?: string | null
        }
        Update: {
          alert_type?: string
          created_at?: string
          event_id?: string | null
          id?: string
          status?: string
          user_id?: string
          watchlist_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_alerts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "intelligence_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_alerts_watchlist_id_fkey"
            columns: ["watchlist_id"]
            isOneToOne: false
            referencedRelation: "intelligence_watchlists"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_dismissed_events: {
        Row: {
          created_at: string
          event_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_dismissed_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "intelligence_events"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_entities: {
        Row: {
          aliases: string[]
          created_at: string
          description: string | null
          domain: string | null
          geography: string | null
          id: string
          metadata: Json
          name: string
          sectors: string[]
          tags: string[]
          type: string
          updated_at: string
          website: string | null
        }
        Insert: {
          aliases?: string[]
          created_at?: string
          description?: string | null
          domain?: string | null
          geography?: string | null
          id?: string
          metadata?: Json
          name: string
          sectors?: string[]
          tags?: string[]
          type: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          aliases?: string[]
          created_at?: string
          description?: string | null
          domain?: string | null
          geography?: string | null
          id?: string
          metadata?: Json
          name?: string
          sectors?: string[]
          tags?: string[]
          type?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      intelligence_event_entities: {
        Row: {
          created_at: string
          entity_id: string
          event_id: string
          id: string
          role: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          event_id: string
          id?: string
          role?: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          event_id?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_event_entities_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "intelligence_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_event_entities_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "intelligence_events"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_event_types: {
        Row: {
          active: boolean
          code: string
          created_at: string
          default_category: string
          description: string | null
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          default_category: string
          description?: string | null
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          default_category?: string
          description?: string | null
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      intelligence_events: {
        Row: {
          canonical_source_url: string | null
          category: string
          confidence_score: number
          created_at: string
          dedupe_key: string | null
          event_type: string
          first_seen_at: string
          id: string
          importance_score: number
          last_seen_at: string
          metadata: Json
          relevance_score: number
          sentiment: string | null
          source_count: number
          summary: string
          title: string
          updated_at: string
          why_it_matters: string
        }
        Insert: {
          canonical_source_url?: string | null
          category: string
          confidence_score?: number
          created_at?: string
          dedupe_key?: string | null
          event_type: string
          first_seen_at?: string
          id?: string
          importance_score?: number
          last_seen_at?: string
          metadata?: Json
          relevance_score?: number
          sentiment?: string | null
          source_count?: number
          summary?: string
          title: string
          updated_at?: string
          why_it_matters?: string
        }
        Update: {
          canonical_source_url?: string | null
          category?: string
          confidence_score?: number
          created_at?: string
          dedupe_key?: string | null
          event_type?: string
          first_seen_at?: string
          id?: string
          importance_score?: number
          last_seen_at?: string
          metadata?: Json
          relevance_score?: number
          sentiment?: string | null
          source_count?: number
          summary?: string
          title?: string
          updated_at?: string
          why_it_matters?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_events_event_type_fkey"
            columns: ["event_type"]
            isOneToOne: false
            referencedRelation: "intelligence_event_types"
            referencedColumns: ["code"]
          },
        ]
      }
      intelligence_saved_events: {
        Row: {
          created_at: string
          event_id: string
          id: string
          notes: string | null
          project_label: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          notes?: string | null
          project_label?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          notes?: string | null
          project_label?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_saved_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "intelligence_events"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_sources: {
        Row: {
          active: boolean
          base_url: string | null
          created_at: string
          credibility_score: number
          id: string
          metadata: Json
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          base_url?: string | null
          created_at?: string
          credibility_score?: number
          id?: string
          metadata?: Json
          name: string
          type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          base_url?: string | null
          created_at?: string
          credibility_score?: number
          id?: string
          metadata?: Json
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      intelligence_watchlists: {
        Row: {
          alert_threshold: string | null
          category: string | null
          created_at: string
          digest_frequency: string | null
          entity_id: string | null
          id: string
          keyword: string | null
          user_id: string
        }
        Insert: {
          alert_threshold?: string | null
          category?: string | null
          created_at?: string
          digest_frequency?: string | null
          entity_id?: string | null
          id?: string
          keyword?: string | null
          user_id: string
        }
        Update: {
          alert_threshold?: string | null
          category?: string | null
          created_at?: string
          digest_frequency?: string | null
          entity_id?: string | null
          id?: string
          keyword?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_watchlists_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "intelligence_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      interaction_participants: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          interaction_id: string
          is_self: boolean
          owner_context_id: string
          person_id: string | null
          role: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          interaction_id: string
          is_self?: boolean
          owner_context_id: string
          person_id?: string | null
          role: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          interaction_id?: string
          is_self?: boolean
          owner_context_id?: string
          person_id?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "interaction_participants_interaction_id_fkey"
            columns: ["interaction_id"]
            isOneToOne: false
            referencedRelation: "interactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interaction_participants_owner_context_id_fkey"
            columns: ["owner_context_id"]
            isOneToOne: false
            referencedRelation: "owner_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interaction_participants_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interaction_participants_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_cross_company_operators"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "interaction_participants_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_person_signals"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "interaction_participants_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_repeat_founders"
            referencedColumns: ["person_id"]
          },
        ]
      }
      interactions: {
        Row: {
          body_text: string | null
          created_at: string
          duration_seconds: number | null
          external_id: string | null
          id: string
          kind: string
          metadata: Json
          occurred_at: string | null
          owner_context_id: string
          source_record_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          body_text?: string | null
          created_at?: string
          duration_seconds?: number | null
          external_id?: string | null
          id?: string
          kind: string
          metadata?: Json
          occurred_at?: string | null
          owner_context_id: string
          source_record_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          body_text?: string | null
          created_at?: string
          duration_seconds?: number | null
          external_id?: string | null
          id?: string
          kind?: string
          metadata?: Json
          occurred_at?: string | null
          owner_context_id?: string
          source_record_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interactions_owner_context_id_fkey"
            columns: ["owner_context_id"]
            isOneToOne: false
            referencedRelation: "owner_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_source_record_id_fkey"
            columns: ["source_record_id"]
            isOneToOne: false
            referencedRelation: "connector_source_records"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_reviews: {
        Row: {
          comment: string | null
          created_at: string
          did_respond: boolean
          firm_id: string
          founder_id: string
          id: string
          interaction_type: string
          nps_score: number
        }
        Insert: {
          comment?: string | null
          created_at?: string
          did_respond?: boolean
          firm_id: string
          founder_id: string
          id?: string
          interaction_type?: string
          nps_score: number
        }
        Update: {
          comment?: string | null
          created_at?: string
          did_respond?: boolean
          firm_id?: string
          founder_id?: string
          id?: string
          interaction_type?: string
          nps_score?: number
        }
        Relationships: []
      }
      investormatch_vc_firms: {
        Row: {
          aum_usd: number | null
          check_size_max: number | null
          check_size_min: number | null
          created_at: string
          first_seen_at: string
          hq_geo: string | null
          id: string
          last_seen_at: string
          linkedin_url: string | null
          logo_url: string | null
          name: string
          portfolio: Json
          portfolio_count: number | null
          raw_payload: Json
          related_firms: Json
          sector_tags: string[]
          slug: string | null
          source_firm_id: number
          stage_focus: string[]
          submission_url: string | null
          thesis_summary: string | null
          twitter_handle: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          aum_usd?: number | null
          check_size_max?: number | null
          check_size_min?: number | null
          created_at?: string
          first_seen_at?: string
          hq_geo?: string | null
          id?: string
          last_seen_at?: string
          linkedin_url?: string | null
          logo_url?: string | null
          name: string
          portfolio?: Json
          portfolio_count?: number | null
          raw_payload?: Json
          related_firms?: Json
          sector_tags?: string[]
          slug?: string | null
          source_firm_id: number
          stage_focus?: string[]
          submission_url?: string | null
          thesis_summary?: string | null
          twitter_handle?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          aum_usd?: number | null
          check_size_max?: number | null
          check_size_min?: number | null
          created_at?: string
          first_seen_at?: string
          hq_geo?: string | null
          id?: string
          last_seen_at?: string
          linkedin_url?: string | null
          logo_url?: string | null
          name?: string
          portfolio?: Json
          portfolio_count?: number | null
          raw_payload?: Json
          related_firms?: Json
          sector_tags?: string[]
          slug?: string | null
          source_firm_id?: number
          stage_focus?: string[]
          submission_url?: string | null
          thesis_summary?: string | null
          twitter_handle?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      kb_action_logs: {
        Row: {
          action_type: string
          agent_name: string | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          preview_only: boolean
          related_entity_id: string | null
          related_entity_type: string | null
          request_payload: Json
          response_payload: Json
          started_at: string
          status: string
          target_provider: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          action_type: string
          agent_name?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          preview_only?: boolean
          related_entity_id?: string | null
          related_entity_type?: string | null
          request_payload?: Json
          response_payload?: Json
          started_at?: string
          status: string
          target_provider?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          action_type?: string
          agent_name?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          preview_only?: boolean
          related_entity_id?: string | null
          related_entity_type?: string | null
          request_payload?: Json
          response_payload?: Json
          started_at?: string
          status?: string
          target_provider?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      kb_document_chunks: {
        Row: {
          chunk_index: number
          content: string
          content_tsv: unknown
          created_at: string
          document_id: string
          embedding: string | null
          id: string
          metadata: Json
          token_count: number | null
        }
        Insert: {
          chunk_index: number
          content: string
          content_tsv?: unknown
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: string
          metadata?: Json
          token_count?: number | null
        }
        Update: {
          chunk_index?: number
          content?: string
          content_tsv?: unknown
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: string
          metadata?: Json
          token_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kb_document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "kb_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_documents: {
        Row: {
          created_at: string
          document_type: string | null
          id: string
          metadata: Json
          mime_type: string | null
          raw_text: string | null
          related_entity_id: string | null
          related_entity_type: string | null
          source_ref: string | null
          source_type: string | null
          storage_path: string | null
          title: string
          updated_at: string
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          document_type?: string | null
          id?: string
          metadata?: Json
          mime_type?: string | null
          raw_text?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          source_ref?: string | null
          source_type?: string | null
          storage_path?: string | null
          title: string
          updated_at?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          document_type?: string | null
          id?: string
          metadata?: Json
          mime_type?: string | null
          raw_text?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          source_ref?: string | null
          source_type?: string | null
          storage_path?: string | null
          title?: string
          updated_at?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      kb_entity_links: {
        Row: {
          confidence: number | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json
          relationship_type: string | null
          source_id: string
          source_table: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json
          relationship_type?: string | null
          source_id: string
          source_table: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json
          relationship_type?: string | null
          source_id?: string
          source_table?: string
        }
        Relationships: []
      }
      kb_external_accounts: {
        Row: {
          account_label: string | null
          auth_status: string
          created_at: string
          external_account_id: string | null
          id: string
          metadata: Json
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_label?: string | null
          auth_status?: string
          created_at?: string
          external_account_id?: string | null
          id?: string
          metadata?: Json
          provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_label?: string | null
          auth_status?: string
          created_at?: string
          external_account_id?: string | null
          id?: string
          metadata?: Json
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      kb_external_object_links: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          external_object_id: string
          external_object_type: string | null
          external_url: string | null
          id: string
          last_synced_at: string | null
          metadata: Json
          provider: string
          sync_status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          external_object_id: string
          external_object_type?: string | null
          external_url?: string | null
          id?: string
          last_synced_at?: string | null
          metadata?: Json
          provider: string
          sync_status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          external_object_id?: string
          external_object_type?: string | null
          external_url?: string | null
          id?: string
          last_synced_at?: string | null
          metadata?: Json
          provider?: string
          sync_status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      kb_notes: {
        Row: {
          body: string
          created_at: string
          created_by_agent: boolean
          id: string
          metadata: Json
          note_type: string | null
          related_entity_id: string | null
          related_entity_type: string | null
          source_ref: string | null
          source_type: string | null
          title: string | null
          updated_at: string
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          created_by_agent?: boolean
          id?: string
          metadata?: Json
          note_type?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          source_ref?: string | null
          source_type?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          created_by_agent?: boolean
          id?: string
          metadata?: Json
          note_type?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          source_ref?: string | null
          source_type?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      kb_saved_queries: {
        Row: {
          created_at: string
          filters: Json
          id: string
          metadata: Json
          name: string
          query_text: string
          updated_at: string
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          metadata?: Json
          name: string
          query_text: string
          updated_at?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          metadata?: Json
          name?: string
          query_text?: string
          updated_at?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      kb_summary_cards: {
        Row: {
          card_type: string
          confidence: number | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json
          source_id: string | null
          source_table: string | null
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          card_type: string
          confidence?: number | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json
          source_id?: string | null
          source_table?: string | null
          summary: string
          title: string
          updated_at?: string
        }
        Update: {
          card_type?: string
          confidence?: number | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json
          source_id?: string | null
          source_table?: string | null
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      kb_sync_job_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          request_payload: Json
          response_payload: Json
          started_at: string
          status: string
          sync_job_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          request_payload?: Json
          response_payload?: Json
          started_at?: string
          status: string
          sync_job_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          request_payload?: Json
          response_payload?: Json
          started_at?: string
          status?: string
          sync_job_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kb_sync_job_runs_sync_job_id_fkey"
            columns: ["sync_job_id"]
            isOneToOne: false
            referencedRelation: "kb_sync_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_sync_jobs: {
        Row: {
          created_at: string
          id: string
          initiated_by_user_id: string | null
          job_type: string
          metadata: Json
          provider: string | null
          related_entity_id: string | null
          related_entity_type: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          initiated_by_user_id?: string | null
          job_type: string
          metadata?: Json
          provider?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          initiated_by_user_id?: string | null
          job_type?: string
          metadata?: Json
          provider?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      match_decisions: {
        Row: {
          candidateIds: string[] | null
          confidenceScore: number
          createdAt: string | null
          decisionType: string
          entityType: string
          id: string
          matchRuleUsed: string
          metadata: Json | null
          organizationId: string | null
          personId: string | null
          resolverVersion: string
          selectedId: string | null
        }
        Insert: {
          candidateIds?: string[] | null
          confidenceScore: number
          createdAt?: string | null
          decisionType: string
          entityType: string
          id?: string
          matchRuleUsed: string
          metadata?: Json | null
          organizationId?: string | null
          personId?: string | null
          resolverVersion: string
          selectedId?: string | null
        }
        Update: {
          candidateIds?: string[] | null
          confidenceScore?: number
          createdAt?: string | null
          decisionType?: string
          entityType?: string
          id?: string
          matchRuleUsed?: string
          metadata?: Json | null
          organizationId?: string | null
          personId?: string | null
          resolverVersion?: string
          selectedId?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_decisions_organizationId_fkey"
            columns: ["organizationId"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_decisions_organizationId_fkey"
            columns: ["organizationId"]
            isOneToOne: false
            referencedRelation: "v_org_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_decisions_organizationId_fkey"
            columns: ["organizationId"]
            isOneToOne: false
            referencedRelation: "v_person_signals"
            referencedColumns: ["primary_org_id"]
          },
          {
            foreignKeyName: "match_decisions_personId_fkey"
            columns: ["personId"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_decisions_personId_fkey"
            columns: ["personId"]
            isOneToOne: false
            referencedRelation: "v_cross_company_operators"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "match_decisions_personId_fkey"
            columns: ["personId"]
            isOneToOne: false
            referencedRelation: "v_person_signals"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "match_decisions_personId_fkey"
            columns: ["personId"]
            isOneToOne: false
            referencedRelation: "v_repeat_founders"
            referencedColumns: ["person_id"]
          },
        ]
      }
      message_participants: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          email_message_id: string
          id: string
          is_self: boolean
          owner_context_id: string
          person_id: string | null
          role: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          email_message_id: string
          id?: string
          is_self?: boolean
          owner_context_id: string
          person_id?: string | null
          role?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          email_message_id?: string
          id?: string
          is_self?: boolean
          owner_context_id?: string
          person_id?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_participants_email_message_id_fkey"
            columns: ["email_message_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_participants_owner_context_id_fkey"
            columns: ["owner_context_id"]
            isOneToOne: false
            referencedRelation: "owner_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_participants_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_participants_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_cross_company_operators"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "message_participants_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_person_signals"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "message_participants_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "v_repeat_founders"
            referencedColumns: ["person_id"]
          },
        ]
      }
      operator_companies: {
        Row: {
          active_job_count: number | null
          apollo_org_id: string | null
          business_model: string | null
          created_at: string
          crunchbase_url: string | null
          data_source: string | null
          deleted_at: string | null
          description: string | null
          domain: string | null
          funding_status: string | null
          headcount: number | null
          headcount_band:
            | Database["public"]["Enums"]["CompanyHeadcountBand"]
            | null
          hq_city: string | null
          hq_country: string | null
          hq_state: string | null
          id: string
          investors: string[]
          last_enriched_at: string | null
          last_job_posted_at: string | null
          latest_activity_at: string | null
          latest_funding_date: string | null
          linkedin_url: string | null
          logo_url: string | null
          name: string
          pdl_company_id: string | null
          sector: Database["public"]["Enums"]["sector_scope_enum"] | null
          sectors: Database["public"]["Enums"]["sector_scope_enum"][]
          stage: Database["public"]["Enums"]["OperatorCompanyStage"]
          total_raised_usd: number | null
          updated_at: string
          website_url: string | null
          x_url: string | null
        }
        Insert: {
          active_job_count?: number | null
          apollo_org_id?: string | null
          business_model?: string | null
          created_at?: string
          crunchbase_url?: string | null
          data_source?: string | null
          deleted_at?: string | null
          description?: string | null
          domain?: string | null
          funding_status?: string | null
          headcount?: number | null
          headcount_band?:
            | Database["public"]["Enums"]["CompanyHeadcountBand"]
            | null
          hq_city?: string | null
          hq_country?: string | null
          hq_state?: string | null
          id: string
          investors?: string[]
          last_enriched_at?: string | null
          last_job_posted_at?: string | null
          latest_activity_at?: string | null
          latest_funding_date?: string | null
          linkedin_url?: string | null
          logo_url?: string | null
          name: string
          pdl_company_id?: string | null
          sector?: Database["public"]["Enums"]["sector_scope_enum"] | null
          sectors?: Database["public"]["Enums"]["sector_scope_enum"][]
          stage?: Database["public"]["Enums"]["OperatorCompanyStage"]
          total_raised_usd?: number | null
          updated_at?: string
          website_url?: string | null
          x_url?: string | null
        }
        Update: {
          active_job_count?: number | null
          apollo_org_id?: string | null
          business_model?: string | null
          created_at?: string
          crunchbase_url?: string | null
          data_source?: string | null
          deleted_at?: string | null
          description?: string | null
          domain?: string | null
          funding_status?: string | null
          headcount?: number | null
          headcount_band?:
            | Database["public"]["Enums"]["CompanyHeadcountBand"]
            | null
          hq_city?: string | null
          hq_country?: string | null
          hq_state?: string | null
          id?: string
          investors?: string[]
          last_enriched_at?: string | null
          last_job_posted_at?: string | null
          latest_activity_at?: string | null
          latest_funding_date?: string | null
          linkedin_url?: string | null
          logo_url?: string | null
          name?: string
          pdl_company_id?: string | null
          sector?: Database["public"]["Enums"]["sector_scope_enum"] | null
          sectors?: Database["public"]["Enums"]["sector_scope_enum"][]
          stage?: Database["public"]["Enums"]["OperatorCompanyStage"]
          total_raised_usd?: number | null
          updated_at?: string
          website_url?: string | null
          x_url?: string | null
        }
        Relationships: []
      }
      operator_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          city: string | null
          completeness_score: number
          country: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          engagement_type: string | null
          enrichment_status: string
          expertise: string[] | null
          first_name: string | null
          full_name: string
          id: string
          is_available: boolean | null
          last_enriched_at: string | null
          last_name: string | null
          linkedin_url: string | null
          people_id: string | null
          prior_companies: string[] | null
          ready_for_live: boolean
          sector_focus: string[] | null
          source: string | null
          source_id: string | null
          stage_focus: string | null
          state: string | null
          title: string | null
          updated_at: string
          website_url: string | null
          x_url: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          completeness_score?: number
          country?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          engagement_type?: string | null
          enrichment_status?: string
          expertise?: string[] | null
          first_name?: string | null
          full_name: string
          id?: string
          is_available?: boolean | null
          last_enriched_at?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          people_id?: string | null
          prior_companies?: string[] | null
          ready_for_live?: boolean
          sector_focus?: string[] | null
          source?: string | null
          source_id?: string | null
          stage_focus?: string | null
          state?: string | null
          title?: string | null
          updated_at?: string
          website_url?: string | null
          x_url?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          completeness_score?: number
          country?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          engagement_type?: string | null
          enrichment_status?: string
          expertise?: string[] | null
          first_name?: string | null
          full_name?: string
          id?: string
          is_available?: boolean | null
          last_enriched_at?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          people_id?: string | null
          prior_companies?: string[] | null
          ready_for_live?: boolean
          sector_focus?: string[] | null
          source?: string | null
          source_id?: string | null
          stage_focus?: string | null
          state?: string | null
          title?: string | null
          updated_at?: string
          website_url?: string | null
          x_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operator_profiles_people_id_fkey"
            columns: ["people_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operator_profiles_people_id_fkey"
            columns: ["people_id"]
            isOneToOne: false
            referencedRelation: "v_cross_company_operators"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "operator_profiles_people_id_fkey"
            columns: ["people_id"]
            isOneToOne: false
            referencedRelation: "v_person_signals"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "operator_profiles_people_id_fkey"
            columns: ["people_id"]
            isOneToOne: false
            referencedRelation: "v_repeat_founders"
            referencedColumns: ["person_id"]
          },
        ]
      }
      operator_signals: {
        Row: {
          company_id: string | null
          confidence_score: number | null
          created_at: string
          deleted_at: string | null
          description: string | null
          entity_type: string
          id: string
          metadata: Json | null
          occurred_at: string | null
          person_id: string | null
          signal_type: Database["public"]["Enums"]["OperatorSignalType"]
          source: string
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          company_id?: string | null
          confidence_score?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          entity_type: string
          id: string
          metadata?: Json | null
          occurred_at?: string | null
          person_id?: string | null
          signal_type: Database["public"]["Enums"]["OperatorSignalType"]
          source: string
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          company_id?: string | null
          confidence_score?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          occurred_at?: string | null
          person_id?: string | null
          signal_type?: Database["public"]["Enums"]["OperatorSignalType"]
          source?: string
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operator_signals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "operator_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          canonicalName: string
          city: string | null
          completeness_score: number
          country: string | null
          createdAt: string | null
          dedupeKey: string
          description: string | null
          domain: string | null
          employeeCount: number | null
          enrichment_status: string
          foundedYear: number | null
          id: string
          industry: string | null
          isYcBacked: boolean | null
          last_enriched_at: string | null
          linkedinUrl: string | null
          location: string | null
          logoUrl: string | null
          ready_for_live: boolean
          sourceIds: string[] | null
          stageProxy: string | null
          state: string | null
          status: string | null
          tags: string[] | null
          updatedAt: string | null
          website: string | null
          ycBatch: string | null
          ycId: string | null
          ycRawJson: Json | null
        }
        Insert: {
          canonicalName: string
          city?: string | null
          completeness_score?: number
          country?: string | null
          createdAt?: string | null
          dedupeKey: string
          description?: string | null
          domain?: string | null
          employeeCount?: number | null
          enrichment_status?: string
          foundedYear?: number | null
          id?: string
          industry?: string | null
          isYcBacked?: boolean | null
          last_enriched_at?: string | null
          linkedinUrl?: string | null
          location?: string | null
          logoUrl?: string | null
          ready_for_live?: boolean
          sourceIds?: string[] | null
          stageProxy?: string | null
          state?: string | null
          status?: string | null
          tags?: string[] | null
          updatedAt?: string | null
          website?: string | null
          ycBatch?: string | null
          ycId?: string | null
          ycRawJson?: Json | null
        }
        Update: {
          canonicalName?: string
          city?: string | null
          completeness_score?: number
          country?: string | null
          createdAt?: string | null
          dedupeKey?: string
          description?: string | null
          domain?: string | null
          employeeCount?: number | null
          enrichment_status?: string
          foundedYear?: number | null
          id?: string
          industry?: string | null
          isYcBacked?: boolean | null
          last_enriched_at?: string | null
          linkedinUrl?: string | null
          location?: string | null
          logoUrl?: string | null
          ready_for_live?: boolean
          sourceIds?: string[] | null
          stageProxy?: string | null
          state?: string | null
          status?: string | null
          tags?: string[] | null
          updatedAt?: string | null
          website?: string | null
          ycBatch?: string | null
          ycId?: string | null
          ycRawJson?: Json | null
        }
        Relationships: []
      }
      owner_contexts: {
        Row: {
          created_at: string
          id: string
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "owner_contexts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_contexts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_investors: {
        Row: {
          amount: number
          company_analysis_id: string | null
          created_at: string
          entity_type: string
          id: string
          instrument: string
          investor_name: string
          round_name: string | null
          source_date: string | null
          source_detail: string | null
          source_type: string
          status: string
          user_id: string
        }
        Insert: {
          amount?: number
          company_analysis_id?: string | null
          created_at?: string
          entity_type?: string
          id?: string
          instrument?: string
          investor_name: string
          round_name?: string | null
          source_date?: string | null
          source_detail?: string | null
          source_type?: string
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          company_analysis_id?: string | null
          created_at?: string
          entity_type?: string
          id?: string
          instrument?: string
          investor_name?: string
          round_name?: string | null
          source_date?: string | null
          source_detail?: string | null
          source_type?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_investors_company_analysis_id_fkey"
            columns: ["company_analysis_id"]
            isOneToOne: false
            referencedRelation: "company_analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          avatarUrl: string | null
          bio: string | null
          canonicalName: string
          city: string | null
          completeness_score: number
          country: string | null
          createdAt: string | null
          dedupeKey: string
          email: string | null
          enrichment_status: string
          expertise: string[] | null
          firstName: string | null
          githubUrl: string | null
          id: string
          last_enriched_at: string | null
          lastName: string | null
          linkedinUrl: string | null
          location: string | null
          ready_for_live: boolean
          sourceIds: string[] | null
          twitterUrl: string | null
          updatedAt: string | null
          ycId: string | null
        }
        Insert: {
          avatarUrl?: string | null
          bio?: string | null
          canonicalName: string
          city?: string | null
          completeness_score?: number
          country?: string | null
          createdAt?: string | null
          dedupeKey: string
          email?: string | null
          enrichment_status?: string
          expertise?: string[] | null
          firstName?: string | null
          githubUrl?: string | null
          id?: string
          last_enriched_at?: string | null
          lastName?: string | null
          linkedinUrl?: string | null
          location?: string | null
          ready_for_live?: boolean
          sourceIds?: string[] | null
          twitterUrl?: string | null
          updatedAt?: string | null
          ycId?: string | null
        }
        Update: {
          avatarUrl?: string | null
          bio?: string | null
          canonicalName?: string
          city?: string | null
          completeness_score?: number
          country?: string | null
          createdAt?: string | null
          dedupeKey?: string
          email?: string | null
          enrichment_status?: string
          expertise?: string[] | null
          firstName?: string | null
          githubUrl?: string | null
          id?: string
          last_enriched_at?: string | null
          lastName?: string | null
          linkedinUrl?: string | null
          location?: string | null
          ready_for_live?: boolean
          sourceIds?: string[] | null
          twitterUrl?: string | null
          updatedAt?: string | null
          ycId?: string | null
        }
        Relationships: []
      }
      portfolio_companies: {
        Row: {
          company_name: string
          company_url: string | null
          created_at: string
          domain: string | null
          id: string
          last_funding_date: string | null
          last_verified_at: string
          linkedin_url: string | null
          location: string | null
          normalized_name: string
          sector: string | null
          slug: string | null
          total_raised_usd: number | null
          updated_at: string
        }
        Insert: {
          company_name: string
          company_url?: string | null
          created_at?: string
          domain?: string | null
          id?: string
          last_funding_date?: string | null
          last_verified_at?: string
          linkedin_url?: string | null
          location?: string | null
          normalized_name: string
          sector?: string | null
          slug?: string | null
          total_raised_usd?: number | null
          updated_at?: string
        }
        Update: {
          company_name?: string
          company_url?: string | null
          created_at?: string
          domain?: string | null
          id?: string
          last_funding_date?: string | null
          last_verified_at?: string
          linkedin_url?: string | null
          location?: string | null
          normalized_name?: string
          sector?: string | null
          slug?: string | null
          total_raised_usd?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      portfolio_company_aliases: {
        Row: {
          alias_value: string
          confidence: number | null
          created_at: string
          id: string
          normalized_value: string
          portfolio_company_id: string
          source: string | null
        }
        Insert: {
          alias_value: string
          confidence?: number | null
          created_at?: string
          id?: string
          normalized_value: string
          portfolio_company_id: string
          source?: string | null
        }
        Update: {
          alias_value?: string
          confidence?: number | null
          created_at?: string
          id?: string
          normalized_value?: string
          portfolio_company_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_company_aliases_portfolio_company_id_fkey"
            columns: ["portfolio_company_id"]
            isOneToOne: false
            referencedRelation: "portfolio_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_investments: {
        Row: {
          check_size_usd: number | null
          confidence: number | null
          created_at: string
          firm_id: string
          id: string
          investment_date: string | null
          led_round: boolean | null
          portfolio_company_id: string
          round_type: string | null
          source_url: string | null
          updated_at: string
        }
        Insert: {
          check_size_usd?: number | null
          confidence?: number | null
          created_at?: string
          firm_id: string
          id?: string
          investment_date?: string | null
          led_round?: boolean | null
          portfolio_company_id: string
          round_type?: string | null
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          check_size_usd?: number | null
          confidence?: number | null
          created_at?: string
          firm_id?: string
          id?: string
          investment_date?: string | null
          led_round?: boolean | null
          portfolio_company_id?: string
          round_type?: string | null
          source_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_investments_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_investments_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "investor_directory_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_investments_portfolio_company_id_fkey"
            columns: ["portfolio_company_id"]
            isOneToOne: false
            referencedRelation: "portfolio_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_source_evidence: {
        Row: {
          announced_date: string | null
          category: string
          created_at: string
          discovered_at: string
          firm_id: string | null
          id: string
          investment_date: string | null
          investment_id: string | null
          investment_stage: string | null
          investment_status: string | null
          is_notable: boolean | null
          normalized_portfolio_company_name: string | null
          portfolio_company_id: string | null
          portfolio_company_linkedin: string | null
          portfolio_company_name: string
          portfolio_company_slug: string | null
          portfolio_company_website: string | null
          raw_payload: Json | null
          source_confidence: number
          source_firm_name: string | null
          source_name: string | null
          source_type: string
          source_url: string | null
        }
        Insert: {
          announced_date?: string | null
          category?: string
          created_at?: string
          discovered_at?: string
          firm_id?: string | null
          id?: string
          investment_date?: string | null
          investment_id?: string | null
          investment_stage?: string | null
          investment_status?: string | null
          is_notable?: boolean | null
          normalized_portfolio_company_name?: string | null
          portfolio_company_id?: string | null
          portfolio_company_linkedin?: string | null
          portfolio_company_name: string
          portfolio_company_slug?: string | null
          portfolio_company_website?: string | null
          raw_payload?: Json | null
          source_confidence?: number
          source_firm_name?: string | null
          source_name?: string | null
          source_type: string
          source_url?: string | null
        }
        Update: {
          announced_date?: string | null
          category?: string
          created_at?: string
          discovered_at?: string
          firm_id?: string | null
          id?: string
          investment_date?: string | null
          investment_id?: string | null
          investment_stage?: string | null
          investment_status?: string | null
          is_notable?: boolean | null
          normalized_portfolio_company_name?: string | null
          portfolio_company_id?: string | null
          portfolio_company_linkedin?: string | null
          portfolio_company_name?: string
          portfolio_company_slug?: string | null
          portfolio_company_website?: string | null
          raw_payload?: Json | null
          source_confidence?: number
          source_firm_name?: string | null
          source_name?: string | null
          source_type?: string
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_source_evidence_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_source_evidence_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "investor_directory_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_source_evidence_investment_id_fkey"
            columns: ["investment_id"]
            isOneToOne: false
            referencedRelation: "portfolio_investments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_source_evidence_portfolio_company_id_fkey"
            columns: ["portfolio_company_id"]
            isOneToOne: false
            referencedRelation: "portfolio_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          company_id: string | null
          created_at: string
          full_name: string
          has_completed_onboarding: boolean
          has_seen_settings_tour: boolean
          id: string
          is_public: boolean
          linkedin_url: string | null
          location: string | null
          resume_url: string | null
          title: string | null
          twitter_url: string | null
          updated_at: string
          user_id: string
          user_type: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          company_id?: string | null
          created_at?: string
          full_name?: string
          has_completed_onboarding?: boolean
          has_seen_settings_tour?: boolean
          id?: string
          is_public?: boolean
          linkedin_url?: string | null
          location?: string | null
          resume_url?: string | null
          title?: string | null
          twitter_url?: string | null
          updated_at?: string
          user_id: string
          user_type?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          company_id?: string | null
          created_at?: string
          full_name?: string
          has_completed_onboarding?: boolean
          has_seen_settings_tour?: boolean
          id?: string
          is_public?: boolean
          linkedin_url?: string | null
          location?: string | null
          resume_url?: string | null
          title?: string | null
          twitter_url?: string | null
          updated_at?: string
          user_id?: string
          user_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_intelligence_items: {
        Row: {
          author: string | null
          body: string | null
          content_hash: string
          created_at: string
          excerpt: string | null
          fetched_at: string
          id: string
          metadata: Json
          processing_status: string
          published_at: string | null
          source_id: string
          source_url: string | null
          title: string
        }
        Insert: {
          author?: string | null
          body?: string | null
          content_hash: string
          created_at?: string
          excerpt?: string | null
          fetched_at?: string
          id?: string
          metadata?: Json
          processing_status?: string
          published_at?: string | null
          source_id: string
          source_url?: string | null
          title: string
        }
        Update: {
          author?: string | null
          body?: string | null
          content_hash?: string
          created_at?: string
          excerpt?: string | null
          fetched_at?: string
          id?: string
          metadata?: Json
          processing_status?: string
          published_at?: string | null
          source_id?: string
          source_url?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_intelligence_items_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "intelligence_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendations: {
        Row: {
          created_at: string
          dedup_key: string
          expires_at: string | null
          id: string
          kind: string
          owner_context_id: string
          rationale: Json
          score: number
          snoozed_until: string | null
          state: string
          subject_organization_id: string | null
          subject_person_id: string | null
          updated_at: string
          via_person_id: string | null
        }
        Insert: {
          created_at?: string
          dedup_key: string
          expires_at?: string | null
          id?: string
          kind: string
          owner_context_id: string
          rationale?: Json
          score: number
          snoozed_until?: string | null
          state?: string
          subject_organization_id?: string | null
          subject_person_id?: string | null
          updated_at?: string
          via_person_id?: string | null
        }
        Update: {
          created_at?: string
          dedup_key?: string
          expires_at?: string | null
          id?: string
          kind?: string
          owner_context_id?: string
          rationale?: Json
          score?: number
          snoozed_until?: string | null
          state?: string
          subject_organization_id?: string | null
          subject_person_id?: string | null
          updated_at?: string
          via_person_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recommendations_owner_context_id_fkey"
            columns: ["owner_context_id"]
            isOneToOne: false
            referencedRelation: "owner_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendations_subject_organization_id_fkey"
            columns: ["subject_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendations_subject_organization_id_fkey"
            columns: ["subject_organization_id"]
            isOneToOne: false
            referencedRelation: "v_org_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendations_subject_organization_id_fkey"
            columns: ["subject_organization_id"]
            isOneToOne: false
            referencedRelation: "v_person_signals"
            referencedColumns: ["primary_org_id"]
          },
          {
            foreignKeyName: "recommendations_subject_person_id_fkey"
            columns: ["subject_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendations_subject_person_id_fkey"
            columns: ["subject_person_id"]
            isOneToOne: false
            referencedRelation: "v_cross_company_operators"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "recommendations_subject_person_id_fkey"
            columns: ["subject_person_id"]
            isOneToOne: false
            referencedRelation: "v_person_signals"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "recommendations_subject_person_id_fkey"
            columns: ["subject_person_id"]
            isOneToOne: false
            referencedRelation: "v_repeat_founders"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "recommendations_via_person_id_fkey"
            columns: ["via_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendations_via_person_id_fkey"
            columns: ["via_person_id"]
            isOneToOne: false
            referencedRelation: "v_cross_company_operators"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "recommendations_via_person_id_fkey"
            columns: ["via_person_id"]
            isOneToOne: false
            referencedRelation: "v_person_signals"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "recommendations_via_person_id_fkey"
            columns: ["via_person_id"]
            isOneToOne: false
            referencedRelation: "v_repeat_founders"
            referencedColumns: ["person_id"]
          },
        ]
      }
      relationship_contexts: {
        Row: {
          created_at: string
          crm_touch_count: number
          edge_id: string
          email_received_count: number
          email_sent_count: number
          id: string
          last_linkedin_connection_at: string | null
          meeting_as_attendee_count: number
          meeting_as_organizer_count: number
          owner_context_id: string
          raw_strength_components: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          crm_touch_count?: number
          edge_id: string
          email_received_count?: number
          email_sent_count?: number
          id?: string
          last_linkedin_connection_at?: string | null
          meeting_as_attendee_count?: number
          meeting_as_organizer_count?: number
          owner_context_id: string
          raw_strength_components?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          crm_touch_count?: number
          edge_id?: string
          email_received_count?: number
          email_sent_count?: number
          id?: string
          last_linkedin_connection_at?: string | null
          meeting_as_attendee_count?: number
          meeting_as_organizer_count?: number
          owner_context_id?: string
          raw_strength_components?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "relationship_contexts_edge_id_fkey"
            columns: ["edge_id"]
            isOneToOne: false
            referencedRelation: "relationship_edges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationship_contexts_owner_context_id_fkey"
            columns: ["owner_context_id"]
            isOneToOne: false
            referencedRelation: "owner_contexts"
            referencedColumns: ["id"]
          },
        ]
      }
      relationship_edges: {
        Row: {
          created_at: string
          crm_touch_count: number
          email_count: number
          first_interaction_at: string | null
          id: string
          last_interaction_at: string | null
          meeting_count: number
          owner_context_id: string
          person_a_id: string
          person_b_id: string
          strength: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          crm_touch_count?: number
          email_count?: number
          first_interaction_at?: string | null
          id?: string
          last_interaction_at?: string | null
          meeting_count?: number
          owner_context_id: string
          person_a_id: string
          person_b_id: string
          strength?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          crm_touch_count?: number
          email_count?: number
          first_interaction_at?: string | null
          id?: string
          last_interaction_at?: string | null
          meeting_count?: number
          owner_context_id?: string
          person_a_id?: string
          person_b_id?: string
          strength?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "relationship_edges_owner_context_id_fkey"
            columns: ["owner_context_id"]
            isOneToOne: false
            referencedRelation: "owner_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationship_edges_person_a_id_fkey"
            columns: ["person_a_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationship_edges_person_a_id_fkey"
            columns: ["person_a_id"]
            isOneToOne: false
            referencedRelation: "v_cross_company_operators"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "relationship_edges_person_a_id_fkey"
            columns: ["person_a_id"]
            isOneToOne: false
            referencedRelation: "v_person_signals"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "relationship_edges_person_a_id_fkey"
            columns: ["person_a_id"]
            isOneToOne: false
            referencedRelation: "v_repeat_founders"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "relationship_edges_person_b_id_fkey"
            columns: ["person_b_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationship_edges_person_b_id_fkey"
            columns: ["person_b_id"]
            isOneToOne: false
            referencedRelation: "v_cross_company_operators"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "relationship_edges_person_b_id_fkey"
            columns: ["person_b_id"]
            isOneToOne: false
            referencedRelation: "v_person_signals"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "relationship_edges_person_b_id_fkey"
            columns: ["person_b_id"]
            isOneToOne: false
            referencedRelation: "v_repeat_founders"
            referencedColumns: ["person_id"]
          },
        ]
      }
      reputation_logs: {
        Row: {
          calculated_at: string
          community_rating: number | null
          firm_id: string
          id: string
          news_sentiment_score: number | null
          reputation_score: number
          social_sentiment_score: number | null
          source_details: Json | null
          weight_community: number
          weight_news: number
          weight_social: number
        }
        Insert: {
          calculated_at?: string
          community_rating?: number | null
          firm_id: string
          id?: string
          news_sentiment_score?: number | null
          reputation_score: number
          social_sentiment_score?: number | null
          source_details?: Json | null
          weight_community?: number
          weight_news?: number
          weight_social?: number
        }
        Update: {
          calculated_at?: string
          community_rating?: number | null
          firm_id?: string
          id?: string
          news_sentiment_score?: number | null
          reputation_score?: number
          social_sentiment_score?: number | null
          source_details?: Json | null
          weight_community?: number
          weight_news?: number
          weight_social?: number
        }
        Relationships: [
          {
            foreignKeyName: "reputation_logs_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reputation_logs_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "investor_directory_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          createdAt: string | null
          endDate: string | null
          functionType: string | null
          id: string
          isCurrent: boolean | null
          organizationId: string
          personId: string
          roleType: string | null
          startDate: string | null
          title: string | null
          updatedAt: string | null
        }
        Insert: {
          createdAt?: string | null
          endDate?: string | null
          functionType?: string | null
          id?: string
          isCurrent?: boolean | null
          organizationId: string
          personId: string
          roleType?: string | null
          startDate?: string | null
          title?: string | null
          updatedAt?: string | null
        }
        Update: {
          createdAt?: string | null
          endDate?: string | null
          functionType?: string | null
          id?: string
          isCurrent?: boolean | null
          organizationId?: string
          personId?: string
          roleType?: string | null
          startDate?: string | null
          title?: string | null
          updatedAt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roles_organizationId_fkey"
            columns: ["organizationId"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roles_organizationId_fkey"
            columns: ["organizationId"]
            isOneToOne: false
            referencedRelation: "v_org_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roles_organizationId_fkey"
            columns: ["organizationId"]
            isOneToOne: false
            referencedRelation: "v_person_signals"
            referencedColumns: ["primary_org_id"]
          },
          {
            foreignKeyName: "roles_personId_fkey"
            columns: ["personId"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roles_personId_fkey"
            columns: ["personId"]
            isOneToOne: false
            referencedRelation: "v_cross_company_operators"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "roles_personId_fkey"
            columns: ["personId"]
            isOneToOne: false
            referencedRelation: "v_person_signals"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "roles_personId_fkey"
            columns: ["personId"]
            isOneToOne: false
            referencedRelation: "v_repeat_founders"
            referencedColumns: ["person_id"]
          },
        ]
      }
      source_articles: {
        Row: {
          article_url: string
          author: string | null
          canonical_url: string
          content_hash: string | null
          created_at: string
          fetch_status: Database["public"]["Enums"]["FundingArticleFetchStatus"]
          first_seen_run_id: string | null
          html_fetched_at: string | null
          id: string
          last_seen_run_id: string | null
          listing_url: string | null
          published_at: string | null
          raw_excerpt: string | null
          raw_text: string | null
          source_key: Database["public"]["Enums"]["FundingIngestSourceKey"]
          title: string
          updated_at: string
        }
        Insert: {
          article_url: string
          author?: string | null
          canonical_url: string
          content_hash?: string | null
          created_at?: string
          fetch_status?: Database["public"]["Enums"]["FundingArticleFetchStatus"]
          first_seen_run_id?: string | null
          html_fetched_at?: string | null
          id: string
          last_seen_run_id?: string | null
          listing_url?: string | null
          published_at?: string | null
          raw_excerpt?: string | null
          raw_text?: string | null
          source_key: Database["public"]["Enums"]["FundingIngestSourceKey"]
          title: string
          updated_at: string
        }
        Update: {
          article_url?: string
          author?: string | null
          canonical_url?: string
          content_hash?: string | null
          created_at?: string
          fetch_status?: Database["public"]["Enums"]["FundingArticleFetchStatus"]
          first_seen_run_id?: string | null
          html_fetched_at?: string | null
          id?: string
          last_seen_run_id?: string | null
          listing_url?: string | null
          published_at?: string | null
          raw_excerpt?: string | null
          raw_text?: string | null
          source_key?: Database["public"]["Enums"]["FundingIngestSourceKey"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      source_records: {
        Row: {
          entityType: string
          fetchedAt: string | null
          id: string
          normalizedAt: string | null
          organizationId: string | null
          personId: string | null
          rawPayload: Json
          sourceAdapter: string
          sourceId: string | null
          sourceUrl: string
        }
        Insert: {
          entityType: string
          fetchedAt?: string | null
          id?: string
          normalizedAt?: string | null
          organizationId?: string | null
          personId?: string | null
          rawPayload: Json
          sourceAdapter: string
          sourceId?: string | null
          sourceUrl: string
        }
        Update: {
          entityType?: string
          fetchedAt?: string | null
          id?: string
          normalizedAt?: string | null
          organizationId?: string | null
          personId?: string | null
          rawPayload?: Json
          sourceAdapter?: string
          sourceId?: string | null
          sourceUrl?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_records_organizationId_fkey"
            columns: ["organizationId"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_records_organizationId_fkey"
            columns: ["organizationId"]
            isOneToOne: false
            referencedRelation: "v_org_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_records_organizationId_fkey"
            columns: ["organizationId"]
            isOneToOne: false
            referencedRelation: "v_person_signals"
            referencedColumns: ["primary_org_id"]
          },
          {
            foreignKeyName: "source_records_personId_fkey"
            columns: ["personId"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_records_personId_fkey"
            columns: ["personId"]
            isOneToOne: false
            referencedRelation: "v_cross_company_operators"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "source_records_personId_fkey"
            columns: ["personId"]
            isOneToOne: false
            referencedRelation: "v_person_signals"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "source_records_personId_fkey"
            columns: ["personId"]
            isOneToOne: false
            referencedRelation: "v_repeat_founders"
            referencedColumns: ["person_id"]
          },
        ]
      }
      startup_competitors: {
        Row: {
          competitor_id: string
          confidence: number | null
          created_at: string
          data_source: Database["public"]["Enums"]["StartupDataSource"] | null
          id: string
          relationship_type: string
          startup_id: string
        }
        Insert: {
          competitor_id: string
          confidence?: number | null
          created_at?: string
          data_source?: Database["public"]["Enums"]["StartupDataSource"] | null
          id: string
          relationship_type?: string
          startup_id: string
        }
        Update: {
          competitor_id?: string
          confidence?: number | null
          created_at?: string
          data_source?: Database["public"]["Enums"]["StartupDataSource"] | null
          id?: string
          relationship_type?: string
          startup_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "startup_competitors_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_competitors_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      startup_founders: {
        Row: {
          avatar_url: string | null
          confidence: number | null
          created_at: string
          data_source: Database["public"]["Enums"]["StartupDataSource"] | null
          domain_expertise: string[] | null
          education_highlight: string | null
          email: string | null
          founder_archetype:
            | Database["public"]["Enums"]["FounderArchetype"]
            | null
          full_name: string
          has_prior_exit: boolean
          id: string
          is_repeat_founder: boolean
          linkedin_url: string | null
          location: string | null
          operator_background: string | null
          operator_to_founder: boolean
          prior_companies: string[] | null
          prior_exits: string[] | null
          prior_outcome_summary: string | null
          professional_id: string | null
          role: string | null
          startup_id: string
          track_record_score: number | null
          updated_at: string
          x_url: string | null
        }
        Insert: {
          avatar_url?: string | null
          confidence?: number | null
          created_at?: string
          data_source?: Database["public"]["Enums"]["StartupDataSource"] | null
          domain_expertise?: string[] | null
          education_highlight?: string | null
          email?: string | null
          founder_archetype?:
            | Database["public"]["Enums"]["FounderArchetype"]
            | null
          full_name: string
          has_prior_exit?: boolean
          id: string
          is_repeat_founder?: boolean
          linkedin_url?: string | null
          location?: string | null
          operator_background?: string | null
          operator_to_founder?: boolean
          prior_companies?: string[] | null
          prior_exits?: string[] | null
          prior_outcome_summary?: string | null
          professional_id?: string | null
          role?: string | null
          startup_id: string
          track_record_score?: number | null
          updated_at?: string
          x_url?: string | null
        }
        Update: {
          avatar_url?: string | null
          confidence?: number | null
          created_at?: string
          data_source?: Database["public"]["Enums"]["StartupDataSource"] | null
          domain_expertise?: string[] | null
          education_highlight?: string | null
          email?: string | null
          founder_archetype?:
            | Database["public"]["Enums"]["FounderArchetype"]
            | null
          full_name?: string
          has_prior_exit?: boolean
          id?: string
          is_repeat_founder?: boolean
          linkedin_url?: string | null
          location?: string | null
          operator_background?: string | null
          operator_to_founder?: boolean
          prior_companies?: string[] | null
          prior_exits?: string[] | null
          prior_outcome_summary?: string | null
          professional_id?: string | null
          role?: string | null
          startup_id?: string
          track_record_score?: number | null
          updated_at?: string
          x_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "startup_founders_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      startup_funding_rounds: {
        Row: {
          amount_usd: number | null
          confidence: number | null
          created_at: string
          data_source: Database["public"]["Enums"]["StartupDataSource"] | null
          id: string
          investor_roles: Json | null
          lead_investors: string[] | null
          participants: string[] | null
          round_date: string | null
          round_name: string
          source_url: string | null
          startup_id: string
          updated_at: string
          valuation_usd: number | null
        }
        Insert: {
          amount_usd?: number | null
          confidence?: number | null
          created_at?: string
          data_source?: Database["public"]["Enums"]["StartupDataSource"] | null
          id: string
          investor_roles?: Json | null
          lead_investors?: string[] | null
          participants?: string[] | null
          round_date?: string | null
          round_name: string
          source_url?: string | null
          startup_id: string
          updated_at?: string
          valuation_usd?: number | null
        }
        Update: {
          amount_usd?: number | null
          confidence?: number | null
          created_at?: string
          data_source?: Database["public"]["Enums"]["StartupDataSource"] | null
          id?: string
          investor_roles?: Json | null
          lead_investors?: string[] | null
          participants?: string[] | null
          round_date?: string | null
          round_name?: string
          source_url?: string | null
          startup_id?: string
          updated_at?: string
          valuation_usd?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "startup_funding_rounds_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      startup_score_snapshots: {
        Row: {
          computed_at: string
          created_at: string
          explanation: string | null
          fundraising_readiness: number
          id: string
          investor_fit: number
          likelihood_to_raise: number
          model_version: string | null
          momentum: number
          quality_of_backers: number
          startup_id: string
        }
        Insert: {
          computed_at?: string
          created_at?: string
          explanation?: string | null
          fundraising_readiness?: number
          id: string
          investor_fit?: number
          likelihood_to_raise?: number
          model_version?: string | null
          momentum?: number
          quality_of_backers?: number
          startup_id: string
        }
        Update: {
          computed_at?: string
          created_at?: string
          explanation?: string | null
          fundraising_readiness?: number
          id?: string
          investor_fit?: number
          likelihood_to_raise?: number
          model_version?: string | null
          momentum?: number
          quality_of_backers?: number
          startup_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "startup_score_snapshots_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      startup_signals: {
        Row: {
          confidence_score: number | null
          created_at: string
          data_source: Database["public"]["Enums"]["StartupDataSource"] | null
          deleted_at: string | null
          description: string | null
          id: string
          metadata: Json | null
          signal_date: string | null
          signal_type: string
          startup_id: string
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          data_source?: Database["public"]["Enums"]["StartupDataSource"] | null
          deleted_at?: string | null
          description?: string | null
          id: string
          metadata?: Json | null
          signal_date?: string | null
          signal_type: string
          startup_id: string
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          data_source?: Database["public"]["Enums"]["StartupDataSource"] | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          signal_date?: string | null
          signal_type?: string
          startup_id?: string
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "startup_signals_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      startups: {
        Row: {
          board_members: string[] | null
          business_model: Database["public"]["Enums"]["BusinessModel"] | null
          business_model_tags: string[] | null
          company_name: string
          company_url: string | null
          created_at: string
          crunchbase_url: string | null
          data_confidence: number | null
          data_sources:
            | Database["public"]["Enums"]["StartupDataSource"][]
            | null
          deleted_at: string | null
          description_long: string | null
          description_short: string | null
          domain: string | null
          external_ids: Json | null
          founded_year: number | null
          founding_date: string | null
          fundraising_readiness_score: number | null
          geo_footprint: string[] | null
          github_url: string | null
          headcount: number | null
          headcount_band:
            | Database["public"]["Enums"]["CompanyHeadcountBand"]
            | null
          headcount_growth_pct: number | null
          hiring_velocity: number | null
          hq_city: string | null
          hq_country: string | null
          hq_state: string | null
          icp_description: string | null
          id: string
          investor_fit_score: number | null
          investor_names: string[] | null
          last_funding_date: string | null
          last_round_date: string | null
          last_round_size_usd: number | null
          last_round_type: string | null
          last_verified_at: string
          lead_investor_names: string[] | null
          likelihood_to_raise_score: number | null
          linkedin_url: string | null
          location: string | null
          logo_url: string | null
          market_category: string | null
          market_subcategory: string | null
          momentum_score: number | null
          notable_customers: string[] | null
          primary_data_source:
            | Database["public"]["Enums"]["StartupDataSource"]
            | null
          quality_of_backers_score: number | null
          revenue_range: Database["public"]["Enums"]["RevenueRange"] | null
          secondary_sectors: string[] | null
          sector: Database["public"]["Enums"]["SectorFocus"] | null
          sectors: Database["public"]["Enums"]["SectorFocus"][] | null
          stage: Database["public"]["Enums"]["OperatorCompanyStage"]
          status: Database["public"]["Enums"]["StartupStatus"]
          target_customer: Database["public"]["Enums"]["TargetCustomer"] | null
          tech_stack: string[] | null
          total_raised_usd: number | null
          updated_at: string
          valuation_usd: number | null
          web_traffic_rank: number | null
          x_url: string | null
          yc_batch: string | null
          yc_slug: string | null
        }
        Insert: {
          board_members?: string[] | null
          business_model?: Database["public"]["Enums"]["BusinessModel"] | null
          business_model_tags?: string[] | null
          company_name: string
          company_url?: string | null
          created_at?: string
          crunchbase_url?: string | null
          data_confidence?: number | null
          data_sources?:
            | Database["public"]["Enums"]["StartupDataSource"][]
            | null
          deleted_at?: string | null
          description_long?: string | null
          description_short?: string | null
          domain?: string | null
          external_ids?: Json | null
          founded_year?: number | null
          founding_date?: string | null
          fundraising_readiness_score?: number | null
          geo_footprint?: string[] | null
          github_url?: string | null
          headcount?: number | null
          headcount_band?:
            | Database["public"]["Enums"]["CompanyHeadcountBand"]
            | null
          headcount_growth_pct?: number | null
          hiring_velocity?: number | null
          hq_city?: string | null
          hq_country?: string | null
          hq_state?: string | null
          icp_description?: string | null
          id: string
          investor_fit_score?: number | null
          investor_names?: string[] | null
          last_funding_date?: string | null
          last_round_date?: string | null
          last_round_size_usd?: number | null
          last_round_type?: string | null
          last_verified_at?: string
          lead_investor_names?: string[] | null
          likelihood_to_raise_score?: number | null
          linkedin_url?: string | null
          location?: string | null
          logo_url?: string | null
          market_category?: string | null
          market_subcategory?: string | null
          momentum_score?: number | null
          notable_customers?: string[] | null
          primary_data_source?:
            | Database["public"]["Enums"]["StartupDataSource"]
            | null
          quality_of_backers_score?: number | null
          revenue_range?: Database["public"]["Enums"]["RevenueRange"] | null
          secondary_sectors?: string[] | null
          sector?: Database["public"]["Enums"]["SectorFocus"] | null
          sectors?: Database["public"]["Enums"]["SectorFocus"][] | null
          stage?: Database["public"]["Enums"]["OperatorCompanyStage"]
          status?: Database["public"]["Enums"]["StartupStatus"]
          target_customer?: Database["public"]["Enums"]["TargetCustomer"] | null
          tech_stack?: string[] | null
          total_raised_usd?: number | null
          updated_at?: string
          valuation_usd?: number | null
          web_traffic_rank?: number | null
          x_url?: string | null
          yc_batch?: string | null
          yc_slug?: string | null
        }
        Update: {
          board_members?: string[] | null
          business_model?: Database["public"]["Enums"]["BusinessModel"] | null
          business_model_tags?: string[] | null
          company_name?: string
          company_url?: string | null
          created_at?: string
          crunchbase_url?: string | null
          data_confidence?: number | null
          data_sources?:
            | Database["public"]["Enums"]["StartupDataSource"][]
            | null
          deleted_at?: string | null
          description_long?: string | null
          description_short?: string | null
          domain?: string | null
          external_ids?: Json | null
          founded_year?: number | null
          founding_date?: string | null
          fundraising_readiness_score?: number | null
          geo_footprint?: string[] | null
          github_url?: string | null
          headcount?: number | null
          headcount_band?:
            | Database["public"]["Enums"]["CompanyHeadcountBand"]
            | null
          headcount_growth_pct?: number | null
          hiring_velocity?: number | null
          hq_city?: string | null
          hq_country?: string | null
          hq_state?: string | null
          icp_description?: string | null
          id?: string
          investor_fit_score?: number | null
          investor_names?: string[] | null
          last_funding_date?: string | null
          last_round_date?: string | null
          last_round_size_usd?: number | null
          last_round_type?: string | null
          last_verified_at?: string
          lead_investor_names?: string[] | null
          likelihood_to_raise_score?: number | null
          linkedin_url?: string | null
          location?: string | null
          logo_url?: string | null
          market_category?: string | null
          market_subcategory?: string | null
          momentum_score?: number | null
          notable_customers?: string[] | null
          primary_data_source?:
            | Database["public"]["Enums"]["StartupDataSource"]
            | null
          quality_of_backers_score?: number | null
          revenue_range?: Database["public"]["Enums"]["RevenueRange"] | null
          secondary_sectors?: string[] | null
          sector?: Database["public"]["Enums"]["SectorFocus"] | null
          sectors?: Database["public"]["Enums"]["SectorFocus"][] | null
          stage?: Database["public"]["Enums"]["OperatorCompanyStage"]
          status?: Database["public"]["Enums"]["StartupStatus"]
          target_customer?: Database["public"]["Enums"]["TargetCustomer"] | null
          tech_stack?: string[] | null
          total_raised_usd?: number | null
          updated_at?: string
          valuation_usd?: number | null
          web_traffic_rank?: number | null
          x_url?: string | null
          yc_batch?: string | null
          yc_slug?: string | null
        }
        Relationships: []
      }
      sync_runs: {
        Row: {
          completed_at: string | null
          connected_account_id: string
          error_message: string | null
          id: string
          metadata: Json
          records_fetched: number
          records_staged: number
          started_at: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          connected_account_id: string
          error_message?: string | null
          id?: string
          metadata?: Json
          records_fetched?: number
          records_staged?: number
          started_at?: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          connected_account_id?: string
          error_message?: string | null
          id?: string
          metadata?: Json
          records_fetched?: number
          records_staged?: number
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_runs_connected_account_id_fkey"
            columns: ["connected_account_id"]
            isOneToOne: false
            referencedRelation: "connected_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity: {
        Row: {
          api_calls_count: number
          created_at: string
          id: string
          last_active_at: string | null
          total_time_seconds: number
          updated_at: string
          user_id: string
        }
        Insert: {
          api_calls_count?: number
          created_at?: string
          id?: string
          last_active_at?: string | null
          total_time_seconds?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          api_calls_count?: number
          created_at?: string
          id?: string
          last_active_at?: string | null
          total_time_seconds?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_credits: {
        Row: {
          created_at: string
          credits_remaining: number
          id: string
          tier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits_remaining?: number
          id?: string
          tier?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits_remaining?: number
          id?: string
          tier?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          created_at: string
          id: string
          notification_settings: Json | null
          onboarding_data: Json | null
          privacy_settings: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notification_settings?: Json | null
          onboarding_data?: Json | null
          privacy_settings?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notification_settings?: Json | null
          onboarding_data?: Json | null
          privacy_settings?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          permission: Database["public"]["Enums"]["app_permission"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission?: Database["public"]["Enums"]["app_permission"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission?: Database["public"]["Enums"]["app_permission"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string
          id: string
          raw_user_meta: Json
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          raw_user_meta?: Json
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          raw_user_meta?: Json
          updated_at?: string
        }
        Relationships: []
      }
      vc_firms: {
        Row: {
          aum_band: Database["public"]["Enums"]["AumBand"] | null
          created_at: string
          description: string | null
          id: string
          is_popular: boolean | null
          is_recent: boolean | null
          is_trending: boolean | null
          last_external_sync: string | null
          name: string
          website: string | null
        }
        Insert: {
          aum_band?: Database["public"]["Enums"]["AumBand"] | null
          created_at?: string
          description?: string | null
          id?: string
          is_popular?: boolean | null
          is_recent?: boolean | null
          is_trending?: boolean | null
          last_external_sync?: string | null
          name: string
          website?: string | null
        }
        Update: {
          aum_band?: Database["public"]["Enums"]["AumBand"] | null
          created_at?: string
          description?: string | null
          id?: string
          is_popular?: boolean | null
          is_recent?: boolean | null
          is_trending?: boolean | null
          last_external_sync?: string | null
          name?: string
          website?: string | null
        }
        Relationships: []
      }
      vc_fund_people: {
        Row: {
          canonical_person_key: string | null
          confidence: number
          created_at: string
          firm_investor_id: string | null
          id: string
          role: string
          source: string | null
          source_url: string | null
          updated_at: string
          vc_fund_id: string
        }
        Insert: {
          canonical_person_key?: string | null
          confidence?: number
          created_at?: string
          firm_investor_id?: string | null
          id?: string
          role: string
          source?: string | null
          source_url?: string | null
          updated_at?: string
          vc_fund_id: string
        }
        Update: {
          canonical_person_key?: string | null
          confidence?: number
          created_at?: string
          firm_investor_id?: string | null
          id?: string
          role?: string
          source?: string | null
          source_url?: string | null
          updated_at?: string
          vc_fund_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vc_fund_people_firm_investor_id_fkey"
            columns: ["firm_investor_id"]
            isOneToOne: false
            referencedRelation: "firm_investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vc_fund_people_vc_fund_id_fkey"
            columns: ["vc_fund_id"]
            isOneToOne: false
            referencedRelation: "vc_funds"
            referencedColumns: ["id"]
          },
        ]
      }
      vc_fund_signals: {
        Row: {
          confidence: number
          created_at: string
          dedupe_key: string
          display_priority: number
          event_date: string
          firm_record_id: string
          headline: string
          id: string
          intelligence_event_id: string | null
          metadata: Json
          mirrored_to_intelligence_at: string | null
          signal_type: Database["public"]["Enums"]["vc_fund_signal_type_enum"]
          source_url: string | null
          summary: string | null
          vc_fund_id: string | null
        }
        Insert: {
          confidence?: number
          created_at?: string
          dedupe_key: string
          display_priority?: number
          event_date: string
          firm_record_id: string
          headline: string
          id?: string
          intelligence_event_id?: string | null
          metadata?: Json
          mirrored_to_intelligence_at?: string | null
          signal_type: Database["public"]["Enums"]["vc_fund_signal_type_enum"]
          source_url?: string | null
          summary?: string | null
          vc_fund_id?: string | null
        }
        Update: {
          confidence?: number
          created_at?: string
          dedupe_key?: string
          display_priority?: number
          event_date?: string
          firm_record_id?: string
          headline?: string
          id?: string
          intelligence_event_id?: string | null
          metadata?: Json
          mirrored_to_intelligence_at?: string | null
          signal_type?: Database["public"]["Enums"]["vc_fund_signal_type_enum"]
          source_url?: string | null
          summary?: string | null
          vc_fund_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vc_fund_signals_firm_record_id_fkey"
            columns: ["firm_record_id"]
            isOneToOne: false
            referencedRelation: "firm_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vc_fund_signals_firm_record_id_fkey"
            columns: ["firm_record_id"]
            isOneToOne: false
            referencedRelation: "investor_directory_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vc_fund_signals_intelligence_event_id_fkey"
            columns: ["intelligence_event_id"]
            isOneToOne: false
            referencedRelation: "intelligence_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vc_fund_signals_vc_fund_id_fkey"
            columns: ["vc_fund_id"]
            isOneToOne: false
            referencedRelation: "vc_funds"
            referencedColumns: ["id"]
          },
        ]
      }
      vc_fund_sources: {
        Row: {
          confidence: number
          content_hash: string | null
          created_at: string
          extracted_payload: Json
          id: string
          published_at: string | null
          publisher: string | null
          source_title: string | null
          source_type: string
          source_url: string | null
          vc_fund_id: string
        }
        Insert: {
          confidence?: number
          content_hash?: string | null
          created_at?: string
          extracted_payload?: Json
          id?: string
          published_at?: string | null
          publisher?: string | null
          source_title?: string | null
          source_type: string
          source_url?: string | null
          vc_fund_id: string
        }
        Update: {
          confidence?: number
          content_hash?: string | null
          created_at?: string
          extracted_payload?: Json
          id?: string
          published_at?: string | null
          publisher?: string | null
          source_title?: string | null
          source_type?: string
          source_url?: string | null
          vc_fund_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vc_fund_sources_vc_fund_id_fkey"
            columns: ["vc_fund_id"]
            isOneToOne: false
            referencedRelation: "vc_funds"
            referencedColumns: ["id"]
          },
        ]
      }
      vc_fund_sync_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          dry_run: boolean
          error_message: string | null
          id: string
          options: Json
          phase: string
          scope_cluster_key: string | null
          scope_firm_id: string | null
          started_at: string
          stats: Json
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          dry_run?: boolean
          error_message?: string | null
          id?: string
          options?: Json
          phase: string
          scope_cluster_key?: string | null
          scope_firm_id?: string | null
          started_at?: string
          stats?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          dry_run?: boolean
          error_message?: string | null
          id?: string
          options?: Json
          phase?: string
          scope_cluster_key?: string | null
          scope_firm_id?: string | null
          started_at?: string
          stats?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vc_fund_sync_runs_scope_firm_id_fkey"
            columns: ["scope_firm_id"]
            isOneToOne: false
            referencedRelation: "firm_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vc_fund_sync_runs_scope_firm_id_fkey"
            columns: ["scope_firm_id"]
            isOneToOne: false
            referencedRelation: "investor_directory_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      vc_funds: {
        Row: {
          active_deployment_window_end: string | null
          active_deployment_window_start: string | null
          announced_date: string | null
          announcement_title: string | null
          announcement_url: string | null
          close_date: string | null
          created_at: string
          currency: string
          deleted_at: string | null
          estimated_check_max_usd: number | null
          estimated_check_min_usd: number | null
          field_confidence: Json
          field_provenance: Json
          final_size_usd: number | null
          firm_record_id: string
          freshness_synced_at: string
          fund_sequence_number: number | null
          fund_type: string | null
          geography_focus: string[]
          id: string
          is_new_fund_signal: boolean
          last_signal_at: string | null
          last_verified_at: string | null
          latest_source_published_at: string | null
          lead_source: string | null
          legacy_fund_record_id: string | null
          likely_actively_deploying: boolean | null
          manually_verified: boolean
          metadata: Json
          name: string
          normalized_key: string
          normalized_name: string
          raw_source_text: string | null
          sector_focus: string[]
          source_confidence: number
          source_count: number
          stage_focus: string[]
          status: Database["public"]["Enums"]["vc_fund_status_enum"]
          target_size_usd: number | null
          updated_at: string
          verification_status: string
          vintage_year: number | null
        }
        Insert: {
          active_deployment_window_end?: string | null
          active_deployment_window_start?: string | null
          announced_date?: string | null
          announcement_title?: string | null
          announcement_url?: string | null
          close_date?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          estimated_check_max_usd?: number | null
          estimated_check_min_usd?: number | null
          field_confidence?: Json
          field_provenance?: Json
          final_size_usd?: number | null
          firm_record_id: string
          freshness_synced_at?: string
          fund_sequence_number?: number | null
          fund_type?: string | null
          geography_focus?: string[]
          id?: string
          is_new_fund_signal?: boolean
          last_signal_at?: string | null
          last_verified_at?: string | null
          latest_source_published_at?: string | null
          lead_source?: string | null
          legacy_fund_record_id?: string | null
          likely_actively_deploying?: boolean | null
          manually_verified?: boolean
          metadata?: Json
          name: string
          normalized_key: string
          normalized_name: string
          raw_source_text?: string | null
          sector_focus?: string[]
          source_confidence?: number
          source_count?: number
          stage_focus?: string[]
          status?: Database["public"]["Enums"]["vc_fund_status_enum"]
          target_size_usd?: number | null
          updated_at?: string
          verification_status?: string
          vintage_year?: number | null
        }
        Update: {
          active_deployment_window_end?: string | null
          active_deployment_window_start?: string | null
          announced_date?: string | null
          announcement_title?: string | null
          announcement_url?: string | null
          close_date?: string | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          estimated_check_max_usd?: number | null
          estimated_check_min_usd?: number | null
          field_confidence?: Json
          field_provenance?: Json
          final_size_usd?: number | null
          firm_record_id?: string
          freshness_synced_at?: string
          fund_sequence_number?: number | null
          fund_type?: string | null
          geography_focus?: string[]
          id?: string
          is_new_fund_signal?: boolean
          last_signal_at?: string | null
          last_verified_at?: string | null
          latest_source_published_at?: string | null
          lead_source?: string | null
          legacy_fund_record_id?: string | null
          likely_actively_deploying?: boolean | null
          manually_verified?: boolean
          metadata?: Json
          name?: string
          normalized_key?: string
          normalized_name?: string
          raw_source_text?: string | null
          sector_focus?: string[]
          source_confidence?: number
          source_count?: number
          stage_focus?: string[]
          status?: Database["public"]["Enums"]["vc_fund_status_enum"]
          target_size_usd?: number | null
          updated_at?: string
          verification_status?: string
          vintage_year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vc_funds_firm_record_id_fkey"
            columns: ["firm_record_id"]
            isOneToOne: false
            referencedRelation: "firm_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vc_funds_firm_record_id_fkey"
            columns: ["firm_record_id"]
            isOneToOne: false
            referencedRelation: "investor_directory_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      vc_interactions: {
        Row: {
          created_at: string
          id: string
          interaction_type: string | null
          vc_firm_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          interaction_type?: string | null
          vc_firm_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          interaction_type?: string | null
          vc_firm_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vc_interactions_vc_firm_id_fkey"
            columns: ["vc_firm_id"]
            isOneToOne: false
            referencedRelation: "vc_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      vc_ratings: {
        Row: {
          anonymous: boolean
          author_user_id: string | null
          comment: string | null
          created_at: string
          id: string
          interaction_date: string | null
          interaction_detail: string | null
          interaction_type: string
          is_draft: boolean
          nps: number | null
          score_feedback: number | null
          score_follow_thru: number | null
          score_resp: number | null
          score_respect: number | null
          score_value_add: number | null
          star_ratings: Json
          vc_firm_id: string | null
          vc_person_id: string | null
          verified: boolean
        }
        Insert: {
          anonymous?: boolean
          author_user_id?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          interaction_date?: string | null
          interaction_detail?: string | null
          interaction_type: string
          is_draft?: boolean
          nps?: number | null
          score_feedback?: number | null
          score_follow_thru?: number | null
          score_resp?: number | null
          score_respect?: number | null
          score_value_add?: number | null
          star_ratings?: Json
          vc_firm_id?: string | null
          vc_person_id?: string | null
          verified?: boolean
        }
        Update: {
          anonymous?: boolean
          author_user_id?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          interaction_date?: string | null
          interaction_detail?: string | null
          interaction_type?: string
          is_draft?: boolean
          nps?: number | null
          score_feedback?: number | null
          score_follow_thru?: number | null
          score_resp?: number | null
          score_respect?: number | null
          score_value_add?: number | null
          star_ratings?: Json
          vc_firm_id?: string | null
          vc_person_id?: string | null
          verified?: boolean
        }
        Relationships: []
      }
      waitlist_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          payload: Json
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_waitlist_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "waitlist_users"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist_milestones: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          referral_threshold: number
          reward_key: string
          reward_label: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          referral_threshold: number
          reward_key: string
          reward_label: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          referral_threshold?: number
          reward_key?: string
          reward_label?: string
        }
        Relationships: []
      }
      waitlist_referrals: {
        Row: {
          created_at: string
          id: string
          referral_code: string
          referred_user_id: string
          referrer_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          referral_code: string
          referred_user_id: string
          referrer_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          referral_code?: string
          referred_user_id?: string
          referrer_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_referrals_referred_user_id_fkey"
            columns: ["referred_user_id"]
            isOneToOne: true
            referencedRelation: "v_waitlist_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_referrals_referred_user_id_fkey"
            columns: ["referred_user_id"]
            isOneToOne: true
            referencedRelation: "waitlist_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_referrals_referrer_user_id_fkey"
            columns: ["referrer_user_id"]
            isOneToOne: false
            referencedRelation: "v_waitlist_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_referrals_referrer_user_id_fkey"
            columns: ["referrer_user_id"]
            isOneToOne: false
            referencedRelation: "waitlist_users"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist_users: {
        Row: {
          biggest_pain: string | null
          campaign: string | null
          company_name: string | null
          created_at: string
          email: string
          id: string
          intent: string[]
          linkedin_url: string | null
          metadata: Json
          name: string | null
          priority_access: boolean
          qualification_score: number
          referral_code: string
          referral_count: number
          referral_score: number
          referred_by_user_id: string | null
          role: string | null
          sector: string | null
          source: string | null
          stage: string | null
          status: string
          total_score: number
          updated_at: string
          urgency: string | null
          waitlist_position: number | null
        }
        Insert: {
          biggest_pain?: string | null
          campaign?: string | null
          company_name?: string | null
          created_at?: string
          email: string
          id?: string
          intent?: string[]
          linkedin_url?: string | null
          metadata?: Json
          name?: string | null
          priority_access?: boolean
          qualification_score?: number
          referral_code?: string
          referral_count?: number
          referral_score?: number
          referred_by_user_id?: string | null
          role?: string | null
          sector?: string | null
          source?: string | null
          stage?: string | null
          status?: string
          total_score?: number
          updated_at?: string
          urgency?: string | null
          waitlist_position?: number | null
        }
        Update: {
          biggest_pain?: string | null
          campaign?: string | null
          company_name?: string | null
          created_at?: string
          email?: string
          id?: string
          intent?: string[]
          linkedin_url?: string | null
          metadata?: Json
          name?: string | null
          priority_access?: boolean
          qualification_score?: number
          referral_code?: string
          referral_count?: number
          referral_score?: number
          referred_by_user_id?: string | null
          role?: string | null
          sector?: string | null
          source?: string | null
          stage?: string | null
          status?: string
          total_score?: number
          updated_at?: string
          urgency?: string | null
          waitlist_position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_users_referred_by_user_id_fkey"
            columns: ["referred_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_waitlist_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_users_referred_by_user_id_fkey"
            columns: ["referred_by_user_id"]
            isOneToOne: false
            referencedRelation: "waitlist_users"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_memberships: {
        Row: {
          created_at: string
          id: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_memberships_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      yc_companies: {
        Row: {
          allLocations: string | null
          badges: Json | null
          batch: string
          createdAt: string | null
          description: string | null
          foundersRaw: Json | null
          id: string
          industries: string[] | null
          longDescription: string | null
          name: string
          organizationId: string | null
          rawJson: Json
          slug: string
          status: string | null
          subverticals: string[] | null
          tags: string[] | null
          teamSize: number | null
          updatedAt: string | null
          website: string | null
          ycId: string
        }
        Insert: {
          allLocations?: string | null
          badges?: Json | null
          batch: string
          createdAt?: string | null
          description?: string | null
          foundersRaw?: Json | null
          id?: string
          industries?: string[] | null
          longDescription?: string | null
          name: string
          organizationId?: string | null
          rawJson: Json
          slug: string
          status?: string | null
          subverticals?: string[] | null
          tags?: string[] | null
          teamSize?: number | null
          updatedAt?: string | null
          website?: string | null
          ycId: string
        }
        Update: {
          allLocations?: string | null
          badges?: Json | null
          batch?: string
          createdAt?: string | null
          description?: string | null
          foundersRaw?: Json | null
          id?: string
          industries?: string[] | null
          longDescription?: string | null
          name?: string
          organizationId?: string | null
          rawJson?: Json
          slug?: string
          status?: string | null
          subverticals?: string[] | null
          tags?: string[] | null
          teamSize?: number | null
          updatedAt?: string | null
          website?: string | null
          ycId?: string
        }
        Relationships: [
          {
            foreignKeyName: "yc_companies_organizationId_fkey"
            columns: ["organizationId"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yc_companies_organizationId_fkey"
            columns: ["organizationId"]
            isOneToOne: false
            referencedRelation: "v_org_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yc_companies_organizationId_fkey"
            columns: ["organizationId"]
            isOneToOne: false
            referencedRelation: "v_person_signals"
            referencedColumns: ["primary_org_id"]
          },
        ]
      }
      yc_people: {
        Row: {
          avatarUrl: string | null
          bio: string | null
          createdAt: string | null
          id: string
          linkedinUrl: string | null
          name: string
          personId: string | null
          role: string | null
          twitterUrl: string | null
          updatedAt: string | null
          ycCompanyId: string | null
          ycId: string
        }
        Insert: {
          avatarUrl?: string | null
          bio?: string | null
          createdAt?: string | null
          id?: string
          linkedinUrl?: string | null
          name: string
          personId?: string | null
          role?: string | null
          twitterUrl?: string | null
          updatedAt?: string | null
          ycCompanyId?: string | null
          ycId: string
        }
        Update: {
          avatarUrl?: string | null
          bio?: string | null
          createdAt?: string | null
          id?: string
          linkedinUrl?: string | null
          name?: string
          personId?: string | null
          role?: string | null
          twitterUrl?: string | null
          updatedAt?: string | null
          ycCompanyId?: string | null
          ycId?: string
        }
        Relationships: [
          {
            foreignKeyName: "yc_people_personId_fkey"
            columns: ["personId"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yc_people_personId_fkey"
            columns: ["personId"]
            isOneToOne: true
            referencedRelation: "v_cross_company_operators"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "yc_people_personId_fkey"
            columns: ["personId"]
            isOneToOne: true
            referencedRelation: "v_person_signals"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "yc_people_personId_fkey"
            columns: ["personId"]
            isOneToOne: true
            referencedRelation: "v_repeat_founders"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "yc_people_ycCompanyId_fkey"
            columns: ["ycCompanyId"]
            isOneToOne: false
            referencedRelation: "yc_companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      investor_directory_safe: {
        Row: {
          aliases: string[] | null
          angellist_url: string | null
          aum: string | null
          ca_sb54_compliant: boolean | null
          community_rating: number | null
          created_at: string | null
          crunchbase_url: string | null
          data_confidence_score: number | null
          description: string | null
          elevator_pitch: string | null
          email: string | null
          email_source: string | null
          entity_type: Database["public"]["Enums"]["entity_type"] | null
          facebook_url: string | null
          firm_name: string | null
          firm_type: string | null
          founded_year: number | null
          founder_reputation_score: number | null
          general_partner_count: number | null
          general_partner_names: string[] | null
          geo_focus: string[] | null
          headcount: string | null
          hq_city: string | null
          hq_country: string | null
          hq_region: Database["public"]["Enums"]["us_region"] | null
          hq_state: string | null
          hq_zip_code: string | null
          id: string | null
          industry_reputation: number | null
          instagram_url: string | null
          is_actively_deploying: boolean | null
          last_enriched_at: string | null
          last_verified_at: string | null
          lead_or_follow: string | null
          lead_partner: string | null
          legal_name: string | null
          linkedin_url: string | null
          location: string | null
          logo_url: string | null
          market_sentiment: string | null
          match_score: number | null
          max_check_size: number | null
          medium_url: string | null
          min_check_size: number | null
          network_strength: number | null
          news_sentiment_score: number | null
          next_update_scheduled_at: string | null
          partner_names: string[] | null
          preferred_stage: string | null
          prisma_firm_id: string | null
          recent_deals: string[] | null
          reputation_score: number | null
          responsiveness_score: number | null
          sector_embedding: string | null
          sector_scope: Database["public"]["Enums"]["sector_scope_enum"] | null
          sentiment_detail: string | null
          slug: string | null
          social_sentiment_score: number | null
          stage_focus: Database["public"]["Enums"]["stage_focus_enum"][] | null
          stage_max: Database["public"]["Enums"]["stage_focus_enum"] | null
          stage_min: Database["public"]["Enums"]["stage_focus_enum"] | null
          status: string | null
          strategy_classifications: string[] | null
          substack_url: string | null
          thesis_orientation:
            | Database["public"]["Enums"]["thesis_orientation"]
            | null
          thesis_verticals: string[] | null
          tiktok_url: string | null
          total_headcount: number | null
          total_investors: number | null
          total_partners: number | null
          updated_at: string | null
          value_add_score: number | null
          verification_status: string | null
          volatility_score: number | null
          website_url: string | null
          x_url: string | null
          youtube_url: string | null
        }
        Insert: {
          aliases?: string[] | null
          angellist_url?: string | null
          aum?: string | null
          ca_sb54_compliant?: boolean | null
          community_rating?: number | null
          created_at?: string | null
          crunchbase_url?: string | null
          data_confidence_score?: number | null
          description?: string | null
          elevator_pitch?: string | null
          email?: never
          email_source?: never
          entity_type?: Database["public"]["Enums"]["entity_type"] | null
          facebook_url?: string | null
          firm_name?: string | null
          firm_type?: string | null
          founded_year?: number | null
          founder_reputation_score?: number | null
          general_partner_count?: number | null
          general_partner_names?: string[] | null
          geo_focus?: string[] | null
          headcount?: string | null
          hq_city?: string | null
          hq_country?: string | null
          hq_region?: Database["public"]["Enums"]["us_region"] | null
          hq_state?: string | null
          hq_zip_code?: string | null
          id?: string | null
          industry_reputation?: number | null
          instagram_url?: string | null
          is_actively_deploying?: boolean | null
          last_enriched_at?: string | null
          last_verified_at?: string | null
          lead_or_follow?: string | null
          lead_partner?: string | null
          legal_name?: string | null
          linkedin_url?: string | null
          location?: string | null
          logo_url?: string | null
          market_sentiment?: string | null
          match_score?: number | null
          max_check_size?: number | null
          medium_url?: string | null
          min_check_size?: number | null
          network_strength?: number | null
          news_sentiment_score?: number | null
          next_update_scheduled_at?: string | null
          partner_names?: string[] | null
          preferred_stage?: string | null
          prisma_firm_id?: string | null
          recent_deals?: string[] | null
          reputation_score?: number | null
          responsiveness_score?: number | null
          sector_embedding?: string | null
          sector_scope?: Database["public"]["Enums"]["sector_scope_enum"] | null
          sentiment_detail?: string | null
          slug?: string | null
          social_sentiment_score?: number | null
          stage_focus?: Database["public"]["Enums"]["stage_focus_enum"][] | null
          stage_max?: Database["public"]["Enums"]["stage_focus_enum"] | null
          stage_min?: Database["public"]["Enums"]["stage_focus_enum"] | null
          status?: string | null
          strategy_classifications?: string[] | null
          substack_url?: string | null
          thesis_orientation?:
            | Database["public"]["Enums"]["thesis_orientation"]
            | null
          thesis_verticals?: string[] | null
          tiktok_url?: string | null
          total_headcount?: number | null
          total_investors?: number | null
          total_partners?: number | null
          updated_at?: string | null
          value_add_score?: number | null
          verification_status?: string | null
          volatility_score?: number | null
          website_url?: string | null
          x_url?: string | null
          youtube_url?: string | null
        }
        Update: {
          aliases?: string[] | null
          angellist_url?: string | null
          aum?: string | null
          ca_sb54_compliant?: boolean | null
          community_rating?: number | null
          created_at?: string | null
          crunchbase_url?: string | null
          data_confidence_score?: number | null
          description?: string | null
          elevator_pitch?: string | null
          email?: never
          email_source?: never
          entity_type?: Database["public"]["Enums"]["entity_type"] | null
          facebook_url?: string | null
          firm_name?: string | null
          firm_type?: string | null
          founded_year?: number | null
          founder_reputation_score?: number | null
          general_partner_count?: number | null
          general_partner_names?: string[] | null
          geo_focus?: string[] | null
          headcount?: string | null
          hq_city?: string | null
          hq_country?: string | null
          hq_region?: Database["public"]["Enums"]["us_region"] | null
          hq_state?: string | null
          hq_zip_code?: string | null
          id?: string | null
          industry_reputation?: number | null
          instagram_url?: string | null
          is_actively_deploying?: boolean | null
          last_enriched_at?: string | null
          last_verified_at?: string | null
          lead_or_follow?: string | null
          lead_partner?: string | null
          legal_name?: string | null
          linkedin_url?: string | null
          location?: string | null
          logo_url?: string | null
          market_sentiment?: string | null
          match_score?: number | null
          max_check_size?: number | null
          medium_url?: string | null
          min_check_size?: number | null
          network_strength?: number | null
          news_sentiment_score?: number | null
          next_update_scheduled_at?: string | null
          partner_names?: string[] | null
          preferred_stage?: string | null
          prisma_firm_id?: string | null
          recent_deals?: string[] | null
          reputation_score?: number | null
          responsiveness_score?: number | null
          sector_embedding?: string | null
          sector_scope?: Database["public"]["Enums"]["sector_scope_enum"] | null
          sentiment_detail?: string | null
          slug?: string | null
          social_sentiment_score?: number | null
          stage_focus?: Database["public"]["Enums"]["stage_focus_enum"][] | null
          stage_max?: Database["public"]["Enums"]["stage_focus_enum"] | null
          stage_min?: Database["public"]["Enums"]["stage_focus_enum"] | null
          status?: string | null
          strategy_classifications?: string[] | null
          substack_url?: string | null
          thesis_orientation?:
            | Database["public"]["Enums"]["thesis_orientation"]
            | null
          thesis_verticals?: string[] | null
          tiktok_url?: string | null
          total_headcount?: number | null
          total_investors?: number | null
          total_partners?: number | null
          updated_at?: string | null
          value_add_score?: number | null
          verification_status?: string | null
          volatility_score?: number | null
          website_url?: string | null
          x_url?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      person_org_affiliations: {
        Row: {
          affiliation_type: string | null
          organization_id: string | null
          person_id: string | null
        }
        Relationships: []
      }
      v_batch_clusters: {
        Row: {
          batch: string | null
          companies: string[] | null
          company_count: number | null
          founder_count: number | null
          industries: string[] | null
          repeat_founders_in_batch: number | null
          sort_key: string | null
          top_expertise_tags: string[] | null
        }
        Relationships: []
      }
      v_cross_company_operators: {
        Row: {
          avatar_url: string | null
          companies: string[] | null
          expertise: string[] | null
          founder_org_count: number | null
          is_repeat_founder: boolean | null
          is_yc_backed: boolean | null
          linkedin_url: string | null
          name: string | null
          org_count: number | null
          person_id: string | null
          primary_domain: string | null
          yc_batch: string | null
          yc_batches_touched: string[] | null
        }
        Relationships: []
      }
      v_expertise_clusters: {
        Row: {
          expertise_tag: string | null
          founder_count: number | null
          repeat_founders: number | null
          sample_founders: string[] | null
          yc_batches: string[] | null
          yc_founders: number | null
        }
        Relationships: []
      }
      v_latest_vc_fund_sync: {
        Row: {
          completed_at: string | null
          id: string | null
          started_at: string | null
          stats: Json | null
        }
        Relationships: []
      }
      v_org_profile: {
        Row: {
          city: string | null
          country: string | null
          created_at: string | null
          description: string | null
          domain: string | null
          employee_count: number | null
          founded_year: number | null
          founder_avatars: string[] | null
          founder_count: number | null
          founder_expertise: string[] | null
          founder_ids: string[] | null
          founder_names: string[] | null
          founder_titles: string[] | null
          has_repeat_founder: boolean | null
          id: string | null
          industry: string | null
          is_duo_founded: boolean | null
          is_founder_unknown: boolean | null
          is_large_team: boolean | null
          is_multi_founder: boolean | null
          is_solo_founded: boolean | null
          is_yc_backed: boolean | null
          linkedin_url: string | null
          location: string | null
          logo_url: string | null
          name: string | null
          repeat_founder_count: number | null
          stage_proxy: string | null
          state: string | null
          status: string | null
          tags: string[] | null
          updated_at: string | null
          website: string | null
          yc_batch: string | null
          yc_id: string | null
        }
        Relationships: []
      }
      v_person_signals: {
        Row: {
          all_titles: string[] | null
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          expertise: string[] | null
          first_name: string | null
          founder_org_count: number | null
          github_url: string | null
          is_co_founder: boolean | null
          is_cross_company_operator: boolean | null
          is_currently_active: boolean | null
          is_first_time_founder: boolean | null
          is_repeat_founder: boolean | null
          is_solo_founder: boolean | null
          is_yc_backed: boolean | null
          last_name: string | null
          linkedin_url: string | null
          name: string | null
          org_count: number | null
          person_id: string | null
          primary_domain: string | null
          primary_org_id: string | null
          primary_org_industry: string | null
          primary_org_logo: string | null
          primary_org_name: string | null
          primary_org_stage: string | null
          role_count: number | null
          twitter_url: string | null
          updated_at: string | null
          yc_batch: string | null
          yc_id: string | null
        }
        Relationships: []
      }
      v_repeat_founders: {
        Row: {
          avatar_url: string | null
          expertise: string[] | null
          first_name: string | null
          founded_companies: string[] | null
          founder_org_count: number | null
          is_co_founder: boolean | null
          is_yc_backed: boolean | null
          last_name: string | null
          linkedin_url: string | null
          name: string | null
          org_count: number | null
          person_id: string | null
          primary_domain: string | null
          twitter_url: string | null
          yc_batch: string | null
          yc_batches: string[] | null
        }
        Relationships: []
      }
      v_waitlist_admin: {
        Row: {
          actual_referral_count: number | null
          biggest_pain: string | null
          campaign: string | null
          company_name: string | null
          created_at: string | null
          email: string | null
          id: string | null
          intent: string[] | null
          linkedin_url: string | null
          metadata: Json | null
          name: string | null
          priority_access: boolean | null
          qualification_score: number | null
          referral_code: string | null
          referral_count: number | null
          referral_score: number | null
          referred_by_email: string | null
          role: string | null
          source: string | null
          stage: string | null
          status: string | null
          total_score: number | null
          urgency: string | null
          waitlist_position: number | null
        }
        Relationships: []
      }
      vc_fund_sync_latest_runs: {
        Row: {
          completed_at: string | null
          dry_run: boolean | null
          error_message: string | null
          id: string | null
          options: Json | null
          phase: string | null
          scope_cluster_key: string | null
          scope_firm_id: string | null
          started_at: string | null
          stats: Json | null
          status: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vc_fund_sync_runs_scope_firm_id_fkey"
            columns: ["scope_firm_id"]
            isOneToOne: false
            referencedRelation: "firm_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vc_fund_sync_runs_scope_firm_id_fkey"
            columns: ["scope_firm_id"]
            isOneToOne: false
            referencedRelation: "investor_directory_safe"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      batch_update_sector_embeddings: {
        Args: { updates: Json }
        Returns: number
      }
      calc_waitlist_qualification_score: {
        Args: {
          p_intent: string[]
          p_role: string
          p_stage: string
          p_urgency: string
        }
        Returns: number
      }
      calc_waitlist_referral_score: {
        Args: { p_referral_count: number }
        Returns: number
      }
      calc_waitlist_total_score: {
        Args: {
          p_priority_access: boolean
          p_qualification_score: number
          p_referral_score: number
        }
        Returns: number
      }
      community_founders_distinct_count: { Args: never; Returns: number }
      create_company_workspace: {
        Args: {
          p_company_name: string
          p_user_id: string
          p_website_url?: string
        }
        Returns: Json
      }
      create_workspace: {
        Args: { p_name: string; p_slug: string }
        Returns: string
      }
      find_connections_by_investor: {
        Args: { _investor_name: string }
        Returns: {
          company_name: string
          instrument: string
          investor_amount: number
          sector: string
          stage: string
          user_id: string
        }[]
      }
      generate_waitlist_referral_code: { Args: never; Returns: string }
      get_active_funds_by_stage: {
        Args: {
          p_days?: number
          p_firm_type?: string[]
          p_fund_size_max?: number
          p_fund_size_min?: number
          p_geography?: string[]
          p_limit?: number
          p_sector?: string[]
          p_stage?: string[]
        }
        Returns: {
          announced_date: string
          close_date: string
          estimated_check_max_usd: number
          estimated_check_min_usd: number
          firm_name: string
          firm_record_id: string
          fund_name: string
          fund_type: string
          geography_focus: string[]
          likely_actively_deploying: boolean
          representative_size_usd: number
          sector_focus: string[]
          source_confidence: number
          stage_focus: string[]
          vc_fund_id: string
          vintage_year: number
        }[]
      }
      get_candidate_capital_events_for_review: {
        Args: {
          p_firm_record_id?: string
          p_limit?: number
          p_status?: string[]
        }
        Returns: {
          candidate_headline: string
          confidence_breakdown: Json
          confidence_score: number
          event_type_guess: string
          evidence_count: number
          firm_record_id: string
          id: string
          latest_seen_at: string
          normalized_fund_label: string
          official_source_present: boolean
          published_at: string
          publisher: string
          raw_firm_name: string
          review_reason: string
          source_diversity: number
          source_url: string
          status: string
        }[]
      }
      get_capital_heatmap_backend: {
        Args: { p_window_days?: number }
        Returns: {
          average_confidence: number
          dimension_kind: string
          dimension_value: string
          official_source_hits: number
          signal_count: number
          total_size_usd: number
          weighted_score: number
          window_days: number
        }[]
      }
      get_collaborative_recommendations: {
        Args: { _current_founder_id: string }
        Returns: {
          firm_id: string
          firm_name: string
          peer_save_count: number
        }[]
      }
      get_firm_funds: {
        Args: { p_firm_record_id: string }
        Returns: {
          active_deployment_window_end: string
          active_deployment_window_start: string
          announced_date: string
          announcement_title: string
          announcement_url: string
          close_date: string
          currency: string
          estimated_check_max_usd: number
          estimated_check_min_usd: number
          field_confidence: Json
          field_provenance: Json
          final_size_usd: number
          fund_name: string
          fund_sequence_number: number
          fund_type: string
          geography_focus: string[]
          is_new_fund_signal: boolean
          last_signal_at: string
          likely_actively_deploying: boolean
          metadata: Json
          normalized_name: string
          sector_focus: string[]
          source_confidence: number
          source_count: number
          stage_focus: string[]
          status: Database["public"]["Enums"]["vc_fund_status_enum"]
          target_size_usd: number
          vc_fund_id: string
          vintage_year: number
        }[]
      }
      get_firms_with_fresh_capital_backend: {
        Args: { p_limit?: number; p_window_days?: number }
        Returns: {
          active_fund_count: number
          active_fund_vintage: number
          capital_freshness_boost_score: number
          firm_name: string
          firm_record_id: string
          fresh_capital_priority_score: number
          has_fresh_capital: boolean
          last_capital_signal_at: string
          last_fund_announcement_date: string
          latest_fund_size_usd: number
          likely_actively_deploying: boolean
        }[]
      }
      get_fresh_capital_firms: {
        Args: {
          p_days?: number
          p_firm_type?: string[]
          p_fund_size_max?: number
          p_fund_size_min?: number
          p_geography?: string[]
          p_limit?: number
          p_sector?: string[]
          p_stage?: string[]
        }
        Returns: {
          active_fund_count: number
          active_fund_vintage: number
          entity_type: Database["public"]["Enums"]["entity_type"]
          estimated_check_range_json: Json
          firm_name: string
          firm_record_id: string
          fresh_capital_priority_score: number
          has_fresh_capital: boolean
          last_capital_signal_at: string
          last_fund_announcement_date: string
          latest_fund_size_usd: number
        }[]
      }
      get_my_company_ids: { Args: never; Returns: string[] }
      get_new_vc_funds: {
        Args: {
          p_days?: number
          p_firm_type?: string[]
          p_fund_size_max?: number
          p_fund_size_min?: number
          p_geography?: string[]
          p_limit?: number
          p_sector?: string[]
          p_stage?: string[]
        }
        Returns: {
          announced_date: string
          announcement_title: string
          announcement_url: string
          close_date: string
          final_size_usd: number
          firm_aum_usd: number
          firm_domain: string
          firm_location: string
          firm_logo_url: string
          firm_name: string
          firm_record_id: string
          firm_website_url: string
          fresh_capital_priority_score: number
          fund_name: string
          fund_sequence_number: number
          fund_type: string
          geography_focus: string[]
          has_fresh_capital: boolean
          likely_actively_deploying: boolean
          sector_focus: string[]
          source_confidence: number
          stage_focus: string[]
          status: Database["public"]["Enums"]["vc_fund_status_enum"]
          target_size_usd: number
          vc_fund_id: string
          vintage_year: number
        }[]
      }
      get_recent_fresh_capital_backend: {
        Args: { p_limit?: number; p_window_days?: number }
        Returns: {
          confidence: number
          display_priority: number
          event_date: string
          firm_name: string
          firm_record_id: string
          fresh_capital_priority_score: number
          fund_name: string
          headline: string
          official_source_present: boolean
          representative_size_usd: number
          signal_type: Database["public"]["Enums"]["vc_fund_signal_type_enum"]
          source_url: string
          summary: string
          vc_fund_id: string
          vc_fund_signal_id: string
        }[]
      }
      get_recent_fund_signals: {
        Args: {
          p_days?: number
          p_firm_type?: string[]
          p_fund_size_max?: number
          p_fund_size_min?: number
          p_geography?: string[]
          p_limit?: number
          p_sector?: string[]
          p_stage?: string[]
        }
        Returns: {
          confidence: number
          display_priority: number
          event_date: string
          firm_name: string
          firm_record_id: string
          fund_name: string
          headline: string
          metadata: Json
          signal_type: Database["public"]["Enums"]["vc_fund_signal_type_enum"]
          source_url: string
          summary: string
          vc_fund_id: string
          vc_fund_signal_id: string
        }[]
      }
      get_recent_funding_feed: {
        Args: { p_limit?: number }
        Returns: {
          amount_label: string
          announced_at: string
          co_investors: string[]
          company_name: string
          confidence_score: number
          confirmation_status: string
          id: string
          lead_investor: string
          lead_website_url: string
          round_kind: string
          sector: string
          source_type: string
          source_url: string
          website_url: string
        }[]
      }
      get_sector_save_rates: {
        Args: { _sector: string }
        Returns: {
          decay_multiplier: number
          firm_id: string
          save_count: number
          save_rate: number
          total_recommendations: number
        }[]
      }
      has_permission: {
        Args: {
          _permission: Database["public"]["Enums"]["app_permission"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_or_above: { Args: { _user_id: string }; Returns: boolean }
      is_company_owner: { Args: { _company_id: string }; Returns: boolean }
      kb_populate_tsvector: {
        Args: { p_document_id: string }
        Returns: undefined
      }
      kb_search_chunks_fts: {
        Args: {
          p_entity_id?: string
          p_entity_type?: string
          p_limit?: number
          p_offset?: number
          p_query: string
        }
        Returns: {
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          document_title: string
          id: string
          metadata: Json
          rank: number
          related_entity_id: string
          related_entity_type: string
        }[]
      }
      kb_search_chunks_vector: {
        Args: {
          p_embedding: string
          p_entity_id?: string
          p_entity_type?: string
          p_limit?: number
          p_similarity_threshold?: number
        }
        Returns: {
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          document_title: string
          id: string
          metadata: Json
          related_entity_id: string
          related_entity_type: string
          similarity: number
        }[]
      }
      match_investors: {
        Args: {
          founder_ask?: number
          founder_geo?: string
          founder_sector_embedding: string
          founder_stage?: string
          match_limit?: number
          similarity_threshold?: number
        }
        Returns: {
          ca_sb54_compliant: boolean
          firm_name: string
          id: string
          lead_or_follow: string
          lead_partner: string
          location: string
          market_sentiment: string
          max_check_size: number
          min_check_size: number
          preferred_stage: string
          recent_deals: string[]
          sentiment_detail: string
          similarity_score: number
          thesis_verticals: string[]
        }[]
      }
      my_connector_manageable_owner_context_ids: {
        Args: never
        Returns: string[]
      }
      my_owner_context_ids: { Args: never; Returns: string[] }
      normalize_tag_value: { Args: { v: string }; Returns: string }
      paths_to_organization: {
        Args: {
          p_owner_context_id: string
          p_self_person_id: string
          p_target_organization_id: string
        }
        Returns: {
          last_interaction_at: string
          path_score: number
          path_type: string
          target_person_id: string
          via_person_id: string
        }[]
      }
      recalculate_waitlist_positions: { Args: never; Returns: undefined }
      recalculate_waitlist_user_scores: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      recommend_competitors: {
        Args: { _industry_tags: string[]; _limit?: number; _user_id: string }
        Returns: {
          competitor_id: string
          competitor_name: string
          description: string
          industry_tags: string[]
          tag_overlap: number
          tracking_count: number
          website: string
        }[]
      }
      refresh_firm_capital_derived_fields: {
        Args: { p_firm_record_id?: string; p_fresh_window_days?: number }
        Returns: number
      }
      reject_identity: {
        Args: { p_owner_context_id: string; p_person_id: string }
        Returns: undefined
      }
      reveal_contact_info: { Args: { _investor_id: string }; Returns: Json }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      waitlist_get_status: {
        Args: { p_email?: string; p_referral_code?: string }
        Returns: Json
      }
      waitlist_signup: {
        Args: {
          p_biggest_pain?: string
          p_campaign?: string
          p_company_name?: string
          p_email: string
          p_intent?: string[]
          p_linkedin_url?: string
          p_metadata?: Json
          p_name?: string
          p_referral_code?: string
          p_role?: string
          p_sector?: string
          p_source?: string
          p_stage?: string
          p_urgency?: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_permission: "user" | "manager" | "admin" | "god"
      AumBand: "NANO" | "MICRO" | "SMALL" | "MID_SIZE" | "LARGE" | "MEGA_FUND"
      BusinessModel:
        | "SAAS"
        | "MARKETPLACE"
        | "E_COMMERCE"
        | "FINTECH_INFRA"
        | "API_PLATFORM"
        | "HARDWARE"
        | "D2C"
        | "ENTERPRISE"
        | "CONSUMER_APP"
        | "OPEN_SOURCE"
        | "OTHER"
      CompanyHeadcountBand:
        | "SOLO"
        | "MICRO"
        | "SMALL"
        | "MID"
        | "LARGE"
        | "ENTERPRISE"
      entity_type:
        | "Institutional"
        | "Micro"
        | "Solo GP"
        | "Angel"
        | "Corporate (CVC)"
        | "Family Office"
        | "Accelerator / Studio"
        | "Syndicate"
        | "Fund of Funds"
      firm_strategy_classification:
        | "THESIS_DRIVEN"
        | "GENERALIST"
        | "OPERATOR_LED"
        | "PLATFORM_SERVICES_HEAVY"
        | "EVERGREEN_LONG_DURATION"
        | "IMPACT_ESG_DRIVEN"
        | "GEOGRAPHY_SPECIALIST"
        | "FOUNDER_PROFILE_DRIVEN"
      FounderArchetype:
        | "TECHNICAL"
        | "COMMERCIAL"
        | "HYBRID"
        | "DOMAIN_EXPERT"
        | "OPERATOR"
        | "SERIAL_ENTREPRENEUR"
      fund_source_type:
        | "official_website"
        | "sec_filing"
        | "crunchbase"
        | "pitchbook"
        | "preqin"
        | "news_article"
        | "press_release"
        | "lp_disclosure"
        | "secondary_aggregator"
        | "ai_inferred"
        | "manual"
        | "other"
      fund_status_enum: "active" | "closed" | "forming" | "winding_down"
      FundingArticleFetchStatus:
        | "PENDING"
        | "FETCHED"
        | "FAILED"
        | "SKIPPED_DUPLICATE"
      FundingDealInvestorRole: "LEAD" | "PARTICIPANT" | "EXISTING" | "UNKNOWN"
      FundingIngestSourceKey:
        | "STARTUPS_GALLERY_NEWS"
        | "TECHCRUNCH_VENTURE"
        | "GEEKWIRE_FUNDINGS"
        | "ALLEYWATCH_FUNDING"
      impact_orientation: "primary" | "integrated" | "considered" | "none"
      OperatorCompanyStage:
        | "PRE_SEED"
        | "SEED"
        | "SERIES_A"
        | "SERIES_B"
        | "SERIES_C"
        | "GROWTH"
        | "PUBLIC"
        | "BOOTSTRAPPED"
        | "ACQUIRED"
        | "SHUTDOWN"
        | "UNKNOWN"
      OperatorEdgeType:
        | "WORKED_WITH"
        | "REPORTED_TO"
        | "COFOUNDED"
        | "INVESTED_IN"
        | "ADVISED"
        | "HIRED"
        | "INTRODUCED"
        | "BOARD_MEMBER"
        | "PEER"
      OperatorFunction:
        | "PRODUCT"
        | "ENGINEERING"
        | "GTM"
        | "SALES"
        | "MARKETING"
        | "FINANCE"
        | "OPERATIONS"
        | "LEGAL"
        | "DESIGN"
        | "DATA"
        | "GENERAL_MANAGEMENT"
        | "PEOPLE_HR"
        | "CUSTOMER_SUCCESS"
        | "OTHER"
      OperatorSeniority:
        | "INDIVIDUAL_CONTRIBUTOR"
        | "MANAGER"
        | "DIRECTOR"
        | "VP"
        | "C_SUITE"
        | "FOUNDER"
        | "ADVISOR"
        | "BOARD"
      OperatorSignalType:
        | "JOB_CHANGE"
        | "PROMOTION"
        | "NEW_ADVISORY_ROLE"
        | "CONTENT_PUBLISHED"
        | "SPEAKING_APPEARANCE"
        | "MEDIA_MENTION"
        | "COMPANY_MILESTONE"
        | "JOB_POSTING_DETECTED"
        | "OPEN_TO_ADVISING"
        | "FUNDING_NEWS"
        | "OTHER"
      RevenueRange:
        | "PRE_REVENUE"
        | "SUB_1M"
        | "ARR_1M_5M"
        | "ARR_5M_10M"
        | "ARR_10M_50M"
        | "ARR_50M_100M"
        | "ARR_100M_PLUS"
        | "UNKNOWN"
      review_entity_type:
        | "fund"
        | "fund_alias"
        | "firm_fund_link"
        | "portfolio_link"
        | "portfolio_company_match"
        | "portfolio_firm_mapping"
        | "firm_focus"
      review_status: "pending" | "approved" | "rejected" | "merged"
      sector_classification: "generalist" | "sector_focused" | "multi_sector"
      sector_scope_enum: "Generalist" | "Specialized"
      SectorFocus:
        | "FINTECH"
        | "ENTERPRISE_SAAS"
        | "AI"
        | "HEALTHTECH"
        | "BIOTECH"
        | "CONSUMER"
        | "CLIMATE"
        | "MOBILITY"
        | "INDUSTRIAL"
        | "CYBERSECURITY"
        | "MEDIA"
        | "WEB3"
        | "EDTECH"
        | "GOVTECH"
        | "HARDWARE"
        | "ROBOTICS"
        | "MARKETPLACE"
        | "AGRITECH"
        | "PROPTECH"
        | "OTHER"
      stage_classification: "multi_stage" | "early_stage" | "growth" | "buyout"
      stage_focus_enum:
        | "Friends and Family"
        | "Pre-Seed"
        | "Seed"
        | "Series A"
        | "Series B+"
        | "Growth"
      StartupDataSource:
        | "SEEDTABLE"
        | "TOPSTARTUPS"
        | "TINYTEAMS"
        | "YC"
        | "NEXTPLAY"
        | "STARTUPS_GALLERY"
        | "CB_INSIGHTS"
        | "CRUNCHBASE"
        | "TRACXN"
        | "MANUAL"
        | "OTHER"
      StartupStatus: "ACTIVE" | "ACQUIRED" | "SHUT_DOWN" | "IPO" | "UNKNOWN"
      structure_classification:
        | "partnership"
        | "solo_gp"
        | "syndicate"
        | "cvc"
        | "family_office"
        | "private_equity"
      TargetCustomer:
        | "SMB"
        | "MID_MARKET"
        | "ENTERPRISE"
        | "CONSUMER"
        | "PROSUMER"
        | "GOVERNMENT"
        | "OTHER"
      theme_classification: "generalist" | "theme_driven" | "multi_theme"
      thesis_orientation:
        | "Generalist"
        | "Sector-Focused"
        | "Thesis-Driven"
        | "Founder-First"
        | "Geographic"
        | "Operator-led"
      us_region:
        | "West"
        | "East"
        | "South"
        | "Midwest"
        | "Southwest"
        | "Southeast"
        | "Northeast"
        | "Northwest"
        | "International"
      vc_fund_signal_type_enum:
        | "new_fund_announced"
        | "fund_closed"
        | "fund_target_updated"
        | "new_vehicle_detected"
        | "fresh_capital_inferred"
        | "fund_size_updated"
      vc_fund_status_enum:
        | "announced"
        | "target"
        | "first_close"
        | "final_close"
        | "inferred_active"
        | "historical"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_permission: ["user", "manager", "admin", "god"],
      AumBand: ["NANO", "MICRO", "SMALL", "MID_SIZE", "LARGE", "MEGA_FUND"],
      BusinessModel: [
        "SAAS",
        "MARKETPLACE",
        "E_COMMERCE",
        "FINTECH_INFRA",
        "API_PLATFORM",
        "HARDWARE",
        "D2C",
        "ENTERPRISE",
        "CONSUMER_APP",
        "OPEN_SOURCE",
        "OTHER",
      ],
      CompanyHeadcountBand: [
        "SOLO",
        "MICRO",
        "SMALL",
        "MID",
        "LARGE",
        "ENTERPRISE",
      ],
      entity_type: [
        "Institutional",
        "Micro",
        "Solo GP",
        "Angel",
        "Corporate (CVC)",
        "Family Office",
        "Accelerator / Studio",
        "Syndicate",
        "Fund of Funds",
      ],
      firm_strategy_classification: [
        "THESIS_DRIVEN",
        "GENERALIST",
        "OPERATOR_LED",
        "PLATFORM_SERVICES_HEAVY",
        "EVERGREEN_LONG_DURATION",
        "IMPACT_ESG_DRIVEN",
        "GEOGRAPHY_SPECIALIST",
        "FOUNDER_PROFILE_DRIVEN",
      ],
      FounderArchetype: [
        "TECHNICAL",
        "COMMERCIAL",
        "HYBRID",
        "DOMAIN_EXPERT",
        "OPERATOR",
        "SERIAL_ENTREPRENEUR",
      ],
      fund_source_type: [
        "official_website",
        "sec_filing",
        "crunchbase",
        "pitchbook",
        "preqin",
        "news_article",
        "press_release",
        "lp_disclosure",
        "secondary_aggregator",
        "ai_inferred",
        "manual",
        "other",
      ],
      fund_status_enum: ["active", "closed", "forming", "winding_down"],
      FundingArticleFetchStatus: [
        "PENDING",
        "FETCHED",
        "FAILED",
        "SKIPPED_DUPLICATE",
      ],
      FundingDealInvestorRole: ["LEAD", "PARTICIPANT", "EXISTING", "UNKNOWN"],
      FundingIngestSourceKey: [
        "STARTUPS_GALLERY_NEWS",
        "TECHCRUNCH_VENTURE",
        "GEEKWIRE_FUNDINGS",
        "ALLEYWATCH_FUNDING",
      ],
      impact_orientation: ["primary", "integrated", "considered", "none"],
      OperatorCompanyStage: [
        "PRE_SEED",
        "SEED",
        "SERIES_A",
        "SERIES_B",
        "SERIES_C",
        "GROWTH",
        "PUBLIC",
        "BOOTSTRAPPED",
        "ACQUIRED",
        "SHUTDOWN",
        "UNKNOWN",
      ],
      OperatorEdgeType: [
        "WORKED_WITH",
        "REPORTED_TO",
        "COFOUNDED",
        "INVESTED_IN",
        "ADVISED",
        "HIRED",
        "INTRODUCED",
        "BOARD_MEMBER",
        "PEER",
      ],
      OperatorFunction: [
        "PRODUCT",
        "ENGINEERING",
        "GTM",
        "SALES",
        "MARKETING",
        "FINANCE",
        "OPERATIONS",
        "LEGAL",
        "DESIGN",
        "DATA",
        "GENERAL_MANAGEMENT",
        "PEOPLE_HR",
        "CUSTOMER_SUCCESS",
        "OTHER",
      ],
      OperatorSeniority: [
        "INDIVIDUAL_CONTRIBUTOR",
        "MANAGER",
        "DIRECTOR",
        "VP",
        "C_SUITE",
        "FOUNDER",
        "ADVISOR",
        "BOARD",
      ],
      OperatorSignalType: [
        "JOB_CHANGE",
        "PROMOTION",
        "NEW_ADVISORY_ROLE",
        "CONTENT_PUBLISHED",
        "SPEAKING_APPEARANCE",
        "MEDIA_MENTION",
        "COMPANY_MILESTONE",
        "JOB_POSTING_DETECTED",
        "OPEN_TO_ADVISING",
        "FUNDING_NEWS",
        "OTHER",
      ],
      RevenueRange: [
        "PRE_REVENUE",
        "SUB_1M",
        "ARR_1M_5M",
        "ARR_5M_10M",
        "ARR_10M_50M",
        "ARR_50M_100M",
        "ARR_100M_PLUS",
        "UNKNOWN",
      ],
      review_entity_type: [
        "fund",
        "fund_alias",
        "firm_fund_link",
        "portfolio_link",
        "portfolio_company_match",
        "portfolio_firm_mapping",
        "firm_focus",
      ],
      review_status: ["pending", "approved", "rejected", "merged"],
      sector_classification: ["generalist", "sector_focused", "multi_sector"],
      sector_scope_enum: ["Generalist", "Specialized"],
      SectorFocus: [
        "FINTECH",
        "ENTERPRISE_SAAS",
        "AI",
        "HEALTHTECH",
        "BIOTECH",
        "CONSUMER",
        "CLIMATE",
        "MOBILITY",
        "INDUSTRIAL",
        "CYBERSECURITY",
        "MEDIA",
        "WEB3",
        "EDTECH",
        "GOVTECH",
        "HARDWARE",
        "ROBOTICS",
        "MARKETPLACE",
        "AGRITECH",
        "PROPTECH",
        "OTHER",
      ],
      stage_classification: ["multi_stage", "early_stage", "growth", "buyout"],
      stage_focus_enum: [
        "Friends and Family",
        "Pre-Seed",
        "Seed",
        "Series A",
        "Series B+",
        "Growth",
      ],
      StartupDataSource: [
        "SEEDTABLE",
        "TOPSTARTUPS",
        "TINYTEAMS",
        "YC",
        "NEXTPLAY",
        "STARTUPS_GALLERY",
        "CB_INSIGHTS",
        "CRUNCHBASE",
        "TRACXN",
        "MANUAL",
        "OTHER",
      ],
      StartupStatus: ["ACTIVE", "ACQUIRED", "SHUT_DOWN", "IPO", "UNKNOWN"],
      structure_classification: [
        "partnership",
        "solo_gp",
        "syndicate",
        "cvc",
        "family_office",
        "private_equity",
      ],
      TargetCustomer: [
        "SMB",
        "MID_MARKET",
        "ENTERPRISE",
        "CONSUMER",
        "PROSUMER",
        "GOVERNMENT",
        "OTHER",
      ],
      theme_classification: ["generalist", "theme_driven", "multi_theme"],
      thesis_orientation: [
        "Generalist",
        "Sector-Focused",
        "Thesis-Driven",
        "Founder-First",
        "Geographic",
        "Operator-led",
      ],
      us_region: [
        "West",
        "East",
        "South",
        "Midwest",
        "Southwest",
        "Southeast",
        "Northeast",
        "Northwest",
        "International",
      ],
      vc_fund_signal_type_enum: [
        "new_fund_announced",
        "fund_closed",
        "fund_target_updated",
        "new_vehicle_detected",
        "fresh_capital_inferred",
        "fund_size_updated",
      ],
      vc_fund_status_enum: [
        "announced",
        "target",
        "first_close",
        "final_close",
        "inferred_active",
        "historical",
      ],
    },
  },
} as const
