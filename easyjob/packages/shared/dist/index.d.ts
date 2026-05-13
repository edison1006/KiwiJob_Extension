/**
 * Shared contracts between the web app, Chrome extension, and API.
 * Keep fields aligned with FastAPI Pydantic models.
 */
export declare const APPLICATION_STATUSES: readonly ["Saved", "Applied", "Viewed", "Assessment", "Interview", "Rejected", "Offer", "Withdrawn"];
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
/** Payload sent from the extension to POST /jobs/save */
export interface JobSavePayload {
    title: string;
    company?: string | null;
    location?: string | null;
    description?: string | null;
    salary?: string | null;
    url: string;
    source_website: string;
    posted_date?: string | null;
    status?: ApplicationStatus;
}
/** Structured AI match output (GET /match/{job_id} and POST /match/analyze) */
export interface MatchAnalysis {
    score: number;
    matched_skills: string[];
    missing_skills: string[];
    matched_experience: string[];
    missing_experience: string[];
    ats_keywords: string[];
    cv_summary_suggestion: string;
    bullet_point_suggestions: string[];
    cover_letter_draft: string;
    risk_flags: string[];
}
export interface JobPostDTO {
    id: number;
    title: string;
    company: string | null;
    location: string | null;
    description: string | null;
    salary: string | null;
    url: string;
    source_website: string;
    posted_date: string | null;
    created_at: string;
    updated_at: string;
}
/** One row in the application tracker (application + job + latest match score) */
export interface ApplicationListItem {
    id: number;
    status: ApplicationStatus;
    saved_at: string;
    updated_at: string;
    match_score: number | null;
    job: JobPostDTO;
}
export interface ApplicationDetail extends ApplicationListItem {
    latest_match: MatchAnalysis | null;
}
export interface AnalyticsSummary {
    total_saved: number;
    total_applied: number;
    interview_count: number;
    rejection_count: number;
    average_match_score: number | null;
    by_source: Record<string, number>;
    by_status: Record<string, number>;
}
export interface ResumeDTO {
    id: number;
    filename: string;
    created_at: string;
    text_preview: string;
}
//# sourceMappingURL=index.d.ts.map