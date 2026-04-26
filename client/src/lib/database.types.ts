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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      analytics_events: {
        Row: {
          created_at: string
          event_name: string
          id: string
          metadata: Json
          org_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_name: string
          id?: string
          metadata?: Json
          org_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_name?: string
          id?: string
          metadata?: Json
          org_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      business_expenses: {
        Row: {
          amount: number
          category: string
          chase_category: string
          created_at: string
          date: string
          description: string
          id: string
          notes: string
          org_id: string
          serial_number: string
        }
        Insert: {
          amount?: number
          category?: string
          chase_category?: string
          created_at?: string
          date: string
          description?: string
          id: string
          notes?: string
          org_id?: string
          serial_number?: string
        }
        Update: {
          amount?: number
          category?: string
          chase_category?: string
          created_at?: string
          date?: string
          description?: string
          id?: string
          notes?: string
          org_id?: string
          serial_number?: string
        }
        Relationships: []
      }
      category_rules: {
        Row: {
          category: string
          created_at: string
          id: string
          keyword: string
          org_id: string
        }
        Insert: {
          category: string
          created_at?: string
          id: string
          keyword: string
          org_id?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          keyword?: string
          org_id?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string
          allowed_project_type_ids: string[]
          billing_model: string
          billing_rate_per_hour: number
          city: string
          company: string
          contact_name: string
          created_at: string
          default_project_type_id: string
          email: string
          id: string
          monthly_hours: number
          org_id: string
          partner_split: Json | null
          per_project_rate: number
          phone: string
          project_type_rates: Json
          retainer_start_date: string
          role_billing_multipliers: Json
          state: string
          zip: string
        }
        Insert: {
          address?: string
          allowed_project_type_ids?: string[]
          billing_model?: string
          billing_rate_per_hour?: number
          city?: string
          company: string
          contact_name?: string
          created_at?: string
          default_project_type_id?: string
          email?: string
          id: string
          monthly_hours?: number
          org_id?: string
          partner_split?: Json | null
          per_project_rate?: number
          phone?: string
          project_type_rates?: Json
          retainer_start_date?: string
          role_billing_multipliers?: Json
          state?: string
          zip?: string
        }
        Update: {
          address?: string
          allowed_project_type_ids?: string[]
          billing_model?: string
          billing_rate_per_hour?: number
          city?: string
          company?: string
          contact_name?: string
          created_at?: string
          default_project_type_id?: string
          email?: string
          id?: string
          monthly_hours?: number
          org_id?: string
          partner_split?: Json | null
          per_project_rate?: number
          phone?: string
          project_type_rates?: Json
          retainer_start_date?: string
          role_billing_multipliers?: Json
          state?: string
          zip?: string
        }
        Relationships: []
      }
      contract_templates: {
        Row: {
          content: string
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          content?: string
          created_at?: string
          deleted_at?: string | null
          id: string
          name?: string
          org_id?: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      contractor_invoices: {
        Row: {
          business_info: Json
          created_at: string
          crew_member_id: string
          id: string
          invoice_number: string
          line_items: Json
          notes: string
          org_id: string
          period_end: string
          period_start: string
          recipient_name: string
          recipient_type: string
          status: string
          total: number
        }
        Insert: {
          business_info?: Json
          created_at?: string
          crew_member_id: string
          id: string
          invoice_number: string
          line_items?: Json
          notes?: string
          org_id?: string
          period_end: string
          period_start: string
          recipient_name?: string
          recipient_type?: string
          status?: string
          total?: number
        }
        Update: {
          business_info?: Json
          created_at?: string
          crew_member_id?: string
          id?: string
          invoice_number?: string
          line_items?: Json
          notes?: string
          org_id?: string
          period_end?: string
          period_start?: string
          recipient_name?: string
          recipient_type?: string
          status?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "contractor_invoices_crew_member_id_fkey"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          client_email: string
          client_id: string
          client_signature: Json | null
          client_signed_at: string | null
          content: string
          created_at: string
          deleted_at: string | null
          id: string
          org_id: string
          owner_signature: Json | null
          owner_signed_at: string | null
          project_id: string | null
          sent_at: string | null
          sign_token: string
          status: string
          template_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          client_email?: string
          client_id?: string
          client_signature?: Json | null
          client_signed_at?: string | null
          content?: string
          created_at?: string
          deleted_at?: string | null
          id: string
          org_id?: string
          owner_signature?: Json | null
          owner_signed_at?: string | null
          project_id?: string | null
          sent_at?: string | null
          sign_token?: string
          status?: string
          template_id?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          client_email?: string
          client_id?: string
          client_signature?: Json | null
          client_signed_at?: string | null
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          org_id?: string
          owner_signature?: Json | null
          owner_signed_at?: string | null
          project_id?: string | null
          sent_at?: string | null
          sign_token?: string
          status?: string
          template_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "contract_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_location_distances: {
        Row: {
          created_at: string
          crew_member_id: string
          distance_miles: number
          id: string
          location_id: string
          org_id: string
        }
        Insert: {
          created_at?: string
          crew_member_id: string
          distance_miles?: number
          id: string
          location_id: string
          org_id?: string
        }
        Update: {
          created_at?: string
          crew_member_id?: string
          distance_miles?: number
          id?: string
          location_id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_location_distances_crew_member_id_fkey"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_location_distances_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_members: {
        Row: {
          business_address: string
          business_city: string
          business_name: string
          business_state: string
          business_zip: string
          default_pay_rate_per_hour: number
          email: string
          home_address: Json | null
          id: string
          name: string
          org_id: string
          phone: string
          role_rates: Json
          roles: string[]
          tax_id: string
          tax_id_type: string
          w9_url: string | null
        }
        Insert: {
          business_address?: string
          business_city?: string
          business_name?: string
          business_state?: string
          business_zip?: string
          default_pay_rate_per_hour?: number
          email?: string
          home_address?: Json | null
          id: string
          name: string
          org_id?: string
          phone?: string
          role_rates?: Json
          roles?: string[]
          tax_id?: string
          tax_id_type?: string
          w9_url?: string | null
        }
        Update: {
          business_address?: string
          business_city?: string
          business_name?: string
          business_state?: string
          business_zip?: string
          default_pay_rate_per_hour?: number
          email?: string
          home_address?: Json | null
          id?: string
          name?: string
          org_id?: string
          phone?: string
          role_rates?: Json
          roles?: string[]
          tax_id?: string
          tax_id_type?: string
          w9_url?: string | null
        }
        Relationships: []
      }
      edit_types: {
        Row: {
          created_at: string
          id: string
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string
          id: string
          name: string
          org_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "edit_types_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      episode_comments: {
        Row: {
          content: string
          created_at: string
          episode_id: string
          id: string
          series_id: string
          user_name: string
          user_role: string
        }
        Insert: {
          content?: string
          created_at?: string
          episode_id: string
          id: string
          series_id: string
          user_name?: string
          user_role?: string
        }
        Update: {
          content?: string
          created_at?: string
          episode_id?: string
          id?: string
          series_id?: string
          user_name?: string
          user_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "episode_comments_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "series_episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_comments_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          client_id: string
          client_info: Json
          company_info: Json
          created_at: string
          deleted_at: string | null
          due_date: string
          id: string
          invoice_number: string
          issue_date: string
          line_items: Json
          notes: string
          org_id: string
          paid_date: string | null
          period_end: string
          period_start: string
          status: string
          subtotal: number
          tax_amount: number
          tax_rate: number
          total: number
          updated_at: string
        }
        Insert: {
          client_id: string
          client_info?: Json
          company_info?: Json
          created_at?: string
          deleted_at?: string | null
          due_date: string
          id: string
          invoice_number: string
          issue_date: string
          line_items?: Json
          notes?: string
          org_id?: string
          paid_date?: string | null
          period_end: string
          period_start: string
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
        }
        Update: {
          client_id?: string
          client_info?: Json
          company_info?: Json
          created_at?: string
          deleted_at?: string | null
          due_date?: string
          id?: string
          invoice_number?: string
          issue_date?: string
          line_items?: Json
          notes?: string
          org_id?: string
          paid_date?: string | null
          period_end?: string
          period_start?: string
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string
          city: string
          id: string
          name: string
          one_time_use: boolean
          org_id: string
          state: string
          zip: string
        }
        Insert: {
          address?: string
          city?: string
          id: string
          name: string
          one_time_use?: boolean
          org_id?: string
          state?: string
          zip?: string
        }
        Update: {
          address?: string
          city?: string
          id?: string
          name?: string
          one_time_use?: boolean
          org_id?: string
          state?: string
          zip?: string
        }
        Relationships: []
      }
      manual_trips: {
        Row: {
          created_at: string
          crew_member_id: string
          date: string
          destination: string
          id: string
          location_id: string | null
          org_id: string
          purpose: string
          round_trip_miles: number
        }
        Insert: {
          created_at?: string
          crew_member_id: string
          date: string
          destination?: string
          id: string
          location_id?: string | null
          org_id?: string
          purpose?: string
          round_trip_miles?: number
        }
        Update: {
          created_at?: string
          crew_member_id?: string
          date?: string
          destination?: string
          id?: string
          location_id?: string | null
          org_id?: string
          purpose?: string
          round_trip_miles?: number
        }
        Relationships: [
          {
            foreignKeyName: "manual_trips_crew_member_id_fkey"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_trips_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_expenses: {
        Row: {
          amount: number
          category: string
          client_id: string
          created_at: string
          date: string
          description: string | null
          id: string
          name: string
          notes: string
          org_id: string
          year: number
        }
        Insert: {
          amount: number
          category: string
          client_id?: string
          created_at?: string
          date: string
          description?: string | null
          id?: string
          name?: string
          notes?: string
          org_id?: string
          year?: number
        }
        Update: {
          amount?: number
          category?: string
          client_id?: string
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          name?: string
          notes?: string
          org_id?: string
          year?: number
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          link: string
          message: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id: string
          link?: string
          message?: string
          read?: boolean
          title?: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          link?: string
          message?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          billing_status: string
          business_info: Json
          created_at: string
          dashboard_widgets: Json | null
          default_billing_model: string
          default_billing_rate: number
          features: Json
          id: string
          logo_url: string
          name: string
          pipeline_stages: Json
          plan: string
          production_type: string
          project_limit: number
          services: Json
          slug: string
          stripe_account_id: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          subscription_updated_at: string | null
          testimonial_prompted_at: string | null
        }
        Insert: {
          billing_status?: string
          business_info?: Json
          created_at?: string
          dashboard_widgets?: Json | null
          default_billing_model?: string
          default_billing_rate?: number
          features?: Json
          id: string
          logo_url?: string
          name: string
          pipeline_stages?: Json
          plan?: string
          production_type?: string
          project_limit?: number
          services?: Json
          slug: string
          stripe_account_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          subscription_updated_at?: string | null
          testimonial_prompted_at?: string | null
        }
        Update: {
          billing_status?: string
          business_info?: Json
          created_at?: string
          dashboard_widgets?: Json | null
          default_billing_model?: string
          default_billing_rate?: number
          features?: Json
          id?: string
          logo_url?: string
          name?: string
          pipeline_stages?: Json
          plan?: string
          production_type?: string
          project_limit?: number
          services?: Json
          slug?: string
          stripe_account_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          subscription_updated_at?: string | null
          testimonial_prompted_at?: string | null
        }
        Relationships: []
      }
      personal_events: {
        Row: {
          all_day: boolean
          category: string
          color: string | null
          created_at: string
          date: string
          end_time: string
          id: string
          location: string
          notes: string
          org_id: string
          priority: boolean | null
          start_time: string
          title: string
        }
        Insert: {
          all_day?: boolean
          category?: string
          color?: string | null
          created_at?: string
          date: string
          end_time?: string
          id: string
          location?: string
          notes?: string
          org_id?: string
          priority?: boolean | null
          start_time?: string
          title: string
        }
        Update: {
          all_day?: boolean
          category?: string
          color?: string | null
          created_at?: string
          date?: string
          end_time?: string
          id?: string
          location?: string
          notes?: string
          org_id?: string
          priority?: boolean | null
          start_time?: string
          title?: string
        }
        Relationships: []
      }
      pipeline_leads: {
        Row: {
          client_id: string | null
          created_at: string
          deleted_at: string | null
          description: string
          email: string
          event_date: string | null
          id: string
          lead_source: string
          location: string
          name: string
          org_id: string
          phone: string
          pipeline_stage: string
          project_type: string
          proposal_id: string | null
          recent_activity: string
          recent_activity_at: string | null
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string
          email?: string
          event_date?: string | null
          id: string
          lead_source?: string
          location?: string
          name?: string
          org_id?: string
          phone?: string
          pipeline_stage?: string
          project_type?: string
          proposal_id?: string | null
          recent_activity?: string
          recent_activity_at?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string
          email?: string
          event_date?: string | null
          id?: string
          lead_source?: string
          location?: string
          name?: string
          org_id?: string
          phone?: string
          pipeline_stage?: string
          project_type?: string
          proposal_id?: string | null
          recent_activity?: string
          recent_activity_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      producer_clients: {
        Row: {
          address: string
          city: string
          company: string
          contact_name: string
          created_at: string
          default_day_rate: number
          default_hourly_rate: number
          email: string
          id: string
          notes: string
          phone: string
          producer_id: string
          state: string
          zip: string
        }
        Insert: {
          address?: string
          city?: string
          company?: string
          contact_name?: string
          created_at?: string
          default_day_rate?: number
          default_hourly_rate?: number
          email?: string
          id: string
          notes?: string
          phone?: string
          producer_id: string
          state?: string
          zip?: string
        }
        Update: {
          address?: string
          city?: string
          company?: string
          contact_name?: string
          created_at?: string
          default_day_rate?: number
          default_hourly_rate?: number
          email?: string
          id?: string
          notes?: string
          phone?: string
          producer_id?: string
          state?: string
          zip?: string
        }
        Relationships: [
          {
            foreignKeyName: "producer_clients_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "producer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      producer_documents: {
        Row: {
          category: string
          created_at: string
          file_type: string
          file_url: string
          gig_id: string
          id: string
          name: string
        }
        Insert: {
          category?: string
          created_at?: string
          file_type?: string
          file_url?: string
          gig_id: string
          id: string
          name?: string
        }
        Update: {
          category?: string
          created_at?: string
          file_type?: string
          file_url?: string
          gig_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "producer_documents_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "producer_gigs"
            referencedColumns: ["id"]
          },
        ]
      }
      producer_expenses: {
        Row: {
          amount: number
          billable: boolean
          category: string
          created_at: string
          date: string
          description: string
          gig_id: string | null
          id: string
          notes: string
          paid_by_client: boolean
          producer_id: string | null
          receipt_url: string
          vendor: string
        }
        Insert: {
          amount?: number
          billable?: boolean
          category?: string
          created_at?: string
          date: string
          description?: string
          gig_id?: string | null
          id: string
          notes?: string
          paid_by_client?: boolean
          producer_id?: string | null
          receipt_url?: string
          vendor?: string
        }
        Update: {
          amount?: number
          billable?: boolean
          category?: string
          created_at?: string
          date?: string
          description?: string
          gig_id?: string | null
          id?: string
          notes?: string
          paid_by_client?: boolean
          producer_id?: string | null
          receipt_url?: string
          vendor?: string
        }
        Relationships: [
          {
            foreignKeyName: "producer_expenses_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "producer_gigs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producer_expenses_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "producer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      producer_gear_catalog: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string
          producer_id: string
          rate: number
          rate_type: string
        }
        Insert: {
          created_at?: string
          id: string
          name?: string
          notes?: string
          producer_id: string
          rate?: number
          rate_type?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string
          producer_id?: string
          rate?: number
          rate_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "producer_gear_catalog_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "producer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      producer_gig_days: {
        Row: {
          call_time: string | null
          clock_in: string | null
          clock_out: string | null
          created_at: string
          date: string
          day_number: number
          day_type: string
          gig_id: string
          id: string
          lunch_in: string | null
          lunch_out: string | null
          notes: string
          wrap_time: string | null
        }
        Insert: {
          call_time?: string | null
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          date: string
          day_number?: number
          day_type?: string
          gig_id: string
          id: string
          lunch_in?: string | null
          lunch_out?: string | null
          notes?: string
          wrap_time?: string | null
        }
        Update: {
          call_time?: string | null
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          date?: string
          day_number?: number
          day_type?: string
          gig_id?: string
          id?: string
          lunch_in?: string | null
          lunch_out?: string | null
          notes?: string
          wrap_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "producer_gig_days_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "producer_gigs"
            referencedColumns: ["id"]
          },
        ]
      }
      producer_gig_gear: {
        Row: {
          created_at: string
          gig_id: string
          id: string
          name: string
          notes: string
          packed: boolean
          quantity: number
          rate: number
          rate_type: string
          rental_days: number
        }
        Insert: {
          created_at?: string
          gig_id: string
          id: string
          name?: string
          notes?: string
          packed?: boolean
          quantity?: number
          rate?: number
          rate_type?: string
          rental_days?: number
        }
        Update: {
          created_at?: string
          gig_id?: string
          id?: string
          name?: string
          notes?: string
          packed?: boolean
          quantity?: number
          rate?: number
          rate_type?: string
          rental_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "producer_gig_gear_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "producer_gigs"
            referencedColumns: ["id"]
          },
        ]
      }
      producer_gigs: {
        Row: {
          billing_mode: string
          cc_surcharge_pct: number
          client_contact: string
          client_email: string
          client_name: string
          client_phone: string
          created_at: string
          date_end: string
          date_start: string
          day_rate: number
          dt_multiplier: number
          dt_threshold: number
          hotel_address: string
          hotel_name: string
          hourly_rate: number
          id: string
          notes: string
          ot_multiplier: number
          ot_threshold: number
          per_diem_rate: number
          per_diem_type: string
          per_diem_zip: string
          position: string
          producer_id: string
          show_name: string
          status: string
          venue_address: string
          venue_city: string
          venue_name: string
          venue_state: string
          venue_zip: string
        }
        Insert: {
          billing_mode?: string
          cc_surcharge_pct?: number
          client_contact?: string
          client_email?: string
          client_name?: string
          client_phone?: string
          created_at?: string
          date_end: string
          date_start: string
          day_rate?: number
          dt_multiplier?: number
          dt_threshold?: number
          hotel_address?: string
          hotel_name?: string
          hourly_rate?: number
          id: string
          notes?: string
          ot_multiplier?: number
          ot_threshold?: number
          per_diem_rate?: number
          per_diem_type?: string
          per_diem_zip?: string
          position?: string
          producer_id: string
          show_name?: string
          status?: string
          venue_address?: string
          venue_city?: string
          venue_name?: string
          venue_state?: string
          venue_zip?: string
        }
        Update: {
          billing_mode?: string
          cc_surcharge_pct?: number
          client_contact?: string
          client_email?: string
          client_name?: string
          client_phone?: string
          created_at?: string
          date_end?: string
          date_start?: string
          day_rate?: number
          dt_multiplier?: number
          dt_threshold?: number
          hotel_address?: string
          hotel_name?: string
          hourly_rate?: number
          id?: string
          notes?: string
          ot_multiplier?: number
          ot_threshold?: number
          per_diem_rate?: number
          per_diem_type?: string
          per_diem_zip?: string
          position?: string
          producer_id?: string
          show_name?: string
          status?: string
          venue_address?: string
          venue_city?: string
          venue_name?: string
          venue_state?: string
          venue_zip?: string
        }
        Relationships: [
          {
            foreignKeyName: "producer_gigs_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "producer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      producer_invoices: {
        Row: {
          created_at: string
          due_date: string | null
          gig_id: string
          id: string
          invoice_number: string
          issued_date: string
          notes: string
          paid_date: string | null
          payment_link: string | null
          status: string
        }
        Insert: {
          created_at?: string
          due_date?: string | null
          gig_id: string
          id: string
          invoice_number?: string
          issued_date?: string
          notes?: string
          paid_date?: string | null
          payment_link?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          due_date?: string | null
          gig_id?: string
          id?: string
          invoice_number?: string
          issued_date?: string
          notes?: string
          paid_date?: string | null
          payment_link?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "producer_invoices_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "producer_gigs"
            referencedColumns: ["id"]
          },
        ]
      }
      producer_mileage: {
        Row: {
          created_at: string
          date: string
          description: string
          gig_id: string | null
          id: string
          miles: number
          producer_id: string
          rate_per_mile: number
        }
        Insert: {
          created_at?: string
          date: string
          description?: string
          gig_id?: string | null
          id: string
          miles?: number
          producer_id: string
          rate_per_mile?: number
        }
        Update: {
          created_at?: string
          date?: string
          description?: string
          gig_id?: string | null
          id?: string
          miles?: number
          producer_id?: string
          rate_per_mile?: number
        }
        Relationships: [
          {
            foreignKeyName: "producer_mileage_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "producer_gigs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producer_mileage_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "producer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      producer_profiles: {
        Row: {
          address: string
          business_name: string
          cc_surcharge_pct: number
          city: string
          coffee_preferences: string[]
          created_at: string
          default_day_rate: number
          default_dt_multiplier: number
          default_dt_threshold: number
          default_hourly_rate: number
          default_ot_multiplier: number
          default_ot_threshold: number
          dietary_restrictions: string[]
          display_name: string
          email: string
          food_preferences: string[]
          free_access: boolean
          id: string
          invoice_prefix: string
          is_admin: boolean
          logo_url: string
          per_diem_default: number
          phone: string
          scan_limit: number
          scans_month: string
          scans_used: number
          state: string
          stripe_customer_id: string
          stripe_subscription_id: string
          subscription_status: string
          subscription_tier: string
          trial_ends_at: string | null
          user_id: string
          wakeup_buffer_min: number
          zip: string
        }
        Insert: {
          address?: string
          business_name?: string
          cc_surcharge_pct?: number
          city?: string
          coffee_preferences?: string[]
          created_at?: string
          default_day_rate?: number
          default_dt_multiplier?: number
          default_dt_threshold?: number
          default_hourly_rate?: number
          default_ot_multiplier?: number
          default_ot_threshold?: number
          dietary_restrictions?: string[]
          display_name?: string
          email?: string
          food_preferences?: string[]
          free_access?: boolean
          id: string
          invoice_prefix?: string
          is_admin?: boolean
          logo_url?: string
          per_diem_default?: number
          phone?: string
          scan_limit?: number
          scans_month?: string
          scans_used?: number
          state?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          subscription_status?: string
          subscription_tier?: string
          trial_ends_at?: string | null
          user_id: string
          wakeup_buffer_min?: number
          zip?: string
        }
        Update: {
          address?: string
          business_name?: string
          cc_surcharge_pct?: number
          city?: string
          coffee_preferences?: string[]
          created_at?: string
          default_day_rate?: number
          default_dt_multiplier?: number
          default_dt_threshold?: number
          default_hourly_rate?: number
          default_ot_multiplier?: number
          default_ot_threshold?: number
          dietary_restrictions?: string[]
          display_name?: string
          email?: string
          food_preferences?: string[]
          free_access?: boolean
          id?: string
          invoice_prefix?: string
          is_admin?: boolean
          logo_url?: string
          per_diem_default?: number
          phone?: string
          scan_limit?: number
          scans_month?: string
          scans_used?: number
          state?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          subscription_status?: string
          subscription_tier?: string
          trial_ends_at?: string | null
          user_id?: string
          wakeup_buffer_min?: number
          zip?: string
        }
        Relationships: []
      }
      project_types: {
        Row: {
          id: string
          lightweight: boolean
          name: string
          org_id: string
        }
        Insert: {
          id: string
          lightweight?: boolean
          name: string
          org_id?: string
        }
        Update: {
          id?: string
          lightweight?: boolean
          name?: string
          org_id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          billing_model: string | null
          billing_rate: number | null
          client_id: string
          created_at: string
          crew: Json
          date: string
          deliverable_url: string
          edit_types: string[]
          editor_billing: Json | null
          end_time: string
          id: string
          location_id: string | null
          notes: string
          org_id: string
          paid_date: string | null
          post_production: Json
          project_rate: number | null
          project_type_id: string
          start_time: string
          status: string
        }
        Insert: {
          billing_model?: string | null
          billing_rate?: number | null
          client_id: string
          created_at?: string
          crew?: Json
          date: string
          deliverable_url?: string
          edit_types?: string[]
          editor_billing?: Json | null
          end_time?: string
          id: string
          location_id?: string | null
          notes?: string
          org_id?: string
          paid_date?: string | null
          post_production?: Json
          project_rate?: number | null
          project_type_id: string
          start_time?: string
          status?: string
        }
        Update: {
          billing_model?: string | null
          billing_rate?: number | null
          client_id?: string
          created_at?: string
          crew?: Json
          date?: string
          deliverable_url?: string
          edit_types?: string[]
          editor_billing?: Json | null
          end_time?: string
          id?: string
          location_id?: string | null
          notes?: string
          org_id?: string
          paid_date?: string | null
          post_production?: Json
          project_rate?: number | null
          project_type_id?: string
          start_time?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_project_type_id_fkey"
            columns: ["project_type_id"]
            isOneToOne: false
            referencedRelation: "project_types"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_templates: {
        Row: {
          contract_content: string
          cover_image_url: string
          created_at: string
          deleted_at: string | null
          id: string
          line_items: Json
          name: string
          notes: string
          org_id: string
          packages: Json
          pages: Json
          payment_config: Json
          updated_at: string
        }
        Insert: {
          contract_content?: string
          cover_image_url?: string
          created_at?: string
          deleted_at?: string | null
          id: string
          line_items?: Json
          name?: string
          notes?: string
          org_id?: string
          packages?: Json
          pages?: Json
          payment_config?: Json
          updated_at?: string
        }
        Update: {
          contract_content?: string
          cover_image_url?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          line_items?: Json
          name?: string
          notes?: string
          org_id?: string
          packages?: Json
          pages?: Json
          payment_config?: Json
          updated_at?: string
        }
        Relationships: []
      }
      proposals: {
        Row: {
          accepted_at: string | null
          client_email: string
          client_id: string
          client_signature: Json | null
          completed_at: string | null
          contract_content: string
          created_at: string
          deleted_at: string | null
          id: string
          invoice_id: string | null
          lead_source: string
          line_items: Json
          notes: string
          org_id: string
          owner_signature: Json | null
          packages: Json
          pages: Json
          paid_at: string | null
          payment_config: Json
          payment_milestones: Json
          pipeline_stage: string
          project_id: string | null
          selected_package_id: string | null
          sent_at: string | null
          status: string
          stripe_session_id: string | null
          subtotal: number
          tax_amount: number
          tax_rate: number
          title: string
          total: number
          updated_at: string
          view_token: string
          viewed_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          client_email?: string
          client_id?: string
          client_signature?: Json | null
          completed_at?: string | null
          contract_content?: string
          created_at?: string
          deleted_at?: string | null
          id: string
          invoice_id?: string | null
          lead_source?: string
          line_items?: Json
          notes?: string
          org_id?: string
          owner_signature?: Json | null
          packages?: Json
          pages?: Json
          paid_at?: string | null
          payment_config?: Json
          payment_milestones?: Json
          pipeline_stage?: string
          project_id?: string | null
          selected_package_id?: string | null
          sent_at?: string | null
          status?: string
          stripe_session_id?: string | null
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          title?: string
          total?: number
          updated_at?: string
          view_token?: string
          viewed_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          client_email?: string
          client_id?: string
          client_signature?: Json | null
          completed_at?: string | null
          contract_content?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          invoice_id?: string | null
          lead_source?: string
          line_items?: Json
          notes?: string
          org_id?: string
          owner_signature?: Json | null
          packages?: Json
          pages?: Json
          paid_at?: string | null
          payment_config?: Json
          payment_milestones?: Json
          pipeline_stage?: string
          project_id?: string | null
          selected_package_id?: string | null
          sent_at?: string | null
          status?: string
          stripe_session_id?: string | null
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          title?: string
          total?: number
          updated_at?: string
          view_token?: string
          viewed_at?: string | null
        }
        Relationships: []
      }
      series: {
        Row: {
          client_id: string
          created_at: string
          goal: string
          id: string
          monthly_token_limit: number
          name: string
          org_id: string
          status: string
          token_reset_date: string
          tokens_used_this_month: number
        }
        Insert: {
          client_id: string
          created_at?: string
          goal?: string
          id: string
          monthly_token_limit?: number
          name: string
          org_id?: string
          status?: string
          token_reset_date?: string
          tokens_used_this_month?: number
        }
        Update: {
          client_id?: string
          created_at?: string
          goal?: string
          id?: string
          monthly_token_limit?: number
          name?: string
          org_id?: string
          status?: string
          token_reset_date?: string
          tokens_used_this_month?: number
        }
        Relationships: [
          {
            foreignKeyName: "series_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      series_episodes: {
        Row: {
          concept: string
          created_at: string
          draft_crew: string[]
          draft_date: string
          draft_end_time: string
          draft_location_id: string
          draft_start_time: string
          episode_number: number
          id: string
          project_id: string | null
          series_id: string
          status: string
          talking_points: string
          title: string
        }
        Insert: {
          concept?: string
          created_at?: string
          draft_crew?: string[]
          draft_date?: string
          draft_end_time?: string
          draft_location_id?: string
          draft_start_time?: string
          episode_number?: number
          id: string
          project_id?: string | null
          series_id: string
          status?: string
          talking_points?: string
          title?: string
        }
        Update: {
          concept?: string
          created_at?: string
          draft_crew?: string[]
          draft_date?: string
          draft_end_time?: string
          draft_location_id?: string
          draft_start_time?: string
          episode_number?: number
          id?: string
          project_id?: string | null
          series_id?: string
          status?: string
          talking_points?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "series_episodes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_episodes_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
        ]
      }
      series_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          sender_name: string
          series_id: string
          tokens_used: number
        }
        Insert: {
          content?: string
          created_at?: string
          id: string
          role?: string
          sender_name?: string
          series_id: string
          tokens_used?: number
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          sender_name?: string
          series_id?: string
          tokens_used?: number
        }
        Relationships: [
          {
            foreignKeyName: "series_messages_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_roles: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      testimonials: {
        Row: {
          approved_at: string | null
          author_company: string
          author_name: string
          content: string
          id: string
          org_id: string
          status: string
          submitted_at: string
          trigger: string
          user_id: string | null
        }
        Insert: {
          approved_at?: string | null
          author_company?: string
          author_name?: string
          content: string
          id: string
          org_id?: string
          status?: string
          submitted_at?: string
          trigger?: string
          user_id?: string | null
        }
        Update: {
          approved_at?: string | null
          author_company?: string
          author_name?: string
          content?: string
          id?: string
          org_id?: string
          status?: string
          submitted_at?: string
          trigger?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "testimonials_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          auto_stopped: boolean
          created_at: string
          crew_member_id: string
          duration_minutes: number | null
          end_time: string | null
          id: string
          notes: string
          org_id: string
          paused_at: string | null
          project_id: string
          start_time: string
          total_paused_ms: number | null
        }
        Insert: {
          auto_stopped?: boolean
          created_at?: string
          crew_member_id?: string
          duration_minutes?: number | null
          end_time?: string | null
          id: string
          notes?: string
          org_id?: string
          paused_at?: string | null
          project_id?: string
          start_time: string
          total_paused_ms?: number | null
        }
        Update: {
          auto_stopped?: boolean
          created_at?: string
          crew_member_id?: string
          duration_minutes?: number | null
          end_time?: string | null
          id?: string
          notes?: string
          org_id?: string
          paused_at?: string | null
          project_id?: string
          start_time?: string
          total_paused_ms?: number | null
        }
        Relationships: []
      }
      tool_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          ip_hash: string | null
          referrer: string | null
          tool_slug: string
          utm_campaign: string | null
          utm_source: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id: string
          ip_hash?: string | null
          referrer?: string | null
          tool_slug: string
          utm_campaign?: string | null
          utm_source?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          ip_hash?: string | null
          referrer?: string | null
          tool_slug?: string
          utm_campaign?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      tool_leads: {
        Row: {
          bounced_at: string | null
          capture_count: number
          context: string | null
          drip_stage: number
          email: string
          first_name: string | null
          first_seen_at: string
          id: string
          ip_hash: string | null
          last_message_id: string | null
          last_seen_at: string
          last_sent_at: string | null
          last_template_id: string | null
          referrer: string | null
          source: string
          unsubscribed_at: string | null
          utm_campaign: string | null
          utm_source: string | null
        }
        Insert: {
          bounced_at?: string | null
          capture_count?: number
          context?: string | null
          drip_stage?: number
          email: string
          first_name?: string | null
          first_seen_at?: string
          id: string
          ip_hash?: string | null
          last_message_id?: string | null
          last_seen_at?: string
          last_sent_at?: string | null
          last_template_id?: string | null
          referrer?: string | null
          source: string
          unsubscribed_at?: string | null
          utm_campaign?: string | null
          utm_source?: string | null
        }
        Update: {
          bounced_at?: string | null
          capture_count?: number
          context?: string | null
          drip_stage?: number
          email?: string
          first_name?: string | null
          first_seen_at?: string
          id?: string
          ip_hash?: string | null
          last_message_id?: string | null
          last_seen_at?: string
          last_sent_at?: string | null
          last_template_id?: string | null
          referrer?: string | null
          source?: string
          unsubscribed_at?: string | null
          utm_campaign?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          client_ids: string[]
          created_at: string
          crew_member_id: string
          email: string
          feature_overrides: Json | null
          has_completed_onboarding: boolean
          id: string
          must_change_password: boolean
          name: string
          org_id: string
          personal_event_templates: Json | null
          role: string
        }
        Insert: {
          client_ids?: string[]
          created_at?: string
          crew_member_id?: string
          email: string
          feature_overrides?: Json | null
          has_completed_onboarding?: boolean
          id: string
          must_change_password?: boolean
          name?: string
          org_id?: string
          personal_event_templates?: Json | null
          role?: string
        }
        Update: {
          client_ids?: string[]
          created_at?: string
          crew_member_id?: string
          email?: string
          feature_overrides?: Json | null
          has_completed_onboarding?: boolean
          id?: string
          must_change_password?: boolean
          name?: string
          org_id?: string
          personal_event_templates?: Json | null
          role?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_producer_admin: { Args: never; Returns: boolean }
      user_client_ids: { Args: never; Returns: string[] }
      user_crew_member_id: { Args: never; Returns: string }
      user_org_id: { Args: never; Returns: string }
      user_role: { Args: never; Returns: string }
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
