import { extractJobFromPage } from "./extraction/generic";
import { isSeekHost, seekHasExtractableJobView } from "./extraction/seek";
import { initKiwiJobPageHost, toggleKiwiJobPageHost } from "./pageHost/inject";
import type { JobSavePayload } from "@kiwijob/shared";

initKiwiJobPageHost();

type DuplicateApplication = {
  status?: string;
  updated_at?: string;
};

let duplicateApplications: DuplicateApplication[] = [];
let duplicateCheckKey = "";
let duplicateCheckTimer: number | null = null;

const SEEK_PENDING_APPLICATION_KEY = "seekPendingApplication";
const SEEK_PENDING_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const SEEK_APPLICATION_PROMPT_ID = "kiwijob-seek-application-prompt";

type PendingSeekApplication = {
  payload: JobSavePayload;
  capturedAt: number;
  sourceUrl: string;
};

function isUsefulSeekJob(job: JobSavePayload): boolean {
  const title = job.title.trim();
  const company = job.company?.trim() || "";
  return Boolean(
    title &&
      company &&
      title !== "Untitled role" &&
      title !== "Open one SEEK job posting" &&
      seekHasExtractableJobView(),
  );
}

async function rememberSeekApplicationCandidate(): Promise<void> {
  if (!isSeekHost(window.location.hostname)) return;
  try {
    const job = extractJobFromPage();
    if (!isUsefulSeekJob(job)) return;
    const pending: PendingSeekApplication = {
      payload: { ...job, status: "Applied" },
      capturedAt: Date.now(),
      sourceUrl: window.location.href,
    };
    await chrome.storage.local.set({ [SEEK_PENDING_APPLICATION_KEY]: pending });
  } catch {
    // Application tracking must never interfere with SEEK's own apply flow.
  }
}

function seekApplicationSuccessDetected(): boolean {
  if (!isSeekHost(window.location.hostname)) return false;
  const route = `${window.location.pathname}${window.location.search}`.toLowerCase();
  if (
    /(?:application|apply|job-application)[^?#]{0,100}(?:success|submitted|complete|confirmation|thank-you)/i.test(route) ||
    /(?:success|submitted|complete|confirmation|thank-you)[^?#]{0,100}(?:application|apply)/i.test(route)
  ) {
    return true;
  }

  const roots = Array.from(
    document.querySelectorAll<HTMLElement>(
      "main h1, main h2, main h3, [role='alert'], [role='status'], [data-automation*='application' i], [data-testid*='application' i]",
    ),
  );
  const focusedText = roots
    .map((node) => node.innerText || node.textContent || "")
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, 12000);
  return [
    /\b(?:your\s+)?application\s+(?:has\s+been\s+)?(?:successfully\s+)?(?:submitted|sent|received|completed)\b/i,
    /\byou(?:'ve| have)?\s+(?:successfully\s+)?applied\b/i,
    /\bapplication\s+(?:is\s+)?complete\b/i,
    /\bthank(?:s| you)\s+for\s+applying\b/i,
    /\bapplication\s+confirmation\b/i,
  ].some((pattern) => pattern.test(focusedText));
}

function createSeekApplicationPrompt(pending: PendingSeekApplication): void {
  if (document.getElementById(SEEK_APPLICATION_PROMPT_ID)) return;

  const host = document.createElement("div");
  host.id = SEEK_APPLICATION_PROMPT_ID;
  host.style.cssText = "all:initial;position:fixed;right:24px;bottom:24px;z-index:2147483647;";
  const shadow = host.attachShadow({ mode: "open" });
  const company = pending.payload.company?.trim() || "this employer";
  const title = pending.payload.title.trim();
  shadow.innerHTML = `
    <style>
      * { box-sizing: border-box; }
      .card { width: min(380px, calc(100vw - 32px)); overflow: hidden; border: 1px solid #dbe4ea; border-radius: 18px;
        background: #fff; color: #16212a; font: 14px/1.45 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        box-shadow: 0 22px 60px rgba(15, 35, 48, .22), 0 3px 12px rgba(15, 35, 48, .1); }
      .accent { height: 5px; background: linear-gradient(90deg, #7c3aed, #14b8a6); }
      .body { padding: 18px; }
      .eyebrow { display: flex; align-items: center; gap: 8px; color: #087f6f; font-size: 12px; font-weight: 750; letter-spacing: .04em; text-transform: uppercase; }
      .check { display: grid; width: 24px; height: 24px; place-items: center; border-radius: 999px; background: #d9fbf4; color: #087f6f; font-size: 15px; }
      h2 { margin: 12px 0 5px; color: #111827; font-size: 18px; line-height: 1.25; }
      p { margin: 0; color: #52616d; }
      .job { margin-top: 12px; padding: 11px 12px; border: 1px solid #e5eaf0; border-radius: 12px; background: #f8fafc; }
      .title { overflow: hidden; color: #1f2937; font-weight: 750; text-overflow: ellipsis; white-space: nowrap; }
      .company { margin-top: 2px; overflow: hidden; color: #64748b; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
      .actions { display: flex; gap: 9px; margin-top: 16px; }
      button { min-height: 40px; border-radius: 10px; padding: 0 14px; font: inherit; font-weight: 750; cursor: pointer; }
      .primary { flex: 1; border: 0; background: linear-gradient(135deg, #7c3aed, #6d28d9); color: #fff; box-shadow: 0 7px 18px rgba(109, 40, 217, .22); }
      .primary:hover { filter: brightness(1.04); }
      .secondary { border: 1px solid #d9e1e8; background: #fff; color: #52616d; }
      .secondary:hover { background: #f8fafc; }
      button:disabled { cursor: wait; opacity: .65; }
      .message { display: none; margin-top: 11px; border-radius: 10px; padding: 9px 10px; font-size: 12px; }
      .message.error { display: block; background: #fff1f2; color: #be123c; }
      .message.success { display: block; background: #ecfdf5; color: #047857; }
      @media (max-width: 520px) { :host { right: 16px !important; bottom: 16px !important; } }
    </style>
    <section class="card" role="dialog" aria-labelledby="kiwijob-seek-prompt-title" aria-live="polite">
      <div class="accent"></div>
      <div class="body">
        <div class="eyebrow"><span class="check">✓</span> SEEK application detected</div>
        <h2 id="kiwijob-seek-prompt-title">Add this application to Tracker?</h2>
        <p>KiwiJob detected a successful application. Confirm to record it as Applied.</p>
        <div class="job"><div class="title"></div><div class="company"></div></div>
        <div class="actions">
          <button type="button" class="secondary">Not now</button>
          <button type="button" class="primary">Add to Tracker</button>
        </div>
        <div class="message"></div>
      </div>
    </section>`;
  const titleNode = shadow.querySelector<HTMLElement>(".title");
  const companyNode = shadow.querySelector<HTMLElement>(".company");
  if (titleNode) titleNode.textContent = title;
  if (companyNode) companyNode.textContent = company;

  const primary = shadow.querySelector<HTMLButtonElement>(".primary");
  const secondary = shadow.querySelector<HTMLButtonElement>(".secondary");
  const message = shadow.querySelector<HTMLElement>(".message");
  secondary?.addEventListener("click", () => {
    void chrome.storage.local.remove(SEEK_PENDING_APPLICATION_KEY);
    host.remove();
  });
  primary?.addEventListener("click", () => {
    if (!primary || !secondary || !message) return;
    primary.disabled = true;
    secondary.disabled = true;
    primary.textContent = "Saving…";
    message.className = "message";
    void chrome.runtime
      .sendMessage({ type: "SAVE_JOB", payload: { ...pending.payload, status: "Applied" } })
      .then((response: { ok?: boolean; error?: string; data?: { id?: number } }) => {
        if (!response?.ok) throw new Error(response?.error || "Could not save this application.");
        void chrome.storage.local.remove(SEEK_PENDING_APPLICATION_KEY);
        message.textContent = "Added to Tracker as Applied.";
        message.className = "message success";
        primary.textContent = "Saved";
        window.setTimeout(() => host.remove(), 2200);
      })
      .catch((error: unknown) => {
        message.textContent = error instanceof Error ? error.message : "Could not save this application.";
        message.className = "message error";
        primary.disabled = false;
        secondary.disabled = false;
        primary.textContent = "Try again";
      });
  });
  document.documentElement.appendChild(host);
}

async function checkForSeekApplicationSuccess(): Promise<void> {
  if (!seekApplicationSuccessDetected() || document.getElementById(SEEK_APPLICATION_PROMPT_ID)) return;
  try {
    const stored = await chrome.storage.local.get(SEEK_PENDING_APPLICATION_KEY);
    const pending = stored[SEEK_PENDING_APPLICATION_KEY] as PendingSeekApplication | undefined;
    if (!pending?.payload || !Number.isFinite(pending.capturedAt)) return;
    if (Date.now() - pending.capturedAt > SEEK_PENDING_MAX_AGE_MS) {
      await chrome.storage.local.remove(SEEK_PENDING_APPLICATION_KEY);
      return;
    }
    createSeekApplicationPrompt(pending);
  } catch {
    // Do not affect the application confirmation page if extension storage is unavailable.
  }
}

async function refreshDuplicateCheck(): Promise<void> {
  try {
    const job = extractJobFromPage();
    const company = job.company?.trim() || "";
    const title = job.title?.trim() || "";
    const key = `${company.toLowerCase()}|${title.toLowerCase()}`;
    if (!company || !title || key === duplicateCheckKey) return;
    duplicateCheckKey = key;
    const response = (await chrome.runtime.sendMessage({ type: "CHECK_DUPLICATE", company, title })) as {
      ok?: boolean;
      data?: { duplicate?: boolean; applications?: DuplicateApplication[] };
    };
    duplicateApplications = response?.ok && response.data?.duplicate ? response.data.applications || [] : [];
  } catch {
    duplicateApplications = [];
  }
}

function looksLikeApplyAction(target: Element): boolean {
  const action = target.closest<HTMLElement>("button, a, input[type='submit'], [role='button']");
  if (!action) return false;
  const label = [action.textContent, action.getAttribute("aria-label"), action.getAttribute("title"), action instanceof HTMLInputElement ? action.value : ""]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (/filter|coupon|discount/.test(label)) return false;
  return /^(apply|apply now|quick apply|easy apply|submit|submit application|send application)\b/.test(label);
}

document.addEventListener(
  "click",
  (event) => {
    if (!(event.target instanceof Element) || !looksLikeApplyAction(event.target)) return;
    if (duplicateApplications.length) {
      const previous = duplicateApplications[0];
      const proceed = window.confirm(
        `KiwiJob shows that you already applied for this company and position${previous.status ? ` (status: ${previous.status})` : ""}. This may be a duplicate application. Apply again?`,
      );
      if (!proceed) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      duplicateApplications = [];
    }
    void rememberSeekApplicationCandidate();
  },
  true,
);

function scheduleDuplicateCheck(): void {
  if (duplicateCheckTimer !== null) window.clearTimeout(duplicateCheckTimer);
  duplicateCheckTimer = window.setTimeout(() => {
    duplicateCheckTimer = null;
    void refreshDuplicateCheck();
  }, 700);
}

scheduleDuplicateCheck();
void checkForSeekApplicationSuccess();
new MutationObserver(() => {
  scheduleDuplicateCheck();
  void checkForSeekApplicationSuccess();
}).observe(document.documentElement, { childList: true, subtree: true });

function removeLegacyInlineMatchCard(): void {
  document.getElementById("kiwijob-inline-job-card")?.remove();
  document.getElementById("kiwijob-inline-card-page-style")?.remove();
  document.querySelectorAll("[data-kiwijob-inline-card]").forEach((el) => el.remove());
  document.documentElement.removeAttribute("data-kiwijob-inline-card-space");
  document.documentElement.style.removeProperty("--kiwijob-original-body-padding-top");
}

removeLegacyInlineMatchCard();

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
  return false;
});
