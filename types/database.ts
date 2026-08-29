/**
 * Database types for SiteBoss Pro.
 *
 * Mirrors supabase/migrations. Once a Supabase project exists these can be
 * regenerated with:
 *
 *   npx supabase gen types typescript --project-id <id> > types/database.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type CompanyRole = "owner" | "member";
export type ProjectStatus = "active" | "on_hold" | "completed";
export type ReportStatus = "draft" | "final";
export type ReportSectionType =
  | "executive_summary"
  | "works_completed"
  | "works_in_progress"
  | "deliveries_plant"
  | "health_safety"
  | "issues_constraints"
  | "outstanding_items"
  | "planned_works";
export type PhotoCategory =
  | "work_completed"
  | "before"
  | "after"
  | "defect"
  | "safety"
  | "progress"
  | "delivery"
  | "general";
export type DocumentType =
  | "drawing"
  | "specification"
  | "rams"
  | "method_statement"
  | "permit"
  | "inspection_sheet"
  | "certificate"
  | "delivery_note"
  | "client_instruction"
  | "other";
export type PhotoPairRole = "before" | "after";
export type IssuePriority = "low" | "medium" | "high" | "critical";
export type IssueStatus = "open" | "in_progress" | "closed";
export type SummaryReportKind = "progress" | "completion";
export type SummarySectionType =
  | "period_summary"
  | "key_activities"
  | "works_completed"
  | "works_in_progress"
  | "resources_and_plant"
  | "next_period"
  | "project_overview"
  | "scope_of_works"
  | "stages_of_works"
  | "key_technical_activities"
  | "completed_works"
  | "photographic_record"
  | "sign_off"
  | "issues_and_resolutions";

type Timestamps = {
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      companies: {
        Row: Timestamps & { id: string; name: string };
        Insert: Partial<Timestamps> & { id?: string; name: string };
        Update: Partial<Timestamps> & { id?: string; name?: string };
        Relationships: [];
      };
      company_members: {
        Row: Timestamps & {
          id: string;
          company_id: string;
          user_id: string;
          role: CompanyRole;
        };
        Insert: Partial<Timestamps> & {
          id?: string;
          company_id: string;
          user_id: string;
          role?: CompanyRole;
        };
        Update: Partial<Timestamps> & {
          id?: string;
          company_id?: string;
          user_id?: string;
          role?: CompanyRole;
        };
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: Timestamps & {
          id: string;
          full_name: string | null;
          phone: string | null;
        };
        Insert: Partial<Timestamps> & {
          id: string;
          full_name?: string | null;
          phone?: string | null;
        };
        Update: Partial<Timestamps> & {
          id?: string;
          full_name?: string | null;
          phone?: string | null;
        };
        Relationships: [];
      };
      projects: {
        Row: Timestamps & {
          id: string;
          company_id: string;
          name: string;
          client: string | null;
          site_address: string | null;
          postcode: string | null;
          project_reference: string | null;
          site_manager: string | null;
          start_date: string | null;
          expected_completion_date: string | null;
          description: string | null;
          status: ProjectStatus;
          created_by: string | null;
        };
        Insert: Partial<Timestamps> & {
          id?: string;
          company_id: string;
          name: string;
          client?: string | null;
          site_address?: string | null;
          postcode?: string | null;
          project_reference?: string | null;
          site_manager?: string | null;
          start_date?: string | null;
          expected_completion_date?: string | null;
          description?: string | null;
          status?: ProjectStatus;
          created_by?: string | null;
        };
        Update: Partial<Timestamps> & {
          id?: string;
          company_id?: string;
          name?: string;
          client?: string | null;
          site_address?: string | null;
          postcode?: string | null;
          project_reference?: string | null;
          site_manager?: string | null;
          start_date?: string | null;
          expected_completion_date?: string | null;
          description?: string | null;
          status?: ProjectStatus;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      issue_events: {
        Row: {
          id: string;
          company_id: string;
          issue_id: string;
          from_status: IssueStatus | null;
          to_status: IssueStatus;
          note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          issue_id: string;
          from_status?: IssueStatus | null;
          to_status: IssueStatus;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          issue_id?: string;
          from_status?: IssueStatus | null;
          to_status?: IssueStatus;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      summary_reports: {
        Row: Timestamps & {
          id: string;
          company_id: string;
          project_id: string;
          kind: SummaryReportKind;
          number: number;
          revision: number;
          supersedes_id: string | null;
          title: string | null;
          period_start: string | null;
          period_end: string | null;
          status: ReportStatus;
          pdf_path: string | null;
          finalised_at: string | null;
          created_by: string | null;
        };
        Insert: Partial<Timestamps> & {
          id?: string;
          company_id: string;
          project_id: string;
          kind: SummaryReportKind;
          number?: number;
          revision?: number;
          supersedes_id?: string | null;
          title?: string | null;
          period_start?: string | null;
          period_end?: string | null;
          status?: ReportStatus;
          pdf_path?: string | null;
          finalised_at?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Timestamps> & {
          id?: string;
          company_id?: string;
          project_id?: string;
          kind?: SummaryReportKind;
          number?: number;
          revision?: number;
          supersedes_id?: string | null;
          title?: string | null;
          period_start?: string | null;
          period_end?: string | null;
          status?: ReportStatus;
          pdf_path?: string | null;
          finalised_at?: string | null;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "summary_reports_project_id_company_id_fkey";
            columns: ["project_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      summary_report_sections: {
        Row: Timestamps & {
          id: string;
          company_id: string;
          summary_report_id: string;
          section_type: SummarySectionType;
          content: string | null;
          ai_generated: boolean;
          sort_order: number;
        };
        Insert: Partial<Timestamps> & {
          id?: string;
          company_id: string;
          summary_report_id: string;
          section_type: SummarySectionType;
          content?: string | null;
          ai_generated?: boolean;
          sort_order?: number;
        };
        Update: Partial<Timestamps> & {
          id?: string;
          company_id?: string;
          summary_report_id?: string;
          section_type?: SummarySectionType;
          content?: string | null;
          ai_generated?: boolean;
          sort_order?: number;
        };
        Relationships: [];
      };
      summary_report_sources: {
        Row: {
          id: string;
          company_id: string;
          summary_report_id: string;
          report_id: string | null;
          source_summary_report_id: string | null;
          via_summary_report_id: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          summary_report_id: string;
          report_id?: string | null;
          source_summary_report_id?: string | null;
          via_summary_report_id?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          summary_report_id?: string;
          report_id?: string | null;
          source_summary_report_id?: string | null;
          via_summary_report_id?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      documents: {
        Row: {
          id: string;
          company_id: string;
          project_id: string;
          storage_path: string;
          title: string;
          original_filename: string;
          doc_type: DocumentType;
          description: string | null;
          reference: string | null;
          revision: string | null;
          document_date: string | null;
          expiry_date: string | null;
          file_size: number | null;
          mime_type: string | null;
          uploaded_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          project_id: string;
          storage_path: string;
          title: string;
          original_filename: string;
          doc_type?: DocumentType;
          description?: string | null;
          reference?: string | null;
          revision?: string | null;
          document_date?: string | null;
          expiry_date?: string | null;
          file_size?: number | null;
          mime_type?: string | null;
          uploaded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          project_id?: string;
          storage_path?: string;
          title?: string;
          original_filename?: string;
          doc_type?: DocumentType;
          description?: string | null;
          reference?: string | null;
          revision?: string | null;
          document_date?: string | null;
          expiry_date?: string | null;
          file_size?: number | null;
          mime_type?: string | null;
          uploaded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      report_documents: {
        Row: {
          id: string;
          company_id: string;
          report_id: string;
          document_id: string;
          sort_order: number;
          title_at_issue: string | null;
          type_at_issue: DocumentType | null;
          reference_at_issue: string | null;
          revision_at_issue: string | null;
          document_date_at_issue: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          report_id: string;
          document_id: string;
          sort_order?: number;
          title_at_issue?: string | null;
          type_at_issue?: DocumentType | null;
          reference_at_issue?: string | null;
          revision_at_issue?: string | null;
          document_date_at_issue?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          report_id?: string;
          document_id?: string;
          sort_order?: number;
          title_at_issue?: string | null;
          type_at_issue?: DocumentType | null;
          reference_at_issue?: string | null;
          revision_at_issue?: string | null;
          document_date_at_issue?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      summary_report_documents: {
        Row: {
          id: string;
          company_id: string;
          summary_report_id: string;
          document_id: string;
          sort_order: number;
          title_at_issue: string | null;
          type_at_issue: DocumentType | null;
          reference_at_issue: string | null;
          revision_at_issue: string | null;
          document_date_at_issue: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          summary_report_id: string;
          document_id: string;
          sort_order?: number;
          title_at_issue?: string | null;
          type_at_issue?: DocumentType | null;
          reference_at_issue?: string | null;
          revision_at_issue?: string | null;
          document_date_at_issue?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          summary_report_id?: string;
          document_id?: string;
          sort_order?: number;
          title_at_issue?: string | null;
          type_at_issue?: DocumentType | null;
          reference_at_issue?: string | null;
          revision_at_issue?: string | null;
          document_date_at_issue?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      summary_report_photos: {
        Row: {
          id: string;
          company_id: string;
          summary_report_id: string;
          photo_id: string;
          sort_order: number;
          caption_override: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          summary_report_id: string;
          photo_id: string;
          sort_order?: number;
          caption_override?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          summary_report_id?: string;
          photo_id?: string;
          sort_order?: number;
          caption_override?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      summary_report_issues: {
        Row: {
          id: string;
          company_id: string;
          summary_report_id: string;
          issue_id: string;
          sort_order: number;
          status_at_issue: IssueStatus | null;
          resolution_at_issue: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          summary_report_id: string;
          issue_id: string;
          sort_order?: number;
          status_at_issue?: IssueStatus | null;
          resolution_at_issue?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          summary_report_id?: string;
          issue_id?: string;
          sort_order?: number;
          status_at_issue?: IssueStatus | null;
          resolution_at_issue?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      reports: {
        Row: Timestamps & {
          id: string;
          company_id: string;
          project_id: string;
          report_number: number;
          report_date: string;
          author_id: string | null;
          author_name: string | null;
          weather: string | null;
          raw_notes: string | null;
          status: ReportStatus;
          pdf_path: string | null;
          finalised_at: string | null;
        };
        Insert: Partial<Timestamps> & {
          id?: string;
          company_id: string;
          project_id: string;
          report_number?: number;
          report_date?: string;
          author_id?: string | null;
          author_name?: string | null;
          weather?: string | null;
          raw_notes?: string | null;
          status?: ReportStatus;
          pdf_path?: string | null;
          finalised_at?: string | null;
        };
        Update: Partial<Timestamps> & {
          id?: string;
          company_id?: string;
          project_id?: string;
          report_number?: number;
          report_date?: string;
          author_id?: string | null;
          author_name?: string | null;
          weather?: string | null;
          raw_notes?: string | null;
          status?: ReportStatus;
          pdf_path?: string | null;
          finalised_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "reports_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_project_id_company_id_fkey";
            columns: ["project_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      report_sections: {
        Row: Timestamps & {
          id: string;
          company_id: string;
          report_id: string;
          section_type: ReportSectionType;
          content: string | null;
          ai_generated: boolean;
          sort_order: number;
        };
        Insert: Partial<Timestamps> & {
          id?: string;
          company_id: string;
          report_id: string;
          section_type: ReportSectionType;
          content?: string | null;
          ai_generated?: boolean;
          sort_order?: number;
        };
        Update: Partial<Timestamps> & {
          id?: string;
          company_id?: string;
          report_id?: string;
          section_type?: ReportSectionType;
          content?: string | null;
          ai_generated?: boolean;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "report_sections_report_id_company_id_fkey";
            columns: ["report_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "reports";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      workforce_entries: {
        Row: Timestamps & {
          id: string;
          company_id: string;
          report_id: string;
          company_name: string;
          trade: string | null;
          operatives: number;
          sort_order: number;
        };
        Insert: Partial<Timestamps> & {
          id?: string;
          company_id: string;
          report_id: string;
          company_name: string;
          trade?: string | null;
          operatives?: number;
          sort_order?: number;
        };
        Update: Partial<Timestamps> & {
          id?: string;
          company_id?: string;
          report_id?: string;
          company_name?: string;
          trade?: string | null;
          operatives?: number;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "workforce_entries_report_id_company_id_fkey";
            columns: ["report_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "reports";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      plant_entries: {
        Row: Timestamps & {
          id: string;
          company_id: string;
          report_id: string;
          description: string;
          quantity: number;
          sort_order: number;
        };
        Insert: Partial<Timestamps> & {
          id?: string;
          company_id: string;
          report_id: string;
          description: string;
          quantity?: number;
          sort_order?: number;
        };
        Update: Partial<Timestamps> & {
          id?: string;
          company_id?: string;
          report_id?: string;
          description?: string;
          quantity?: number;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "plant_entries_report_id_company_id_fkey";
            columns: ["report_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "reports";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      photos: {
        Row: Timestamps & {
          id: string;
          company_id: string;
          project_id: string;
          report_id: string | null;
          storage_path: string;
          caption: string | null;
          original_caption: string | null;
          category: PhotoCategory;
          pair_id: string | null;
          pair_role: PhotoPairRole | null;
          width: number | null;
          height: number | null;
          taken_at: string | null;
          sort_order: number;
          uploaded_by: string | null;
        };
        Insert: Partial<Timestamps> & {
          id?: string;
          company_id: string;
          project_id: string;
          report_id?: string | null;
          storage_path: string;
          caption?: string | null;
          original_caption?: string | null;
          category?: PhotoCategory;
          pair_id?: string | null;
          pair_role?: PhotoPairRole | null;
          width?: number | null;
          height?: number | null;
          taken_at?: string | null;
          sort_order?: number;
          uploaded_by?: string | null;
        };
        Update: Partial<Timestamps> & {
          id?: string;
          company_id?: string;
          project_id?: string;
          report_id?: string | null;
          storage_path?: string;
          caption?: string | null;
          original_caption?: string | null;
          category?: PhotoCategory;
          pair_id?: string | null;
          pair_role?: PhotoPairRole | null;
          width?: number | null;
          height?: number | null;
          taken_at?: string | null;
          sort_order?: number;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "photos_project_id_company_id_fkey";
            columns: ["project_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "photos_report_id_company_id_fkey";
            columns: ["report_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "reports";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      issues: {
        Row: Timestamps & {
          id: string;
          company_id: string;
          project_id: string;
          report_id: string | null;
          title: string;
          description: string | null;
          resolution: string | null;
          photo_id: string | null;
          responsible: string | null;
          priority: IssuePriority;
          status: IssueStatus;
          closed_at: string | null;
          created_by: string | null;
        };
        Insert: Partial<Timestamps> & {
          id?: string;
          company_id: string;
          project_id: string;
          report_id?: string | null;
          title: string;
          description?: string | null;
          resolution?: string | null;
          photo_id?: string | null;
          responsible?: string | null;
          priority?: IssuePriority;
          status?: IssueStatus;
          closed_at?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Timestamps> & {
          id?: string;
          company_id?: string;
          project_id?: string;
          report_id?: string | null;
          title?: string;
          description?: string | null;
          resolution?: string | null;
          photo_id?: string | null;
          responsible?: string | null;
          priority?: IssuePriority;
          status?: IssueStatus;
          closed_at?: string | null;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "issues_project_id_company_id_fkey";
            columns: ["project_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "issues_report_id_company_id_fkey";
            columns: ["report_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "reports";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "issues_photo_id_company_id_fkey";
            columns: ["photo_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "photos";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
    };
    Views: Record<never, never>;
    Functions: {
      is_company_member: {
        Args: { target_company_id: string };
        Returns: boolean;
      };
      is_company_owner: {
        Args: { target_company_id: string };
        Returns: boolean;
      };
      shares_company_with: {
        Args: { target_user_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      company_role: CompanyRole;
      document_type: DocumentType;
      issue_priority: IssuePriority;
      issue_status: IssueStatus;
      photo_category: PhotoCategory;
      photo_pair_role: PhotoPairRole;
      project_status: ProjectStatus;
      report_section_type: ReportSectionType;
      report_status: ReportStatus;
      summary_report_kind: SummaryReportKind;
      summary_section_type: SummarySectionType;
    };
    CompositeTypes: Record<never, never>;
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];

export type Company = Tables<"companies">;
export type CompanyMember = Tables<"company_members">;
export type Profile = Tables<"profiles">;
export type Project = Tables<"projects">;
export type Report = Tables<"reports">;
export type ReportSection = Tables<"report_sections">;
export type WorkforceEntry = Tables<"workforce_entries">;
export type PlantEntry = Tables<"plant_entries">;
export type Photo = Tables<"photos">;
export type Document = Tables<"documents">;
export type ReportDocument = Tables<"report_documents">;
export type SummaryReportDocument = Tables<"summary_report_documents">;
export type Issue = Tables<"issues">;
export type IssueEvent = Tables<"issue_events">;
export type SummaryReport = Tables<"summary_reports">;
export type SummaryReportSection = Tables<"summary_report_sections">;
export type SummaryReportSource = Tables<"summary_report_sources">;
export type SummaryReportPhoto = Tables<"summary_report_photos">;
export type SummaryReportIssue = Tables<"summary_report_issues">;
