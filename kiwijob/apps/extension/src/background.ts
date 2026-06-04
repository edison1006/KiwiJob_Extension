import type { BgRequest, BgResponse } from "./messages";

const DEFAULT_API = "http://localhost:8000";

function syncSidePanelEntry(): void {
  if (!chrome.sidePanel?.setOptions) return;
  void chrome.sidePanel.setOptions({ path: "page-sidebar.html" });
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

syncSidePanelEntry();

chrome.action.onClicked.addListener((tab) => {
  if (tab.id != null) {
    void chrome.tabs.sendMessage(tab.id, { type: "KIWIJOB_TOGGLE_UI" }).catch(() => {});
  }
});

chrome.runtime.onInstalled.addListener(() => {
  syncSidePanelEntry();
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

async function authState(): Promise<{ token: string; user: { id: number; email: string; display_name: string } | null }> {
  const v = await chrome.storage.sync.get(["authToken", "authUser"]);
  const token = typeof v.authToken === "string" ? v.authToken.trim() : "";
  const user =
    v.authUser && typeof v.authUser === "object" && typeof v.authUser.email === "string"
      ? (v.authUser as { id: number; email: string; display_name: string })
      : null;
  return { token, user };
}

async function authHeaders(): Promise<Record<string, string>> {
  const { token } = await authState();
  const h: Record<string, string> = {};
  if (token) {
    h.Authorization = `Bearer ${token}`;
  }
  return h;
}

async function jsonHeaders(): Promise<HeadersInit> {
  return { "Content-Type": "application/json", ...(await authHeaders()) };
}

async function storeAuth(data: unknown): Promise<unknown> {
  const body = data as { access_token?: unknown; user?: unknown };
  if (typeof body.access_token !== "string" || !body.user || typeof body.user !== "object") {
    throw new Error("Invalid auth response");
  }
  await chrome.storage.sync.set({ authToken: body.access_token, authUser: body.user });
  return body;
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
      if (request.type === "AUTH_STATE") {
        const api = await getApiBase();
        const state = await authState();
        try {
          const res = await fetch(`${api}/auth/me`, { method: "GET", credentials: "include", headers: await authHeaders() });
          if (res.ok) {
            const user = await res.json();
            await chrome.storage.sync.set({ authUser: user });
            sendResponse({ ok: true, data: { token: state.token, user } });
            return;
          }
          await chrome.storage.sync.remove(["authToken", "authUser"]);
          sendResponse({ ok: true, data: { token: "", user: null } });
        } catch {
          sendResponse({ ok: true, data: state });
        }
        return;
      }
      if (request.type === "AUTH_LOGIN" || request.type === "AUTH_REGISTER") {
        const api = await getApiBase();
        const endpoint = request.type === "AUTH_LOGIN" ? "/auth/login" : "/auth/register";
        const payload =
          request.type === "AUTH_LOGIN"
            ? { email: request.email, password: request.password }
            : { email: request.email, password: request.password, display_name: request.displayName || "" };
        const res = await fetch(`${api}${endpoint}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          sendResponse({ ok: false, error: await formatApiError(res) });
          return;
        }
        sendResponse({ ok: true, data: await storeAuth(await res.json()) });
        return;
      }
      if (request.type === "AUTH_LOGOUT") {
        const api = await getApiBase();
        try {
          await fetch(`${api}/auth/logout`, { method: "POST", credentials: "include", headers: await authHeaders() });
        } catch {
          /* network logout is best-effort; local session is cleared either way. */
        }
        await chrome.storage.sync.remove(["authToken", "authUser"]);
        sendResponse({ ok: true, data: { token: "", user: null } });
        return;
      }
      if (request.type === "SAVE_JOB") {
        const api = await getApiBase();
        let res: Response;
        try {
          res = await fetch(`${api}/jobs/save`, {
            method: "POST",
            credentials: "include",
            headers: await jsonHeaders(),
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
      if (request.type === "PREVIEW_MATCH") {
        const api = await getApiBase();
        let res: Response;
        try {
          res = await fetch(`${api}/match/preview`, {
            method: "POST",
            credentials: "include",
            headers: await jsonHeaders(),
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
            credentials: "include",
            headers: await jsonHeaders(),
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
            credentials: "include",
            headers: await authHeaders(),
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
            credentials: "include",
            headers: await authHeaders(),
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
            credentials: "include",
            headers: await authHeaders(),
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
            credentials: "include",
            headers: await authHeaders(),
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
