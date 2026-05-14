import React, { useEffect, useMemo, useState } from "react";
import type { ApplicationStatus, JobSavePayload } from "@easyjob/shared";
import { APPLICATION_STATUSES } from "@easyjob/shared";
import { EASYJOB_CLOSE_DRAWER, EASYJOB_EXTENSION_SOURCE } from "../pageHost/messages";
import "./panel.css";

/** Logo at package root (`public/easyjob-logo.svg`). Leading `/` URLs fail on `chrome-extension://` pages. */
const easyjobLogoSrc =
  typeof chrome !== "undefined" && typeof chrome.runtime?.getURL === "function"
    ? chrome.runtime.getURL("easyjob-logo.svg")
    : "/easyjob-logo.svg";

type ExtractResp =
  | { ok: true; data: JobSavePayload }
  | { ok: false; error: string };

type AnyResp = { ok: true; data?: unknown } | { ok: false; error: string };

type TabId = "job" | "autofill" | "score" | "settings";

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

const DEFAULT_WEB_APP_URL =
  (typeof import.meta.env !== "undefined" && import.meta.env.VITE_WEB_APP_URL?.trim()) || "http://localhost:5173";

function normalizeWebAppUrl(raw: string): string {
  let t = raw.trim().replace(/\/+$/, "");
  if (!t) t = DEFAULT_WEB_APP_URL;
  if (!/^https?:\/\//i.test(t)) t = `http://${t}`;
  return t;
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

function requestCloseEmbed(): void {
  window.top?.postMessage({ type: EASYJOB_CLOSE_DRAWER, source: EASYJOB_EXTENSION_SOURCE }, "*");
}

export function EasyJobPanel() {
  const [tab, setTab] = useState<TabId>("job");
  const [apiBase, setApiBase] = useState("http://localhost:8000");
  const [webAppUrl, setWebAppUrl] = useState(DEFAULT_WEB_APP_URL);
  const [mockUserId, setMockUserId] = useState("");
  const [draft, setDraft] = useState<JobSavePayload | null>(null);
  const [status, setStatus] = useState<ApplicationStatus>("Saved");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [lastId, setLastId] = useState<number | null>(null);
  const [apiHealth, setApiHealth] = useState<"idle" | "checking" | "ok" | "offline">("idle");

  useEffect(() => {
    void chrome.storage.sync.get(["apiBase", "mockUserId", "webAppUrl"]).then((v) => {
      if (typeof v.apiBase === "string" && v.apiBase) setApiBase(v.apiBase);
      if (typeof v.webAppUrl === "string" && v.webAppUrl.trim()) setWebAppUrl(normalizeWebAppUrl(v.webAppUrl));
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

  const saveLabel = lastId ? `Saved #${lastId}` : "Not saved";

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
    const web = normalizeWebAppUrl(webAppUrl);
    setWebAppUrl(web);
    await chrome.storage.sync.set({
      apiBase: nextApi,
      mockUserId: clean,
      webAppUrl: web,
    });
    if (clean !== nextMock) setMockUserId(clean);
  }

  function openWebDashboard() {
    const url = normalizeWebAppUrl(webAppUrl);
    void chrome.tabs.create({ url });
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

  const tabs: { id: TabId; label: string }[] = [
    { id: "job", label: "Job" },
    { id: "autofill", label: "Autofill" },
    { id: "score", label: "Score" },
    { id: "settings", label: "Settings" },
  ];

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-white">
      <div className="sticky top-0 z-10 shrink-0 border-b border-slate-200 bg-white shadow-sm">
        <header className="flex items-center gap-2 px-3 py-2">
          <img src={easyjobLogoSrc} alt="" className="h-7 w-7 shrink-0 object-contain" width={28} height={28} />
          <span className="text-sm font-semibold tracking-tight text-slate-900">EasyJob</span>
          <div className="min-w-0 flex-1" />
          <button
            type="button"
            className="rounded-md px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
            onClick={() => openWebDashboard()}
          >
            Dashboard
          </button>
          <button
            type="button"
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            title="Close"
            aria-label="Close"
            onClick={() => requestCloseEmbed()}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <nav className="flex gap-0 border-t border-slate-100 px-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`relative flex-1 px-1.5 py-2 text-center text-[11px] font-semibold transition ${
                tab === t.id ? "text-brand-700" : "text-slate-500 hover:text-slate-800"
              }`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {tab === t.id ? (
                <span className="absolute bottom-0 left-3 right-3 h-px rounded-full bg-brand-600" />
              ) : null}
            </button>
          ))}
        </nav>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
        <div className="px-3 py-3 pb-6">
          {tab === "job" ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3">
                <div className="text-xs font-semibold text-slate-600">Detected</div>
                <dl className="mt-2 space-y-1.5 text-xs leading-snug text-slate-900">
                  <div className="flex gap-2">
                    <dt className="w-16 shrink-0 font-semibold text-slate-500">Title</dt>
                    <dd className="min-w-0 break-words font-medium">{detectedRows.title}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-16 shrink-0 font-semibold text-slate-500">Location</dt>
                    <dd className="min-w-0 break-words font-medium">{detectedRows.location}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-16 shrink-0 font-semibold text-slate-500">Company</dt>
                    <dd className="min-w-0 break-words font-medium">{detectedRows.company}</dd>
                  </div>
                </dl>
                {detectedSecondary ? (
                  <div className="mt-2 line-clamp-2 text-[11px] text-slate-600">{detectedSecondary}</div>
                ) : null}
                <button
                  type="button"
                  className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                  onClick={() => void refreshExtract()}
                >
                  Re-scan page
                </button>
              </div>

              <div>
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

              <button
                type="button"
                disabled={busy || !draft}
                onClick={() => void onSave()}
                className="flex w-full items-center justify-center rounded-lg bg-brand-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
              >
                Save to job tracker
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => void onAnalyze()}
                className="flex w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              >
                Analyze match
              </button>

              <p className="text-[11px] leading-relaxed text-slate-500">
                Without <code className="rounded bg-slate-100 px-0.5">OPENAI_API_KEY</code>, Analyze match uses a JD-only mock scorer. Upload a CV
                on the web dashboard first when using real scoring.
              </p>

              <div className="border-t border-slate-200 pt-3 text-[11px] text-slate-600">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">{saveLabel}</span>
                  {draft?.salary?.trim() ? <span className="text-slate-500">{draft.salary.trim()}</span> : null}
                </div>
              </div>
            </div>
          ) : null}

          {tab === "autofill" ? (
            <div className="rounded-xl border border-sky-100 bg-sky-50/90 p-3 text-xs leading-relaxed text-sky-950">
              <div className="font-semibold text-sky-900">Autofill</div>
              <p className="mt-2 text-sky-900/90">
                Save your applicant profile in the web app under <span className="font-medium">Settings → Application profile</span> (same API
                base and mock user id as in Settings here).
              </p>
              <p className="mt-2 text-sky-900/90">
                On an application form page, <span className="font-medium">right-click</span> and choose{" "}
                <span className="font-medium">Fill form with EasyJob profile</span>, or use the keyboard shortcut from{" "}
                <code className="rounded bg-white/80 px-0.5">chrome://extensions/shortcuts</code>. Chrome can still apply its own saved addresses;
                the extension merges non–httpOnly cookies when fields are empty in your profile.
              </p>
            </div>
          ) : null}

          {tab === "score" ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs text-slate-700">
              <div className="font-semibold text-slate-800">Match score</div>
              <p className="mt-2 leading-relaxed">
                Save this job from the Job tab, then run match analysis. Open the web dashboard for the full keyword breakdown and suggestions.
              </p>
              <button
                type="button"
                disabled={busy || !lastId}
                onClick={() => void onAnalyze()}
                className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              >
                Run match analysis
              </button>
            </div>
          ) : null}

          {tab === "settings" ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600">API base URL</label>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm"
                  value={apiBase}
                  onChange={(e) => setApiBase(e.target.value)}
                  onBlur={() => void persistSettings(apiBase, mockUserId)}
                />
                <div className="mt-1 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 text-[11px] leading-snug">
                    {apiHealth === "checking" || apiHealth === "idle" ? (
                      <span className="text-slate-500">Checking API…</span>
                    ) : apiHealth === "ok" ? (
                      <span className="font-medium text-emerald-700">API reachable.</span>
                    ) : (
                      <span className="text-amber-900">
                        API offline. Run <code className="rounded bg-amber-50 px-0.5">bash dev.sh</code> in{" "}
                        <code className="rounded bg-amber-50 px-0.5">easyjob/apps/api</code>, then{" "}
                        <code className="rounded bg-amber-50 px-0.5">{normalizeApiBase(apiBase)}/health</code>.
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
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Mock user id (optional)</label>
                <p className="text-[11px] text-slate-500">Digits only. Same as web app local mock id.</p>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm"
                  value={mockUserId}
                  placeholder="1"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  onChange={(e) => setMockUserId(e.target.value)}
                  onBlur={() => void persistSettings(apiBase, mockUserId)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600" htmlFor="easyjob-web-app-url">
                  Web app URL
                </label>
                <input
                  id="easyjob-web-app-url"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm"
                  value={webAppUrl}
                  placeholder={DEFAULT_WEB_APP_URL}
                  onChange={(e) => setWebAppUrl(e.target.value)}
                  onBlur={() => void persistSettings(apiBase, mockUserId)}
                />
              </div>
            </div>
          ) : null}

          {msg ? <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-800">{msg}</div> : null}
        </div>
      </div>
    </div>
  );
}
