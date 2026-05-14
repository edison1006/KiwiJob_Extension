import { extractJobFromPage } from "./extraction/generic";
import { initSeekNativeSaveOnClick } from "./seekNativeSave";

initSeekNativeSaveOnClick();

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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
