export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      accounts: {
        Row: {
          balance_agorot: number
          color: string | null
          created_at: string
          currency: string
          household_id: string
          icon: string | null
          id: string
          include_in_total: boolean
          is_active: boolean
          name: string
          owner_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          balance_agorot?: number
          color?: string | null
          created_at?: string
          currency?: string
          household_id: string
          icon?: string | null
          id?: string
          include_in_total?: boolean
          is_active?: boolean
          name: string
          owner_id?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          balance_agorot?: number
          color?: string | null
          created_at?: string
          currency?: string
          household_id?: string
          icon?: string | null
          id?: string
          include_in_total?: boolean
          is_active?: boolean
          name?: string
          owner_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_allocations: {
        Row: {
          amount_agorot: number
          budget_id: string
          category_id: string
          household_id: string
          id: string
        }
        Insert: {
          amount_agorot: number
          budget_id: string
          category_id: string
          household_id: string
          id?: string
        }
        Update: {
          amount_agorot?: number
          budget_id?: string
          category_id?: string
          household_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_allocations_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_allocations_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_allocations_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          created_at: string
          household_id: string
          id: string
          name: string | null
          period_end: string
          period_start: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          name?: string | null
          period_end: string
          period_start: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          name?: string | null
          period_end?: string
          period_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color: string
          created_at: string
          household_id: string | null
          icon: string
          id: string
          is_active: boolean
          is_income: boolean
          is_system: boolean
          name_en: string | null
          name_he: string
          parent_id: string | null
          sort_order: number
        }
        Insert: {
          color?: string
          created_at?: string
          household_id?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          is_income?: boolean
          is_system?: boolean
          name_en?: string | null
          name_he: string
          parent_id?: string | null
          sort_order?: number
        }
        Update: {
          color?: string
          created_at?: string
          household_id?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          is_income?: boolean
          is_system?: boolean
          name_en?: string | null
          name_he?: string
          parent_id?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      category_rules: {
        Row: {
          category_id: string
          created_at: string
          field: string
          household_id: string
          id: string
          is_active: boolean
          is_case_sensitive: boolean
          operator: string
          sort_order: number
          value: string
        }
        Insert: {
          category_id: string
          created_at?: string
          field: string
          household_id: string
          id?: string
          is_active?: boolean
          is_case_sensitive?: boolean
          operator: string
          sort_order?: number
          value: string
        }
        Update: {
          category_id?: string
          created_at?: string
          field?: string
          household_id?: string
          id?: string
          is_active?: boolean
          is_case_sensitive?: boolean
          operator?: string
          sort_order?: number
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_rules_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          household_id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          household_id: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          household_id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      invitations: {
        Row: {
          created_at: string
          email: string | null
          expires_at: string
          household_id: string
          id: string
          invited_by: string | null
          status: string
          token: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          expires_at?: string
          household_id: string
          id?: string
          invited_by?: string | null
          status?: string
          token?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          expires_at?: string
          household_id?: string
          id?: string
          invited_by?: string | null
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      planned_obligations: {
        Row: {
          account_id: string | null
          amount_agorot: number
          category_id: string | null
          created_at: string
          created_by: string | null
          due_date: string
          household_id: string
          id: string
          is_shared: boolean
          name: string
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          amount_agorot: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          due_date: string
          household_id: string
          id?: string
          is_shared?: boolean
          name: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          amount_agorot?: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string
          household_id?: string
          id?: string
          is_shared?: boolean
          name?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "planned_obligations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_obligations_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_obligations_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          locale: string
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          id: string
          locale?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          locale?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      recurring_transactions: {
        Row: {
          account_id: string
          amount_agorot: number
          category_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          day_of_month: number | null
          description: string
          frequency: string
          household_id: string
          id: string
          is_active: boolean
          is_shared: boolean
          last_generated_at: string | null
          next_due_date: string
        }
        Insert: {
          account_id: string
          amount_agorot: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          day_of_month?: number | null
          description: string
          frequency: string
          household_id: string
          id?: string
          is_active?: boolean
          is_shared?: boolean
          last_generated_at?: string | null
          next_due_date: string
        }
        Update: {
          account_id?: string
          amount_agorot?: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          day_of_month?: number | null
          description?: string
          frequency?: string
          household_id?: string
          id?: string
          is_active?: boolean
          is_shared?: boolean
          last_generated_at?: string | null
          next_due_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_transactions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_goals: {
        Row: {
          account_id: string | null
          color: string | null
          created_at: string
          created_by: string | null
          current_agorot: number
          household_id: string
          icon: string | null
          id: string
          is_completed: boolean
          name: string
          target_agorot: number
          target_date: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          current_agorot?: number
          household_id: string
          icon?: string | null
          id?: string
          is_completed?: boolean
          name: string
          target_agorot: number
          target_date?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          current_agorot?: number
          household_id?: string
          icon?: string | null
          id?: string
          is_completed?: boolean
          name?: string
          target_agorot?: number
          target_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_goals_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_goals_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string
          amount_agorot: number
          category_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string
          household_id: string
          id: string
          is_excluded: boolean
          is_shared: boolean
          matched_rule_id: string | null
          merchant_name: string | null
          note: string | null
          payer_id: string | null
          receipt_url: string | null
          recurring_id: string | null
          source: string
          transfer_id: string | null
          txn_date: string
          updated_at: string
        }
        Insert: {
          account_id: string
          amount_agorot: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description: string
          household_id: string
          id?: string
          is_excluded?: boolean
          is_shared?: boolean
          matched_rule_id?: string | null
          merchant_name?: string | null
          note?: string | null
          payer_id?: string | null
          receipt_url?: string | null
          recurring_id?: string | null
          source?: string
          transfer_id?: string | null
          txn_date: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          amount_agorot?: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string
          household_id?: string
          id?: string
          is_excluded?: boolean
          is_shared?: boolean
          matched_rule_id?: string | null
          merchant_name?: string | null
          note?: string | null
          payer_id?: string | null
          receipt_url?: string | null
          recurring_id?: string | null
          source?: string
          transfer_id?: string | null
          txn_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_matched_rule_id_fkey"
            columns: ["matched_rule_id"]
            isOneToOne: false
            referencedRelation: "category_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_recurring_id_fkey"
            columns: ["recurring_id"]
            isOneToOne: false
            referencedRelation: "recurring_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      transfers: {
        Row: {
          amount_agorot: number
          created_at: string
          created_by: string | null
          description: string
          from_account_id: string
          household_id: string
          id: string
          to_account_id: string
          txn_date: string
          updated_at: string
        }
        Insert: {
          amount_agorot: number
          created_at?: string
          created_by?: string | null
          description: string
          from_account_id: string
          household_id: string
          id?: string
          to_account_id: string
          txn_date: string
          updated_at?: string
        }
        Update: {
          amount_agorot?: number
          created_at?: string
          created_by?: string | null
          description?: string
          from_account_id?: string
          household_id?: string
          id?: string
          to_account_id?: string
          txn_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfers_from_account_id_fkey"
            columns: ["from_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { p_token: string }; Returns: Json }
      advance_recurring_due_date: {
        Args: {
          p_day_of_month: number
          p_due_date: string
          p_frequency: string
        }
        Returns: string
      }
      create_household: { Args: { p_name: string }; Returns: Json }
      create_transfer: {
        Args: {
          p_amount_agorot: number
          p_description: string
          p_from_account_id: string
          p_to_account_id: string
          p_txn_date: string
        }
        Returns: Json
      }
      dblink: { Args: { "": string }; Returns: Record<string, unknown>[] }
      dblink_cancel_query: { Args: { "": string }; Returns: string }
      dblink_close: { Args: { "": string }; Returns: string }
      dblink_connect: { Args: { "": string }; Returns: string }
      dblink_connect_u: { Args: { "": string }; Returns: string }
      dblink_current_query: { Args: never; Returns: string }
      dblink_disconnect:
        | { Args: never; Returns: string }
        | { Args: { "": string }; Returns: string }
      dblink_error_message: { Args: { "": string }; Returns: string }
      dblink_exec: { Args: { "": string }; Returns: string }
      dblink_fdw_validator: {
        Args: { catalog: unknown; options: string[] }
        Returns: undefined
      }
      dblink_get_connections: { Args: never; Returns: string[] }
      dblink_get_notify:
        | { Args: { conname: string }; Returns: Record<string, unknown>[] }
        | { Args: never; Returns: Record<string, unknown>[] }
      dblink_get_pkey: {
        Args: { "": string }
        Returns: Database["public"]["CompositeTypes"]["dblink_pkey_results"][]
        SetofOptions: {
          from: "*"
          to: "dblink_pkey_results"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      dblink_get_result: {
        Args: { "": string }
        Returns: Record<string, unknown>[]
      }
      dblink_is_busy: { Args: { "": string }; Returns: number }
      delete_own_account: { Args: never; Returns: Json }
      delete_transfer: { Args: { p_transfer_id: string }; Returns: Json }
      generate_recurring_transactions: { Args: never; Returns: Json }
      is_household_admin: { Args: { hid: string }; Returns: boolean }
      is_household_member: { Args: { hid: string }; Returns: boolean }
      leave_household: { Args: never; Returns: Json }
      save_budget_allocations: {
        Args: { p_allocations: Json; p_period_start: string }
        Returns: Json
      }
      skip_recurring_occurrence: {
        Args: { p_recurring_id: string }
        Returns: Json
      }
      update_transfer: {
        Args: {
          p_amount_agorot: number
          p_description: string
          p_from_account_id: string
          p_to_account_id: string
          p_transfer_id: string
          p_txn_date: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      dblink_pkey_results: {
        position: number | null
        colname: string | null
      }
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

