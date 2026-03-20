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
      company_analyses: {
        Row: {
          burn_rate: string | null
          cac: string | null
          company_name: string
          created_at: string
          deck_file_path: string | null
          deck_text: string | null
          executive_summary: string | null
          health_score: number | null
          id: string
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
          company_name?: string
          created_at?: string
          deck_file_path?: string | null
          deck_text?: string | null
          executive_summary?: string | null
          health_score?: number | null
          id?: string
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
          company_name?: string
          created_at?: string
          deck_file_path?: string | null
          deck_text?: string | null
          executive_summary?: string | null
          health_score?: number | null
          id?: string
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
      investor_database: {
        Row: {
          ca_sb54_compliant: boolean | null
          created_at: string
          firm_name: string
          id: string
          lead_or_follow: string | null
          lead_partner: string | null
          location: string | null
          market_sentiment: string | null
          max_check_size: number | null
          min_check_size: number | null
          preferred_stage: string | null
          recent_deals: string[] | null
          sentiment_detail: string | null
          thesis_verticals: string[]
        }
        Insert: {
          ca_sb54_compliant?: boolean | null
          created_at?: string
          firm_name: string
          id?: string
          lead_or_follow?: string | null
          lead_partner?: string | null
          location?: string | null
          market_sentiment?: string | null
          max_check_size?: number | null
          min_check_size?: number | null
          preferred_stage?: string | null
          recent_deals?: string[] | null
          sentiment_detail?: string | null
          thesis_verticals?: string[]
        }
        Update: {
          ca_sb54_compliant?: boolean | null
          created_at?: string
          firm_name?: string
          id?: string
          lead_or_follow?: string | null
          lead_partner?: string | null
          location?: string | null
          market_sentiment?: string | null
          max_check_size?: number | null
          min_check_size?: number | null
          preferred_stage?: string | null
          recent_deals?: string[] | null
          sentiment_detail?: string | null
          thesis_verticals?: string[]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
