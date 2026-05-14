import type {
  AnalyticsSummary,
  ApplicationDetail,
  ApplicationListItem,
  ApplicationStatus,
  JobSavePayload,
  MatchAnalysis,
  ResumeDTO,
} from "@easyjob/shared";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/+$/, "");

export function getApiBaseUrl(): string {
  return API_URL;
}

function headers(): HeadersInit {
  const h: Record<string, string> = {};
  const mock = localStorage.getItem("easyjob_mock_user_id");
  if (mock?.trim()) h["X-Mock-User-Id"] = mock.trim();
  return h;
}

function formatErrorBody(text: string): string {
  const raw = text.trim();
  if (!raw) return "Request failed";
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
    const res = await fetch(`${API_URL}/health`, { headers: headers() });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchJobs(): Promise<ApplicationListItem[]> {
  const res = await fetch(`${API_URL}/jobs`, { headers: headers() });
  return parseJson(res);
}

export async function fetchJob(id: number): Promise<ApplicationDetail> {
  const res = await fetch(`${API_URL}/jobs/${id}`, { headers: headers() });
  return parseJson(res);
}

export async function updateJobStatus(id: number, status: ApplicationStatus): Promise<ApplicationListItem> {
  const res = await fetch(`${API_URL}/jobs/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...headers() },
    body: JSON.stringify({ status }),
  });
  return parseJson(res);
}

export async function deleteJob(id: number): Promise<void> {
  const res = await fetch(`${API_URL}/jobs/${id}`, { method: "DELETE", headers: headers() });
  if (!res.ok) throw new Error(formatErrorBody(await res.text()));
}

export async function fetchMatch(jobId: number): Promise<MatchAnalysis> {
  const res = await fetch(`${API_URL}/match/${jobId}`, { headers: headers() });
  return parseJson(res);
}

export async function analyzeMatch(jobId: number): Promise<MatchAnalysis> {
  const res = await fetch(`${API_URL}/match/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers() },
    body: JSON.stringify({ job_id: jobId }),
  });
  return parseJson(res);
}

export async function fetchResumes(): Promise<ResumeDTO[]> {
  const res = await fetch(`${API_URL}/resumes`, { headers: headers() });
  return parseJson(res);
}

export async function uploadResume(file: File): Promise<ResumeDTO> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API_URL}/resumes/upload`, {
    method: "POST",
    headers: headers(),
    body: fd,
  });
  return parseJson(res);
}

export async function fetchAnalytics(): Promise<AnalyticsSummary> {
  const res = await fetch(`${API_URL}/analytics/summary`, { headers: headers() });
  return parseJson(res);
}

export async function saveJobRemote(payload: JobSavePayload): Promise<ApplicationListItem> {
  const res = await fetch(`${API_URL}/jobs/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers() },
    body: JSON.stringify(payload),
  });
  return parseJson(res);
}
