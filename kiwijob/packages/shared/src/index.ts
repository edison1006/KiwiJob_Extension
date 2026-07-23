/**
 * Shared contracts between the web app, Chrome extension, and API.
 * Keep fields aligned with FastAPI Pydantic models.
 */

export const APPLICATION_STATUSES = [
  "Saved",
  "Applied",
  "Assessment",
  "Reply",
  "Interview",
  "Rejected",
  "Offer",
  "Withdrawn",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Payload sent from the extension to POST /jobs/save */
export interface JobSavePayload {
  title: string;
  company?: string | null;
  location?: string | null;
  description?: string | null;
  salary?: string | null;
  employment_type?: string | null;
  workplace_type?: string | null;
  visa_requirement?: string | null;
  url: string;
  apply_url?: string | null;
  company_url?: string | null;
  external_job_id?: string | null;
  source_website: string;
  posted_date?: string | null;
  closing_date?: string | null;
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
  employment_type: string | null;
  workplace_type: string | null;
  visa_requirement: string | null;
  url: string;
  apply_url: string | null;
  company_url: string | null;
  external_job_id: string | null;
  source_website: string;
  posted_date: string | null;
  closing_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobPostUpdatePayload {
  title?: string;
  company?: string | null;
  location?: string | null;
  description?: string | null;
  salary?: string | null;
  employment_type?: string | null;
  workplace_type?: string | null;
  visa_requirement?: string | null;
  url?: string;
  apply_url?: string | null;
  company_url?: string | null;
  external_job_id?: string | null;
  source_website?: string;
  posted_date?: string | null;
  closing_date?: string | null;
  status?: ApplicationStatus;
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

export interface ApplicationNote {
  id: number;
  application_id: number;
  content: string;
  created_at: string;
  updated_at: string;
  is_edited: boolean;
}

export interface ApplicationTimelineEvent {
  id: number;
  event_type: string;
  source: string;
  page_url: string | null;
  status_after: ApplicationStatus | null;
  occurred_at: string;
  created_at: string;
}

export interface ApplicationDetail extends ApplicationListItem {
  latest_match: MatchAnalysis | null;
  notes: ApplicationNote[];
  timeline: ApplicationTimelineEvent[];
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

export interface InsightTitleCount {
  title: string;
  count: number;
}

export interface InsightsSummary {
  days: number;
  start_date: string;
  end_date: string;
  applications: number;
  replies: number;
  interviews: number;
  offers: number;
  rejections: number;
  response_rate: number;
  interview_rate: number;
  top_titles: InsightTitleCount[];
  by_status: Record<string, number>;
}

export interface ResumeDTO {
  id: number;
  filename: string;
  created_at: string;
  text_preview: string;
}

export interface CvOptimizationSuggestion {
  id: string;
  section: string;
  original: string;
  suggested: string;
  reason: string;
  accepted: boolean;
}

export interface CvOptimization {
  id: number;
  application_id: number;
  resume_id: number;
  title: string;
  match_score: number;
  suggestions: CvOptimizationSuggestion[];
  optimized_text: string;
  created_at: string;
  updated_at: string;
}

export interface CvProfileEducation {
  school: string;
  degree: string;
  years: string;
}

export interface CvProfileExperience {
  title: string;
  company: string;
  years: string;
}

export interface CvProfileUpload {
  id: number;
  filename: string;
  created_at: string;
}

export interface CvProfileDTO {
  full_name: string;
  initials: string;
  email: string;
  phone: string;
  summary: string;
  education: CvProfileEducation[];
  experience: CvProfileExperience[];
  skills: string[];
  certifications: string[];
  languages: string[];
  links: string[];
  upload: CvProfileUpload | null;
}

/** Stored per user (API + web Settings) and used by the extension to fill ATS / career-site forms. */
export interface ApplicantAutofillProfile {
  fullName: string;
  email: string;
  phone: string;
  linkedInUrl: string;
  portfolioUrl: string;
  githubUrl: string;
  city: string;
  country: string;
  workAuthorization: string;
  sponsorship: string;
  salaryExpectation: string;
  noticePeriod: string;
  skills: string;
  summary: string;
  coverLetter: string;
}

export const EMPTY_APPLICANT_AUTOFILL_PROFILE: ApplicantAutofillProfile = {
  fullName: "",
  email: "",
  phone: "",
  linkedInUrl: "",
  portfolioUrl: "",
  githubUrl: "",
  city: "",
  country: "",
  workAuthorization: "",
  sponsorship: "",
  salaryExpectation: "",
  noticePeriod: "",
  skills: "",
  summary: "",
  coverLetter: "",
};
