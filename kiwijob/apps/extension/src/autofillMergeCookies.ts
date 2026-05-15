import type { ApplicantAutofillProfile } from "@kiwijob/shared";

function decodeCookieValue(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  try {
    return decodeURIComponent(t.replace(/\+/g, " "));
  } catch {
    return t;
  }
}

function normCookieName(name: string): string {
  return name.toLowerCase().replace(/[-_]/g, "");
}

/**
 * Fills gaps in the API profile using first-party cookie name/value heuristics
 * (Chrome exposes only non–httpOnly cookies to extensions).
 */
export function mergeApplicantProfileWithCookies(
  base: ApplicantAutofillProfile,
  cookies: chrome.cookies.Cookie[],
): ApplicantAutofillProfile {
  const out: ApplicantAutofillProfile = { ...base };
  let first = "";
  let last = "";

  for (const c of cookies) {
    const val = decodeCookieValue(c.value || "");
    if (!val) continue;
    const key = normCookieName(c.name);

    if (!out.email && (key === "email" || key.endsWith("email") || key === "useremail")) {
      if (val.includes("@")) out.email = val;
      continue;
    }
    if (!out.phone && (key.includes("phone") || key.includes("mobile") || key.includes("cell") || key === "tel")) {
      out.phone = val;
      continue;
    }
    if (!out.linkedInUrl && (key.includes("linkedin") || key === "inurl")) {
      if (val.includes("linkedin") || val.startsWith("http")) out.linkedInUrl = val;
      continue;
    }
    if (!out.portfolioUrl && (key.includes("website") || key.includes("portfolio") || key === "url" || key === "homepage")) {
      if (val.startsWith("http")) out.portfolioUrl = val;
      continue;
    }
    if (!out.city && key.includes("city") && !key.includes("company")) {
      out.city = val;
      continue;
    }
    if (!out.country && (key.includes("country") || key === "nation")) {
      out.country = val;
      continue;
    }
    if (!out.fullName && (key === "name" || key === "fullname" || key === "displayname")) {
      out.fullName = val;
      continue;
    }
    if (key === "firstname" || key === "fname" || key === "givenname") first = val;
    if (key === "lastname" || key === "lname" || key === "surname" || key === "familyname") last = val;
  }

  if (!out.fullName.trim() && (first || last)) {
    out.fullName = [first, last].filter(Boolean).join(" ").trim();
  }

  return out;
}
