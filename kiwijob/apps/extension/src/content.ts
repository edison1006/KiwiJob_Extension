import { applyAutofillToPage, type AutofillProfile } from "./autofill";
import { initApplicationActivityTracker } from "./activityTracker";
import { extractJobFromPage } from "./extraction/generic";
import { initKiwiJobPageHost, toggleKiwiJobPageHost } from "./pageHost/inject";
import { initSeekNativeSaveOnClick } from "./seekNativeSave";

initSeekNativeSaveOnClick();
initApplicationActivityTracker();
initKiwiJobPageHost();

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
