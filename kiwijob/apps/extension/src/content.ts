import type { JobSavePayload, MatchAnalysis } from "@kiwijob/shared";
import { applyAutofillToPage, type AutofillProfile } from "./autofill";
import { initApplicationActivityTracker } from "./activityTracker";
import { initEmailActivityTracker } from "./emailActivityTracker";
import { extractJobFromPage } from "./extraction/generic";
import { initKiwiJobPageHost, toggleKiwiJobPageHost } from "./pageHost/inject";
import { initSeekNativeSaveOnClick } from "./seekNativeSave";

initSeekNativeSaveOnClick();
initApplicationActivityTracker();
initEmailActivityTracker();
initKiwiJobPageHost();

let lastJobSignature = "";
let notifyTimer: number | undefined;
let inlineMatchSignature = "";
let inlineMatchTimer: number | undefined;

const INLINE_CARD_HOST_ID = "kiwijob-inline-job-card";
const INLINE_CARD_SPACE_ATTR = "data-kiwijob-inline-card-space";
const INLINE_CARD_BODY_PADDING_VAR = "--kiwijob-original-body-padding-top";
const INLINE_CARD_OFFSET_PX = 118;

type RuntimeResponse<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

function jobSignature(payload: ReturnType<typeof extractJobFromPage>): string {
  return [payload.url, payload.title, payload.company || "", payload.location || ""].join("||");
}

function isRealJobPayload(payload: JobSavePayload | null | undefined): payload is JobSavePayload {
  if (!payload?.url || !payload.title?.trim()) return false;
  if (/open one seek job posting/i.test(payload.title)) return false;
  const hostname = window.location.hostname.toLowerCase();
  const pathname = window.location.pathname.toLowerCase();
  const title = payload.title.toLowerCase();
  const source = (payload.source_website || "").toLowerCase();
  if (/(^|\.)coursera\.org$/i.test(hostname)) return false;
  const hasJobPostingJsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).some((script) =>
    /"@type"\s*:\s*"?JobPosting"?/i.test(script.textContent || ""),
  );
  const isLinkedIn = /(^|\.)linkedin\.com$/i.test(hostname);
  const isLinkedInJobPage = isLinkedIn && /^\/jobs\//i.test(pathname);
  if (isLinkedIn && !isLinkedInJobPage) return false;

  const knownJobBoardPath =
    /\/(job|jobs|viewjob|jobsearch)(\/|\b)/i.test(pathname) ||
    /\/rc\/clk\b/i.test(pathname) ||
    /(?:^|[?&])vjk=/i.test(window.location.search);
  const knownAtsHost = /greenhouse|lever|workday|smartrecruiters|ashby|bamboohr|job-boards/i.test(hostname);
  const knownJobBoardHost =
    /seek|indeed|trademe|jobs\.govt\.nz/i.test(hostname) || (isLinkedInJobPage && /job|jobs|hiring/i.test(`${pathname} ${title} ${source}`));
  const hasJobUrlSignal = knownJobBoardPath || knownAtsHost || knownJobBoardHost;
  const hasJobDomSignal = Boolean(
    document.querySelector(
      [
        '[data-automation="job-detail-title"]',
        '[data-automation="jobDetailTitle"]',
        '[data-testid="job-detail-title"]',
        '[data-testid="jobsearch-JobInfoHeader-title"]',
        ".job-details-jobs-unified-top-card",
        ".jobs-unified-top-card",
        "#job-details",
        "#jobDescriptionText",
        ".job-description",
        ".jobs-description",
        ".description__text",
        "[class*='job-description' i]",
      ].join(","),
    ),
  );
  if (!hasJobPostingJsonLd && !hasJobUrlSignal && !hasJobDomSignal) return false;
  return true;
}

function sourceLabel(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes("seek")) return "SEEK";
  if (s.includes("linkedin")) return "LinkedIn";
  if (s.includes("trademe")) return "Trade Me";
  if (s.includes("indeed")) return "Indeed";
  if (s.includes("greenhouse")) return "Greenhouse";
  if (s.includes("lever")) return "Lever";
  if (s.includes("workday")) return "Workday";
  if (s.includes("smartrecruiters")) return "SmartRecruiters";
  if (s.includes("ashby")) return "Ashby";
  if (s.includes("jobs.govt.nz")) return "NZ Govt Jobs";
  return raw.replace(/^www\./i, "").split(".")[0]?.replace(/^\w/, (c) => c.toUpperCase()) || "Job site";
}

function matchRequirementCounts(match: MatchAnalysis): { matched: number; total: number } {
  const matched = match.matched_skills.length + match.matched_experience.length;
  const missing = match.missing_skills.length + match.missing_experience.length + match.ats_keywords.length;
  return { matched, total: Math.max(1, matched + missing) };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === '"') return "&quot;";
    return "&#39;";
  });
}

function sendRuntimeMessage<T>(message: unknown): Promise<RuntimeResponse<T>> {
  return chrome.runtime.sendMessage(message) as Promise<RuntimeResponse<T>>;
}

function ensureInlineCardHost(): ShadowRoot {
  let host = document.getElementById(INLINE_CARD_HOST_ID) as HTMLElement | null;
  if (!host) {
    host = document.createElement("div");
    host.id = INLINE_CARD_HOST_ID;
    host.setAttribute("data-kiwijob-inline-card", "");
    document.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; }
      .kj-card {
        position: fixed;
        top: 82px;
        left: 50%;
        z-index: 2147483638;
        width: min(760px, calc(100vw - 32px));
        min-height: 82px;
        transform: translateX(-50%);
        overflow: hidden;
        border-radius: 18px;
        background: rgba(248, 250, 252, 0.94);
        color: #172033;
        box-shadow: 0 24px 70px rgba(15, 23, 42, 0.26);
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        backdrop-filter: blur(18px);
      }
      .kj-inner { display: grid; grid-template-columns: 92px minmax(0, 1fr) 132px; min-height: 82px; }
      .kj-score {
        display: grid;
        place-items: center;
        background: linear-gradient(135deg, #12a6c8, #6d3fc3);
        color: #fff;
      }
      .kj-ring {
        display: grid;
        place-items: center;
        width: 58px;
        height: 58px;
        border-radius: 999px;
        background: conic-gradient(#fff var(--score), rgba(255,255,255,.22) 0);
        box-shadow: inset 0 0 0 8px rgba(255,255,255,.18);
        font-size: 17px;
        font-weight: 800;
      }
      .kj-ring span {
        display: grid;
        place-items: center;
        width: 43px;
        height: 43px;
        border-radius: 999px;
        background: rgba(25, 137, 166, .9);
      }
      .kj-body { min-width: 0; padding: 16px 18px; }
      .kj-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .kj-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 18px; font-weight: 850; letter-spacing: -.02em; color: #172033; }
      .kj-sub { margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; line-height: 1.45; color: #526071; }
      .kj-sub strong { color: #087ea4; }
      .kj-job { margin-top: 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: #69778a; }
      .kj-actions { display: flex; align-items: center; gap: 7px; }
      .kj-btn {
        border: 1px solid rgba(109, 63, 195, .16);
        border-radius: 999px;
        background: #fff;
        color: #2e245a;
        cursor: pointer;
        font-size: 11px;
        font-weight: 800;
        padding: 6px 10px;
      }
      .kj-btn:hover { background: #f4efff; }
      .kj-close {
        width: 24px;
        height: 24px;
        border: 0;
        border-radius: 999px;
        background: rgba(15, 23, 42, .06);
        color: #64748b;
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
      }
      .kj-close:hover { background: rgba(15, 23, 42, .12); color: #111827; }
      .kj-brand {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        background: rgba(226, 232, 240, .72);
        padding: 12px;
        color: #172033;
        font-size: 18px;
        font-weight: 900;
      }
      .kj-logo { width: 34px; height: 34px; border-radius: 10px; object-fit: cover; }
      .kj-hidden { display: none; }
      @media (max-width: 620px) {
        .kj-card { top: 72px; width: calc(100vw - 18px); }
        .kj-inner { grid-template-columns: 74px minmax(0, 1fr); }
        .kj-brand { display: none; }
        .kj-body { padding: 12px; }
        .kj-title { font-size: 15px; }
        .kj-actions { margin-top: 8px; }
        .kj-top { display: block; }
      }
    `;
    const container = document.createElement("div");
    container.className = "kj-root";
    shadow.append(style, container);
  }
  return host.shadowRoot as ShadowRoot;
}

function applyInlinePageOffset(): void {
  const body = document.body;
  if (!body) return;
  if (!document.documentElement.hasAttribute(INLINE_CARD_SPACE_ATTR)) {
    document.documentElement.style.setProperty(INLINE_CARD_BODY_PADDING_VAR, getComputedStyle(body).paddingTop || "0px");
  }
  document.documentElement.setAttribute(INLINE_CARD_SPACE_ATTR, "1");
  if (!document.getElementById("kiwijob-inline-card-page-style")) {
    const style = document.createElement("style");
    style.id = "kiwijob-inline-card-page-style";
    style.textContent = `
      html[${INLINE_CARD_SPACE_ATTR}="1"] body {
        padding-top: calc(var(${INLINE_CARD_BODY_PADDING_VAR}, 0px) + ${INLINE_CARD_OFFSET_PX}px) !important;
        transition: padding-top 180ms ease;
      }
    `;
    document.documentElement.appendChild(style);
  }
}

function removeInlinePageOffset(): void {
  document.documentElement.removeAttribute(INLINE_CARD_SPACE_ATTR);
  document.documentElement.style.removeProperty(INLINE_CARD_BODY_PADDING_VAR);
  document.getElementById("kiwijob-inline-card-page-style")?.remove();
}

function removeInlineJobCard(): void {
  document.getElementById(INLINE_CARD_HOST_ID)?.remove();
  removeInlinePageOffset();
}

function renderInlineJobCard(payload: JobSavePayload, state: { match?: MatchAnalysis | null; loading?: boolean; message?: string; saved?: boolean } = {}): void {
  applyInlinePageOffset();
  const shadow = ensureInlineCardHost();
  const root = shadow.querySelector(".kj-root") as HTMLElement;
  const score = state.match?.score ?? 0;
  const counts = state.match ? matchRequirementCounts(state.match) : { matched: 0, total: 0 };
  const source = sourceLabel(payload.source_website || new URL(payload.url).hostname);
  const companyLine = [payload.company, payload.location].filter(Boolean).join(" · ");
  const status = state.message
    ? escapeHtml(state.message)
    : state.loading
      ? "Calculating JD-to-CV match…"
    : state.match
      ? `<strong>${counts.matched} of ${counts.total} requirements</strong> matched from this JD.`
      : "Job detected. Run match or save it to KiwiJob.";
  root.innerHTML = `
    <div class="kj-card" role="region" aria-label="KiwiJob detected job card" style="--score: ${Math.max(0, Math.min(100, score))}%">
      <div class="kj-inner">
        <div class="kj-score"><div class="kj-ring"><span>${score}%</span></div></div>
        <div class="kj-body">
          <div class="kj-top">
            <div class="kj-title">Resume Match</div>
            <div class="kj-actions">
              <button class="kj-btn" data-action="match" type="button">${state.match ? "Refresh" : "Match"}</button>
              <button class="kj-btn" data-action="save" type="button">${state.saved ? "Saved" : "Save"}</button>
              <button class="kj-btn" data-action="panel" type="button">Open</button>
              <button class="kj-close" data-action="close" type="button" aria-label="Close">×</button>
            </div>
          </div>
          <div class="kj-sub">${status}</div>
          <div class="kj-job">${escapeHtml(payload.title)}${companyLine ? ` · ${escapeHtml(companyLine)}` : ""} · ${escapeHtml(source)}</div>
        </div>
        <div class="kj-brand">
          <img class="kj-logo" src="${chrome.runtime.getURL("kiwijob-logo.png")}" alt="" />
          <span>KiwiJob</span>
        </div>
      </div>
    </div>
  `;

  root.querySelector('[data-action="close"]')?.addEventListener("click", () => removeInlineJobCard());
  root.querySelector('[data-action="panel"]')?.addEventListener("click", () => toggleKiwiJobPageHost());
  root.querySelector('[data-action="match"]')?.addEventListener("click", () => void previewInlineMatch(payload, false));
  root.querySelector('[data-action="save"]')?.addEventListener("click", () => void saveInlineJob(payload));
}

async function previewInlineMatch(payload: JobSavePayload, auto: boolean): Promise<void> {
  renderInlineJobCard(payload, { loading: true });
  try {
    const resp = await sendRuntimeMessage<MatchAnalysis>({ type: "PREVIEW_MATCH", payload: { ...payload, status: "Saved" } });
    if (!resp.ok) {
      renderInlineJobCard(payload, { message: auto ? "Job detected. Sign in or upload a CV to show match." : resp.error });
      return;
    }
    renderInlineJobCard(payload, { match: resp.data as MatchAnalysis });
  } catch (e) {
    renderInlineJobCard(payload, { message: e instanceof Error ? e.message : String(e) });
  }
}

async function saveInlineJob(payload: JobSavePayload): Promise<void> {
  renderInlineJobCard(payload, { loading: true, message: "Saving to KiwiJob…" });
  try {
    const resp = await sendRuntimeMessage<{ id?: number }>({ type: "SAVE_JOB", payload: { ...payload, status: "Saved" } });
    if (!resp.ok) {
      renderInlineJobCard(payload, { message: resp.error });
      return;
    }
    renderInlineJobCard(payload, { saved: true, message: "Saved to job tracker." });
  } catch (e) {
    renderInlineJobCard(payload, { message: e instanceof Error ? e.message : String(e) });
  }
}

function updateInlineJobCard(payload: JobSavePayload): void {
  window.clearTimeout(inlineMatchTimer);
  const sig = jobSignature(payload);
  if (sig === inlineMatchSignature) return;
  inlineMatchSignature = sig;
  renderInlineJobCard(payload);
  inlineMatchTimer = window.setTimeout(() => void previewInlineMatch(payload, true), 900);
}

function notifyJobChanged(): void {
  window.clearTimeout(notifyTimer);
  notifyTimer = window.setTimeout(() => {
    try {
      const payload = extractJobFromPage();
      const sig = jobSignature(payload);
      if (isRealJobPayload(payload)) updateInlineJobCard(payload);
      else removeInlineJobCard();
      if (sig === lastJobSignature) return;
      lastJobSignature = sig;
      chrome.runtime.sendMessage({ type: "KIWIJOB_JOB_CHANGED", payload }).catch(() => {});
    } catch {
      removeInlineJobCard();
      /* ignore transient LinkedIn render states */
    }
  }, 450);
}

function initJobChangeNotifier(): void {
  notifyJobChanged();
  let lastHref = window.location.href;
  window.setInterval(() => {
    if (window.location.href !== lastHref) {
      lastHref = window.location.href;
      notifyJobChanged();
    }
  }, 700);
  if (document.body) {
    const observer = new MutationObserver(() => notifyJobChanged());
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

initJobChangeNotifier();

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "KIWIJOB_TOGGLE_UI") {
    toggleKiwiJobPageHost();
    return false;
  }
  if (msg?.type === "EXTRACT_JOB") {
    try {
      const payload = extractJobFromPage();
      sendResponse({ ok: true, data: payload });
    } catch (e) {
      sendResponse({ ok: false, error: (e as Error).message });
    }
    return true;
  }
  if (msg?.type === "AUTOFILL_TAB") {
    try {
      const profile = msg.profile as AutofillProfile;
      const data = applyAutofillToPage(profile, msg.settings);
      sendResponse({ ok: true, data });
    } catch (e) {
      sendResponse({ ok: false, error: (e as Error).message });
    }
    return true;
  }
  return false;
});
