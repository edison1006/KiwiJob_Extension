import { extractJobFromPage } from "./extraction/generic";

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
