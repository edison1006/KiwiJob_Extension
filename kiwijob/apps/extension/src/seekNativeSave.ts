import { extractJobFromPage } from "./extraction/generic";
import { isSeekHost } from "./extraction/seek";
import type { BgResponse } from "./messages";

function isSeekJobDetailPath(): boolean {
  return /\/job\b/i.test(window.location.pathname);
}

/** SEEK job-ad primary Save (bookmark), not Quick apply or search filters. */
function isSeekJobSaveClickTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  const btn = target.closest("button");
  if (!btn) return false;

  const da = (btn.getAttribute("data-automation") || "").toLowerCase();
  if (da.includes("quick") || da.includes("apply")) return false;
  if (da.includes("savejob") || da.includes("save-job") || da.includes("job-save") || da.includes("favouritejob")) {
    return true;
  }

  const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
  if (aria.includes("save") && (aria.includes("job") || aria.includes("advert"))) return true;

  const text = (btn.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (text === "save") {
    const inMain = btn.closest("main, [role='main'], article");
    return Boolean(inMain);
  }
  return false;
}

let lastSaveAt = 0;
let lastSaveUrl = "";

function showToast(message: string, ok: boolean): void {
  const id = "kiwijob-native-save-toast";
  document.getElementById(id)?.remove();
  const div = document.createElement("div");
  div.id = id;
  const bg = ok ? "#ecfdf5" : "#fef2f2";
  const fg = ok ? "#065f46" : "#991b1b";
  const border = ok ? "#a7f3d0" : "#fecaca";
  div.setAttribute(
    "style",
    `position:fixed;top:16px;right:16px;z-index:2147483646;max-width:320px;padding:12px 14px;border-radius:10px;
    font:13px/1.35 system-ui,-apple-system,sans-serif;box-shadow:0 4px 24px rgba(0,0,0,.15);
    background:${bg};color:${fg};border:1px solid ${border};`,
  );
  div.textContent = message;
  document.body.appendChild(div);
  window.setTimeout(() => div.remove(), 5000);
}

/**
 * When the user clicks SEEK's native Save on a job ad, sync the listing to KiwiJob (same as side panel Save job).
 */
export function initSeekNativeSaveOnClick(): void {
  if (!isSeekHost(window.location.hostname)) return;

  document.addEventListener(
    "click",
    (ev: MouseEvent) => {
      if (!isSeekJobDetailPath()) return;
      if (!isSeekJobSaveClickTarget(ev.target)) return;

      const urlKey = window.location.href.split("#")[0].split("?")[0];
      const now = Date.now();
      if (now - lastSaveAt < 1800 && urlKey === lastSaveUrl) return;
      lastSaveAt = now;
      lastSaveUrl = urlKey;

      let payload: ReturnType<typeof extractJobFromPage>;
      try {
        payload = extractJobFromPage();
      } catch (e) {
        showToast(`KiwiJob: could not read job — ${(e as Error).message}`, false);
        return;
      }

      const body = { ...payload, status: "Saved" as const };
      chrome.runtime.sendMessage({ type: "SAVE_JOB", payload: body }, (resp: BgResponse | undefined) => {
        const err = chrome.runtime.lastError;
        if (err) {
          showToast(`KiwiJob: ${err.message}`, false);
          return;
        }
        if (!resp) {
          showToast("KiwiJob: no response from extension.", false);
          return;
        }
        if (!resp.ok) {
          showToast(`KiwiJob: ${resp.error}`, false);
          return;
        }
        const id = (resp.data as { id?: number })?.id;
        showToast(id != null ? `KiwiJob: saved (application #${id}).` : "KiwiJob: saved.", true);
      });
    },
    false,
  );
}
