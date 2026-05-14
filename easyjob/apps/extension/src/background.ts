import type { BgRequest, BgResponse } from "./messages";
import type { ApplicantAutofillProfile } from "@easyjob/shared";
import { EMPTY_APPLICANT_AUTOFILL_PROFILE } from "@easyjob/shared";
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
    void chrome.tabs.sendMessage(tab.id, { type: "EASYJOB_TOGGLE_UI" }).catch(() => {});
  }
});

const CTX_FILL = "easyjob-fill-application-form";

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
    city: s("city"),
    country: s("country"),
  };
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

async function runAutofillActiveTab(): Promise<void> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  const tabId = tab?.id;
  const url = tab?.url;
  if (typeof tabId !== "number" || !url || !isInjectableUrl(url)) {
    return;
  }
  const profile = await buildAutofillProfileForTab(url);
  try {
    await chrome.tabs.sendMessage(tabId, { type: "AUTOFILL_TAB", profile });
  } catch {
    /* content script missing — user must reload tab */
  }
}

function installContextMenu(): void {
  if (!chrome.contextMenus) return;
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CTX_FILL,
      title: "Fill form with EasyJob profile",
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
    try {
      await chrome.tabs.sendMessage(tab.id!, { type: "AUTOFILL_TAB", profile });
    } catch {
      /* ignore */
    }
  })();
});

chrome.commands?.onCommand.addListener((command) => {
  if (command === "easyjob-autofill") {
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
      sendResponse({ ok: false, error: "Unknown message" });
    } catch (e) {
      sendResponse({ ok: false, error: (e as Error).message });
    }
  })();
  return true;
});

export {};
