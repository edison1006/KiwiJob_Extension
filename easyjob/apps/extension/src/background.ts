import type { BgRequest, BgResponse } from "./messages";

const DEFAULT_API = "http://localhost:8000";

async function getApiBase(): Promise<string> {
  const v = await chrome.storage.sync.get(["apiBase"]);
  return typeof v.apiBase === "string" && v.apiBase.length ? v.apiBase.replace(/\/$/, "") : DEFAULT_API;
}

async function mockHeaders(): Promise<HeadersInit> {
  const v = await chrome.storage.sync.get(["mockUserId"]);
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (typeof v.mockUserId === "string" && v.mockUserId.trim()) {
    h["X-Mock-User-Id"] = v.mockUserId.trim();
  }
  return h;
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
        const res = await fetch(`${api}/jobs/save`, {
          method: "POST",
          headers: await mockHeaders(),
          body: JSON.stringify(request.payload),
        });
        if (!res.ok) {
          sendResponse({ ok: false, error: await res.text() });
          return;
        }
        const data = await res.json();
        await chrome.storage.local.set({ lastApplicationId: data.id });
        sendResponse({ ok: true, data });
        return;
      }
      if (request.type === "ANALYZE_MATCH") {
        const api = await getApiBase();
        const res = await fetch(`${api}/match/analyze`, {
          method: "POST",
          headers: await mockHeaders(),
          body: JSON.stringify({ job_id: request.jobId }),
        });
        if (!res.ok) {
          sendResponse({ ok: false, error: await res.text() });
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
