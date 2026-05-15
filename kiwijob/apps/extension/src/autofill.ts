/**
 * Heuristic application-form autofill for common ATS / career-site forms.
 * Sets native values and dispatches input/change for many React / Vue controlled fields.
 */

import type { ApplicantAutofillProfile } from "@kiwijob/shared";
import { EMPTY_APPLICANT_AUTOFILL_PROFILE } from "@kiwijob/shared";

export type AutofillProfile = ApplicantAutofillProfile;
export const EMPTY_AUTOFILL_PROFILE = EMPTY_APPLICANT_AUTOFILL_PROFILE;

export type AutofillSettings = {
  aiUniqueQuestions: boolean;
  continuous: boolean;
  fields: {
    basic: boolean;
    contact: boolean;
    links: boolean;
    location: boolean;
    workAuthorization: boolean;
    salary: boolean;
    skills: boolean;
    coverLetter: boolean;
  };
};

export const DEFAULT_AUTOFILL_SETTINGS: AutofillSettings = {
  aiUniqueQuestions: true,
  continuous: false,
  fields: {
    basic: true,
    contact: true,
    links: true,
    location: true,
    workAuthorization: true,
    salary: true,
    skills: false,
    coverLetter: true,
  },
};

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

function words(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
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

function readableHaystack(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
  const bits = [
    el.id,
    el.getAttribute("name"),
    el.getAttribute("autocomplete"),
    el.getAttribute("placeholder"),
    el.getAttribute("aria-label"),
  ];
  if (el.id) {
    const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (lab?.textContent) bits.push(lab.textContent);
  }
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    for (const id of labelledBy.split(/\s+/)) {
      const lab = document.getElementById(id);
      if (lab?.textContent) bits.push(lab.textContent);
    }
  }
  const nearby = el.closest("label, fieldset, [role='group'], div, section");
  if (nearby?.textContent) bits.push(nearby.textContent.slice(0, 500));
  return words(bits.filter(Boolean).join(" "));
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

function optionLooksLike(opt: HTMLOptionElement, want: string): boolean {
  const v = words(opt.value);
  const t = words(opt.textContent);
  return Boolean(want && (v === want || t === want || v.includes(want) || t.includes(want) || want.includes(t)));
}

function trySelectText(sel: HTMLSelectElement, value: string): boolean {
  const want = words(value);
  if (!want) return false;
  const opts = Array.from(sel.options);
  const hit = opts.find((o) => optionLooksLike(o, want));
  if (!hit) return false;
  sel.focus();
  sel.value = hit.value;
  sel.dispatchEvent(new Event("input", { bubbles: true }));
  sel.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function yesNoFromProfile(prompt: string, profile: AutofillProfile): string | null {
  if (/sponsor|sponsorship|visa/i.test(prompt) && trim(profile.sponsorship)) return profile.sponsorship;
  if (/authori[sz]ed|right to work|eligible to work|work permit/i.test(prompt) && trim(profile.workAuthorization)) {
    return profile.workAuthorization;
  }
  return null;
}

function answerUniqueQuestion(prompt: string, profile: AutofillProfile, settings: AutofillSettings): string | null {
  if (!settings.aiUniqueQuestions) return null;
  if (settings.fields.salary && /salary|compensation|pay expectation|expected pay|rate/i.test(prompt)) {
    return trim(profile.salaryExpectation) || null;
  }
  if (settings.fields.workAuthorization) {
    const yn = yesNoFromProfile(prompt, profile);
    if (yn) return yn;
  }
  if (settings.fields.skills && /skill|technology|tools|stack|language|framework/i.test(prompt)) {
    return trim(profile.skills) || null;
  }
  if (/notice|start date|available|availability/i.test(prompt)) return trim(profile.noticePeriod) || null;
  if (settings.fields.coverLetter && /cover letter|why.*(role|company)|motivation|tell us about yourself|additional information/i.test(prompt)) {
    return trim(profile.coverLetter) || trim(profile.summary) || null;
  }
  if (/summary|bio|profile|about you/i.test(prompt)) return trim(profile.summary) || null;
  return null;
}

function mergeSettings(settings?: Partial<AutofillSettings>): AutofillSettings {
  return {
    ...DEFAULT_AUTOFILL_SETTINGS,
    ...(settings || {}),
    fields: { ...DEFAULT_AUTOFILL_SETTINGS.fields, ...(settings?.fields || {}) },
  };
}

/**
 * Walk inputs/textareas/selects and fill matching fields. Returns human-readable field labels filled.
 */
export function applyAutofillToPage(profile: AutofillProfile, rawSettings?: Partial<AutofillSettings>): AutofillResult {
  const settings = mergeSettings(rawSettings);
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
    const prompt = readableHaystack(el);

    if (el instanceof HTMLSelectElement) {
      if (settings.fields.location && trim(profile.country) && (h.includes("country") || h.includes("nation"))) {
        if (trySelectCountry(el, profile.country)) filled.push("Country");
        continue;
      }
      if (settings.fields.location && trim(profile.city) && (h.includes("city") || h.includes("town"))) {
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
      if (settings.fields.workAuthorization && yesNoFromProfile(prompt, profile) && trySelectText(el, yesNoFromProfile(prompt, profile)!)) {
        filled.push("Work authorization");
        continue;
      }
      continue;
    }

    if (el instanceof HTMLInputElement) {
      const t = (el.type || "text").toLowerCase();
      if (t === "checkbox" || t === "radio") continue;

      if (settings.fields.contact && (t === "email" || h.includes("email") || el.getAttribute("autocomplete") === "email")) {
        const v = trim(profile.email);
        if (!v) {
          skippedEmpty.push("email");
          continue;
        }
        setNativeValue(el, v);
        filled.push("Email");
        continue;
      }

      if (
        settings.fields.contact &&
        (t === "tel" || h.includes("phone") || h.includes("mobile") || h.includes("cell") || el.getAttribute("autocomplete") === "tel")
      ) {
        const v = trim(profile.phone);
        if (!v) {
          skippedEmpty.push("phone");
          continue;
        }
        setNativeValue(el, v);
        filled.push("Phone");
        continue;
      }

      if (settings.fields.links && (h.includes("linkedin") || h.includes("linked-in"))) {
        const v = trim(profile.linkedInUrl);
        if (!v) {
          skippedEmpty.push("LinkedIn");
          continue;
        }
        setNativeValue(el, v);
        filled.push("LinkedIn");
        continue;
      }

      if (settings.fields.links && h.includes("github")) {
        const v = trim(profile.githubUrl) || trim(profile.portfolioUrl);
        if (!v) {
          skippedEmpty.push("GitHub");
          continue;
        }
        setNativeValue(el, v);
        filled.push("GitHub");
        continue;
      }

      if (settings.fields.links && (h.includes("portfolio") || h.includes("website") || h.includes("personalurl"))) {
        const v = trim(profile.portfolioUrl) || trim(profile.githubUrl);
        if (!v) {
          skippedEmpty.push("website");
          continue;
        }
        setNativeValue(el, v);
        filled.push("Website");
        continue;
      }

      if (settings.fields.links && t === "url") {
        const po = trim(profile.portfolioUrl);
        const gh = trim(profile.githubUrl);
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
        if (gh) {
          setNativeValue(el, gh);
          filled.push("GitHub");
          continue;
        }
        skippedEmpty.push("URL");
        continue;
      }

      if (settings.fields.basic && (el.getAttribute("autocomplete") === "given-name" || h.includes("firstname") || h.includes("fname"))) {
        const v = first;
        if (!v) {
          skippedEmpty.push("first name");
          continue;
        }
        setNativeValue(el, v);
        filled.push("First name");
        continue;
      }

      if (
        settings.fields.basic &&
        (el.getAttribute("autocomplete") === "family-name" || h.includes("lastname") || h.includes("lname") || h.includes("surname"))
      ) {
        const v = last || first;
        if (!v) {
          skippedEmpty.push("last name");
          continue;
        }
        setNativeValue(el, v);
        filled.push("Last name");
        continue;
      }

      if (settings.fields.location && h.includes("city") && !h.includes("companycity")) {
        const v = trim(profile.city);
        if (!v) continue;
        setNativeValue(el, v);
        filled.push("City");
        continue;
      }

      const acName = el.getAttribute("autocomplete");
      const nameAttr = norm(el.getAttribute("name"));
      if (
        settings.fields.basic &&
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

      if (settings.fields.salary && /salary|compensation|pay|rate/.test(h)) {
        const v = trim(profile.salaryExpectation);
        if (!v) {
          skippedEmpty.push("salary");
          continue;
        }
        setNativeValue(el, v);
        filled.push("Salary");
        continue;
      }

      if (settings.fields.workAuthorization && /authori[sz]|sponsor|visa|righttowork|eligible/.test(h)) {
        const v = yesNoFromProfile(prompt, profile);
        if (!v) {
          skippedEmpty.push("work authorization");
          continue;
        }
        setNativeValue(el, v);
        filled.push("Work authorization");
        continue;
      }

      if (settings.fields.skills && /skill|technology|stack|framework|programminglanguage/.test(h)) {
        const v = trim(profile.skills);
        if (!v) {
          skippedEmpty.push("skills");
          continue;
        }
        setNativeValue(el, v);
        filled.push("Skills");
        continue;
      }
    }

    if (el instanceof HTMLTextAreaElement) {
      const answer = answerUniqueQuestion(prompt, profile, settings);
      if (answer) {
        setNativeValue(el, answer);
        filled.push(prompt.includes("cover") ? "Cover letter" : "Question");
        continue;
      }
    }
  }

  if (settings.continuous) {
    window.setTimeout(() => {
      const next = applyAutofillToPage(profile, { ...settings, continuous: false });
      if (next.filled.length) {
        document.dispatchEvent(new CustomEvent("kiwijob:autofill-pass", { detail: next }));
      }
    }, 1200);
  }

  const dedup = [...new Set(filled)];
  return { filled: dedup, skippedEmpty: [...new Set(skippedEmpty)] };
}
