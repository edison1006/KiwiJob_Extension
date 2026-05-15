import type { BgRequest, BgResponse } from "./messages";
import type { ApplicantAutofillProfile, CvProfileDTO } from "@kiwijob/shared";
import { EMPTY_APPLICANT_AUTOFILL_PROFILE } from "@kiwijob/shared";
import type { AutofillSettings, AutofillResult } from "./autofill";
import { DEFAULT_AUTOFILL_SETTINGS } from "./autofill";
import { mergeApplicantProfileWithCookies } from "./autofillMergeCookies";

const DEFAULT_API = "http://localhost:8000";

function syncSidePanelEntry(): void {
  if (!chrome.sidePanel?.setOptions) return;
  void chrome.sidePanel.setOptions({ path: "page-sidebar.html" });
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
}

syncSidePanelEntry();

chrome.action.onClicked.addListener((tab) => {
  if (tab.id != null) {
    void chrome.tabs.sendMessage(tab.id, { type: "KIWIJOB_TOGGLE_UI" }).catch(() => {});
  }
});

const CTX_FILL = "kiwijob-fill-application-form";

function parseApplicantProfileJson(data: unknown): ApplicantAutofillProfile {
  const e = EMPTY_APPLICANT_AUTOFILL_PROFILE;
  if (!data || typeof data !== "object") return { ...e };
  const o = data as Record<string, unknown>;
  const s = (k: keyof ApplicantAutofillProfile) => (typeof o[k] === "string" ? o[k] : "") || "";
  return {
    fullName: s("fullName"),
    email: s("email"),
    phone: s("phone"),
    linkedInUrl: s("linkedInUrl"),
    portfolioUrl: s("portfolioUrl"),
    githubUrl: s("githubUrl"),
    city: s("city"),
    country: s("country"),
    workAuthorization: s("workAuthorization"),
    sponsorship: s("sponsorship"),
    salaryExpectation: s("salaryExpectation"),
    noticePeriod: s("noticePeriod"),
    skills: s("skills"),
    summary: s("summary"),
    coverLetter: s("coverLetter"),
  };
}

function profileFromCv(data: CvProfileDTO | null): Partial<ApplicantAutofillProfile> {
  if (!data?.upload) return {};
  return {
    fullName: data.full_name || "",
    email: data.email || "",
    phone: data.phone || "",
    skills: data.skills.join(", "),
    linkedInUrl: data.links.find((x) => /linkedin/i.test(x)) || "",
    portfolioUrl: data.links.find((x) => !/linkedin|github/i.test(x)) || "",
    githubUrl: data.links.find((x) => /github/i.test(x)) || "",
    summary: [
      data.experience[0]?.title ? `Most recent role: ${data.experience[0].title}` : "",
      data.education[0]?.school ? `Education: ${data.education[0].school}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

function mergeAutofillSettings(raw: unknown): AutofillSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_AUTOFILL_SETTINGS;
  const o = raw as Partial<AutofillSettings>;
  return {
    ...DEFAULT_AUTOFILL_SETTINGS,
    ...o,
    fields: { ...DEFAULT_AUTOFILL_SETTINGS.fields, ...(o.fields || {}) },
  };
}

async function getAutofillSettings(): Promise<AutofillSettings> {
  const v = await chrome.storage.sync.get(["autofillSettings"]);
  return mergeAutofillSettings(v.autofillSettings);
}

async function buildAutofillProfileForTab(tabUrl: string): Promise<ApplicantAutofillProfile> {
  const api = await getApiBase();
  let apiProfile = { ...EMPTY_APPLICANT_AUTOFILL_PROFILE };
  try {
    const res = await fetch(`${api}/me/applicant-profile`, { method: "GET", headers: await mockUserIdHeaders() });
    if (res.ok) {
      apiProfile = parseApplicantProfileJson(await res.json());
    }
  } catch {
    /* offline API — still try cookies */
  }
  try {
    const local = await chrome.storage.local.get(["selectedResumeId"]);
    const resumeId = typeof local.selectedResumeId === "number" ? local.selectedResumeId : undefined;
    const path = resumeId ? `/resumes/${resumeId}/profile` : "/resumes/profile";
    const res = await fetch(`${api}${path}`, { method: "GET", headers: await mockUserIdHeaders() });
    if (res.ok) {
      apiProfile = { ...apiProfile, ...profileFromCv((await res.json()) as CvProfileDTO) };
    }
  } catch {
    /* CV profile is best-effort; manual applicant profile remains valid. */
  }
  let cookies: chrome.cookies.Cookie[] = [];
  try {
    cookies = await chrome.cookies.getAll({ url: tabUrl });
  } catch {
    cookies = [];
  }
  return mergeApplicantProfileWithCookies(apiProfile, cookies);
}

function isInjectableUrl(url: string | undefined): boolean {
  if (!url) return false;
  if (url.startsWith("chrome://") || url.startsWith("edge://") || url.startsWith("about:") || url.startsWith("devtools:")) {
    return false;
  }
  if (url.startsWith("chrome-extension://")) return false;
  return url.startsWith("http://") || url.startsWith("https://");
}

async function runAutofillActiveTab(): Promise<AutofillResult> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  const tabId = tab?.id;
  const url = tab?.url;
  if (typeof tabId !== "number" || !url || !isInjectableUrl(url)) {
    return { filled: [], skippedEmpty: ["active tab"] };
  }
  const profile = await buildAutofillProfileForTab(url);
  const settings = await getAutofillSettings();
  try {
    return (await chrome.tabs.sendMessage(tabId, { type: "AUTOFILL_TAB", profile, settings })) as AutofillResult;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { filled: [], skippedEmpty: [`page script: ${message || "not reachable"}`] };
  }
}

function installContextMenu(): void {
  if (!chrome.contextMenus) return;
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CTX_FILL,
      title: "Fill form with KiwiJob profile",
      contexts: ["page", "frame", "editable"],
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  installContextMenu();
  syncSidePanelEntry();
});

chrome.contextMenus?.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CTX_FILL || typeof tab?.id !== "number" || !tab.url) return;
  if (!isInjectableUrl(tab.url)) return;
  void (async () => {
    const profile = await buildAutofillProfileForTab(tab.url!);
    const settings = await getAutofillSettings();
    try {
      await chrome.tabs.sendMessage(tab.id!, { type: "AUTOFILL_TAB", profile, settings });
    } catch {
      /* ignore */
    }
  })();
});

chrome.commands?.onCommand.addListener((command) => {
  if (command === "kiwijob-autofill") {
    void runAutofillActiveTab();
  }
});

/** Turn FastAPI `{"detail": ...}` bodies into a short user-facing string. */
async function formatApiError(res: Response): Promise<string> {
  const raw = await res.text();
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

async function getApiBase(): Promise<string> {
  const v = await chrome.storage.sync.get(["apiBase"]);
  return typeof v.apiBase === "string" && v.apiBase.length ? v.apiBase.replace(/\/$/, "") : DEFAULT_API;
}

async function mockUserIdHeaders(): Promise<Record<string, string>> {
  const v = await chrome.storage.sync.get(["mockUserId"]);
  const h: Record<string, string> = {};
  const raw = typeof v.mockUserId === "string" ? v.mockUserId.trim() : "";
  if (raw && !/https?:\/\//i.test(raw) && /^\d+$/.test(raw)) {
    h["X-Mock-User-Id"] = raw;
  }
  return h;
}

async function mockHeaders(): Promise<HeadersInit> {
  return { "Content-Type": "application/json", ...(await mockUserIdHeaders()) };
}

chrome.runtime.onMessage.addListener((request: BgRequest, _sender, sendResponse: (r: BgResponse) => void) => {
  void (async () => {
    try {
      if (request.type === "GET_API_BASE") {
        sendResponse({ ok: true, data: await getApiBase() });
        return;
      }
      if (request.type === "SET_API_BASE") {
        await chrome.storage.sync.set({ apiBase: request.apiBase });
        sendResponse({ ok: true, data: await getApiBase() });
        return;
      }
      if (request.type === "AUTOFILL_ACTIVE_TAB") {
        sendResponse({ ok: true, data: await runAutofillActiveTab() });
        return;
      }
      if (request.type === "SAVE_JOB") {
        const api = await getApiBase();
        let res: Response;
        try {
          res = await fetch(`${api}/jobs/save`, {
            method: "POST",
            headers: await mockHeaders(),
            body: JSON.stringify(request.payload),
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          sendResponse({
            ok: false,
            error:
              msg.includes("Failed to fetch") || msg.includes("NetworkError")
                ? `Cannot reach API at ${api}. Start the backend (uvicorn) and open ${api}/health in a tab to verify.`
                : msg,
          });
          return;
        }
        if (!res.ok) {
          sendResponse({ ok: false, error: await formatApiError(res) });
          return;
        }
        const data = await res.json();
        await chrome.storage.local.set({ lastApplicationId: data.id });
        sendResponse({ ok: true, data });
        return;
      }
      if (request.type === "TRACK_EVENT") {
        const api = await getApiBase();
        let res: Response;
        try {
          res = await fetch(`${api}/events/track`, {
            method: "POST",
            headers: await mockHeaders(),
            body: JSON.stringify(request.payload),
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          sendResponse({
            ok: false,
            error:
              msg.includes("Failed to fetch") || msg.includes("NetworkError")
                ? `Cannot reach API at ${api}. Start the backend and check ${api}/health.`
                : msg,
          });
          return;
        }
        if (!res.ok) {
          sendResponse({ ok: false, error: await formatApiError(res) });
          return;
        }
        const data = await res.json();
        const id = (data as { application?: { id?: unknown } }).application?.id;
        if (typeof id === "number") {
          await chrome.storage.local.set({ lastApplicationId: id });
        }
        sendResponse({ ok: true, data });
        return;
      }
      if (request.type === "PREVIEW_MATCH") {
        const api = await getApiBase();
        let res: Response;
        try {
          res = await fetch(`${api}/match/preview`, {
            method: "POST",
            headers: await mockHeaders(),
            body: JSON.stringify(request.payload),
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          sendResponse({
            ok: false,
            error:
              msg.includes("Failed to fetch") || msg.includes("NetworkError")
                ? `Cannot reach API at ${api}. Start the backend and check ${api}/health.`
                : msg,
          });
          return;
        }
        if (!res.ok) {
          sendResponse({ ok: false, error: await formatApiError(res) });
          return;
        }
        sendResponse({ ok: true, data: await res.json() });
        return;
      }
      if (request.type === "ANALYZE_MATCH") {
        const api = await getApiBase();
        let res: Response;
        try {
          res = await fetch(`${api}/match/analyze`, {
            method: "POST",
            headers: await mockHeaders(),
            body: JSON.stringify({ job_id: request.jobId }),
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          sendResponse({
            ok: false,
            error:
              msg.includes("Failed to fetch") || msg.includes("NetworkError")
                ? `Cannot reach API at ${api}. Start the backend and check ${api}/health.`
                : msg,
          });
          return;
        }
        if (!res.ok) {
          sendResponse({ ok: false, error: await formatApiError(res) });
          return;
        }
        const data = await res.json();
        sendResponse({ ok: true, data });
        return;
      }
      if (request.type === "GET_MATCH") {
        const api = await getApiBase();
        let res: Response;
        try {
          res = await fetch(`${api}/match/${request.jobId}`, {
            method: "GET",
            headers: await mockUserIdHeaders(),
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          sendResponse({
            ok: false,
            error:
              msg.includes("Failed to fetch") || msg.includes("NetworkError")
                ? `Cannot reach API at ${api}. Start the backend and check ${api}/health.`
                : msg,
          });
          return;
        }
        if (!res.ok) {
          sendResponse({ ok: false, error: await formatApiError(res) });
          return;
        }
        const data = await res.json();
        sendResponse({ ok: true, data });
        return;
      }
      if (request.type === "GET_INSIGHTS") {
        const api = await getApiBase();
        let res: Response;
        try {
          const days = Math.max(1, Math.min(365, Number(request.days) || 7));
          const params = new URLSearchParams({ days: String(days) });
          if (request.start) params.set("start", request.start);
          if (request.end) params.set("end", request.end);
          res = await fetch(`${api}/analytics/insights?${params.toString()}`, {
            method: "GET",
            headers: await mockUserIdHeaders(),
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          sendResponse({
            ok: false,
            error:
              msg.includes("Failed to fetch") || msg.includes("NetworkError")
                ? `Cannot reach API at ${api}. Start the backend and check ${api}/health.`
                : msg,
          });
          return;
        }
        if (!res.ok) {
          sendResponse({ ok: false, error: await formatApiError(res) });
          return;
        }
        sendResponse({ ok: true, data: await res.json() });
        return;
      }
      if (request.type === "GET_CV_PROFILE") {
        const api = await getApiBase();
        let res: Response;
        try {
          const path = typeof request.resumeId === "number" ? `/resumes/${request.resumeId}/profile` : "/resumes/profile";
          res = await fetch(`${api}${path}`, {
            method: "GET",
            headers: await mockUserIdHeaders(),
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          sendResponse({
            ok: false,
            error:
              msg.includes("Failed to fetch") || msg.includes("NetworkError")
                ? `Cannot reach API at ${api}. Start the backend and check ${api}/health.`
                : msg,
          });
          return;
        }
        if (!res.ok) {
          sendResponse({ ok: false, error: await formatApiError(res) });
          return;
        }
        sendResponse({ ok: true, data: await res.json() });
        return;
      }
      if (request.type === "GET_RESUMES") {
        const api = await getApiBase();
        let res: Response;
        try {
          res = await fetch(`${api}/resumes`, {
            method: "GET",
            headers: await mockUserIdHeaders(),
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          sendResponse({
            ok: false,
            error:
              msg.includes("Failed to fetch") || msg.includes("NetworkError")
                ? `Cannot reach API at ${api}. Start the backend and check ${api}/health.`
                : msg,
          });
          return;
        }
        if (!res.ok) {
          sendResponse({ ok: false, error: await formatApiError(res) });
          return;
        }
        sendResponse({ ok: true, data: await res.json() });
        return;
      }
      sendResponse({ ok: false, error: "Unknown message" });
    } catch (e) {
      sendResponse({ ok: false, error: (e as Error).message });
    }
  })();
  return true;
});

export {};
