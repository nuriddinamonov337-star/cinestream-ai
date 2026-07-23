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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_sessions: {
        Row: {
          payload: Json
          state: string
          telegram_id: number
          updated_at: string
        }
        Insert: {
          payload?: Json
          state: string
          telegram_id: number
          updated_at?: string
        }
        Update: {
          payload?: Json
          state?: string
          telegram_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      broadcasts: {
        Row: {
          created_at: string
          created_by_telegram_id: number
          failed_count: number
          id: string
          media_file_id: string | null
          media_file_type: string | null
          sent_count: number
          text: string | null
        }
        Insert: {
          created_at?: string
          created_by_telegram_id: number
          failed_count?: number
          id?: string
          media_file_id?: string | null
          media_file_type?: string | null
          sent_count?: number
          text?: string | null
        }
        Update: {
          created_at?: string
          created_by_telegram_id?: number
          failed_count?: number
          id?: string
          media_file_id?: string | null
          media_file_type?: string | null
          sent_count?: number
          text?: string | null
        }
        Relationships: []
      }
      channels: {
        Row: {
          chat_id: number
          created_at: string
          id: string
          invite_link: string | null
          is_active: boolean
          title: string
          username: string | null
        }
        Insert: {
          chat_id: number
          created_at?: string
          id?: string
          invite_link?: string | null
          is_active?: boolean
          title: string
          username?: string | null
        }
        Update: {
          chat_id?: number
          created_at?: string
          id?: string
          invite_link?: string | null
          is_active?: boolean
          title?: string
          username?: string | null
        }
        Relationships: []
      }
      movies: {
        Row: {
          caption: string | null
          code: string
          created_at: string
          file_id: string
          file_type: string
          id: string
          is_premium: boolean
          source_chat_id: number | null
          source_message_id: number | null
          title: string
          views_count: number
        }
        Insert: {
          caption?: string | null
          code: string
          created_at?: string
          file_id: string
          file_type?: string
          id?: string
          is_premium?: boolean
          source_chat_id?: number | null
          source_message_id?: number | null
          title: string
          views_count?: number
        }
        Update: {
          caption?: string | null
          code?: string
          created_at?: string
          file_id?: string
          file_type?: string
          id?: string
          is_premium?: boolean
          source_chat_id?: number | null
          source_message_id?: number | null
          title?: string
          views_count?: number
        }
        Relationships: []
      }
      payments: {
        Row: {
          admin_message_ids: Json | null
          created_at: string
          decided_at: string | null
          decided_by_telegram_id: number | null
          id: string
          plan_key: string
          receipt_file_id: string | null
          receipt_file_type: string | null
          status: string
          user_id: string
        }
        Insert: {
          admin_message_ids?: Json | null
          created_at?: string
          decided_at?: string | null
          decided_by_telegram_id?: number | null
          id?: string
          plan_key: string
          receipt_file_id?: string | null
          receipt_file_type?: string | null
          status?: string
          user_id: string
        }
        Update: {
          admin_message_ids?: Json | null
          created_at?: string
          decided_at?: string | null
          decided_by_telegram_id?: number | null
          id?: string
          plan_key?: string
          receipt_file_id?: string | null
          receipt_file_type?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_plan_key_fkey"
            columns: ["plan_key"]
            isOneToOne: false
            referencedRelation: "premium_plans"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      premium_plans: {
        Row: {
          duration_days: number
          is_active: boolean
          key: string
          price_uzs: number
          sort_order: number
          title: string
        }
        Insert: {
          duration_days: number
          is_active?: boolean
          key: string
          price_uzs: number
          sort_order?: number
          title: string
        }
        Update: {
          duration_days?: number
          is_active?: boolean
          key?: string
          price_uzs?: number
          sort_order?: number
          title?: string
        }
        Relationships: []
      }
      premium_subscriptions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          payment_id: string | null
          plan_key: string
          started_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          payment_id?: string | null
          plan_key: string
          started_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          payment_id?: string | null
          plan_key?: string
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "premium_subscriptions_plan_key_fkey"
            columns: ["plan_key"]
            isOneToOne: false
            referencedRelation: "premium_plans"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "premium_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          first_name: string | null
          id: string
          is_blocked: boolean
          language_code: string | null
          last_name: string | null
          last_seen_at: string
          telegram_id: number
          updated_at: string
          username: string | null
        }
        Insert: {
          created_at?: string
          first_name?: string | null
          id?: string
          is_blocked?: boolean
          language_code?: string | null
          last_name?: string | null
          last_seen_at?: string
          telegram_id: number
          updated_at?: string
          username?: string | null
        }
        Update: {
          created_at?: string
          first_name?: string | null
          id?: string
          is_blocked?: boolean
          language_code?: string | null
          last_name?: string | null
          last_seen_at?: string
          telegram_id?: number
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          created_at: string
          error: string | null
          event: string
          id: string
          ok: boolean
          payload: Json
          response_body: string | null
          status_code: number | null
          target_url: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          event: string
          id?: string
          ok?: boolean
          payload: Json
          response_body?: string | null
          status_code?: number | null
          target_url: string
        }
        Update: {
          created_at?: string
          error?: string | null
          event?: string
          id?: string
          ok?: boolean
          payload?: Json
          response_body?: string | null
          status_code?: number | null
          target_url?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_user_premium: { Args: { _user_id: string }; Returns: boolean }
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
