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
      firm_records: {
        Row: {
          address: string | null
          aliases: string[]
          angellist_url: string | null
          aum: string | null
          beehiiv_url: string | null
          ca_sb54_compliant: boolean | null
          cb_insights_url: string | null
          canonical_hq_locked: boolean
          canonical_hq_set_at: string | null
          canonical_hq_source: string | null
          community_rating: number | null
          created_at: string
          crunchbase_url: string | null
          data_confidence_score: number | null
          deleted_at: string | null
          description: string | null
          elevator_pitch: string | null
          email: string | null
          email_source: string | null
          entity_type: Database["public"]["Enums"]["entity_type"] | null
          facebook_url: string | null
          firm_name: string
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
          id: string
          industry_reputation: number | null
          instagram_url: string | null
          is_actively_deploying: boolean | null
          is_popular: boolean | null
          is_recent: boolean | null
          is_trending: boolean | null
          last_enriched_at: string | null
          last_verified_at: string | null
          lead_or_follow: string | null
          lead_partner: string | null
          legal_name: string | null
          linkedin_url: string | null
          location: string | null
          locations: Record<string, unknown> | null
          logo_url: string | null
          market_sentiment: string | null
          match_score: number | null
          max_check_size: number | null
          medium_url: string | null
          min_check_size: number | null
          network_strength: number | null
          news_sentiment_score: number | null
          next_update_scheduled_at: string | null
          normalized_name: string | null
          openvc_url: string | null
          partner_names: string[] | null
          phone: string | null
          preferred_stage: string | null
          prisma_firm_id: string | null
          recent_deals: string[] | null
          reputation_score: number | null
          reputation_updated_at: string | null
          responsiveness_score: number | null
          sector_embedding: string | null
          sector_scope: Database["public"]["Enums"]["sector_scope_enum"] | null
          sentiment_detail: string | null
          signal_nfx_url: string | null
          slug: string | null
          social_sentiment_score: number | null
          stage_focus: Database["public"]["Enums"]["stage_focus_enum"][] | null
          stage_max: Database["public"]["Enums"]["stage_focus_enum"] | null
          stage_min: Database["public"]["Enums"]["stage_focus_enum"] | null
          status: string | null
          strategy_classifications: Database["public"]["Enums"]["firm_strategy_classification"][]
          substack_url: string | null
          search_vector: unknown | null
          thesis_orientation: Database["public"]["Enums"]["thesis_orientation"] | null
          thesis_verticals: string[]
          tiktok_url: string | null
          total_headcount: number | null
          total_investors: number | null
          total_partners: number | null
          trustfinta_url: string | null
          updated_at: string | null
          value_add_score: number | null
          vcsheet_url: string | null
          verification_status: string | null
          volatility_score: number | null
          website_url: string | null
          x_url: string | null
          youtube_url: string | null
        }
        Insert: {
          address?: string | null
          aliases?: string[]
          angellist_url?: string | null
          aum?: string | null
          beehiiv_url?: string | null
          ca_sb54_compliant?: boolean | null
          cb_insights_url?: string | null
          canonical_hq_locked?: boolean
          canonical_hq_set_at?: string | null
          canonical_hq_source?: string | null
          community_rating?: number | null
          created_at?: string
          crunchbase_url?: string | null
          data_confidence_score?: number | null
          deleted_at?: string | null
          description?: string | null
          elevator_pitch?: string | null
          email?: string | null
          email_source?: string | null
          entity_type?: Database["public"]["Enums"]["entity_type"] | null
          facebook_url?: string | null
          firm_name: string
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
          id?: string
          industry_reputation?: number | null
          instagram_url?: string | null
          is_actively_deploying?: boolean | null
          is_popular?: boolean | null
          is_recent?: boolean | null
          is_trending?: boolean | null
          last_enriched_at?: string | null
          last_verified_at?: string | null
          lead_or_follow?: string | null
          lead_partner?: string | null
          legal_name?: string | null
          linkedin_url?: string | null
          location?: string | null
          locations?: Record<string, unknown> | null
          logo_url?: string | null
          market_sentiment?: string | null
          match_score?: number | null
          max_check_size?: number | null
          medium_url?: string | null
          min_check_size?: number | null
          network_strength?: number | null
          news_sentiment_score?: number | null
          next_update_scheduled_at?: string | null
          normalized_name?: string | null
          openvc_url?: string | null
          partner_names?: string[] | null
          phone?: string | null
          preferred_stage?: string | null
          prisma_firm_id?: string | null
          recent_deals?: string[] | null
          reputation_score?: number | null
          reputation_updated_at?: string | null
          responsiveness_score?: number | null
          sector_embedding?: string | null
          sector_scope?: Database["public"]["Enums"]["sector_scope_enum"] | null
          sentiment_detail?: string | null
          signal_nfx_url?: string | null
          slug?: string | null
          social_sentiment_score?: number | null
          stage_focus?: Database["public"]["Enums"]["stage_focus_enum"][] | null
          stage_max?: Database["public"]["Enums"]["stage_focus_enum"] | null
          stage_min?: Database["public"]["Enums"]["stage_focus_enum"] | null
          status?: string | null
          strategy_classifications?: Database["public"]["Enums"]["firm_strategy_classification"][]
          substack_url?: string | null
          search_vector?: unknown | null
          thesis_orientation?: Database["public"]["Enums"]["thesis_orientation"] | null
          thesis_verticals?: string[]
          tiktok_url?: string | null
          total_headcount?: number | null
          total_investors?: number | null
          total_partners?: number | null
          trustfinta_url?: string | null
          updated_at?: string | null
          value_add_score?: number | null
          vcsheet_url?: string | null
          verification_status?: string | null
          volatility_score?: number | null
          website_url?: string | null
          x_url?: string | null
          youtube_url?: string | null
        }
        Update: {
          address?: string | null
          angellist_url?: string | null
          aum?: string | null
          beehiiv_url?: string | null
          ca_sb54_compliant?: boolean | null
          cb_insights_url?: string | null
          canonical_hq_locked?: boolean
          canonical_hq_set_at?: string | null
          canonical_hq_source?: string | null
          community_rating?: number | null
          created_at?: string
          crunchbase_url?: string | null
          data_confidence_score?: number | null
          deleted_at?: string | null
          description?: string | null
          elevator_pitch?: string | null
          email?: string | null
          email_source?: string | null
          entity_type?: Database["public"]["Enums"]["entity_type"] | null
          facebook_url?: string | null
          firm_name?: string
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
          id?: string
          industry_reputation?: number | null
          instagram_url?: string | null
          is_actively_deploying?: boolean | null
          is_popular?: boolean | null
          is_recent?: boolean | null
          is_trending?: boolean | null
          last_enriched_at?: string | null
          last_verified_at?: string | null
          lead_or_follow?: string | null
          lead_partner?: string | null
          legal_name?: string | null
          linkedin_url?: string | null
          location?: string | null
          locations?: Record<string, unknown> | null
          logo_url?: string | null
          market_sentiment?: string | null
          match_score?: number | null
          max_check_size?: number | null
          medium_url?: string | null
          min_check_size?: number | null
          network_strength?: number | null
          news_sentiment_score?: number | null
          next_update_scheduled_at?: string | null
          normalized_name?: string | null
          openvc_url?: string | null
          partner_names?: string[] | null
          phone?: string | null
          preferred_stage?: string | null
          prisma_firm_id?: string | null
          recent_deals?: string[] | null
          reputation_score?: number | null
          reputation_updated_at?: string | null
          responsiveness_score?: number | null
          sector_embedding?: string | null
          sector_scope?: Database["public"]["Enums"]["sector_scope_enum"] | null
          sentiment_detail?: string | null
          signal_nfx_url?: string | null
          slug?: string | null
          social_sentiment_score?: number | null
          stage_focus?: Database["public"]["Enums"]["stage_focus_enum"][] | null
          stage_max?: Database["public"]["Enums"]["stage_focus_enum"] | null
          stage_min?: Database["public"]["Enums"]["stage_focus_enum"] | null
          status?: string | null
          strategy_classifications?: Database["public"]["Enums"]["firm_strategy_classification"][]
          substack_url?: string | null
          search_vector?: unknown | null
          thesis_orientation?: Database["public"]["Enums"]["thesis_orientation"] | null
          thesis_verticals?: string[]
          tiktok_url?: string | null
          total_headcount?: number | null
          total_investors?: number | null
          total_partners?: number | null
          trustfinta_url?: string | null
          updated_at?: string | null
          value_add_score?: number | null
          vcsheet_url?: string | null
          verification_status?: string | null
          volatility_score?: number | null
          website_url?: string | null
          x_url?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      firm_records_hq_audit: {
        Row: {
          changed_at: string
          firm_id: string
          id: string
          new_hq_city: string | null
          new_hq_country: string | null
          new_hq_state: string | null
          new_location: string | null
          old_hq_city: string | null
          old_hq_country: string | null
          old_hq_state: string | null
          old_location: string | null
          source: string | null
        }
        Insert: {
          changed_at?: string
          firm_id: string
          id?: string
          new_hq_city?: string | null
          new_hq_country?: string | null
          new_hq_state?: string | null
          new_location?: string | null
          old_hq_city?: string | null
          old_hq_country?: string | null
          old_hq_state?: string | null
          old_location?: string | null
          source?: string | null
        }
        Update: {
          changed_at?: string
          firm_id?: string
          id?: string
          new_hq_city?: string | null
          new_hq_country?: string | null
          new_hq_state?: string | null
          new_location?: string | null
          old_hq_city?: string | null
          old_hq_country?: string | null
          old_hq_state?: string | null
          old_location?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "firm_records_hq_audit_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_records"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_investors: {
        Row: {
          avatar_url: string | null
          profile_image_url: string | null
          profile_image_last_fetched_at: string | null
          background_summary: string | null
          bio: string | null
          check_size_max: number | null
          check_size_min: number | null
          city: string | null
          cold_outreach_ok: boolean
          country: string | null
          created_at: string
          deleted_at: string | null
          education_summary: string | null
          email: string | null
          facebook_url: string | null
          firm_id: string
          first_name: string | null
          full_name: string
          id: string
          instagram_url: string | null
          investment_style: string | null
          is_active: boolean
          is_actively_investing: boolean
          last_active_date: string | null
          last_name: string | null
          linkedin_url: string | null
          match_score: number | null
          medium_url: string | null
          needs_review: boolean
          network_strength: number | null
          normalized_full_name: string | null
          personal_thesis_tags: string[] | null
          phone: string | null
          preferred_name: string | null
          prior_firms: string[] | null
          prisma_person_id: string | null
          recent_deal_count: number | null
          reputation_score: number | null
          responsiveness_score: number | null
          sector_focus: string[] | null
          stage_focus: string[] | null
          state: string | null
          substack_url: string | null
          tiktok_url: string | null
          timezone: string | null
          title: string | null
          updated_at: string
          value_add_score: number | null
          warm_intro_preferred: boolean
          website_url: string | null
          x_url: string | null
          youtube_url: string | null
        }
        Insert: {
          avatar_url?: string | null
          profile_image_url?: string | null
          profile_image_last_fetched_at?: string | null
          background_summary?: string | null
          bio?: string | null
          check_size_max?: number | null
          check_size_min?: number | null
          city?: string | null
          cold_outreach_ok?: boolean
          country?: string | null
          created_at?: string
          deleted_at?: string | null
          education_summary?: string | null
          email?: string | null
          facebook_url?: string | null
          firm_id: string
          first_name?: string | null
          full_name: string
          id?: string
          instagram_url?: string | null
          investment_style?: string | null
          is_active?: boolean
          is_actively_investing?: boolean
          last_active_date?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          match_score?: number | null
          medium_url?: string | null
          needs_review?: boolean
          network_strength?: number | null
          normalized_full_name?: string | null
          personal_thesis_tags?: string[] | null
          phone?: string | null
          preferred_name?: string | null
          prior_firms?: string[] | null
          prisma_person_id?: string | null
          recent_deal_count?: number | null
          reputation_score?: number | null
          responsiveness_score?: number | null
          sector_focus?: string[] | null
          stage_focus?: string[] | null
          state?: string | null
          substack_url?: string | null
          tiktok_url?: string | null
          timezone?: string | null
          title?: string | null
          updated_at?: string
          value_add_score?: number | null
          warm_intro_preferred?: boolean
          website_url?: string | null
          x_url?: string | null
          youtube_url?: string | null
        }
        Update: {
          avatar_url?: string | null
          profile_image_url?: string | null
          profile_image_last_fetched_at?: string | null
          background_summary?: string | null
          bio?: string | null
          check_size_max?: number | null
          check_size_min?: number | null
          city?: string | null
          cold_outreach_ok?: boolean
          country?: string | null
          created_at?: string
          deleted_at?: string | null
          education_summary?: string | null
          email?: string | null
          facebook_url?: string | null
          firm_id?: string
          first_name?: string | null
          full_name?: string
          id?: string
          instagram_url?: string | null
          investment_style?: string | null
          is_active?: boolean
          is_actively_investing?: boolean
          last_active_date?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          match_score?: number | null
          medium_url?: string | null
          needs_review?: boolean
          network_strength?: number | null
          normalized_full_name?: string | null
          personal_thesis_tags?: string[] | null
          phone?: string | null
          preferred_name?: string | null
          prior_firms?: string[] | null
          prisma_person_id?: string | null
          recent_deal_count?: number | null
          reputation_score?: number | null
          responsiveness_score?: number | null
          sector_focus?: string[] | null
          stage_focus?: string[] | null
          state?: string | null
          substack_url?: string | null
          tiktok_url?: string | null
          timezone?: string | null
          title?: string | null
          updated_at?: string
          value_add_score?: number | null
          warm_intro_preferred?: boolean
          website_url?: string | null
          x_url?: string | null
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "firm_investors_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firm_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firm_investors_firm_id_fkey"
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
          is_draft: boolean
          nps: number | null
          score_feedback: number | null
          score_follow_thru: number | null
          score_resp: number | null
          score_respect: number | null
          score_value_add: number | null
          star_ratings: Record<string, unknown>
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
          star_ratings?: Record<string, unknown>
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
          star_ratings?: Record<string, unknown>
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
      profile_field_provenance: {
        Row: {
          id: string
          profile_id: string
          field_name: string
          source_type: Database["public"]["Enums"]["profile_field_source_type"]
          source_detail: Json | null
          confidence: number | null
          updated_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          field_name: string
          source_type: Database["public"]["Enums"]["profile_field_source_type"]
          source_detail?: Json | null
          confidence?: number | null
          updated_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          field_name?: string
          source_type?: Database["public"]["Enums"]["profile_field_source_type"]
          source_detail?: Json | null
          confidence?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_field_provenance_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          actions_last_30d: number | null
          avatar_url: string | null
          bio: string | null
          capital_raised_lifetime: number | null
          city: string | null
          community_tags: string[]
          company_departed_at: string | null
          company_id: string | null
          company_joined_at: string | null
          company_role: string | null
          country: string | null
          created_at: string
          current_role_title: string | null
          domains_of_expertise: string[]
          engagement_score: number | null
          founder_role: string | null
          founder_seniority: string | null
          fundraising_experience_level: string | null
          full_name: string
          gtm_experience: string | null
          has_completed_onboarding: boolean
          has_prior_exit: boolean | null
          has_seen_settings_tour: boolean
          hiring_experience_level: string | null
          id: string
          intro_preferences: string[]
          intros_made_count: number | null
          is_public: boolean
          last_active_at: string | null
          leadership_style: string | null
          linkedin_url: string | null
          location: string | null
          management_experience_level: string | null
          playbooks_used_count: number | null
          preferred_help_areas: string[]
          primary_expertise: string | null
          prior_exits_count: number | null
          prior_startups_count: number
          region: string | null
          resume_url: string | null
          risk_tolerance: string | null
          timezone: string | null
          title: string | null
          twitter_url: string | null
          updated_at: string
          user_id: string
          user_type: string
          willing_to_advise: boolean | null
          working_style: string | null
          years_experience: number | null
        }
        Insert: {
          actions_last_30d?: number | null
          avatar_url?: string | null
          bio?: string | null
          capital_raised_lifetime?: number | null
          city?: string | null
          community_tags?: string[]
          company_departed_at?: string | null
          company_id?: string | null
          company_joined_at?: string | null
          company_role?: string | null
          country?: string | null
          created_at?: string
          current_role_title?: string | null
          domains_of_expertise?: string[]
          engagement_score?: number | null
          founder_role?: string | null
          founder_seniority?: string | null
          fundraising_experience_level?: string | null
          full_name?: string
          gtm_experience?: string | null
          has_completed_onboarding?: boolean
          has_prior_exit?: boolean | null
          has_seen_settings_tour?: boolean
          hiring_experience_level?: string | null
          id?: string
          intro_preferences?: string[]
          intros_made_count?: number | null
          is_public?: boolean
          last_active_at?: string | null
          leadership_style?: string | null
          linkedin_url?: string | null
          location?: string | null
          management_experience_level?: string | null
          playbooks_used_count?: number | null
          preferred_help_areas?: string[]
          primary_expertise?: string | null
          prior_exits_count?: number | null
          prior_startups_count?: number
          region?: string | null
          resume_url?: string | null
          risk_tolerance?: string | null
          timezone?: string | null
          title?: string | null
          twitter_url?: string | null
          updated_at?: string
          user_id: string
          user_type?: string
          willing_to_advise?: boolean | null
          working_style?: string | null
          years_experience?: number | null
        }
        Update: {
          actions_last_30d?: number | null
          avatar_url?: string | null
          bio?: string | null
          capital_raised_lifetime?: number | null
          city?: string | null
          community_tags?: string[]
          company_departed_at?: string | null
          company_id?: string | null
          company_joined_at?: string | null
          company_role?: string | null
          country?: string | null
          created_at?: string
          current_role_title?: string | null
          domains_of_expertise?: string[]
          engagement_score?: number | null
          founder_role?: string | null
          founder_seniority?: string | null
          fundraising_experience_level?: string | null
          full_name?: string
          gtm_experience?: string | null
          has_completed_onboarding?: boolean
          has_prior_exit?: boolean | null
          has_seen_settings_tour?: boolean
          hiring_experience_level?: string | null
          id?: string
          intro_preferences?: string[]
          intros_made_count?: number | null
          is_public?: boolean
          last_active_at?: string | null
          leadership_style?: string | null
          linkedin_url?: string | null
          location?: string | null
          management_experience_level?: string | null
          playbooks_used_count?: number | null
          preferred_help_areas?: string[]
          primary_expertise?: string | null
          prior_exits_count?: number | null
          prior_startups_count?: number
          region?: string | null
          resume_url?: string | null
          risk_tolerance?: string | null
          timezone?: string | null
          title?: string | null
          twitter_url?: string | null
          updated_at?: string
          user_id?: string
          user_type?: string
          willing_to_advise?: boolean | null
          working_style?: string | null
          years_experience?: number | null
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
      }
    }
    Views: {
      investor_directory_safe: {
        Row: {
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
          strategy_classifications: Database["public"]["Enums"]["firm_strategy_classification"][] | null
          substack_url: string | null
          thesis_orientation: Database["public"]["Enums"]["thesis_orientation"] | null
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
          firm_name?: string | null
          firm_type?: string | null
          founded_year?: number | null
          founder_sentiment_score?: number | null
          general_partner_count?: number | null
          general_partner_names?: string[] | null
          headcount?: string | null
          hq_city?: string | null
          hq_country?: string | null
          hq_state?: string | null
          id?: string | null
          industry_reputation?: number | null
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
          sentiment_detail?: string | null
          slug?: string | null
          social_sentiment_score?: number | null
          status?: string | null
          thesis_verticals?: string[] | null
          total_headcount?: number | null
          total_investors?: number | null
          total_partners?: number | null
          updated_at?: string | null
          value_add_score?: number | null
          verification_status?: number | null
          volatility_score?: number | null
          website_url?: string | null
          x_url?: string | null
        }
        Update: {
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
          firm_name?: string | null
          firm_type?: string | null
          founded_year?: number | null
          founder_sentiment_score?: number | null
          general_partner_count?: number | null
          general_partner_names?: string[] | null
          headcount?: string | null
          hq_city?: string | null
          hq_country?: string | null
          hq_state?: string | null
          id?: string | null
          industry_reputation?: number | null
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
          sentiment_detail?: string | null
          slug?: string | null
          social_sentiment_score?: number | null
          status?: string | null
          thesis_verticals?: string[] | null
          total_headcount?: number | null
          total_investors?: number | null
          total_partners?: number | null
          updated_at?: string | null
          value_add_score?: number | null
          verification_status?: string | null
          volatility_score?: number | null
          website_url?: string | null
          x_url?: string | null
        }
        Relationships: []
      }
      /** Read-only view; coalesced counters. App uses `profiles` + profileRead.ts — see that file. */
      profiles_app_read: {
        Row: {
          actions_last_30d: number
          avatar_url: string | null
          bio: string | null
          capital_raised_lifetime: number | null
          city: string | null
          community_tags: string[]
          company_departed_at: string | null
          company_id: string | null
          company_joined_at: string | null
          company_role: string | null
          country: string | null
          created_at: string
          current_role_title: string | null
          domains_of_expertise: string[]
          engagement_score: number | null
          founder_role: string | null
          founder_seniority: string | null
          fundraising_experience_level: string | null
          full_name: string
          gtm_experience: string | null
          has_completed_onboarding: boolean
          has_prior_exit: boolean | null
          has_seen_settings_tour: boolean
          hiring_experience_level: string | null
          id: string
          intro_preferences: string[]
          intros_made_count: number
          is_public: boolean
          last_active_at: string | null
          leadership_style: string | null
          linkedin_url: string | null
          location: string | null
          management_experience_level: string | null
          playbooks_used_count: number
          preferred_help_areas: string[]
          primary_expertise: string | null
          prior_exits_count: number
          prior_startups_count: number
          region: string | null
          resume_url: string | null
          risk_tolerance: string | null
          timezone: string | null
          title: string | null
          twitter_url: string | null
          updated_at: string
          user_id: string
          user_type: string
          willing_to_advise: boolean | null
          working_style: string | null
          years_experience: number | null
        }
        Insert: Record<string, never>
        Update: Record<string, never>
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
      search_firm_investors: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          avatar_url: string | null
          firm_id: string
          firm_name: string
          full_name: string
          id: string
          match_rank: number
          profile_image_url: string | null
          sim_score: number
          title: string | null
        }[]
      }
      search_firm_records: {
        Args: { p_limit?: number; p_query: string; p_ready_for_live?: boolean | null }
        Returns: Database["public"]["Tables"]["firm_records"]["Row"][]
      }
    }
    Enums: {
      app_permission: "user" | "manager" | "admin" | "god"
      entity_type: "Institutional" | "Micro" | "Solo GP" | "Angel" | "Corporate (CVC)" | "Family Office" | "Accelerator / Studio" | "Syndicate" | "Fund of Funds"
      profile_field_source_type:
        | "user_entered"
        | "imported"
        | "inferred"
        | "computed"
        | "admin_set"
      firm_strategy_classification:
        | "THESIS_DRIVEN"
        | "GENERALIST"
        | "OPERATOR_LED"
        | "PLATFORM_SERVICES_HEAVY"
        | "EVERGREEN_LONG_DURATION"
        | "IMPACT_ESG_DRIVEN"
        | "GEOGRAPHY_SPECIALIST"
        | "FOUNDER_PROFILE_DRIVEN"
      thesis_orientation: "Generalist" | "Sector-Focused" | "Thesis-Driven" | "Founder-First" | "Geographic" | "Operator-led"
      stage_focus_enum: "Friends and Family" | "Pre-Seed" | "Seed" | "Series A" | "Series B+" | "Growth"
      sector_scope_enum: "Generalist" | "Specialized"
      us_region: "West" | "East" | "South" | "Midwest" | "Southwest" | "Southeast" | "Northeast" | "Northwest" | "International"
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
      entity_type: ["Institutional", "Micro", "Solo GP", "Angel", "Corporate (CVC)", "Family Office", "Accelerator / Studio", "Syndicate", "Fund of Funds"],
      profile_field_source_type: ["user_entered", "imported", "inferred", "computed", "admin_set"],
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
      thesis_orientation: ["Generalist", "Sector-Focused", "Thesis-Driven", "Founder-First", "Geographic", "Operator-led"],
      stage_focus_enum: ["Friends and Family", "Pre-Seed", "Seed", "Series A", "Series B+", "Growth"],
      sector_scope_enum: ["Generalist", "Specialized"],
      us_region: ["West", "East", "South", "Midwest", "Southwest", "Southeast", "Northeast", "Northwest", "International"],
    },
  },
} as const
