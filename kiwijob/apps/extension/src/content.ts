import { extractJobFromPage } from "./extraction/generic";
import { initKiwiJobPageHost, toggleKiwiJobPageHost } from "./pageHost/inject";

initKiwiJobPageHost();

type DuplicateApplication = {
  status?: string;
  updated_at?: string;
};

let duplicateApplications: DuplicateApplication[] = [];
let duplicateCheckKey = "";
let duplicateCheckTimer: number | null = null;

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
    if (!(event.target instanceof Element) || !looksLikeApplyAction(event.target) || !duplicateApplications.length) return;
    const previous = duplicateApplications[0];
    const proceed = window.confirm(
      `KiwiJob shows that you already applied for this company and position${previous.status ? ` (status: ${previous.status})` : ""}. This may be a duplicate application. Apply again?`,
    );
    if (!proceed) {
      event.preventDefault();
      event.stopImmediatePropagation();
    } else {
      duplicateApplications = [];
    }
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
new MutationObserver(scheduleDuplicateCheck).observe(document.documentElement, { childList: true, subtree: true });

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
