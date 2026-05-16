import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ApplicationStatus, CvProfileDTO, InsightsSummary, JobSavePayload, MatchAnalysis, ResumeDTO } from "@kiwijob/shared";
import { APPLICATION_STATUSES } from "@kiwijob/shared";
import type { ContentToPanelMessage } from "../messages";
import type { AutofillResult, AutofillSettings } from "../autofill";
import { DEFAULT_AUTOFILL_SETTINGS } from "../autofill";
import { KIWIJOB_CLOSE_DRAWER, KIWIJOB_EXTENSION_SOURCE } from "../pageHost/messages";
import "./panel.css";

/** Logo at package root (`public/kiwijob-logo.png`). Leading `/` URLs fail on `chrome-extension://` pages. */
const kiwijobLogoSrc =
  typeof chrome !== "undefined" && typeof chrome.runtime?.getURL === "function"
    ? chrome.runtime.getURL("kiwijob-logo.png")
    : "/kiwijob-logo.png";

type ExtractResp =
  | { ok: true; data: JobSavePayload }
  | { ok: false; error: string };

type AnyResp = { ok: true; data?: unknown } | { ok: false; error: string };

type TabId = "jobs" | "applications" | "profile" | "insights";
type AutofillFieldKey = keyof AutofillSettings["fields"];
type InsightRange = "7" | "30" | "90" | "custom";
type LoadCvProfileOptions = { silent?: boolean; preferLatest?: boolean };
type AuthUser = { id: number; email: string; display_name: string };
type AuthState = { token: string; user: AuthUser | null };

type RequirementMatch = {
  label: string;
  matched: number;
  total: number;
  note: string;
};

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

function sourceLabel(raw: string): string {
  const s = raw.trim().toLowerCase().replace(/^www\./, "");
  if (!s) return "";
  if (s.includes("seek")) return "SEEK";
  if (s.includes("linkedin")) return "LinkedIn";
  if (s.includes("trademe")) return "Trade Me";
  if (s.includes("indeed")) return "Indeed";
  if (s.includes("jora")) return "Jora";
  if (s.includes("jobs.govt.nz")) return "NZ Govt Jobs";
  return raw.replace(/^www\./i, "").split(".")[0] || raw;
}

function isoDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
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

function authHeaders(token: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function requestCloseEmbed(): void {
  window.top?.postMessage({ type: KIWIJOB_CLOSE_DRAWER, source: KIWIJOB_EXTENSION_SOURCE }, "*");
}

function extensionContextError(): string | null {
  if (typeof chrome === "undefined" || !chrome.runtime?.id) {
    return "Extension context expired. Refresh this page, then reopen KiwiJob.";
  }
  return null;
}

async function sendRuntimeMessage(message: unknown): Promise<AnyResp> {
  const expired = extensionContextError();
  if (expired) return { ok: false, error: expired };
  try {
    return (await chrome.runtime.sendMessage(message)) as AnyResp;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function setSyncStorage(value: Record<string, unknown>): Promise<void> {
  const expired = extensionContextError();
  if (expired) throw new Error(expired);
  await chrome.storage.sync.set(value);
}

async function setLocalStorage(value: Record<string, unknown>): Promise<void> {
  const expired = extensionContextError();
  if (expired) return;
  await chrome.storage.local.set(value);
}

function percent(matched: number, total: number): number {
  if (!total) return 100;
  return Math.round((matched / total) * 100);
}

function matchRequirements(data: MatchAnalysis): RequirementMatch[] {
  const skillTotal = data.matched_skills.length + data.missing_skills.length;
  const experienceTotal = data.matched_experience.length + data.missing_experience.length;
  return [
    {
      label: "Skills",
      matched: data.matched_skills.length,
      total: skillTotal,
      note: data.missing_skills.length ? `${data.missing_skills.length} skill gap(s)` : "Core skills covered",
    },
    {
      label: "Experience",
      matched: data.matched_experience.length,
      total: experienceTotal,
      note: data.missing_experience.length ? `${data.missing_experience.length} experience gap(s)` : "Experience aligned",
    },
    {
      label: "ATS keywords",
      matched: Math.max(0, 8 - data.ats_keywords.length),
      total: Math.max(8, data.ats_keywords.length),
      note: data.ats_keywords.length ? `${data.ats_keywords.length} keyword(s) to add` : "Keyword coverage looks strong",
    },
    {
      label: "Risk flags",
      matched: data.risk_flags.length ? 0 : 1,
      total: 1,
      note: data.risk_flags.length ? `${data.risk_flags.length} risk flag(s)` : "No major risks found",
    },
  ];
}

function ChipList({ items, tone }: { items: string[]; tone: "strong" | "weak" | "neutral" }) {
  const toneClass =
    tone === "strong"
      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
      : tone === "weak"
        ? "bg-amber-50 text-amber-900 ring-amber-200"
        : "bg-slate-100 text-slate-700 ring-slate-200";

  if (!items.length) return <div className="text-[11px] text-slate-500">None detected.</div>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.slice(0, 8).map((item) => (
        <span key={item} className={`rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ${toneClass}`}>
          {item}
        </span>
      ))}
    </div>
  );
}

function MatchSummary({ data }: { data: MatchAnalysis }) {
  const strengths = [...data.matched_skills, ...data.matched_experience];
  const weakSpots = [...data.missing_skills, ...data.missing_experience, ...data.risk_flags];

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-brand-100 bg-gradient-to-br from-brand-600 to-sky-600 p-3 text-white shadow-sm">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-white/75">Match score</div>
        <div className="mt-1 flex items-end gap-1">
          <span className="text-4xl font-bold leading-none">{Math.round(data.score)}</span>
          <span className="pb-1 text-sm font-semibold text-white/80">/ 100</span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-white/80">Compared against the uploaded CV and the saved job description.</p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="text-xs font-semibold text-slate-800">JD requirement match</div>
        <div className="mt-3 space-y-2.5">
          {matchRequirements(data).map((row) => {
            const p = percent(row.matched, row.total);
            return (
              <div key={row.label}>
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-semibold text-slate-700">{row.label}</span>
                  <span className="font-bold text-slate-900">{p}%</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-brand-600" style={{ width: `${p}%` }} />
                </div>
                <div className="mt-1 text-[10px] text-slate-500">{row.note}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="text-xs font-semibold text-slate-800">Uploaded CV match</div>
        <div className="mt-3 space-y-3">
          <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-2">
            <div className="mb-2 text-[11px] font-bold text-emerald-800">Strengths</div>
            <ChipList items={strengths} tone="strong" />
          </div>
          <div className="rounded-lg border border-amber-100 bg-amber-50/70 p-2">
            <div className="mb-2 text-[11px] font-bold text-amber-900">Weak spots</div>
            <ChipList items={weakSpots} tone="weak" />
          </div>
          {data.ats_keywords.length ? (
            <div>
              <div className="mb-2 text-[11px] font-semibold text-slate-700">Keywords to add</div>
              <ChipList items={data.ats_keywords} tone="neutral" />
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-slate-200 pt-4">
      <h3 className="text-lg font-bold text-slate-950">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-slate-500">{children}</div>;
}

function SkillChips({ items }: { items: string[] }) {
  if (!items.length) return <EmptyLine>No skills provided</EmptyLine>;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span key={item} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-900">
          {item}
        </span>
      ))}
    </div>
  );
}

function InfoLine({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
}) {
  return (
    <button
      type="button"
      className="group flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-slate-50"
      onClick={onCopy ?? (() => void navigator.clipboard?.writeText(value))}
    >
      <span className="mt-0.5 w-12 shrink-0 text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="min-w-0 flex-1 break-words text-sm font-semibold text-slate-900 group-hover:text-teal-700">{value}</span>
    </button>
  );
}

function CvProfileView({
  profile,
  resumes,
  selectedResumeId,
  loading,
  error,
  onSelectResume,
  onRefresh,
  onEdit,
}: {
  profile: CvProfileDTO | null;
  resumes: ResumeDTO[];
  selectedResumeId: number | null;
  loading: boolean;
  error: string | null;
  onSelectResume: (id: number) => void;
  onRefresh: () => void;
  onEdit: () => void;
}) {
  if (loading && !profile) return <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Loading CV profile…</div>;
  if (!profile?.upload) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-600">
        <div>Upload a CV or resume in Documents first. Profile will update automatically.</div>
        <div className="mt-2 text-xs leading-relaxed text-slate-500">If you already uploaded one, make sure you are signed in with the same account.</div>
        <button type="button" className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm" onClick={onRefresh}>
          Sync now
        </button>
        {error ? <div className="mt-2 text-amber-800">{error}</div> : null}
      </div>
    );
  }

  return (
    <div className="space-y-4 text-slate-900">
      {resumes.length > 1 ? (
        <label className="block rounded-xl border border-slate-200 bg-white p-3 text-xs font-semibold text-slate-700 shadow-sm">
          CV
          <select
            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900"
            value={selectedResumeId ?? ""}
            onChange={(e) => onSelectResume(Number(e.target.value))}
          >
            {resumes.map((resume) => (
              <option key={resume.id} value={resume.id}>
                {resume.filename}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            className="min-w-0 text-left"
            onClick={() => void navigator.clipboard?.writeText([profile.full_name, profile.email, profile.phone, ...profile.links].filter(Boolean).join("\n"))}
          >
            <h2 className="min-w-0 break-words text-xl font-bold leading-tight text-slate-950">{profile.full_name || "KiwiJob Profile"}</h2>
            <div className="mt-1 text-xs font-medium text-slate-500">Personal information</div>
          </button>
          <div className="flex shrink-0 gap-2 text-sm font-semibold text-teal-700">
            <button type="button" onClick={onRefresh} className="hover:underline">
              Sync
            </button>
            <button type="button" onClick={onEdit} className="hover:underline">
              Edit
            </button>
          </div>
        </div>

        <div className="mt-3 space-y-1 rounded-xl bg-slate-50/80 p-1.5">
          <InfoLine label="Email" value={profile.email || "No email provided"} />
          <InfoLine label="Phone" value={profile.phone || "No phone provided"} />
          <div className="flex items-start gap-3 rounded-lg px-2 py-2">
            <span className="mt-1 w-12 shrink-0 text-[11px] font-bold uppercase tracking-wide text-slate-400">Links</span>
            <div className="min-w-0 flex-1">
              {profile.links.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {profile.links.map((link) => (
                    <button
                      key={link}
                      type="button"
                      className="max-w-full truncate rounded-full border border-teal-100 bg-white px-2.5 py-1 text-xs font-semibold text-teal-700 shadow-sm hover:bg-teal-50"
                      title={link}
                      onClick={() => void navigator.clipboard?.writeText(link)}
                    >
                      {link.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-sm font-medium text-slate-500">No links provided</div>
              )}
            </div>
          </div>
        </div>
      </section>

      <Section title="Summary">
        {profile.summary ? (
          <button type="button" className="block w-full text-left text-sm leading-relaxed text-slate-700" onClick={() => void navigator.clipboard?.writeText(profile.summary)}>
            {profile.summary}
          </button>
        ) : (
          <EmptyLine>No summary provided</EmptyLine>
        )}
      </Section>

      <Section title="Experience">
        {profile.experience.length ? (
          <div className="space-y-3">
            {profile.experience.map((item) => (
              <button
                key={`${item.title}-${item.company}-${item.years}`}
                type="button"
                className="block w-full text-left"
                onClick={() => void navigator.clipboard?.writeText([item.title, item.company, item.years].filter(Boolean).join("\n"))}
              >
                <div className="font-bold text-slate-950">{item.title}</div>
                <div className="text-sm text-slate-600">{[item.company, item.years].filter(Boolean).join(" · ")}</div>
              </button>
            ))}
          </div>
        ) : (
          <EmptyLine>No experience provided</EmptyLine>
        )}
      </Section>

      <Section title="Skills">
        {profile.skills.length ? <SkillChips items={profile.skills} /> : <EmptyLine>No skills provided</EmptyLine>}
      </Section>

      <Section title="Certificates">
        {profile.certifications.length ? <SkillChips items={profile.certifications} /> : <EmptyLine>No certificates provided</EmptyLine>}
      </Section>

      <Section title="Languages">
        {profile.languages.length ? <SkillChips items={profile.languages} /> : <EmptyLine>No languages provided</EmptyLine>}
      </Section>

      {error ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">{error}</div> : null}
    </div>
  );
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

export function KiwiJobPanel() {
  const [tab, setTab] = useState<TabId>("jobs");
  const [apiBase, setApiBase] = useState("http://localhost:8000");
  const [webAppUrl, setWebAppUrl] = useState(DEFAULT_WEB_APP_URL);
  const [auth, setAuth] = useState<AuthState>({ token: "", user: null });
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [draft, setDraft] = useState<JobSavePayload | null>(null);
  const [status, setStatus] = useState<ApplicationStatus>("Saved");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [lastId, setLastId] = useState<number | null>(null);
  const [apiHealth, setApiHealth] = useState<"idle" | "checking" | "ok" | "offline">("idle");
  const [autofillSettings, setAutofillSettings] = useState<AutofillSettings>(DEFAULT_AUTOFILL_SETTINGS);
  const [autofillResult, setAutofillResult] = useState<AutofillResult | null>(null);
  const [insightRange, setInsightRange] = useState<InsightRange>("7");
  const [customStart, setCustomStart] = useState(() => isoDate(30));
  const [customEnd, setCustomEnd] = useState(() => isoDate(0));
  const [insights, setInsights] = useState<InsightsSummary | null>(null);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [matchResult, setMatchResult] = useState<MatchAnalysis | null>(null);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [cvProfile, setCvProfile] = useState<CvProfileDTO | null>(null);
  const [resumes, setResumes] = useState<ResumeDTO[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<number | null>(null);
  const [cvProfileLoading, setCvProfileLoading] = useState(false);
  const [cvProfileError, setCvProfileError] = useState<string | null>(null);
  const autoMatchedJobKey = useRef("");

  useEffect(() => {
    void chrome.storage.sync.get(["apiBase", "webAppUrl", "autofillSettings"]).then((v) => {
      if (typeof v.apiBase === "string" && v.apiBase) setApiBase(v.apiBase);
      if (typeof v.webAppUrl === "string" && v.webAppUrl.trim()) setWebAppUrl(normalizeWebAppUrl(v.webAppUrl));
      setAutofillSettings(mergeAutofillSettings(v.autofillSettings));
    });
    void chrome.runtime.sendMessage({ type: "AUTH_STATE" }).then((resp: AnyResp) => {
      if (resp.ok) setAuth(resp.data as AuthState);
    });
    void chrome.storage.local.get(["lastApplicationId"]).then((v) => {
      if (typeof v.lastApplicationId === "number") setLastId(v.lastApplicationId);
    });
  }, []);

  useEffect(() => {
    const syncAuth = () => {
      void chrome.runtime.sendMessage({ type: "AUTH_STATE" }).then((resp: AnyResp) => {
        if (resp.ok) setAuth(resp.data as AuthState);
      });
    };
    window.addEventListener("focus", syncAuth);
    document.addEventListener("visibilitychange", syncAuth);
    return () => {
      window.removeEventListener("focus", syncAuth);
      document.removeEventListener("visibilitychange", syncAuth);
    };
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
      return { title: "—", salary: "—", location: "—", company: "—" };
    }
    return {
      title: draft.title?.trim() || "—",
      salary: draft.salary?.trim() || "—",
      location: draft.location?.trim() || "—",
      company: draft.company?.trim() || "—",
      visa: draft.visa_requirement?.trim() || "",
    };
  }, [draft]);

  const detectedSecondary = useMemo(() => {
    if (!draft) return "";
    try {
      return sourceLabel(draft.source_website || new URL(draft.url).hostname);
    } catch {
      return sourceLabel(draft.source_website || "");
    }
  }, [draft]);

  const saveLabel = lastId ? `Saved #${lastId}` : "Not saved";

  async function submitAuth() {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const resp = (await chrome.runtime.sendMessage(
        authMode === "login"
          ? { type: "AUTH_LOGIN", email: authEmail, password: authPassword }
          : { type: "AUTH_REGISTER", email: authEmail, password: authPassword, displayName: authName },
      )) as AnyResp;
      if (!resp.ok) {
        setAuthError(resp.error);
        return;
      }
      const body = resp.data as { access_token?: string; user?: AuthUser };
      setAuth({ token: body.access_token || "", user: body.user || null });
      setAuthPassword("");
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : String(e));
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    const resp = (await chrome.runtime.sendMessage({ type: "AUTH_LOGOUT" })) as AnyResp;
    if (resp.ok) setAuth({ token: "", user: null });
  }

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
      setLastId(null);
      setMatchResult(null);
      setMatchError(null);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      setMsg(`Could not reach the page script. Reload this tab, then click Re-scan. (${detail})`);
    }
  }

  useEffect(() => {
    void refreshExtract();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const listener = (message: ContentToPanelMessage) => {
      if (message?.type !== "KIWIJOB_JOB_CHANGED") return;
      const payload = message.payload as JobSavePayload;
      if (!payload?.title || !payload?.url) return;
      setDraft({ ...payload, status });
      setLastId(null);
      setMatchResult(null);
      setMatchError(null);
      setMsg(null);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [status]);

  async function persistSettings(nextApi: string) {
    const web = normalizeWebAppUrl(webAppUrl);
    setWebAppUrl(web);
    await setSyncStorage({
      apiBase: nextApi,
      webAppUrl: web,
    });
  }

  async function persistAutofillSettings(next: AutofillSettings) {
    setAutofillSettings(next);
    await setSyncStorage({ autofillSettings: next });
  }

  function updateAutofillFlag(key: "aiUniqueQuestions" | "continuous", value: boolean) {
    void persistAutofillSettings({ ...autofillSettings, [key]: value });
  }

  function updateAutofillField(key: AutofillFieldKey, value: boolean) {
    void persistAutofillSettings({ ...autofillSettings, fields: { ...autofillSettings.fields, [key]: value } });
  }

  function openWebDashboard() {
    const url = normalizeWebAppUrl(webAppUrl);
    void chrome.tabs.create({ url });
  }

  function openSavedJobInDashboard(applicationId: number) {
    const url = new URL(`${normalizeWebAppUrl(webAppUrl)}/tracker`);
    url.searchParams.set("saved", String(applicationId));
    void chrome.tabs.create({ url: url.toString() });
  }

  async function onSave(openTracker = true) {
    if (!draft) return;
    setBusy(true);
    setMsg(null);
    try {
      await persistSettings(apiBase);
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
      setMsg(openTracker ? `Saved (application #${data.id}). Opening tracker…` : `Saved (application #${data.id}).`);
      if (openTracker) openSavedJobInDashboard(data.id);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onPreviewMatch(auto = false) {
    if (!draft) return;
    setBusy(true);
    setMsg(auto ? "Detected job. Calculating match…" : null);
    setMatchError(null);
    try {
      await persistSettings(apiBase);
      const matchResp = await sendRuntimeMessage({
        type: "PREVIEW_MATCH",
        payload: { ...draft, status },
      });
      if (!matchResp.ok) {
        setMsg(matchResp.error);
        setMatchError(matchResp.error);
        return;
      }
      setMatchResult(matchResp.data as MatchAnalysis);
      setMsg("Match analysis complete. Save manually if you want to track this job.");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setMsg(message);
      setMatchError(message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!draft?.url || !draft.title) return;
    if (/open one seek job posting/i.test(draft.title)) return;
    const key = `${draft.url}::${draft.title}`;
    if (autoMatchedJobKey.current === key) return;
    autoMatchedJobKey.current = key;
    const timer = window.setTimeout(() => void onPreviewMatch(true), 600);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.url, draft?.title]);

  async function onAnalyze() {
    const id = lastId;
    if (!id) {
      setMsg("Save a job first to get an application id.");
      return;
    }
    setBusy(true);
    setMsg(null);
    setMatchError(null);
    try {
      await persistSettings(apiBase);
      const resp = (await chrome.runtime.sendMessage({ type: "ANALYZE_MATCH", jobId: id })) as AnyResp;
      if (!resp.ok) {
        setMsg(resp.error);
        setMatchError(resp.error);
        return;
      }
      setMatchResult(resp.data as MatchAnalysis);
      setMsg("Match analysis complete.");
    } catch (e) {
      const message = (e as Error).message;
      setMsg(message);
      setMatchError(message);
    } finally {
      setBusy(false);
    }
  }

  async function loadLatestMatch(applicationId: number) {
    setMatchError(null);
    try {
      const resp = (await chrome.runtime.sendMessage({ type: "GET_MATCH", jobId: applicationId })) as AnyResp;
      if (!resp.ok) {
        setMatchResult(null);
        if (!resp.error.toLowerCase().includes("no match analysis")) setMatchError(resp.error);
        return;
      }
      setMatchResult(resp.data as MatchAnalysis);
    } catch (e) {
      setMatchError(e instanceof Error ? e.message : String(e));
    }
  }

  async function loadResumes(): Promise<ResumeDTO[]> {
    const headers = authHeaders(auth.token);
    const res = await fetch(`${normalizeApiBase(apiBase)}/resumes`, { credentials: "include", headers });
    if (!res.ok) throw new Error(await res.text() || res.statusText);
    const list = (await res.json()) as ResumeDTO[];
    setResumes(list);
    return list;
  }

  async function loadCvProfile(resumeId?: number | null, options: LoadCvProfileOptions = {}) {
    const { silent = false, preferLatest = resumeId == null } = options;
    if (!silent) setCvProfileLoading(true);
    setCvProfileError(null);
    try {
      const list = await loadResumes();
      const requestedId = preferLatest ? null : (resumeId ?? selectedResumeId);
      const id = requestedId && list.some((resume) => resume.id === requestedId) ? requestedId : (list[0]?.id ?? null);
      setSelectedResumeId(id);
      if (id) void setLocalStorage({ selectedResumeId: id });
      if (!id) {
        setCvProfile(null);
        return;
      }
      const headers = authHeaders(auth.token);
      const res = await fetch(`${normalizeApiBase(apiBase)}/resumes/${id}/profile`, { credentials: "include", headers });
      if (!res.ok) {
        setCvProfileError(await res.text() || res.statusText);
        return;
      }
      setCvProfile((await res.json()) as CvProfileDTO);
    } catch (e) {
      setCvProfileError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!silent) setCvProfileLoading(false);
    }
  }

  function selectResume(id: number) {
    setSelectedResumeId(id);
    void setLocalStorage({ selectedResumeId: id });
    void loadCvProfile(id, { preferLatest: false });
  }

  async function onAutofillActiveTab() {
    setBusy(true);
    setMsg(null);
    setAutofillResult(null);
    try {
      const expired = extensionContextError();
      if (expired) {
        setMsg(expired);
        setAutofillResult({ filled: [], skippedEmpty: [expired] });
        return;
      }
      await persistSettings(apiBase);
      await persistAutofillSettings(autofillSettings);
      const resp = await sendRuntimeMessage({ type: "AUTOFILL_ACTIVE_TAB" });
      if (!resp.ok) {
        setMsg(resp.error);
        setAutofillResult({ filled: [], skippedEmpty: [resp.error] });
        return;
      }
      const result = resp.data as AutofillResult;
      setAutofillResult(result);
      setMsg(result.filled.length ? `Autofilled ${result.filled.length} field group(s).` : "No matching fields found on this page.");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function loadInsights(range = insightRange) {
    setInsightsError(null);
    try {
      await persistSettings(apiBase);
      const days = range === "custom" ? 30 : Number(range);
      const resp = (await chrome.runtime.sendMessage({
        type: "GET_INSIGHTS",
        days,
        start: range === "custom" ? customStart : undefined,
        end: range === "custom" ? customEnd : undefined,
      })) as AnyResp;
      if (!resp.ok) {
        setInsightsError(resp.error);
        return;
      }
      setInsights(resp.data as InsightsSummary);
    } catch (e) {
      setInsightsError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    if (tab === "insights") void loadInsights(insightRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, insightRange, customStart, customEnd]);

  useEffect(() => {
    if (tab === "profile") void loadCvProfile(null, { preferLatest: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (tab !== "profile") return;
    const syncLatest = () => void loadCvProfile(null, { preferLatest: true, silent: true });
    const timer = window.setInterval(syncLatest, 12000);
    window.addEventListener("focus", syncLatest);
    document.addEventListener("visibilitychange", syncLatest);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", syncLatest);
      document.removeEventListener("visibilitychange", syncLatest);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, apiBase, auth.token]);

  const tabs: { id: TabId; label: string; description: string }[] = [
    { id: "jobs", label: "Jobs", description: "职位列表、实时抓取" },
    { id: "applications", label: "Applications", description: "已申请职位追踪" },
    { id: "profile", label: "Profile", description: "CV、技能、签证、偏好" },
    { id: "insights", label: "Insights", description: "数据分析（成功率、市场趋势）" },
  ];

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-white">
      <div className="sticky top-0 z-10 shrink-0 border-b border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold tracking-tight text-slate-900">KiwiJob</div>
            <div className="truncate text-[11px] text-slate-500">Job search assistant</div>
          </div>
          <button
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            title="Close panel"
            aria-label="Close panel"
            onClick={() => requestCloseEmbed()}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <nav className="flex gap-0 px-1" aria-label="Panel sections">
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
          {!auth.user ? (
            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/90 p-3">
              <div className="text-sm font-bold text-slate-900">{authMode === "register" ? "Create KiwiJob account" : "Login to KiwiJob"}</div>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">Use the same account in the dashboard and extension.</p>
              <div className="mt-3 grid grid-cols-2 rounded-lg bg-slate-200/70 p-1 text-xs font-semibold">
                <button
                  type="button"
                  className={`rounded-md px-2 py-1.5 ${authMode === "login" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
                  onClick={() => setAuthMode("login")}
                >
                  Login
                </button>
                <button
                  type="button"
                  className={`rounded-md px-2 py-1.5 ${authMode === "register" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
                  onClick={() => setAuthMode("register")}
                >
                  Register
                </button>
              </div>
              <div className="mt-3 space-y-2">
                {authMode === "register" ? (
                  <input
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm"
                    placeholder="Name"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                  />
                ) : null}
                <input
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm"
                  placeholder="Email"
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                />
                <input
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm"
                  placeholder="Password"
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                />
                {authError ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">{authError}</div> : null}
                <button
                  type="button"
                  disabled={authBusy}
                  className="w-full rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
                  onClick={() => void submitAuth()}
                >
                  {authBusy ? "Please wait..." : authMode === "register" ? "Create account" : "Login"}
                </button>
              </div>
            </div>
          ) : null}
          {tab === "jobs" ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3">
                <div className="text-xs font-semibold text-slate-600">Detected</div>
                <dl className="mt-2 space-y-1.5 text-xs leading-snug text-slate-900">
                  <div className="flex gap-2">
                    <dt className="w-16 shrink-0 font-semibold text-slate-500">Title</dt>
                    <dd className="min-w-0 break-words font-medium">{detectedRows.title}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-16 shrink-0 font-semibold text-slate-500">Salary</dt>
                    <dd className="min-w-0 break-words font-medium">{detectedRows.salary}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-16 shrink-0 font-semibold text-slate-500">Location</dt>
                    <dd className="min-w-0 break-words font-medium">{detectedRows.location}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-16 shrink-0 font-semibold text-slate-500">Company</dt>
                    <dd className="min-w-0 break-words font-medium">{detectedRows.company}</dd>
                  </div>
                  {detectedRows.visa ? (
                    <div className="flex gap-2">
                      <dt className="w-16 shrink-0 font-semibold text-slate-500">Visa</dt>
                      <dd className="min-w-0 break-words font-medium">{detectedRows.visa}</dd>
                    </div>
                  ) : null}
                </dl>
                {detectedSecondary ? (
                  <div className="mt-2 line-clamp-2 text-[11px] text-slate-600">数据来源：{detectedSecondary}</div>
                ) : null}
                <button
                  type="button"
                  className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                  onClick={() => void refreshExtract()}
                >
                  Refresh detection
                </button>
              </div>

              <button
                type="button"
                disabled={busy || !draft}
                onClick={() => void onSave(false)}
                className="flex w-full items-center justify-center rounded-lg bg-brand-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save to job tracker"}
              </button>

              <button
                type="button"
                disabled={busy || !draft}
                onClick={() => void onPreviewMatch(false)}
                className="flex w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              >
                {busy ? "Matching…" : matchResult ? "Refresh match" : "Run match now"}
              </button>

              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs text-slate-700">
                  <div className="font-semibold text-slate-800">AI Match / Resume Optimization</div>
                  <p className="mt-2 leading-relaxed">
                    Match runs automatically when a job is detected. Saving to your tracker stays manual.
                  </p>
                  {matchError ? <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">{matchError}</div> : null}
                </div>

                {matchResult ? (
                  <MatchSummary data={matchResult} />
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-center text-xs text-slate-600">
                    {busy ? "Calculating match for this job…" : "Open a job page to automatically show your match score here."}
                  </div>
                )}

                {lastId ? (
                  <button
                    type="button"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
                    onClick={() => void loadLatestMatch(lastId)}
                  >
                    Refresh match
                  </button>
                ) : null}
              </div>

              <button
                type="button"
                className="flex w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                onClick={() => {
                  const url = new URL(`${normalizeWebAppUrl(webAppUrl)}/browse`);
                  void chrome.tabs.create({ url: url.toString() });
                }}
              >
                Open NZ job search
              </button>
            </div>
          ) : null}

          {tab === "applications" ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                <div className="text-xs font-semibold text-slate-800">Application tracking</div>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                  Save jobs from the Jobs tab, then track application status, interviews, offers, and outcomes in the dashboard.
                </p>
                <div className="mt-3">
                  <label className="text-xs font-semibold text-slate-600">Current status</label>
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
                  className="mt-3 flex w-full items-center justify-center rounded-lg bg-brand-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
                >
                  Save / update application
                </button>
                <button
                  type="button"
                  className="mt-2 flex w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                  onClick={() => {
                    if (lastId) openSavedJobInDashboard(lastId);
                    else void chrome.tabs.create({ url: `${normalizeWebAppUrl(webAppUrl)}/tracker` });
                  }}
                >
                  Open applications dashboard
                </button>
              </div>
            </div>
          ) : null}

          {tab === "profile" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm hover:bg-slate-50"
                  onClick={() => void chrome.tabs.create({ url: `${normalizeWebAppUrl(webAppUrl)}/matches` })}
                >
                  <div className="text-sm font-bold text-slate-900">Job Matches</div>
                  <div className="mt-1 text-xs text-slate-500">Fill out preferences</div>
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm hover:bg-slate-50"
                  onClick={() => void chrome.tabs.create({ url: `${normalizeWebAppUrl(webAppUrl)}/tracker` })}
                >
                  <div className="text-sm font-bold text-slate-900">Job Tracker</div>
                  <div className="mt-1 text-xs text-slate-500">Track saved jobs</div>
                </button>
              </div>

              <button
                type="button"
                disabled={busy}
                className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
                onClick={() => void onAutofillActiveTab()}
              >
                {busy ? "Autofilling…" : "Autofill this page"}
              </button>
              {autofillResult ? (
                <div className="rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-800">
                  <div className="font-semibold">Filled: {autofillResult.filled.length ? autofillResult.filled.join(", ") : "—"}</div>
                  {autofillResult.skippedEmpty.length ? <div className="mt-1">Missing profile data: {autofillResult.skippedEmpty.join(", ")}</div> : null}
                </div>
              ) : null}

              <CvProfileView
                profile={cvProfile}
                resumes={resumes}
                selectedResumeId={selectedResumeId}
                loading={cvProfileLoading}
                error={cvProfileError}
                onSelectResume={selectResume}
                onRefresh={() => void loadCvProfile()}
                onEdit={() => void chrome.tabs.create({ url: `${normalizeWebAppUrl(webAppUrl)}/documents` })}
              />
            </div>
          ) : null}

          {tab === "insights" ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs text-slate-700">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-800">Insights dashboard</div>
                    <p className="mt-1 text-[11px] text-slate-500">Applications, replies, interviews, and title trends.</p>
                  </div>
                  <select
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                    value={insightRange}
                    onChange={(e) => setInsightRange(e.target.value as InsightRange)}
                  >
                    <option value="7">1 week</option>
                    <option value="30">1 month</option>
                    <option value="90">3 month</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>

                {insightRange === "custom" ? (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <label className="text-[11px] font-semibold text-slate-600">
                      Start
                      <input
                        type="date"
                        value={customStart}
                        onChange={(e) => setCustomStart(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
                      />
                    </label>
                    <label className="text-[11px] font-semibold text-slate-600">
                      End
                      <input
                        type="date"
                        value={customEnd}
                        onChange={(e) => setCustomEnd(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
                      />
                    </label>
                  </div>
                ) : null}

                <div className="mt-3 grid grid-cols-2 gap-2">
                  {[
                    ["Applied", insights?.applications ?? 0],
                    ["Replies", insights?.replies ?? 0],
                    ["Interviews", insights?.interviews ?? 0],
                    ["Offers", insights?.offers ?? 0],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-slate-200 bg-white p-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
                      <div className="mt-1 text-xl font-bold text-slate-900">{value}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-brand-50 p-2 text-brand-900">
                    <div className="text-[10px] font-semibold uppercase tracking-wide">Response rate</div>
                    <div className="mt-1 text-lg font-bold">{insights?.response_rate ?? 0}%</div>
                  </div>
                  <div className="rounded-lg bg-sky-50 p-2 text-sky-900">
                    <div className="text-[10px] font-semibold uppercase tracking-wide">Interview rate</div>
                    <div className="mt-1 text-lg font-bold">{insights?.interview_rate ?? 0}%</div>
                  </div>
                </div>

                <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2">
                  <div className="text-[11px] font-semibold text-slate-700">Top job titles</div>
                  <div className="mt-2 space-y-1.5">
                    {insights?.top_titles?.length ? (
                      insights.top_titles.map((item) => (
                        <div key={item.title} className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="min-w-0 truncate text-slate-700">{item.title}</span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">{item.count}</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-[11px] text-slate-500">No applications in this period yet.</div>
                    )}
                  </div>
                </div>

                {insightsError ? <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">{insightsError}</div> : null}

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                    onClick={() => void loadInsights(insightRange)}
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    className="flex-1 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-700"
                    onClick={() => void chrome.tabs.create({ url: `${normalizeWebAppUrl(webAppUrl)}/analytics` })}
                  >
                    Full dashboard
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">API base URL</label>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm"
                  value={apiBase}
                  onChange={(e) => setApiBase(e.target.value)}
                  onBlur={() => void persistSettings(apiBase)}
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
                        <code className="rounded bg-amber-50 px-0.5">kiwijob/apps/api</code>, then{" "}
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
              <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700">
                <div className="font-semibold text-slate-900">Signed in</div>
                <div className="mt-1 break-words">{auth.user?.email || "Not signed in"}</div>
                {auth.user ? (
                  <button
                    type="button"
                    className="mt-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    onClick={() => void signOut()}
                  >
                    Sign out
                  </button>
                ) : null}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600" htmlFor="kiwijob-web-app-url">
                  Web app URL
                </label>
                <input
                  id="kiwijob-web-app-url"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm"
                  value={webAppUrl}
                  placeholder={DEFAULT_WEB_APP_URL}
                  onChange={(e) => setWebAppUrl(e.target.value)}
                  onBlur={() => void persistSettings(apiBase)}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <footer className="z-10 shrink-0 border-t border-slate-200 bg-white shadow-[0_-4px_14px_-6px_rgba(15,23,42,0.12)]">
        {(tab === "jobs" || msg || apiHealth === "offline") && (
          <div className="space-y-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
            {tab === "jobs" ? (
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                <span className="rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-800">{saveLabel}</span>
              </div>
            ) : null}
            {apiHealth === "offline" ? (
              <p className="text-[11px] leading-snug text-amber-900">
                API unreachable at <code className="rounded bg-amber-50 px-0.5">{normalizeApiBase(apiBase)}</code>. Start the backend and open{" "}
                <code className="rounded bg-amber-50 px-0.5">{normalizeApiBase(apiBase)}/health</code> in a tab to verify.
              </p>
            ) : null}
            {msg ? <div className="rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-800">{msg}</div> : null}
          </div>
        )}
        <div className="flex items-center gap-2 px-3 py-2">
          <img src={kiwijobLogoSrc} alt="" className="h-7 w-7 shrink-0 object-contain" width={28} height={28} />
          <span className="text-sm font-semibold tracking-tight text-slate-900">KiwiJob</span>
          <div className="min-w-0 flex-1" />
          <button
            type="button"
            className="rounded-md px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
            onClick={() => openWebDashboard()}
          >
            Dashboard
          </button>
        </div>
      </footer>
    </div>
  );
}
