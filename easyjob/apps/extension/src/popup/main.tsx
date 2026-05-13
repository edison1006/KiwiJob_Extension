import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ApplicationStatus, JobSavePayload } from "@easyjob/shared";
import { APPLICATION_STATUSES } from "@easyjob/shared";
import "./popup.css";

type ExtractResp =
  | { ok: true; data: JobSavePayload }
  | { ok: false; error: string };

type AnyResp = { ok: true; data?: unknown } | { ok: false; error: string };

async function getActiveTabId(): Promise<number | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const id = tabs[0]?.id;
  return typeof id === "number" ? id : null;
}

function Popup() {
  const [apiBase, setApiBase] = useState("http://localhost:8000");
  const [mockUserId, setMockUserId] = useState("");
  const [draft, setDraft] = useState<JobSavePayload | null>(null);
  const [status, setStatus] = useState<ApplicationStatus>("Saved");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [lastId, setLastId] = useState<number | null>(null);

  useEffect(() => {
    void chrome.storage.sync.get(["apiBase", "mockUserId"]).then((v) => {
      if (typeof v.apiBase === "string" && v.apiBase) setApiBase(v.apiBase);
      if (typeof v.mockUserId === "string") setMockUserId(v.mockUserId);
    });
    void chrome.storage.local.get(["lastApplicationId"]).then((v) => {
      if (typeof v.lastApplicationId === "number") setLastId(v.lastApplicationId);
    });
  }, []);

  const titlePreview = useMemo(() => draft?.title ?? "—", [draft]);

  async function refreshExtract() {
    setMsg(null);
    const tabId = await getActiveTabId();
    if (!tabId) {
      setMsg("No active tab.");
      return;
    }
    try {
      const resp = (await chrome.tabs.sendMessage(tabId, { type: "EXTRACT_JOB" })) as ExtractResp;
      if (!resp || resp.ok === undefined) {
        setMsg("No response from page. Reload the tab and try again.");
        return;
      }
      if (!resp.ok) {
        setMsg(resp.error);
        return;
      }
      setDraft({ ...resp.data, status });
    } catch {
      setMsg("Could not extract from this page (restricted URL or reload needed).");
    }
  }

  useEffect(() => {
    void refreshExtract();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function persistSettings(nextApi: string, nextMock: string) {
    await chrome.storage.sync.set({ apiBase: nextApi, mockUserId: nextMock });
  }

  async function onSave() {
    if (!draft) return;
    setBusy(true);
    setMsg(null);
    try {
      await persistSettings(apiBase, mockUserId);
      const resp = (await chrome.runtime.sendMessage({
        type: "SAVE_JOB",
        payload: { ...draft, status },
      })) as AnyResp;
      if (!resp.ok) {
        setMsg(resp.error);
        return;
      }
      const data = resp.data as { id: number };
      setLastId(data.id);
      setMsg(`Saved (application #${data.id}).`);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onAnalyze() {
    const id = lastId;
    if (!id) {
      setMsg("Save a job first to get an application id.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await persistSettings(apiBase, mockUserId);
      const resp = (await chrome.runtime.sendMessage({ type: "ANALYZE_MATCH", jobId: id })) as AnyResp;
      if (!resp.ok) {
        setMsg(resp.error);
        return;
      }
      setMsg("Match analysis complete. Open the EasyJob dashboard to view details.");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4">
      <div className="flex items-center gap-2">
        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-brand-600 to-indigo-700" />
        <div>
          <div className="text-sm font-semibold text-slate-900">EasyJob</div>
          <div className="text-xs text-slate-500">Capture + sync</div>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <label className="text-xs font-semibold text-slate-600">API base URL</label>
        <input
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm"
          value={apiBase}
          onChange={(e) => setApiBase(e.target.value)}
          onBlur={() => void persistSettings(apiBase, mockUserId)}
        />
        <label className="text-xs font-semibold text-slate-600">Mock user id (optional)</label>
        <input
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm"
          value={mockUserId}
          placeholder="default: 1"
          onChange={(e) => setMockUserId(e.target.value)}
          onBlur={() => void persistSettings(apiBase, mockUserId)}
        />
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="text-xs font-semibold text-slate-600">Detected</div>
        <div className="mt-1 text-sm font-semibold text-slate-900">{titlePreview}</div>
        <div className="mt-1 line-clamp-3 text-xs text-slate-600">{draft?.company ? `${draft.company} • ` : ""}{draft?.location ?? ""}</div>
        <button
          type="button"
          className="mt-3 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100"
          onClick={() => void refreshExtract()}
        >
          Re-scan page
        </button>
      </div>

      <div className="mt-3">
        <label className="text-xs font-semibold text-slate-600">Application status</label>
        <select
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
          value={status}
          onChange={(e) => {
            const s = e.target.value as ApplicationStatus;
            setStatus(s);
            setDraft((d) => (d ? { ...d, status: s } : d));
          }}
        >
          {APPLICATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy || !draft}
          onClick={() => void onSave()}
          className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
        >
          Save job
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onAnalyze()}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50"
        >
          Analyze match
        </button>
      </div>

      {lastId ? <div className="mt-2 text-xs text-slate-500">Last saved application id: {lastId}</div> : null}

      {msg ? <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-800">{msg}</div> : null}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>,
);
