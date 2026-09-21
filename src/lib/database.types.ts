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
      finishes: {
        Row: {
          floor_texture: string | null
          room_id: string
          wall_color: string | null
        }
        Insert: {
          floor_texture?: string | null
          room_id: string
          wall_color?: string | null
        }
        Update: {
          floor_texture?: string | null
          room_id?: string
          wall_color?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finishes_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: true
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      furniture_items: {
        Row: {
          category: Database["public"]["Enums"]["furniture_category"]
          height_m: number
          id: string
          label: string
          plan_id: string
          position_x: number
          position_y: number
          rotation: number
          width_m: number
        }
        Insert: {
          category: Database["public"]["Enums"]["furniture_category"]
          height_m: number
          id?: string
          label: string
          plan_id: string
          position_x: number
          position_y: number
          rotation?: number
          width_m: number
        }
        Update: {
          category?: Database["public"]["Enums"]["furniture_category"]
          height_m?: number
          id?: string
          label?: string
          plan_id?: string
          position_x?: number
          position_y?: number
          rotation?: number
          width_m?: number
        }
        Relationships: [
          {
            foreignKeyName: "furniture_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      house_openings: {
        Row: {
          edge: number
          house_id: string
          id: string
          kind: Database["public"]["Enums"]["opening_kind"]
          offset_m: number
          width_m: number
        }
        Insert: {
          edge: number
          house_id: string
          id?: string
          kind: Database["public"]["Enums"]["opening_kind"]
          offset_m: number
          width_m: number
        }
        Update: {
          edge?: number
          house_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["opening_kind"]
          offset_m?: number
          width_m?: number
        }
        Relationships: [
          {
            foreignKeyName: "house_openings_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      houses: {
        Row: {
          center_x: number
          center_y: number
          height_m: number
          id: string
          plan_id: string
          rotation: number
          width_m: number
        }
        Insert: {
          center_x: number
          center_y: number
          height_m: number
          id?: string
          plan_id: string
          rotation?: number
          width_m: number
        }
        Update: {
          center_x?: number
          center_y?: number
          height_m?: number
          id?: string
          plan_id?: string
          rotation?: number
          width_m?: number
        }
        Relationships: [
          {
            foreignKeyName: "houses_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: true
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          id: string
          nom: string
          updated_at: string
          user_id: string
          wall_type: Database["public"]["Enums"]["wall_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          nom: string
          updated_at?: string
          user_id: string
          wall_type?: Database["public"]["Enums"]["wall_type"]
        }
        Update: {
          created_at?: string
          id?: string
          nom?: string
          updated_at?: string
          user_id?: string
          wall_type?: Database["public"]["Enums"]["wall_type"]
        }
        Relationships: [
          {
            foreignKeyName: "plans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          mail: string
          nom: string
          pays: string
          ville: string
        }
        Insert: {
          created_at?: string
          id: string
          mail: string
          nom: string
          pays: string
          ville: string
        }
        Update: {
          created_at?: string
          id?: string
          mail?: string
          nom?: string
          pays?: string
          ville?: string
        }
        Relationships: []
      }
      roads: {
        Row: {
          center_x: number
          center_y: number
          length_m: number
          rotation: number
          terrain_id: string
          width_m: number
        }
        Insert: {
          center_x: number
          center_y: number
          length_m: number
          rotation?: number
          terrain_id: string
          width_m: number
        }
        Update: {
          center_x?: number
          center_y?: number
          length_m?: number
          rotation?: number
          terrain_id?: string
          width_m?: number
        }
        Relationships: [
          {
            foreignKeyName: "roads_terrain_id_fkey"
            columns: ["terrain_id"]
            isOneToOne: true
            referencedRelation: "terrains"
            referencedColumns: ["id"]
          },
        ]
      }
      room_openings: {
        Row: {
          edge: number
          id: string
          kind: Database["public"]["Enums"]["opening_kind"]
          offset_m: number
          room_id: string
          width_m: number
        }
        Insert: {
          edge: number
          id?: string
          kind: Database["public"]["Enums"]["opening_kind"]
          offset_m: number
          room_id: string
          width_m: number
        }
        Update: {
          edge?: number
          id?: string
          kind?: Database["public"]["Enums"]["opening_kind"]
          offset_m?: number
          room_id?: string
          width_m?: number
        }
        Relationships: [
          {
            foreignKeyName: "room_openings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_removed_walls: {
        Row: {
          edge: number
          room_id: string
        }
        Insert: {
          edge: number
          room_id: string
        }
        Update: {
          edge?: number
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_removed_walls_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_walls: {
        Row: {
          room_id: string
          wall_id: string
        }
        Insert: {
          room_id: string
          wall_id: string
        }
        Update: {
          room_id?: string
          wall_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_walls_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_walls_wall_id_fkey"
            columns: ["wall_id"]
            isOneToOne: false
            referencedRelation: "walls"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          category: Database["public"]["Enums"]["room_category"]
          center_x: number
          center_y: number
          height_m: number
          id: string
          label: string
          plan_id: string
          position: number
          rotation: number
          width_m: number
        }
        Insert: {
          category: Database["public"]["Enums"]["room_category"]
          center_x: number
          center_y: number
          height_m: number
          id?: string
          label: string
          plan_id: string
          position?: number
          rotation?: number
          width_m: number
        }
        Update: {
          category?: Database["public"]["Enums"]["room_category"]
          center_x?: number
          center_y?: number
          height_m?: number
          id?: string
          label?: string
          plan_id?: string
          position?: number
          rotation?: number
          width_m?: number
        }
        Relationships: [
          {
            foreignKeyName: "rooms_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      technical_symbols: {
        Row: {
          id: string
          plan_id: string
          position_x: number
          position_y: number
          type: Database["public"]["Enums"]["technical_symbol_type"]
        }
        Insert: {
          id?: string
          plan_id: string
          position_x: number
          position_y: number
          type: Database["public"]["Enums"]["technical_symbol_type"]
        }
        Update: {
          id?: string
          plan_id?: string
          position_x?: number
          position_y?: number
          type?: Database["public"]["Enums"]["technical_symbol_type"]
        }
        Relationships: [
          {
            foreignKeyName: "technical_symbols_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      terrain_gates: {
        Row: {
          id: string
          kind: Database["public"]["Enums"]["gate_kind"]
          offset_m: number
          side_index: number
          terrain_id: string
          width_m: number
        }
        Insert: {
          id?: string
          kind: Database["public"]["Enums"]["gate_kind"]
          offset_m: number
          side_index: number
          terrain_id: string
          width_m: number
        }
        Update: {
          id?: string
          kind?: Database["public"]["Enums"]["gate_kind"]
          offset_m?: number
          side_index?: number
          terrain_id?: string
          width_m?: number
        }
        Relationships: [
          {
            foreignKeyName: "terrain_gates_terrain_id_fkey"
            columns: ["terrain_id"]
            isOneToOne: false
            referencedRelation: "terrains"
            referencedColumns: ["id"]
          },
        ]
      }
      terrain_points: {
        Row: {
          id: string
          kind: Database["public"]["Enums"]["terrain_point_kind"]
          label: string | null
          lat: number | null
          lng: number | null
          position: number
          terrain_id: string
          x: number
          y: number
        }
        Insert: {
          id?: string
          kind?: Database["public"]["Enums"]["terrain_point_kind"]
          label?: string | null
          lat?: number | null
          lng?: number | null
          position: number
          terrain_id: string
          x: number
          y: number
        }
        Update: {
          id?: string
          kind?: Database["public"]["Enums"]["terrain_point_kind"]
          label?: string | null
          lat?: number | null
          lng?: number | null
          position?: number
          terrain_id?: string
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "terrain_points_terrain_id_fkey"
            columns: ["terrain_id"]
            isOneToOne: false
            referencedRelation: "terrains"
            referencedColumns: ["id"]
          },
        ]
      }
      terrains: {
        Row: {
          fenced: boolean
          id: string
          input_mode: Database["public"]["Enums"]["terrain_input_mode"]
          plan_id: string
        }
        Insert: {
          fenced?: boolean
          id?: string
          input_mode: Database["public"]["Enums"]["terrain_input_mode"]
          plan_id: string
        }
        Update: {
          fenced?: boolean
          id?: string
          input_mode?: Database["public"]["Enums"]["terrain_input_mode"]
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "terrains_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: true
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      wall_openings: {
        Row: {
          id: string
          offset_m: number
          type: Database["public"]["Enums"]["wall_opening_type"]
          wall_id: string
          width_m: number
        }
        Insert: {
          id?: string
          offset_m: number
          type: Database["public"]["Enums"]["wall_opening_type"]
          wall_id: string
          width_m: number
        }
        Update: {
          id?: string
          offset_m?: number
          type?: Database["public"]["Enums"]["wall_opening_type"]
          wall_id?: string
          width_m?: number
        }
        Relationships: [
          {
            foreignKeyName: "wall_openings_wall_id_fkey"
            columns: ["wall_id"]
            isOneToOne: false
            referencedRelation: "walls"
            referencedColumns: ["id"]
          },
        ]
      }
      walls: {
        Row: {
          end_x: number
          end_y: number
          id: string
          plan_id: string
          start_x: number
          start_y: number
          thickness_m: number
        }
        Insert: {
          end_x: number
          end_y: number
          id?: string
          plan_id: string
          start_x: number
          start_y: number
          thickness_m: number
        }
        Update: {
          end_x?: number
          end_y?: number
          id?: string
          plan_id?: string
          start_x?: number
          start_y?: number
          thickness_m?: number
        }
        Relationships: [
          {
            foreignKeyName: "walls_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      save_plan: {
        Args: { p_data: Json }
        Returns: string
      }
    }
    Enums: {
      furniture_category:
        | "mobilier"
        | "cuisine"
        | "salle-de-bain"
      gate_kind:
        | "pedestrian"
        | "vehicle"
      opening_kind:
        | "interior"
        | "entrance"
        | "window"
      room_category:
        | "salon"
        | "chambre"
        | "cuisine"
        | "salle-a-manger"
        | "salle-de-bain"
        | "wc"
        | "garage"
        | "escalier"
        | "couloir"
        | "autre"
      technical_symbol_type:
        | "prise"
        | "interrupteur"
        | "point-lumineux"
        | "arrivee-eau"
        | "evacuation-eau"
      terrain_input_mode:
        | "gps"
        | "manual"
      terrain_point_kind:
        | "vertex"
        | "annotation"
      wall_opening_type:
        | "door"
        | "window"
      wall_type:
        | "brique-11"
        | "brique-22"
        | "parpaing"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      furniture_category: ["mobilier", "cuisine", "salle-de-bain"],
      gate_kind: ["pedestrian", "vehicle"],
      opening_kind: ["interior", "entrance", "window"],
      room_category: ["salon", "chambre", "cuisine", "salle-a-manger", "salle-de-bain", "wc", "garage", "escalier", "couloir", "autre"],
      technical_symbol_type: ["prise", "interrupteur", "point-lumineux", "arrivee-eau", "evacuation-eau"],
      terrain_input_mode: ["gps", "manual"],
      terrain_point_kind: ["vertex", "annotation"],
      wall_opening_type: ["door", "window"],
      wall_type: ["brique-11", "brique-22", "parpaing"],
    },
  },
} as const
