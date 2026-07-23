import type {
  AnalyticsSummary,
  ApplicantAutofillProfile,
  ApplicationDetail,
  ApplicationListItem,
  ApplicationNote,
  ApplicationStatus,
  CvOptimization,
  CvOptimizationSuggestion,
  JobPostUpdatePayload,
  JobSavePayload,
  MatchAnalysis,
  ResumeDTO,
} from "@kiwijob/shared";

const DEFAULT_API_URL = "http://kiwijob-api.ap-southeast-2.elasticbeanstalk.com";
const API_URL = (import.meta.env.VITE_API_URL || DEFAULT_API_URL).replace(/\/+$/, "");
const AUTH_TOKEN_KEY = "kiwijob_auth_token";

export type UserDTO = {
  id: number;
  email: string;
  display_name: string;
};

export type AuthResponse = {
  access_token: string;
  token_type: "bearer";
  user: UserDTO;
};

export type JobSearchFilters = {
  keywords: string;
  location: string;
  jobType: string;
  minSalary: string;
  sources: string[];
};

export type JobSearchResult = {
  source_id: string;
  source_name: string;
  search_url: string;
  job: JobSavePayload;
  company_logo_url?: string | null;
};

export function getApiBaseUrl(): string {
  return API_URL;
}

export function getAuthToken(): string {
  return localStorage.getItem(AUTH_TOKEN_KEY)?.trim() ?? "";
}

export function setAuthToken(token: string) {
  const t = token.trim();
  if (t) localStorage.setItem(AUTH_TOKEN_KEY, t);
  else localStorage.removeItem(AUTH_TOKEN_KEY);
}

export function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

function headers(): HeadersInit {
  const h: Record<string, string> = {};
  const token = getAuthToken();
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function formatErrorBody(text: string): string {
  const raw = text.trim();
  if (!raw) return "Request failed";
  if (/^Method Not Allowed$/i.test(raw)) {
    return "API endpoint is outdated (missing /jobs/search). Restart the backend service and try again.";
  }
  try {
    const j = JSON.parse(raw) as { detail?: unknown };
    const d = j.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) {
      return d
        .map((item) => {
          if (item && typeof item === "object" && "msg" in item) return String((item as { msg: unknown }).msg);
          return String(item);
        })
        .join("; ");
    }
  } catch {
    /* not JSON */
  }
  return raw.slice(0, 800);
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(formatErrorBody(text) || res.statusText);
  }
  return res.json() as Promise<T>;
}

export async function probeApiHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, { credentials: "include", headers: headers() });
    return res.ok;
  } catch {
    return false;
  }
}

export async function registerAccount(email: string, password: string, displayName = ""): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, display_name: displayName }),
  });
  const body = await parseJson<AuthResponse>(res);
  setAuthToken(body.access_token);
  return body;
}

export async function loginAccount(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await parseJson<AuthResponse>(res);
  setAuthToken(body.access_token);
  return body;
}

export async function oauthLogin(provider: "google" | "apple", idToken: string): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/auth/oauth`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, id_token: idToken }),
  });
  const body = await parseJson<AuthResponse>(res);
  setAuthToken(body.access_token);
  return body;
}

export async function logoutAccount(): Promise<void> {
  try {
    await fetch(`${API_URL}/auth/logout`, { method: "POST", credentials: "include", headers: headers() });
  } finally {
    clearAuthToken();
  }
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const res = await fetch(`${API_URL}/auth/password`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...headers() },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  if (!res.ok) throw new Error(formatErrorBody(await res.text()));
}

export async function fetchCurrentUser(): Promise<UserDTO> {
  const res = await fetch(`${API_URL}/auth/me`, { credentials: "include", headers: headers() });
  return parseJson(res);
}

export async function deleteAccount(): Promise<void> {
  const res = await fetch(`${API_URL}/auth/account`, {
    method: "DELETE",
    credentials: "include",
    headers: headers(),
  });
  if (!res.ok) throw new Error(formatErrorBody(await res.text()));
  clearAuthToken();
}

export async function fetchJobs(): Promise<ApplicationListItem[]> {
  const res = await fetch(`${API_URL}/jobs`, { credentials: "include", headers: headers() });
  return parseJson(res);
}

export async function fetchJob(id: number): Promise<ApplicationDetail> {
  const res = await fetch(`${API_URL}/jobs/${id}`, { credentials: "include", headers: headers() });
  return parseJson(res);
}

export async function updateJobStatus(id: number, status: ApplicationStatus): Promise<ApplicationListItem> {
  const res = await fetch(`${API_URL}/jobs/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...headers() },
    body: JSON.stringify({ status }),
  });
  return parseJson(res);
}

export async function updateJobDetails(id: number, payload: JobPostUpdatePayload): Promise<ApplicationListItem> {
  const res = await fetch(`${API_URL}/jobs/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...headers() },
    body: JSON.stringify(payload),
  });
  return parseJson(res);
}

export async function createApplicationNote(jobId: number, content: string): Promise<ApplicationNote> {
  const res = await fetch(`${API_URL}/jobs/${jobId}/notes`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...headers() },
    body: JSON.stringify({ content }),
  });
  return parseJson(res);
}

export async function updateApplicationNote(jobId: number, noteId: number, content: string): Promise<ApplicationNote> {
  const res = await fetch(`${API_URL}/jobs/${jobId}/notes/${noteId}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...headers() },
    body: JSON.stringify({ content }),
  });
  return parseJson(res);
}

export async function deleteApplicationNote(jobId: number, noteId: number): Promise<void> {
  const res = await fetch(`${API_URL}/jobs/${jobId}/notes/${noteId}`, { method: "DELETE", credentials: "include", headers: headers() });
  if (!res.ok) throw new Error(formatErrorBody(await res.text()));
}

export async function deleteJob(id: number): Promise<void> {
  const res = await fetch(`${API_URL}/jobs/${id}`, { method: "DELETE", credentials: "include", headers: headers() });
  if (!res.ok) throw new Error(formatErrorBody(await res.text()));
}

export async function extractJobFromUrl(url: string): Promise<JobSavePayload> {
  const res = await fetch(`${API_URL}/jobs/extract`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...headers() },
    body: JSON.stringify({ url }),
  });
  return parseJson(res);
}

export async function searchJobsRemote(filters: JobSearchFilters): Promise<JobSearchResult[]> {
  const res = await fetch(`${API_URL}/jobs/search`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...headers() },
    body: JSON.stringify({
      keywords: filters.keywords,
      location: filters.location,
      job_type: filters.jobType,
      min_salary: filters.minSalary,
      sources: filters.sources,
    }),
  });
  return parseJson(res);
}

export async function fetchMatch(jobId: number): Promise<MatchAnalysis> {
  const res = await fetch(`${API_URL}/match/${jobId}`, { credentials: "include", headers: headers() });
  return parseJson(res);
}

export async function analyzeMatch(jobId: number): Promise<MatchAnalysis> {
  const res = await fetch(`${API_URL}/match/analyze`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...headers() },
    body: JSON.stringify({ job_id: jobId }),
  });
  return parseJson(res);
}

export async function fetchResumes(): Promise<ResumeDTO[]> {
  const res = await fetch(`${API_URL}/resumes`, { credentials: "include", headers: headers() });
  return parseJson(res);
}

export async function uploadResume(file: File): Promise<ResumeDTO> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API_URL}/resumes/upload`, {
    method: "POST",
    credentials: "include",
    headers: headers(),
    body: fd,
  });
  return parseJson(res);
}

export async function deleteResume(id: number): Promise<void> {
  const res = await fetch(`${API_URL}/resumes/${id}`, { method: "DELETE", credentials: "include", headers: headers() });
  if (!res.ok) throw new Error(formatErrorBody(await res.text()));
}

export async function createCvOptimization(applicationId: number, resumeId: number): Promise<CvOptimization> {
  const res = await fetch(`${API_URL}/cv-optimizations`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...headers() },
    body: JSON.stringify({ application_id: applicationId, resume_id: resumeId }),
  });
  return parseJson(res);
}

export async function fetchCvOptimizations(): Promise<CvOptimization[]> {
  const res = await fetch(`${API_URL}/cv-optimizations`, { credentials: "include", headers: headers() });
  return parseJson(res);
}

export async function updateCvOptimization(
  id: number,
  payload: { title?: string; optimized_text?: string; suggestions?: CvOptimizationSuggestion[] },
): Promise<CvOptimization> {
  const res = await fetch(`${API_URL}/cv-optimizations/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...headers() },
    body: JSON.stringify(payload),
  });
  return parseJson(res);
}

export async function downloadCvOptimization(id: number, filename: string): Promise<void> {
  const res = await fetch(`${API_URL}/cv-optimizations/${id}/download`, { credentials: "include", headers: headers() });
  if (!res.ok) throw new Error(formatErrorBody(await res.text()));
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename.replace(/[^a-z0-9_-]+/gi, "-") || "optimized-cv"}.docx`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function fetchAnalytics(): Promise<AnalyticsSummary> {
  const res = await fetch(`${API_URL}/analytics/summary`, { credentials: "include", headers: headers() });
  return parseJson(res);
}

export async function fetchApplicantProfile(): Promise<ApplicantAutofillProfile> {
  const res = await fetch(`${API_URL}/me/applicant-profile`, { credentials: "include", headers: headers() });
  return parseJson(res);
}

export async function saveApplicantProfile(profile: ApplicantAutofillProfile): Promise<ApplicantAutofillProfile> {
  const res = await fetch(`${API_URL}/me/applicant-profile`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...headers() },
    body: JSON.stringify(profile),
  });
  return parseJson(res);
}

export async function saveJobRemote(payload: JobSavePayload): Promise<ApplicationListItem> {
  const res = await fetch(`${API_URL}/jobs/save`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...headers() },
    body: JSON.stringify(payload),
  });
  return parseJson(res);
}
