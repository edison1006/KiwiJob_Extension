/**
 * Heuristic application-form autofill for common ATS / career-site forms.
 * Sets native values and dispatches input/change for many React / Vue controlled fields.
 */

import type { ApplicantAutofillProfile } from "@easyjob/shared";
import { EMPTY_APPLICANT_AUTOFILL_PROFILE } from "@easyjob/shared";

export type AutofillProfile = ApplicantAutofillProfile;
export const EMPTY_AUTOFILL_PROFILE = EMPTY_APPLICANT_AUTOFILL_PROFILE;

export type AutofillResult = {
  filled: string[];
  skippedEmpty: string[];
};

function trim(s: string): string {
  return s.trim();
}

function nameParts(fullName: string): { first: string; last: string } {
  const p = trim(fullName).split(/\s+/).filter(Boolean);
  if (!p.length) return { first: "", last: "" };
  if (p.length === 1) return { first: p[0], last: "" };
  return { first: p[0], last: p.slice(1).join(" ") };
}

function isVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  if (el.closest("[hidden], [aria-hidden='true']")) return false;
  const s = getComputedStyle(el);
  if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 && r.height < 2) return false;
  return true;
}

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[_\s-]+/g, "");
}

function haystack(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
  const id = norm(el.id);
  const name = norm(el.getAttribute("name"));
  const ac = norm(el.getAttribute("autocomplete"));
  const ph = norm(el.getAttribute("placeholder"));
  let label = "";
  if (el.id) {
    const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (lab) label = norm(lab.textContent);
  }
  const aria = norm(el.getAttribute("aria-label"));
  return `${id} ${name} ${ac} ${ph} ${label} ${aria}`;
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const v = value.length > 8000 ? value.slice(0, 8000) : value;
  const max = el.getAttribute("maxlength");
  if (max && /^\d+$/.test(max)) {
    const n = parseInt(max, 10);
    if (Number.isFinite(n) && v.length > n) {
      el.focus();
      el.value = v.slice(0, n);
    } else {
      el.focus();
      el.value = v;
    }
  } else {
    el.focus();
    el.value = v;
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function trySelectCountry(sel: HTMLSelectElement, country: string): boolean {
  const want = trim(country).toLowerCase();
  if (!want) return false;
  const opts = Array.from(sel.options);
  let hit = opts.find((o) => o.value.toLowerCase() === want);
  if (!hit) hit = opts.find((o) => o.textContent?.trim().toLowerCase() === want);
  if (!hit) hit = opts.find((o) => o.textContent?.toLowerCase().includes(want) || o.value.toLowerCase().includes(want));
  if (!hit) return false;
  sel.focus();
  sel.value = hit.value;
  sel.dispatchEvent(new Event("input", { bubbles: true }));
  sel.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

/**
 * Walk inputs/textareas/selects and fill matching fields. Returns human-readable field labels filled.
 */
export function applyAutofillToPage(profile: AutofillProfile): AutofillResult {
  const filled: string[] = [];
  const skippedEmpty: string[] = [];
  const { first, last } = nameParts(profile.fullName);

  const candidates = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="image"]):not([type="reset"]):not([type="file"]):not([type="password"]), textarea, select',
  );

  for (const el of Array.from(candidates)) {
    if (
      !(el instanceof HTMLInputElement) &&
      !(el instanceof HTMLTextAreaElement) &&
      !(el instanceof HTMLSelectElement)
    ) {
      continue;
    }
    if (!isVisible(el)) continue;
    if (el.disabled) continue;
    if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.readOnly) continue;

    const h = haystack(el);

    if (el instanceof HTMLSelectElement) {
      if (trim(profile.country) && (h.includes("country") || h.includes("nation"))) {
        if (trySelectCountry(el, profile.country)) filled.push("Country");
        continue;
      }
      if (trim(profile.city) && (h.includes("city") || h.includes("town"))) {
        const want = trim(profile.city).toLowerCase();
        const opts = Array.from(el.options);
        const hit = opts.find((o) => o.textContent?.toLowerCase().includes(want) || o.value.toLowerCase().includes(want));
        if (hit) {
          el.focus();
          el.value = hit.value;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          filled.push("City");
        }
        continue;
      }
      continue;
    }

    if (el instanceof HTMLInputElement) {
      const t = (el.type || "text").toLowerCase();
      if (t === "checkbox" || t === "radio") continue;

      if (t === "email" || h.includes("email") || el.getAttribute("autocomplete") === "email") {
        const v = trim(profile.email);
        if (!v) {
          skippedEmpty.push("email");
          continue;
        }
        setNativeValue(el, v);
        filled.push("Email");
        continue;
      }

      if (t === "tel" || h.includes("phone") || h.includes("mobile") || h.includes("cell") || el.getAttribute("autocomplete") === "tel") {
        const v = trim(profile.phone);
        if (!v) {
          skippedEmpty.push("phone");
          continue;
        }
        setNativeValue(el, v);
        filled.push("Phone");
        continue;
      }

      if (h.includes("linkedin") || h.includes("linked-in")) {
        const v = trim(profile.linkedInUrl);
        if (!v) {
          skippedEmpty.push("LinkedIn");
          continue;
        }
        setNativeValue(el, v);
        filled.push("LinkedIn");
        continue;
      }

      if (h.includes("portfolio") || h.includes("website") || h.includes("personalurl") || h.includes("github")) {
        const v = trim(profile.portfolioUrl);
        if (!v) {
          skippedEmpty.push("website");
          continue;
        }
        setNativeValue(el, v);
        filled.push("Website");
        continue;
      }

      if (t === "url") {
        const po = trim(profile.portfolioUrl);
        const li = trim(profile.linkedInUrl);
        if (po) {
          setNativeValue(el, po);
          filled.push("Website");
          continue;
        }
        if (li) {
          setNativeValue(el, li);
          filled.push("LinkedIn");
          continue;
        }
        skippedEmpty.push("URL");
        continue;
      }

      if (el.getAttribute("autocomplete") === "given-name" || h.includes("firstname") || h.includes("fname")) {
        const v = first;
        if (!v) {
          skippedEmpty.push("first name");
          continue;
        }
        setNativeValue(el, v);
        filled.push("First name");
        continue;
      }

      if (el.getAttribute("autocomplete") === "family-name" || h.includes("lastname") || h.includes("lname") || h.includes("surname")) {
        const v = last || first;
        if (!v) {
          skippedEmpty.push("last name");
          continue;
        }
        setNativeValue(el, v);
        filled.push("Last name");
        continue;
      }

      if (h.includes("city") && !h.includes("companycity")) {
        const v = trim(profile.city);
        if (!v) continue;
        setNativeValue(el, v);
        filled.push("City");
        continue;
      }

      const acName = el.getAttribute("autocomplete");
      const nameAttr = norm(el.getAttribute("name"));
      if (
        t === "text" &&
        (acName === "name" ||
          nameAttr === "name" ||
          nameAttr === "fullname" ||
          nameAttr === "full_name" ||
          nameAttr === "applicantname" ||
          nameAttr === "candidate_name" ||
          (nameAttr.includes("yourname") && !nameAttr.includes("company")))
      ) {
        const v = trim(profile.fullName);
        if (!v) {
          skippedEmpty.push("full name");
          continue;
        }
        setNativeValue(el, v);
        filled.push("Full name");
        continue;
      }
    }

    if (el instanceof HTMLTextAreaElement) {
      if (h.includes("cover") || h.includes("letter") || h.includes("message") || h.includes("additionalinfo")) {
        /* optional: do not force cover letter from profile in MVP */
        continue;
      }
    }
  }

  const dedup = [...new Set(filled)];
  return { filled: dedup, skippedEmpty: [...new Set(skippedEmpty)] };
}
