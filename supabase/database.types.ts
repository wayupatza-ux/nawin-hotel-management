export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: { action: string; actor: string | null; at: string; id: string; meta: Json | null; target_id: string | null; target_table: string }
        Insert: { action: string; actor?: string | null; at?: string; id?: string; meta?: Json | null; target_id?: string | null; target_table: string }
        Update: { action?: string; actor?: string | null; at?: string; id?: string; meta?: Json | null; target_id?: string | null; target_table?: string }
      }
      booking_status_history: {
        Row: { booking_id: string; changed_at: string; changed_by: string | null; id: string; status: Database["public"]["Enums"]["booking_status"] }
        Insert: { booking_id: string; changed_at?: string; changed_by?: string | null; id?: string; status: Database["public"]["Enums"]["booking_status"] }
        Update: { booking_id?: string; changed_at?: string; changed_by?: string | null; id?: string; status?: Database["public"]["Enums"]["booking_status"] }
      }
      bookings: {
        Row: { booking_ref: string; branch_id: string; check_in: string; check_out: string; created_at: string; created_by: string | null; guest_id: string; id: string; notes: string | null; num_guests: number; room_id: string | null; room_type_id: string; source: Database["public"]["Enums"]["booking_source"]; status: Database["public"]["Enums"]["booking_status"]; total_amount: number; updated_at: string }
        Insert: { booking_ref?: string; branch_id: string; check_in: string; check_out: string; created_at?: string; created_by?: string | null; guest_id: string; id?: string; notes?: string | null; num_guests?: number; room_id?: string | null; room_type_id: string; source?: Database["public"]["Enums"]["booking_source"]; status?: Database["public"]["Enums"]["booking_status"]; total_amount?: number; updated_at?: string }
        Update: Partial<Database["public"]["Tables"]["bookings"]["Insert"]>
      }
      branches: {
        Row: { address: string | null; created_at: string; id: string; is_active: boolean; name: string; phone: string | null; timezone: string; updated_at: string }
        Insert: { address?: string | null; created_at?: string; id?: string; is_active?: boolean; name: string; phone?: string | null; timezone?: string; updated_at?: string }
        Update: Partial<Database["public"]["Tables"]["branches"]["Insert"]>
      }
      guest_documents: {
        Row: { created_at: string; doc_number: string | null; doc_type: Database["public"]["Enums"]["doc_type"]; file_path: string | null; guest_id: string; id: string; updated_at: string; verified: boolean }
        Insert: { created_at?: string; doc_number?: string | null; doc_type: Database["public"]["Enums"]["doc_type"]; file_path?: string | null; guest_id: string; id?: string; updated_at?: string; verified?: boolean }
        Update: Partial<Database["public"]["Tables"]["guest_documents"]["Insert"]>
      }
      guests: {
        Row: { created_at: string; display_name: string | null; email: string | null; first_name: string | null; id: string; last_name: string | null; line_user_id: string | null; nationality: string | null; phone: string | null; updated_at: string }
        Insert: { created_at?: string; display_name?: string | null; email?: string | null; first_name?: string | null; id?: string; last_name?: string | null; line_user_id?: string | null; nationality?: string | null; phone?: string | null; updated_at?: string }
        Update: Partial<Database["public"]["Tables"]["guests"]["Insert"]>
      }
      notifications_log: {
        Row: { booking_id: string | null; channel: string; error: string | null; event_type: string; id: string; payload: Json | null; sent_at: string; status: string }
        Insert: { booking_id?: string | null; channel?: string; error?: string | null; event_type: string; id?: string; payload?: Json | null; sent_at?: string; status?: string }
        Update: Partial<Database["public"]["Tables"]["notifications_log"]["Insert"]>
      }
      payments: {
        Row: { amount: number; booking_id: string; id: string; method: Database["public"]["Enums"]["payment_method"]; note: string | null; paid_at: string; recorded_by: string | null }
        Insert: { amount: number; booking_id: string; id?: string; method?: Database["public"]["Enums"]["payment_method"]; note?: string | null; paid_at?: string; recorded_by?: string | null }
        Update: Partial<Database["public"]["Tables"]["payments"]["Insert"]>
      }
      profiles: {
        Row: { branch_id: string | null; created_at: string; full_name: string | null; id: string; is_active: boolean; role: Database["public"]["Enums"]["user_role"]; updated_at: string }
        Insert: { branch_id?: string | null; created_at?: string; full_name?: string | null; id: string; is_active?: boolean; role?: Database["public"]["Enums"]["user_role"]; updated_at?: string }
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>
      }
      room_types: {
        Row: { base_price: number; branch_id: string; capacity: number; code: Database["public"]["Enums"]["room_type_code"]; created_at: string; has_window: boolean; id: string; is_active: boolean; name: string; updated_at: string }
        Insert: { base_price: number; branch_id: string; capacity?: number; code: Database["public"]["Enums"]["room_type_code"]; created_at?: string; has_window?: boolean; id?: string; is_active?: boolean; name: string; updated_at?: string }
        Update: Partial<Database["public"]["Tables"]["room_types"]["Insert"]>
      }
      rooms: {
        Row: { branch_id: string; created_at: string; floor: number | null; id: string; room_number: string; room_type_id: string; status: Database["public"]["Enums"]["room_status"]; updated_at: string }
        Insert: { branch_id: string; created_at?: string; floor?: number | null; id?: string; room_number: string; room_type_id: string; status?: Database["public"]["Enums"]["room_status"]; updated_at?: string }
        Update: Partial<Database["public"]["Tables"]["rooms"]["Insert"]>
      }
    }
    Functions: {
      check_availability: { Args: { p_branch_id: string; p_check_in: string; p_check_out: string; p_room_type_id: string }; Returns: number }
      auth_role: { Args: never; Returns: Database["public"]["Enums"]["user_role"] }
      auth_branch: { Args: never; Returns: string }
      is_ceo: { Args: never; Returns: boolean }
      can_access_branch: { Args: { p_branch_id: string }; Returns: boolean }
      log_audit: { Args: { p_action: string; p_id: string; p_meta?: Json; p_table: string }; Returns: undefined }
    }
    Enums: {
      booking_source: "line" | "walk_in" | "ota" | "staff"
      booking_status: "pending" | "confirmed" | "checked_in" | "checked_out" | "cancelled" | "no_show"
      doc_type: "passport" | "national_id"
      payment_method: "cash" | "card" | "transfer" | "other"
      room_status: "available" | "maintenance" | "closed"
      room_type_code: "standard_no_window" | "standard" | "superior_no_window" | "superior"
      user_role: "staff" | "manager" | "ceo"
    }
  }
}
