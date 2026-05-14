import { applyAutofillToPage, type AutofillProfile } from "./autofill";
import { extractJobFromPage } from "./extraction/generic";
import { initEasyJobPageHost, toggleEasyJobPageHost } from "./pageHost/inject";
import { initSeekNativeSaveOnClick } from "./seekNativeSave";

initSeekNativeSaveOnClick();
initEasyJobPageHost();

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "EASYJOB_TOGGLE_UI") {
    toggleEasyJobPageHost();
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
      const data = applyAutofillToPage(profile);
      sendResponse({ ok: true, data });
    } catch (e) {
      sendResponse({ ok: false, error: (e as Error).message });
    }
    return true;
  }
  return false;
});
