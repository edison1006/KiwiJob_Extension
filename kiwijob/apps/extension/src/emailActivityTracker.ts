import type { ApplicationStatus } from "@kiwijob/shared";
import type { BgResponse } from "./messages";

type EmailEventType = "email_reply" | "email_assessment" | "email_interview" | "email_offer" | "email_rejection";

const EMAIL_SEND_COOLDOWN_MS = 5 * 60 * 1000;
const sent = new Map<string, number>();

function isMailPage(): boolean {
  const host = window.location.hostname.toLowerCase();
  return host === "mail.google.com" || host === "outlook.live.com" || host === "outlook.office.com";
}

function sourceName(): string {
  const host = window.location.hostname.toLowerCase();
  if (host === "mail.google.com") return "gmail";
  if (host.includes("outlook")) return "outlook_email";
  return "email";
}

function visibleText(): string {
  return (document.body?.innerText || "").replace(/\s+/g, " ").trim();
}

function text(selector: string): string {
  return document.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim() || "";
}

function attr(selector: string, name: string): string {
  return document.querySelector(selector)?.getAttribute(name)?.trim() || "";
}

function detectEmailEvent(body: string): EmailEventType | null {
  const t = body.toLowerCase();
  if (/interview invitation|schedule an interview|book an interview|interview with|invited to interview|select a time/.test(t)) {
    return "email_interview";
  }
  if (/offer of employment|job offer|pleased to offer|offer letter|employment agreement/.test(t)) {
    return "email_offer";
  }
  if (/unfortunately|not progress|not selected|unsuccessful|decided not to proceed|will not be moving forward|pursue other candidates/.test(t)) {
    return "email_rejection";
  }
  if (/assessment|coding test|aptitude test|work sample|skills test|technical test|complete the test/.test(t)) {
    return "email_assessment";
  }
  if (/thank you for applying|we received your application|your application|regarding your application|recruitment|talent acquisition|hiring team|next step/.test(t)) {
    return "email_reply";
  }
  return null;
}

function statusForEvent(type: EmailEventType): ApplicationStatus {
  if (type === "email_interview") return "Interview";
  if (type === "email_offer") return "Offer";
  if (type === "email_rejection") return "Rejected";
  if (type === "email_assessment") return "Assessment";
  return "Reply";
}

function subjectFromPage(): string {
  return (
    text(".hP") ||
    text("[data-testid='message-subject']") ||
    document.title.replace(/\s+-\s+Gmail$/i, "").replace(/\s+-\s+Outlook$/i, "").trim()
  );
}

function senderFromPage(): string {
  return attr(".gD[email]", "email") || text(".gD") || attr("[email]", "email") || text("[data-testid='message-header']") || "";
}

function externalId(): string {
  return (
    attr("[data-legacy-message-id]", "data-legacy-message-id") ||
    attr("[data-message-id]", "data-message-id") ||
    `${window.location.href.split("#")[0]}:${subjectFromPage()}`
  );
}

function canSend(key: string): boolean {
  const now = Date.now();
  const last = sent.get(key) || 0;
  if (now - last < EMAIL_SEND_COOLDOWN_MS) return false;
  sent.set(key, now);
  return true;
}

function scanEmail(): void {
  if (!isMailPage()) return;
  const body = visibleText().slice(0, 8000);
  const type = detectEmailEvent(body);
  if (!type) return;
  const subject = subjectFromPage();
  const id = externalId();
  const key = `${type}:${id}`;
  if (!canSend(key)) return;
  chrome.runtime.sendMessage(
    {
      type: "TRACK_EVENT",
      payload: {
        event_type: type,
        source: sourceName(),
        page_url: window.location.href.split("#")[0],
        status: statusForEvent(type),
        metadata: {
          external_id: id,
          subject,
          sender: senderFromPage(),
          body_preview: body.slice(0, 2000),
          title: document.title,
          detector: "email_page_text",
        },
      },
    },
    (_resp: BgResponse | undefined) => {
      void chrome.runtime.lastError;
    },
  );
}

export function initEmailActivityTracker(): void {
  if (!isMailPage()) return;
  window.setTimeout(scanEmail, 1800);
  window.setInterval(scanEmail, 5000);
  if (document.body) {
    const observer = new MutationObserver(() => window.setTimeout(scanEmail, 500));
    observer.observe(document.body, { childList: true, subtree: true });
  }
}
