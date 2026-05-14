// src/background.ts
var DEFAULT_API = "http://localhost:8000";
if (chrome.sidePanel?.setPanelBehavior) {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
  });
}
async function formatApiError(res) {
  const raw = await res.text();
  try {
    const j = JSON.parse(raw);
    const d = j.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) {
      return d.map((item) => {
        if (item && typeof item === "object" && "msg" in item) return String(item.msg);
        return String(item);
      }).join("; ");
    }
  } catch {
  }
  return raw.slice(0, 800);
}
async function getApiBase() {
  const v = await chrome.storage.sync.get(["apiBase"]);
  return typeof v.apiBase === "string" && v.apiBase.length ? v.apiBase.replace(/\/$/, "") : DEFAULT_API;
}
async function mockHeaders() {
  const v = await chrome.storage.sync.get(["mockUserId"]);
  const h = { "Content-Type": "application/json" };
  const raw = typeof v.mockUserId === "string" ? v.mockUserId.trim() : "";
  if (raw && !/https?:\/\//i.test(raw) && /^\d+$/.test(raw)) {
    h["X-Mock-User-Id"] = raw;
  }
  return h;
}
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
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
        let res;
        try {
          res = await fetch(`${api}/jobs/save`, {
            method: "POST",
            headers: await mockHeaders(),
            body: JSON.stringify(request.payload)
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          sendResponse({
            ok: false,
            error: msg.includes("Failed to fetch") || msg.includes("NetworkError") ? `Cannot reach API at ${api}. Start the backend (uvicorn) and open ${api}/health in a tab to verify.` : msg
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
        let res;
        try {
          res = await fetch(`${api}/match/analyze`, {
            method: "POST",
            headers: await mockHeaders(),
            body: JSON.stringify({ job_id: request.jobId })
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          sendResponse({
            ok: false,
            error: msg.includes("Failed to fetch") || msg.includes("NetworkError") ? `Cannot reach API at ${api}. Start the backend and check ${api}/health.` : msg
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
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true;
});
