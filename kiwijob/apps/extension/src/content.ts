import { extractJobFromPage } from "./extraction/generic";
import { initKiwiJobPageHost, toggleKiwiJobPageHost } from "./pageHost/inject";

initKiwiJobPageHost();

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
