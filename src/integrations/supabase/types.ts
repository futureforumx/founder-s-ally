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
      firm_recent_deals: {
        Row: {
          amount: string | null
          company_name: string
          created_at: string
          date_announced: string | null
          firm_id: string
          id: string
          stage: string | null
        }
        Insert: {
          amount?: string | null
          company_name: string
          created_at?: string
          date_announced?: string | null
          firm_id: string
          id?: string
          stage?: string | null
        }
        Update: {
          amount?: string | null
          company_name?: string
          created_at?: string
          date_announced?: string | null
          firm_id?: string
          id?: string
          stage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "firm_recent_deals_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "investor_database"
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
            referencedRelation: "investor_database"
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
      investor_database: {
        Row: {
          aum: string | null
          ca_sb54_compliant: boolean | null
          community_rating: number | null
          created_at: string
          email: string | null
          email_source: string | null
          firm_name: string
          firm_type: string | null
          founder_reputation_score: number | null
          headcount: string | null
          id: string
          is_actively_deploying: boolean | null
          is_popular: boolean | null
          is_recent: boolean | null
          is_trending: boolean | null
          last_enriched_at: string | null
          lead_or_follow: string | null
          lead_partner: string | null
          location: string | null
          logo_url: string | null
          market_sentiment: string | null
          max_check_size: number | null
          min_check_size: number | null
          news_sentiment_score: number | null
          preferred_stage: string | null
          recent_deals: string[] | null
          reputation_score: number | null
          reputation_updated_at: string | null
          sector_embedding: string | null
          sentiment_detail: string | null
          social_sentiment_score: number | null
          thesis_verticals: string[]
          website_url: string | null
        }
        Insert: {
          aum?: string | null
          ca_sb54_compliant?: boolean | null
          community_rating?: number | null
          created_at?: string
          email?: string | null
          email_source?: string | null
          firm_name: string
          firm_type?: string | null
          founder_reputation_score?: number | null
          headcount?: string | null
          id?: string
          is_actively_deploying?: boolean | null
          is_popular?: boolean | null
          is_recent?: boolean | null
          is_trending?: boolean | null
          last_enriched_at?: string | null
          lead_or_follow?: string | null
          lead_partner?: string | null
          location?: string | null
          logo_url?: string | null
          market_sentiment?: string | null
          max_check_size?: number | null
          min_check_size?: number | null
          news_sentiment_score?: number | null
          preferred_stage?: string | null
          recent_deals?: string[] | null
          reputation_score?: number | null
          reputation_updated_at?: string | null
          sector_embedding?: string | null
          sentiment_detail?: string | null
          social_sentiment_score?: number | null
          thesis_verticals?: string[]
          website_url?: string | null
        }
        Update: {
          aum?: string | null
          ca_sb54_compliant?: boolean | null
          community_rating?: number | null
          created_at?: string
          email?: string | null
          email_source?: string | null
          firm_name?: string
          firm_type?: string | null
          founder_reputation_score?: number | null
          headcount?: string | null
          id?: string
          is_actively_deploying?: boolean | null
          is_popular?: boolean | null
          is_recent?: boolean | null
          is_trending?: boolean | null
          last_enriched_at?: string | null
          lead_or_follow?: string | null
          lead_partner?: string | null
          location?: string | null
          logo_url?: string | null
          market_sentiment?: string | null
          max_check_size?: number | null
          min_check_size?: number | null
          news_sentiment_score?: number | null
          preferred_stage?: string | null
          recent_deals?: string[] | null
          reputation_score?: number | null
          reputation_updated_at?: string | null
          sector_embedding?: string | null
          sentiment_detail?: string | null
          social_sentiment_score?: number | null
          thesis_verticals?: string[]
          website_url?: string | null
        }
        Relationships: []
      }
      investor_partners: {
        Row: {
          created_at: string
          firm_id: string
          full_name: string
          id: string
          is_active: boolean
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          firm_id: string
          full_name: string
          id?: string
          is_active?: boolean
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          firm_id?: string
          full_name?: string
          id?: string
          is_active?: boolean
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investor_partners_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "investor_database"
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
      investor_reviews: {
        Row: {
          comment: string | null
          created_at: string
          did_respond: boolean | null
          firm_id: string
          founder_id: string
          id: string
          interaction_detail: string | null
          interaction_type: string
          is_anonymous: boolean
          nps_score: number
          person_id: string
          star_ratings: Record<string, number>
        }
        Insert: {
          comment?: string | null
          created_at?: string
          did_respond?: boolean | null
          firm_id: string
          founder_id: string
          id?: string
          interaction_detail?: string | null
          interaction_type?: string
          is_anonymous?: boolean
          nps_score: number
          person_id?: string
          star_ratings?: Record<string, number>
        }
        Update: {
          comment?: string | null
          created_at?: string
          did_respond?: boolean | null
          firm_id?: string
          founder_id?: string
          id?: string
          interaction_detail?: string | null
          interaction_type?: string
          is_anonymous?: boolean
          nps_score?: number
          person_id?: string
          star_ratings?: Record<string, number>
        }
        Relationships: []
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
          nps: number
          score_feedback: number | null
          score_follow_thru: number | null
          score_resp: number | null
          score_respect: number | null
          score_value_add: number | null
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
          nps: number
          score_feedback?: number | null
          score_follow_thru?: number | null
          score_resp?: number | null
          score_respect?: number | null
          score_value_add?: number | null
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
          nps?: number
          score_feedback?: number | null
          score_follow_thru?: number | null
          score_resp?: number | null
          score_respect?: number | null
          score_value_add?: number | null
          vc_firm_id?: string | null
          vc_person_id?: string | null
          verified?: boolean
        }
        Relationships: []
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
            referencedRelation: "investor_database"
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
    }
    Views: {
      investor_directory_safe: {
        Row: {
          aum: string | null
          ca_sb54_compliant: boolean | null
          created_at: string | null
          email: string | null
          email_source: string | null
          firm_name: string | null
          id: string | null
          last_enriched_at: string | null
          lead_or_follow: string | null
          lead_partner: string | null
          location: string | null
          logo_url: string | null
          market_sentiment: string | null
          max_check_size: number | null
          min_check_size: number | null
          preferred_stage: string | null
          recent_deals: string[] | null
          sector_embedding: string | null
          sentiment_detail: string | null
          thesis_verticals: string[] | null
          website_url: string | null
        }
        Insert: {
          aum?: string | null
          ca_sb54_compliant?: boolean | null
          created_at?: string | null
          email?: never
          email_source?: never
          firm_name?: string | null
          id?: string | null
          last_enriched_at?: string | null
          lead_or_follow?: string | null
          lead_partner?: string | null
          location?: string | null
          logo_url?: string | null
          market_sentiment?: string | null
          max_check_size?: number | null
          min_check_size?: number | null
          preferred_stage?: string | null
          recent_deals?: string[] | null
          sector_embedding?: string | null
          sentiment_detail?: string | null
          thesis_verticals?: string[] | null
          website_url?: string | null
        }
        Update: {
          aum?: string | null
          ca_sb54_compliant?: boolean | null
          created_at?: string | null
          email?: never
          email_source?: never
          firm_name?: string | null
          id?: string | null
          last_enriched_at?: string | null
          lead_or_follow?: string | null
          lead_partner?: string | null
          location?: string | null
          logo_url?: string | null
          market_sentiment?: string | null
          max_check_size?: number | null
          min_check_size?: number | null
          preferred_stage?: string | null
          recent_deals?: string[] | null
          sector_embedding?: string | null
          sentiment_detail?: string | null
          thesis_verticals?: string[] | null
          website_url?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
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
      get_collaborative_recommendations: {
        Args: { _current_founder_id: string }
        Returns: {
          firm_id: string
          firm_name: string
          peer_save_count: number
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
      reveal_contact_info: { Args: { _investor_id: string }; Returns: Json }
    }
    Enums: {
      app_permission: "user" | "manager" | "admin" | "god"
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
    },
  },
} as const
