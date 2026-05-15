import type { ApplicationStatus, JobSavePayload } from "@kiwijob/shared";
import type { BgResponse } from "./messages";
import { extractJobFromPage } from "./extraction/generic";

type TrackEventType =
  | "job_viewed"
  | "application_started"
  | "application_submitted"
  | "assessment_detected"
  | "interview_detected"
  | "offer_detected"
  | "rejection_detected";

const SEND_COOLDOWN_MS = 15 * 60 * 1000;
const sent = new Map<string, number>();

function sourceWebsite(): string {
  return window.location.hostname || "unknown";
}

function currentPageUrl(): string {
  return window.location.href.split("#")[0];
}

function eventKey(type: string): string {
  return `${type}:${currentPageUrl()}`;
}

function canSend(type: string): boolean {
  const key = eventKey(type);
  const now = Date.now();
  const last = sent.get(key) || 0;
  if (now - last < SEND_COOLDOWN_MS) return false;
  sent.set(key, now);
  return true;
}

function visibleText(): string {
  return (document.body?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 5000);
}

function hasLikelyJobContext(): boolean {
  const haystack = `${window.location.hostname} ${window.location.pathname} ${document.title}`.toLowerCase();
  return /job|career|greenhouse|lever|workday|seek|linkedin|indeed|trademe|smartrecruiters|ashby|bamboohr/.test(haystack);
}

function tryExtractJob(status: ApplicationStatus): JobSavePayload | null {
  try {
    return { ...extractJobFromPage(), status };
  } catch {
    const title = document.title.split(/[|\-–]/)[0]?.trim();
    if (!title || !hasLikelyJobContext()) return null;
    return {
      title,
      company: null,
      location: null,
      description: visibleText(),
      salary: null,
      url: currentPageUrl(),
      source_website: sourceWebsite(),
      posted_date: null,
      status,
    };
  }
}

function statusForEvent(type: TrackEventType): ApplicationStatus {
  if (type === "job_viewed") return "Viewed";
  if (type === "assessment_detected") return "Assessment";
  if (type === "interview_detected") return "Interview";
  if (type === "offer_detected") return "Offer";
  if (type === "rejection_detected") return "Rejected";
  return "Applied";
}

function sendEvent(type: TrackEventType, metadata: Record<string, unknown> = {}): void {
  if (!canSend(type)) return;
  const status = statusForEvent(type);
  const job = tryExtractJob(status);
  if (!job) return;
  chrome.runtime.sendMessage(
    {
      type: "TRACK_EVENT",
      payload: {
        event_type: type,
        source: "extension",
        page_url: currentPageUrl(),
        status,
        job,
        metadata: {
          title: document.title,
          hostname: window.location.hostname,
          pathname: window.location.pathname,
          ...metadata,
        },
      },
    },
    (_resp: BgResponse | undefined) => {
      /* Best-effort telemetry; the panel still surfaces explicit failures. */
      void chrome.runtime.lastError;
    },
  );
}

function isApplyLikeElement(el: Element): boolean {
  const signal = [
    el.textContent || "",
    el.getAttribute("aria-label") || "",
    el.getAttribute("title") || "",
    el.getAttribute("value") || "",
    el.getAttribute("name") || "",
    el.getAttribute("id") || "",
    el.getAttribute("href") || "",
    el.getAttribute("data-automation") || "",
    el.getAttribute("data-testid") || "",
    el.getAttribute("data-test") || "",
    el.getAttribute("data-qa") || "",
    el.getAttribute("data-cy") || "",
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .toLowerCase();

  if (/\b(save|saved|bookmark|favourite|favorite|share)\b/.test(signal)) return false;
  return /\b(quick apply|easy apply|apply now|apply for this job|apply on company site|apply|submit application|submit|send application)\b/.test(signal);
}

function formLooksLikeApplicationSubmit(form: HTMLFormElement): boolean {
  const signal = [
    form.textContent || "",
    form.getAttribute("aria-label") || "",
    form.getAttribute("name") || "",
    form.getAttribute("id") || "",
    ...Array.from(form.querySelectorAll("button, input[type='submit'], [role='button']")).map(
      (el) => `${el.textContent || ""} ${el.getAttribute("aria-label") || ""} ${el.getAttribute("value") || ""}`,
    ),
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .toLowerCase();

  return /\b(application|apply|submit application|send application)\b/.test(signal);
}

function detectOutcomeFromText(text: string): TrackEventType | null {
  const t = text.toLowerCase();
  if (/thank you for applying|application submitted|application received|we(?:'|’)ve received your application|your application has been sent/.test(t)) {
    return "application_submitted";
  }
  if (/interview invitation|schedule an interview|book an interview|interview with|invited to interview/.test(t)) {
    return "interview_detected";
  }
  if (/offer of employment|job offer|pleased to offer|offer letter/.test(t)) {
    return "offer_detected";
  }
  if (/unfortunately|not progress|not selected|unsuccessful|decided not to proceed|will not be moving forward/.test(t)) {
    return "rejection_detected";
  }
  if (/assessment|coding test|aptitude test|work sample|skills test/.test(t)) {
    return "assessment_detected";
  }
  return null;
}

function scanForOutcome(): void {
  if (!hasLikelyJobContext()) return;
  const outcome = detectOutcomeFromText(visibleText());
  if (outcome) sendEvent(outcome, { detector: "page_text" });
}

export function initApplicationActivityTracker(): void {
  window.setTimeout(() => sendEvent("job_viewed", { detector: "page_load" }), 1200);
  window.setTimeout(scanForOutcome, 1800);

  document.addEventListener(
    "click",
    (ev) => {
      const target = ev.target;
      if (!(target instanceof Element)) return;
      const clickable = target.closest("button, a, input[type='submit'], [role='button']");
      if (!clickable || !isApplyLikeElement(clickable)) return;
      const label = (clickable.textContent || clickable.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
      sendEvent("application_submitted", { detector: "apply_click", label });
      window.setTimeout(scanForOutcome, 2500);
    },
    true,
  );

  document.addEventListener(
    "submit",
    (ev) => {
      const form = ev.target;
      if (!(form instanceof HTMLFormElement) || !formLooksLikeApplicationSubmit(form)) return;
      sendEvent("application_submitted", { detector: "form_submit" });
      window.setTimeout(scanForOutcome, 2500);
    },
    true,
  );

  const observer = new MutationObserver(() => scanForOutcome());
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }
}
