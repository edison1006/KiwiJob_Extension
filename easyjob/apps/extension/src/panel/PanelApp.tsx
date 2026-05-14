import React, { useEffect, useMemo, useState } from "react";
import type { ApplicationStatus, JobSavePayload } from "@easyjob/shared";
import { APPLICATION_STATUSES } from "@easyjob/shared";
import "./panel.css";

type ExtractResp =
  | { ok: true; data: JobSavePayload }
  | { ok: false; error: string };

type AnyResp = { ok: true; data?: unknown } | { ok: false; error: string };

/** Positive integer only. Job URLs / text are ignored so the API falls back to the default user. */
function sanitizeMockUserIdInput(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/https?:\/\//i.test(t)) return "";
  const digits = t.replace(/\D/g, "");
  if (!digits) return "";
  const n = parseInt(digits, 10);
  if (!Number.isFinite(n) || n < 1) return "";
  return String(n);
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

function isInjectablePage(url: string | undefined): { ok: true } | { ok: false; hint: string } {
  if (!url) {
    return { ok: false, hint: "No URL for this tab yet. Wait for the page to finish loading." };
  }
  if (url.startsWith("chrome://") || url.startsWith("edge://") || url.startsWith("about:") || url.startsWith("devtools:")) {
    return {
      ok: false,
      hint: "Built-in browser pages cannot be scraped. Open a job posting on a normal site (https), then click Re-scan.",
    };
  }
  if (url.startsWith("chrome-extension://")) {
    return { ok: false, hint: "Switch to a job listing tab (https), then click Re-scan." };
  }
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return { ok: false, hint: "Only http(s) pages are supported." };
  }
  return { ok: true };
}

export function normalizeApiBase(raw: string): string {
  const t = raw.trim().replace(/\/+$/, "");
  return t.length ? t : "http://localhost:8000";
}

async function probeApiHealth(base: string): Promise<boolean> {
  const root = normalizeApiBase(base);
  const ctrl = new AbortController();
  const tid = window.setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(`${root}/health`, { method: "GET", signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(tid);
  }
}

export function EasyJobPanel() {
  const [apiBase, setApiBase] = useState("http://localhost:8000");
  const [mockUserId, setMockUserId] = useState("");
  const [draft, setDraft] = useState<JobSavePayload | null>(null);
  const [status, setStatus] = useState<ApplicationStatus>("Saved");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [lastId, setLastId] = useState<number | null>(null);
  const [apiHealth, setApiHealth] = useState<"idle" | "checking" | "ok" | "offline">("idle");

  useEffect(() => {
    void chrome.storage.sync.get(["apiBase", "mockUserId"]).then((v) => {
      if (typeof v.apiBase === "string" && v.apiBase) setApiBase(v.apiBase);
      if (typeof v.mockUserId === "string") {
        const s = sanitizeMockUserIdInput(v.mockUserId);
        setMockUserId(s);
        if (s !== v.mockUserId.trim()) {
          void chrome.storage.sync.set({ mockUserId: s });
        }
      }
    });
    void chrome.storage.local.get(["lastApplicationId"]).then((v) => {
      if (typeof v.lastApplicationId === "number") setLastId(v.lastApplicationId);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const base = apiBase;
    setApiHealth("checking");
    const timer = window.setTimeout(() => {
      void probeApiHealth(base).then((ok) => {
        if (!cancelled) setApiHealth(ok ? "ok" : "offline");
      });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [apiBase]);

  const detectedRows = useMemo(() => {
    if (!draft) {
      return { title: "—", location: "—", company: "—" };
    }
    return {
      title: draft.title?.trim() || "—",
      location: draft.location?.trim() || "—",
      company: draft.company?.trim() || "—",
    };
  }, [draft]);

  const detectedSecondary = useMemo(() => {
    if (!draft) return "";
    const bits: string[] = [];
    if (draft.salary?.trim()) bits.push(draft.salary.trim());
    try {
      bits.push(new URL(draft.url).hostname);
    } catch {
      if (draft.source_website) bits.push(draft.source_website);
    }
    return bits.filter(Boolean).join(" · ");
  }, [draft]);

  async function refreshExtract() {
    setMsg(null);
    const tab = await getActiveTab();
    const tabId = tab?.id;
    if (typeof tabId !== "number") {
      setMsg("No active tab.");
      return;
    }
    const allowed = isInjectablePage(tab?.url);
    if (!allowed.ok) {
      setMsg(allowed.hint);
      return;
    }
    try {
      const resp = (await chrome.tabs.sendMessage(tabId, { type: "EXTRACT_JOB" })) as ExtractResp;
      if (!resp || resp.ok === undefined) {
        setMsg("No response from the page. Reload the job tab and try again (needed once after installing the extension).");
        return;
      }
      if (!resp.ok) {
        setMsg(resp.error);
        return;
      }
      setDraft({ ...resp.data, status });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      setMsg(`Could not reach the page script. Reload this tab, then click Re-scan. (${detail})`);
    }
  }

  useEffect(() => {
    void refreshExtract();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function persistSettings(nextApi: string, nextMock: string) {
    const clean = sanitizeMockUserIdInput(nextMock);
    await chrome.storage.sync.set({ apiBase: nextApi, mockUserId: clean });
    if (clean !== nextMock) setMockUserId(clean);
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
      setMsg("Match analysis complete. Open the web dashboard to see the score and full breakdown.");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl p-4 pb-8">
      <div className="flex flex-col items-center gap-1 border-b border-slate-100 pb-4">
        <img
          src="/easyjob-logo.svg"
          alt="EasyJob"
          className="h-16 w-auto max-w-[200px] object-contain sm:h-20 sm:max-w-[220px]"
          width={220}
          height={154}
        />
        <div className="text-xs text-slate-500">Side panel · capture + sync</div>
      </div>

      <div className="mt-4 space-y-2">
        <label className="text-xs font-semibold text-slate-600">API base URL</label>
        <input
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm"
          value={apiBase}
          onChange={(e) => setApiBase(e.target.value)}
          onBlur={() => void persistSettings(apiBase, mockUserId)}
        />
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 text-[11px] leading-snug">
            {apiHealth === "checking" || apiHealth === "idle" ? (
              <span className="text-slate-500">Checking API…</span>
            ) : apiHealth === "ok" ? (
              <span className="font-medium text-emerald-700">API reachable.</span>
            ) : (
              <span className="text-amber-900">
                API unreachable. From <code className="rounded bg-amber-50 px-0.5">easyjob/apps/api</code> run{" "}
                <code className="rounded bg-amber-50 px-0.5">bash dev.sh</code> (needs <code className="rounded bg-amber-50 px-0.5">.venv</code>
                ). Then open <code className="rounded bg-amber-50 px-0.5">{normalizeApiBase(apiBase)}/health</code>.
              </span>
            )}
          </div>
          <button
            type="button"
            className="shrink-0 rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => {
              setApiHealth("checking");
              void probeApiHealth(apiBase).then((ok) => setApiHealth(ok ? "ok" : "offline"));
            }}
          >
            Retry
          </button>
        </div>
        <label className="text-xs font-semibold text-slate-600">Mock user id (optional)</label>
        <p className="text-[11px] leading-snug text-slate-500">Digits only (e.g. 1). Leave empty for default. Do not paste the job URL here.</p>
        <input
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm"
          value={mockUserId}
          placeholder="1"
          inputMode="numeric"
          pattern="[0-9]*"
          onChange={(e) => setMockUserId(e.target.value)}
          onBlur={() => void persistSettings(apiBase, mockUserId)}
        />
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="text-xs font-semibold text-slate-600">Detected</div>
        <dl className="mt-2 space-y-1.5 text-xs leading-snug text-slate-900">
          <div className="flex gap-1.5">
            <dt className="shrink-0 font-semibold text-slate-600">Title:</dt>
            <dd className="min-w-0 break-words font-medium">{detectedRows.title}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="shrink-0 font-semibold text-slate-600">Location:</dt>
            <dd className="min-w-0 break-words font-medium">{detectedRows.location}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="shrink-0 font-semibold text-slate-600">Company:</dt>
            <dd className="min-w-0 break-words font-medium">{detectedRows.company}</dd>
          </div>
        </dl>
        {detectedSecondary ? (
          <div className="mt-1 line-clamp-2 text-xs text-slate-600">{detectedSecondary}</div>
        ) : null}
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

      <div className="mt-2 text-[11px] leading-snug text-slate-500">
        Without <code className="rounded bg-slate-100 px-0.5">OPENAI_API_KEY</code>, Analyze match uses a JD-only mock scorer. With a key set,
        upload a CV on the web dashboard first.
      </div>

      {lastId ? <div className="mt-2 text-xs text-slate-500">Last saved application id: {lastId}</div> : null}

      {msg ? <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-800">{msg}</div> : null}
    </div>
  );
}
