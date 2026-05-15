import { applyAutofillToPage, type AutofillProfile } from "./autofill";
import { initApplicationActivityTracker } from "./activityTracker";
import { extractJobFromPage } from "./extraction/generic";
import { initKiwiJobPageHost, toggleKiwiJobPageHost } from "./pageHost/inject";
import { initSeekNativeSaveOnClick } from "./seekNativeSave";

initSeekNativeSaveOnClick();
initApplicationActivityTracker();
initKiwiJobPageHost();

let lastJobSignature = "";
let notifyTimer: number | undefined;

function jobSignature(payload: ReturnType<typeof extractJobFromPage>): string {
  return [payload.url, payload.title, payload.company || "", payload.location || ""].join("||");
}

function notifyJobChanged(): void {
  window.clearTimeout(notifyTimer);
  notifyTimer = window.setTimeout(() => {
    try {
      const payload = extractJobFromPage();
      const sig = jobSignature(payload);
      if (sig === lastJobSignature) return;
      lastJobSignature = sig;
      chrome.runtime.sendMessage({ type: "KIWIJOB_JOB_CHANGED", payload }).catch(() => {});
    } catch {
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
