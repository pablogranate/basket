export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      announcements: {
        Row: {
          active: boolean
          body: string
          created_at: string
          created_by: string | null
          id: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          public_value: string | null
          secret_value: string | null
          setting_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          public_value?: string | null
          secret_value?: string | null
          setting_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          public_value?: string | null
          secret_value?: string | null
          setting_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          attendance_confirmed_at: string | null
          attendance_note: string | null
          attendance_response: string | null
          confirmed: boolean
          created_at: string
          created_by: string | null
          id: string
          match_id: string
          notes: string | null
          person_id: string | null
          role_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          attendance_confirmed_at?: string | null
          attendance_note?: string | null
          attendance_response?: string | null
          confirmed?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          match_id: string
          notes?: string | null
          person_id?: string | null
          role_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          attendance_confirmed_at?: string | null
          attendance_note?: string | null
          attendance_response?: string | null
          confirmed?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          match_id?: string
          notes?: string | null
          person_id?: string | null
          role_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          after: Json | null
          before: Json | null
          changed_by: string | null
          created_at: string
          id: number
          match_id: string | null
          record_id: string
          table_name: string
        }
        Insert: {
          action: string
          after?: Json | null
          before?: Json | null
          changed_by?: string | null
          created_at?: string
          id?: never
          match_id?: string | null
          record_id: string
          table_name: string
        }
        Update: {
          action?: string
          after?: Json | null
          before?: Json | null
          changed_by?: string | null
          created_at?: string
          id?: never
          match_id?: string | null
          record_id?: string
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      club_aliases: {
        Row: {
          alias: string
          club_id: string
          created_at: string
          id: string
        }
        Insert: {
          alias: string
          club_id: string
          created_at?: string
          id?: string
        }
        Update: {
          alias?: string
          club_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_aliases_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_contacts: {
        Row: {
          club_name: string
          created_at: string
          created_by: string | null
          id: string
          league: string | null
          notes: string | null
          phone: string | null
          responsable: string | null
          source_block: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          club_name: string
          created_at?: string
          created_by?: string | null
          id?: string
          league?: string | null
          notes?: string | null
          phone?: string | null
          responsable?: string | null
          source_block?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          club_name?: string
          created_at?: string
          created_by?: string | null
          id?: string
          league?: string | null
          notes?: string | null
          phone?: string | null
          responsable?: string | null
          source_block?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_contacts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          created_at: string
          id: string
          instagram: string | null
          logo_url: string | null
          manager: string | null
          name: string
          official_url: string | null
          slug: string
          stadium: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          instagram?: string | null
          logo_url?: string | null
          manager?: string | null
          name: string
          official_url?: string | null
          slug: string
          stadium?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          instagram?: string | null
          logo_url?: string | null
          manager?: string | null
          name?: string
          official_url?: string | null
          slug?: string
          stadium?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      collaborator_reports: {
        Row: {
          apto_lineal: boolean
          assignment_id: string
          attachments: Json
          building_observations: string | null
          club_flag: boolean
          club_observation: string | null
          created_at: string
          created_by: string | null
          feed_detected: boolean
          general_observations: string | null
          gpu_value: string | null
          graphics_check: boolean
          id: string
          incident_level: string
          match_id: string
          other_flag: boolean
          other_observation: string | null
          paid: boolean
          ping_value: string | null
          problems: Json
          reporter_profile_id: string | null
          signal_label: string
          speedtest_value: string | null
          st_flag: boolean
          st_observation: string | null
          start_check: boolean
          submitted_at: string
          technical_observations: string | null
          test_check: boolean
          test_time: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          apto_lineal?: boolean
          assignment_id: string
          attachments?: Json
          building_observations?: string | null
          club_flag?: boolean
          club_observation?: string | null
          created_at?: string
          created_by?: string | null
          feed_detected?: boolean
          general_observations?: string | null
          gpu_value?: string | null
          graphics_check?: boolean
          id?: string
          incident_level: string
          match_id: string
          other_flag?: boolean
          other_observation?: string | null
          paid?: boolean
          ping_value?: string | null
          problems?: Json
          reporter_profile_id?: string | null
          signal_label: string
          speedtest_value?: string | null
          st_flag?: boolean
          st_observation?: string | null
          start_check?: boolean
          submitted_at?: string
          technical_observations?: string | null
          test_check?: boolean
          test_time?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          apto_lineal?: boolean
          assignment_id?: string
          attachments?: Json
          building_observations?: string | null
          club_flag?: boolean
          club_observation?: string | null
          created_at?: string
          created_by?: string | null
          feed_detected?: boolean
          general_observations?: string | null
          gpu_value?: string | null
          graphics_check?: boolean
          id?: string
          incident_level?: string
          match_id?: string
          other_flag?: boolean
          other_observation?: string | null
          paid?: boolean
          ping_value?: string | null
          problems?: Json
          reporter_profile_id?: string | null
          signal_label?: string
          speedtest_value?: string | null
          st_flag?: boolean
          st_observation?: string | null
          start_check?: boolean
          submitted_at?: string
          technical_observations?: string | null
          test_check?: boolean
          test_time?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collaborator_reports_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: true
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaborator_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaborator_reports_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaborator_reports_reporter_profile_id_fkey"
            columns: ["reporter_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaborator_reports_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fixtures: {
        Row: {
          away_club: string | null
          away_points: number | null
          away_team: string | null
          category: string | null
          city: string | null
          competition: string | null
          court: string | null
          created_at: string
          group: string | null
          home_club: string | null
          home_points: number | null
          home_team: string | null
          id: string
          match_date: string | null
          match_time: string | null
          phase: string | null
          province: string | null
          suspended: boolean
          synced_at: string
          venue: string | null
        }
        Insert: {
          away_club?: string | null
          away_points?: number | null
          away_team?: string | null
          category?: string | null
          city?: string | null
          competition?: string | null
          court?: string | null
          created_at?: string
          group?: string | null
          home_club?: string | null
          home_points?: number | null
          home_team?: string | null
          id: string
          match_date?: string | null
          match_time?: string | null
          phase?: string | null
          province?: string | null
          suspended?: boolean
          synced_at?: string
          venue?: string | null
        }
        Update: {
          away_club?: string | null
          away_points?: number | null
          away_team?: string | null
          category?: string | null
          city?: string | null
          competition?: string | null
          court?: string | null
          created_at?: string
          group?: string | null
          home_club?: string | null
          home_points?: number | null
          home_team?: string | null
          id?: string
          match_date?: string | null
          match_time?: string | null
          phase?: string | null
          province?: string | null
          suspended?: boolean
          synced_at?: string
          venue?: string | null
        }
        Relationships: []
      }
      grid_sync_runs: {
        Row: {
          assignments_deleted: number
          assignments_upserted: number
          created_count: number
          deleted_count: number
          error: string | null
          finished_at: string | null
          id: string
          people_created: number
          skipped_count: number
          started_at: string
          status: string
          trigger: string
          updated_count: number
        }
        Insert: {
          assignments_deleted?: number
          assignments_upserted?: number
          created_count?: number
          deleted_count?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          people_created?: number
          skipped_count?: number
          started_at?: string
          status: string
          trigger: string
          updated_count?: number
        }
        Update: {
          assignments_deleted?: number
          assignments_upserted?: number
          created_count?: number
          deleted_count?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          people_created?: number
          skipped_count?: number
          started_at?: string
          status?: string
          trigger?: string
          updated_count?: number
        }
        Relationships: []
      }
      leagues: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_external: boolean
          name: string
          slug: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_external?: boolean
          name: string
          slug: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_external?: boolean
          name?: string
          slug?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      matches: {
        Row: {
          away_team: string
          commentary_plan: string | null
          competition: string | null
          created_at: string
          created_by: string | null
          day_notified_at: string | null
          duration_minutes: number
          home_team: string
          id: string
          kickoff_at: string
          league_id: string | null
          notes: string | null
          owner_id: string | null
          production_code: string | null
          production_mode: string | null
          status: Database["public"]["Enums"]["match_status"]
          timezone: string
          transport: string | null
          updated_at: string
          updated_by: string | null
          venue: string | null
        }
        Insert: {
          away_team: string
          commentary_plan?: string | null
          competition?: string | null
          created_at?: string
          created_by?: string | null
          day_notified_at?: string | null
          duration_minutes?: number
          home_team: string
          id?: string
          kickoff_at: string
          league_id?: string | null
          notes?: string | null
          owner_id?: string | null
          production_code?: string | null
          production_mode?: string | null
          status?: Database["public"]["Enums"]["match_status"]
          timezone?: string
          transport?: string | null
          updated_at?: string
          updated_by?: string | null
          venue?: string | null
        }
        Update: {
          away_team?: string
          commentary_plan?: string | null
          competition?: string | null
          created_at?: string
          created_by?: string | null
          day_notified_at?: string | null
          duration_minutes?: number
          home_team?: string
          id?: string
          kickoff_at?: string
          league_id?: string | null
          notes?: string | null
          owner_id?: string | null
          production_code?: string | null
          production_mode?: string | null
          status?: Database["public"]["Enums"]["match_status"]
          timezone?: string
          transport?: string | null
          updated_at?: string
          updated_by?: string | null
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_logs: {
        Row: {
          channel: string
          created_at: string
          destination: string | null
          error: string | null
          id: string
          match_id: string | null
          match_label: string
          person_id: string | null
          recipient_name: string
          role_names: string[]
          status: string
          trigger: string
        }
        Insert: {
          channel: string
          created_at?: string
          destination?: string | null
          error?: string | null
          id?: string
          match_id?: string | null
          match_label?: string
          person_id?: string | null
          recipient_name?: string
          role_names?: string[]
          status: string
          trigger: string
        }
        Update: {
          channel?: string
          created_at?: string
          destination?: string | null
          error?: string | null
          id?: string
          match_id?: string | null
          match_label?: string
          person_id?: string | null
          recipient_name?: string
          role_names?: string[]
          status?: string
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_logs_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          active: boolean
          category: string | null
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          role_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          category?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          role_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          category?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          role_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "people_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      person_functions: {
        Row: {
          created_at: string
          created_by: string | null
          function_key: string
          id: string
          person_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          function_key: string
          id?: string
          person_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          function_key?: string
          id?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_functions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_functions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_user_id: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      roles: {
        Row: {
          active: boolean
          category: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_league_memberships: {
        Row: {
          created_at: string
          league_id: string
          season: string
          team_id: string
        }
        Insert: {
          created_at?: string
          league_id: string
          season: string
          team_id: string
        }
        Update: {
          created_at?: string
          league_id?: string
          season?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_league_memberships_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_league_memberships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          category: string
          club_id: string
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          category?: string
          club_id: string
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          category?: string
          club_id?: string
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "editor" | "viewer" | "coordinator" | "collaborator"
      match_status: "Pendiente" | "Confirmado" | "Realizado"
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
      app_role: ["admin", "editor", "viewer", "coordinator", "collaborator"],
      match_status: ["Pendiente", "Confirmado", "Realizado"],
    },
  },
} as const


export type AppRole = Database["public"]["Enums"]["app_role"];
export type MatchStatus = Database["public"]["Enums"]["match_status"];
export type AppSettingRow = Database["public"]["Tables"]["app_settings"]["Row"];
export type AnnouncementRow = Database["public"]["Tables"]["announcements"]["Row"];
export type MatchRow = Database["public"]["Tables"]["matches"]["Row"];
export type PersonRow = Database["public"]["Tables"]["people"]["Row"];
export type PersonFunctionRow =
  Database["public"]["Tables"]["person_functions"]["Row"];
export type RoleRow = Database["public"]["Tables"]["roles"]["Row"];
export type AssignmentRow = Database["public"]["Tables"]["assignments"]["Row"];
export type CollaboratorReportRow =
  Database["public"]["Tables"]["collaborator_reports"]["Row"];
export type AuditRow = Database["public"]["Tables"]["audit_log"]["Row"];
export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type LeagueRow = Database["public"]["Tables"]["leagues"]["Row"];
export type ClubRow = Database["public"]["Tables"]["clubs"]["Row"];
export type TeamRow = Database["public"]["Tables"]["teams"]["Row"];
export type TeamLeagueMembershipRow =
  Database["public"]["Tables"]["team_league_memberships"]["Row"];
