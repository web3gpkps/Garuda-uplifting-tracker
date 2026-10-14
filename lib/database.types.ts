// Supabase schema types for the migrations in supabase/migrations/.
// Same shape as `supabase gen types typescript --local`. Regenerate with:
//   supabase gen types typescript --local > lib/database.types.ts

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
    PostgrestVersion: "13.0.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      action_items: {
        Row: {
          action: string | null
          aspect: string | null
          code: string
          due_date: string | null
          evidence: string | null
          group_name: string
          kind: string | null
          kps_notes: string | null
          pic: string | null
          progress: number
          root_cause: string | null
          schedule: string | null
          sort_order: number | null
          source: string | null
          status: string
          target: string | null
          updated_at: string
          updated_by_link: string | null
          updated_on: string | null
        }
        Insert: {
          action?: string | null
          aspect?: string | null
          code: string
          due_date?: string | null
          evidence?: string | null
          group_name: string
          kind?: string | null
          kps_notes?: string | null
          pic?: string | null
          progress?: number
          root_cause?: string | null
          schedule?: string | null
          sort_order?: number | null
          source?: string | null
          status?: string
          target?: string | null
          updated_at?: string
          updated_by_link?: string | null
          updated_on?: string | null
        }
        Update: {
          action?: string | null
          aspect?: string | null
          code?: string
          due_date?: string | null
          evidence?: string | null
          group_name?: string
          kind?: string | null
          kps_notes?: string | null
          pic?: string | null
          progress?: number
          root_cause?: string | null
          schedule?: string | null
          sort_order?: number | null
          source?: string | null
          status?: string
          target?: string | null
          updated_at?: string
          updated_by_link?: string | null
          updated_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "action_items_updated_by_link_fkey"
            columns: ["updated_by_link"]
            isOneToOne: false
            referencedRelation: "share_links"
            referencedColumns: ["id"]
          },
        ]
      }
      admins: {
        Row: {
          created_at: string
          email: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      bmi_checks: {
        Row: {
          check_date: string | null
          height_cm: number
          id: number
          period: number
          staff_code: string
          updated_at: string
          updated_by_link: string | null
          updated_by_user: string | null
          weight_kg: number
        }
        Insert: {
          check_date?: string | null
          height_cm: number
          id?: number
          period: number
          staff_code: string
          updated_at?: string
          updated_by_link?: string | null
          updated_by_user?: string | null
          weight_kg: number
        }
        Update: {
          check_date?: string | null
          height_cm?: number
          id?: number
          period?: number
          staff_code?: string
          updated_at?: string
          updated_by_link?: string | null
          updated_by_user?: string | null
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "bmi_checks_staff_code_fkey"
            columns: ["staff_code"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "bmi_checks_updated_by_link_fkey"
            columns: ["updated_by_link"]
            isOneToOne: false
            referencedRelation: "share_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bmi_checks_updated_by_user_fkey"
            columns: ["updated_by_user"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          branch_code: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          email: string
          full_name: string
          id: string
          status: Database["public"]["Enums"]["account_status"]
        }
        Insert: {
          branch_code: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          email: string
          full_name?: string
          id: string
          status?: Database["public"]["Enums"]["account_status"]
        }
        Update: {
          branch_code?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          email?: string
          full_name?: string
          id?: string
          status?: Database["public"]["Enums"]["account_status"]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      remedials: {
        Row: {
          action: string | null
          id: number
          notes: string | null
          post_test: number | null
          remedial_on: string | null
          reported: string | null
          role_play: number | null
          sort_order: number | null
          staff_code: string
          updated_at: string
          updated_by_link: string | null
        }
        Insert: {
          action?: string | null
          id?: number
          notes?: string | null
          post_test?: number | null
          remedial_on?: string | null
          reported?: string | null
          role_play?: number | null
          sort_order?: number | null
          staff_code: string
          updated_at?: string
          updated_by_link?: string | null
        }
        Update: {
          action?: string | null
          id?: number
          notes?: string | null
          post_test?: number | null
          remedial_on?: string | null
          reported?: string | null
          role_play?: number | null
          sort_order?: number | null
          staff_code?: string
          updated_at?: string
          updated_by_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "remedials_staff_code_fkey"
            columns: ["staff_code"]
            isOneToOne: true
            referencedRelation: "staff"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "remedials_updated_by_link_fkey"
            columns: ["updated_by_link"]
            isOneToOne: false
            referencedRelation: "share_links"
            referencedColumns: ["id"]
          },
        ]
      }
      replacements: {
        Row: {
          effective_on: string | null
          final_result: number | null
          id: number
          notes: string | null
          post_test: number | null
          program: string | null
          reason: string | null
          replaced_name: string
          replacement_name: string | null
          reported: string | null
          sort_order: number | null
          staff_code: string | null
          station: string | null
          training_on: string | null
          updated_at: string
          updated_by_link: string | null
          withdrawn_on: string | null
        }
        Insert: {
          effective_on?: string | null
          final_result?: number | null
          id?: number
          notes?: string | null
          post_test?: number | null
          program?: string | null
          reason?: string | null
          replaced_name: string
          replacement_name?: string | null
          reported?: string | null
          sort_order?: number | null
          staff_code?: string | null
          station?: string | null
          training_on?: string | null
          updated_at?: string
          updated_by_link?: string | null
          withdrawn_on?: string | null
        }
        Update: {
          effective_on?: string | null
          final_result?: number | null
          id?: number
          notes?: string | null
          post_test?: number | null
          program?: string | null
          reason?: string | null
          replaced_name?: string
          replacement_name?: string | null
          reported?: string | null
          sort_order?: number | null
          staff_code?: string | null
          station?: string | null
          training_on?: string | null
          updated_at?: string
          updated_by_link?: string | null
          withdrawn_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "replacements_staff_code_fkey"
            columns: ["staff_code"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "replacements_station_fkey"
            columns: ["station"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "replacements_updated_by_link_fkey"
            columns: ["updated_by_link"]
            isOneToOne: false
            referencedRelation: "share_links"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          bmi_first_check: string
          bmi_interval_days: number
          bmi_interval_months: number
          bmi_normal_max: number
          bmi_overweight_max: number
          bmi_periods: number
          bmi_underweight_below: number
          coverage_done: number
          id: number
          pass_grade: number
          replacement_deadline: string
          target_coverage: number
          target_interactive: number
          target_knowledge: number
          target_overweight_max: number
          target_overweight_months: number
          target_pass_rate: number
          updated_at: string
          week1_start: string
          weeks: number
          weight_post_test: number
          weight_role_play: number
        }
        Insert: {
          bmi_first_check: string
          bmi_interval_days: number
          bmi_interval_months: number
          bmi_normal_max: number
          bmi_overweight_max: number
          bmi_periods: number
          bmi_underweight_below: number
          coverage_done: number
          id?: number
          pass_grade: number
          replacement_deadline: string
          target_coverage: number
          target_interactive: number
          target_knowledge: number
          target_overweight_max: number
          target_overweight_months: number
          target_pass_rate: number
          updated_at?: string
          week1_start: string
          weeks: number
          weight_post_test: number
          weight_role_play: number
        }
        Update: {
          bmi_first_check?: string
          bmi_interval_days?: number
          bmi_interval_months?: number
          bmi_normal_max?: number
          bmi_overweight_max?: number
          bmi_periods?: number
          bmi_underweight_below?: number
          coverage_done?: number
          id?: number
          pass_grade?: number
          replacement_deadline?: string
          target_coverage?: number
          target_interactive?: number
          target_knowledge?: number
          target_overweight_max?: number
          target_overweight_months?: number
          target_pass_rate?: number
          updated_at?: string
          week1_start?: string
          weeks?: number
          weight_post_test?: number
          weight_role_play?: number
        }
        Relationships: []
      }
      share_links: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          label: string | null
          last_used_at: string | null
          revoked_at: string | null
          scope: string
          token: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          last_used_at?: string | null
          revoked_at?: string | null
          scope: string
          token?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          last_used_at?: string | null
          revoked_at?: string | null
          scope?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          assignment_status: string
          bmi_has_note: boolean | null
          bmi_note: string | null
          code: string
          created_at: string
          employee_no: string | null
          feedback: string | null
          gender: string | null
          name: string
          notes: string | null
          post_test: number | null
          program: string | null
          provider: string | null
          report_remark: string | null
          role_play: number | null
          sort_order: number | null
          station: string
          touch_point: string | null
          updated_at: string
          updated_by_link: string | null
        }
        Insert: {
          assignment_status?: string
          bmi_has_note?: boolean | null
          bmi_note?: string | null
          code: string
          created_at?: string
          employee_no?: string | null
          feedback?: string | null
          gender?: string | null
          name: string
          notes?: string | null
          post_test?: number | null
          program?: string | null
          provider?: string | null
          report_remark?: string | null
          role_play?: number | null
          sort_order?: number | null
          station: string
          touch_point?: string | null
          updated_at?: string
          updated_by_link?: string | null
        }
        Update: {
          assignment_status?: string
          bmi_has_note?: boolean | null
          bmi_note?: string | null
          code?: string
          created_at?: string
          employee_no?: string | null
          feedback?: string | null
          gender?: string | null
          name?: string
          notes?: string | null
          post_test?: number | null
          program?: string | null
          provider?: string | null
          report_remark?: string | null
          role_play?: number | null
          sort_order?: number | null
          station?: string
          touch_point?: string | null
          updated_at?: string
          updated_by_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_station_fkey"
            columns: ["station"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "staff_updated_by_link_fkey"
            columns: ["updated_by_link"]
            isOneToOne: false
            referencedRelation: "share_links"
            referencedColumns: ["id"]
          },
        ]
      }
      stations: {
        Row: {
          code: string
          sort: number
        }
        Insert: {
          code: string
          sort: number
        }
        Update: {
          code?: string
          sort?: number
        }
        Relationships: []
      }
      sync_conflicts: {
        Row: {
          baseline: Json | null
          column_name: string | null
          created_at: string
          db_value: Json | null
          id: number
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          row_key: string | null
          sheet_value: Json | null
          table_name: string
        }
        Insert: {
          baseline?: Json | null
          column_name?: string | null
          created_at?: string
          db_value?: Json | null
          id?: number
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          row_key?: string | null
          sheet_value?: Json | null
          table_name: string
        }
        Update: {
          baseline?: Json | null
          column_name?: string | null
          created_at?: string
          db_value?: Json | null
          id?: number
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          row_key?: string | null
          sheet_value?: Json | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_conflicts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_state: {
        Row: {
          baseline: Json
          failures: number
          id: boolean
          initialized: boolean
          last_error: string | null
          last_ping_at: string | null
          last_success_at: string | null
          lease_token: string | null
          lease_until: string | null
        }
        Insert: {
          baseline?: Json
          failures?: number
          id?: boolean
          initialized?: boolean
          last_error?: string | null
          last_ping_at?: string | null
          last_success_at?: string | null
          lease_token?: string | null
          lease_until?: string | null
        }
        Update: {
          baseline?: Json
          failures?: number
          id?: boolean
          initialized?: boolean
          last_error?: string | null
          last_ping_at?: string | null
          last_success_at?: string | null
          lease_token?: string | null
          lease_until?: string | null
        }
        Relationships: []
      }
      weekly_reports: {
        Row: {
          findings: string | null
          scope: string
          updated_at: string
          updated_by_link: string | null
          week: number
        }
        Insert: {
          findings?: string | null
          scope: string
          updated_at?: string
          updated_by_link?: string | null
          week: number
        }
        Update: {
          findings?: string | null
          scope?: string
          updated_at?: string
          updated_by_link?: string | null
          week?: number
        }
        Relationships: [
          {
            foreignKeyName: "weekly_reports_updated_by_link_fkey"
            columns: ["updated_by_link"]
            isOneToOne: false
            referencedRelation: "share_links"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_scores: {
        Row: {
          coaching_notes: string | null
          gap_topic: string | null
          id: number
          observer: string | null
          score_attitude: number | null
          score_communication: number | null
          score_grooming: number | null
          score_knowledge: number | null
          staff_code: string
          touch_point: string | null
          updated_at: string
          updated_by: string | null
          updated_by_link: string | null
          week: number
        }
        Insert: {
          coaching_notes?: string | null
          gap_topic?: string | null
          id?: number
          observer?: string | null
          score_attitude?: number | null
          score_communication?: number | null
          score_grooming?: number | null
          score_knowledge?: number | null
          staff_code: string
          touch_point?: string | null
          updated_at?: string
          updated_by?: string | null
          updated_by_link?: string | null
          week: number
        }
        Update: {
          coaching_notes?: string | null
          gap_topic?: string | null
          id?: number
          observer?: string | null
          score_attitude?: number | null
          score_communication?: number | null
          score_grooming?: number | null
          score_knowledge?: number | null
          staff_code?: string
          touch_point?: string | null
          updated_at?: string
          updated_by?: string | null
          updated_by_link?: string | null
          week?: number
        }
        Relationships: [
          {
            foreignKeyName: "weekly_scores_staff_code_fkey"
            columns: ["staff_code"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "weekly_scores_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_scores_updated_by_link_fkey"
            columns: ["updated_by_link"]
            isOneToOne: false
            referencedRelation: "share_links"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_delete_account: { Args: { p_user_id: string }; Returns: undefined }
      is_admin: { Args: never; Returns: boolean }
      registration_branches: { Args: never; Returns: string[] }
      share_delete_remedial: {
        Args: {
          p_staff_code: string
          p_token: string
        }
        Returns: Json
      }
      share_delete_replacement: {
        Args: {
          p_id: number
          p_token: string
        }
        Returns: Json
      }
      share_kps_save_staff_baseline: {
        Args: {
          p_code: string
          p_feedback: string
          p_post_test: number
          p_report_remark: string
          p_role_play: number
          p_token: string
        }
        Returns: Json
      }
      share_kps_update_action_item: {
        Args: {
          p_action: string
          p_aspect: string
          p_code: string
          p_due_date: string
          p_group_name: string
          p_kind: string
          p_kps_notes: string
          p_pic: string
          p_root_cause: string
          p_schedule: string
          p_source: string
          p_target: string
          p_token: string
        }
        Returns: Json
      }
      share_open: { Args: { p_token: string }; Returns: Json }
      share_save_check: {
        Args: {
          p_check_date: string
          p_height_cm: number
          p_period: number
          p_staff_code: string
          p_token: string
          p_weight_kg: number
        }
        Returns: Json
      }
      share_save_profile: {
        Args: {
          p_bmi_has_note: boolean
          p_bmi_note: string
          p_gender: string
          p_staff_code: string
          p_token: string
        }
        Returns: Json
      }
      share_save_remedial: {
        Args: {
          p_action: string
          p_notes: string
          p_post_test: number
          p_remedial_on: string
          p_reported: string
          p_role_play: number
          p_staff_code: string
          p_token: string
        }
        Returns: Json
      }
      share_save_replacement: {
        Args: {
          p_effective_on: string
          p_final_result: number
          p_id: number
          p_notes: string
          p_post_test: number
          p_program: string
          p_reason: string
          p_replaced_name: string
          p_replacement_name: string
          p_reported: string
          p_staff_code: string
          p_station: string
          p_token: string
          p_training_on: string
          p_withdrawn_on: string
        }
        Returns: Json
      }
      share_save_staff: {
        Args: {
          p_assignment_status: string
          p_code: string
          p_employee_no: string
          p_gender: string
          p_name: string
          p_notes: string
          p_program: string
          p_provider: string
          p_station: string
          p_token: string
          p_touch_point: string
        }
        Returns: Json
      }
      share_save_weekly_report: {
        Args: {
          p_findings: string
          p_token: string
          p_week: number
        }
        Returns: Json
      }
      share_save_weekly_score: {
        Args: {
          p_coaching_notes: string
          p_gap_topic: string
          p_observer: string
          p_score_attitude: number
          p_score_communication: number
          p_score_grooming: number
          p_score_knowledge: number
          p_staff_code: string
          p_token: string
          p_touch_point: string
          p_week: number
        }
        Returns: Json
      }
      share_update_action_item: {
        Args: {
          p_code: string
          p_evidence: string
          p_progress: number
          p_status: string
          p_token: string
          p_updated_on: string
        }
        Returns: Json
      }
      sync_claim_lease: { Args: { p_ttl_seconds: number }; Returns: string }
      sync_release_lease: {
        Args: {
          p_baseline?: Json
          p_error?: string
          p_token: string
        }
        Returns: boolean
      }
    }
    Enums: {
      account_status: "pending" | "active" | "inactive"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
