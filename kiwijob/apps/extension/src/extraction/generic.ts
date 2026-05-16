import type { JobSavePayload } from "@kiwijob/shared";
import { isLinkedInJobViewUrl } from "./linkedin";
import { isSeekHost, seekHasExtractableJobView } from "./seek";
import { siteExtractors } from "./registry";

function text(el: Element | null | undefined): string | null {
  const t = el?.textContent?.trim();
  return t && t.length ? t : null;
}

function jsonLdTypeMatches(types: unknown, needle: string): boolean {
  if (types === needle) return true;
  if (Array.isArray(types)) return types.includes(needle);
  return false;
}

function flattenJsonLdValue(data: unknown, out: Record<string, unknown>[]): void {
  if (data == null) return;
  if (Array.isArray(data)) {
    for (const item of data) flattenJsonLdValue(item, out);
    return;
  }
  if (typeof data !== "object") return;
  const o = data as Record<string, unknown>;
  const graph = o["@graph"];
  if (Array.isArray(graph)) {
    for (const item of graph) flattenJsonLdValue(item, out);
    return;
  }
  out.push(o);
}

function collectJsonLdObjects(): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      const raw = script.textContent?.trim();
      if (!raw) continue;
      flattenJsonLdValue(JSON.parse(raw), out);
    } catch {
      /* skip invalid JSON */
    }
  }
  return out;
}

function orgNameFromJsonLd(org: unknown): string | null {
  if (org == null) return null;
  if (typeof org === "string") return org.trim() || null;
  if (Array.isArray(org)) return orgNameFromJsonLd(org[0]);
  if (typeof org !== "object") return null;
  const o = org as Record<string, unknown>;
  if (typeof o.name === "string" && o.name.trim()) return o.name.trim();
  return null;
}

function formatJsonLdPostalAddress(address: unknown): string | null {
  if (address == null) return null;
  if (typeof address === "string") return address.trim() || null;
  if (typeof address !== "object") return null;
  const a = address as Record<string, unknown>;
  const loc = typeof a.addressLocality === "string" ? a.addressLocality.trim() : "";
  const region = typeof a.addressRegion === "string" ? a.addressRegion.trim() : "";
  const parts = [loc, region].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function formatJsonLdJobLocation(jobLocation: unknown): string | null {
  if (jobLocation == null) return null;
  if (typeof jobLocation === "string") return jobLocation.trim() || null;
  if (Array.isArray(jobLocation)) {
    const parts = jobLocation.map(formatJsonLdJobLocation).filter((x): x is string => Boolean(x?.trim()));
    return parts.length ? parts.join(" · ") : null;
  }
  if (typeof jobLocation !== "object") return null;
  const loc = jobLocation as Record<string, unknown>;
  if (jsonLdTypeMatches(loc["@type"], "Place")) {
    const name = typeof loc.name === "string" ? loc.name.trim() : "";
    const addr = formatJsonLdPostalAddress(loc.address);
    if (name && addr) return `${name} (${addr})`;
    return addr || name || null;
  }
  if (loc.address) return formatJsonLdPostalAddress(loc.address);
  return typeof loc.name === "string" ? loc.name.trim() || null : null;
}

function collectUrlsFromJsonLdField(v: unknown): string[] {
  if (v == null) return [];
  if (typeof v === "string") return v.trim() ? [v.trim()] : [];
  if (Array.isArray(v)) return v.flatMap(collectUrlsFromJsonLdField);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return [...collectUrlsFromJsonLdField(o.url), ...collectUrlsFromJsonLdField(o["@id"])];
  }
  return [];
}

/** When a page embeds several JobPostings (e.g. Trade Me “similar jobs”), pick the one for this URL. */
function jobPostingMatchesCurrentPage(node: Record<string, unknown>): boolean {
  const hereFull = window.location.href.split("#")[0];
  const herePath = window.location.pathname;
  const listingId = herePath.match(/\/listing\/(\d+)/i)?.[1];
  for (const u of collectUrlsFromJsonLdField(node.url)) {
    try {
      const abs = new URL(u, window.location.origin).href.split("#")[0];
      if (abs === hereFull || abs.split("?")[0] === hereFull.split("?")[0]) return true;
      const p = new URL(u, window.location.origin).pathname;
      if (p && (p === herePath || herePath.endsWith(p) || p.endsWith(herePath))) return true;
    } catch {
      /* ignore */
    }
  }
  if (listingId) {
    try {
      if (JSON.stringify(node).includes(listingId)) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

function jobPostingNodesForPage(): Record<string, unknown>[] {
  const all: Record<string, unknown>[] = [];
  for (const node of collectJsonLdObjects()) {
    if (!jsonLdTypeMatches(node["@type"], "JobPosting")) continue;
    all.push(node);
  }
  if (all.length <= 1) return all;
  const matched = all.filter(jobPostingMatchesCurrentPage);
  return matched.length ? matched : [];
}

/** Prefer structured JobPosting (SEEK, many career sites) over og:title / og:site_name. */
function tryJobPostingJsonLd(): Partial<JobSavePayload> | null {
  for (const node of jobPostingNodesForPage()) {
    const title = typeof node.title === "string" ? node.title.trim() : "";
    const company = orgNameFromJsonLd(node.hiringOrganization);
    const location = formatJsonLdJobLocation(node.jobLocation);
    let description: string | undefined;
    if (typeof node.description === "string") {
      const stripped = node.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (stripped.length > 80) description = stripped.slice(0, 50000);
    }
    const posted = typeof node.datePosted === "string" ? node.datePosted.trim() : "";
    if (!title && !company && !location && !description) continue;
    const out: Partial<JobSavePayload> = {};
    if (title) out.title = title;
    if (company) out.company = company;
    if (location) out.location = location;
    if (description) out.description = description;
    if (posted) out.posted_date = posted;
    return out;
  }
  return null;
}

function pickH1JobTitle(): string | null {
  const path = window.location.pathname;
  const href = window.location.href;
  if (!/\/job\b|\/jobs\/view\/|\/viewjob\b/i.test(`${path}${href}`)) return null;
  return (
    text(document.querySelector('[data-automation="job-detail-title"]')) ||
    text(document.querySelector("article h1")) ||
    text(document.querySelector("main h1")) ||
    text(document.querySelector("h1"))
  );
}

function pickTitle(): string | null {
  const h1 = pickH1JobTitle();
  if (h1 && h1.length < 280) return h1;
  const og = document.querySelector('meta[property="og:title"]')?.getAttribute("content")?.trim();
  if (og) return og;
  const tw = document.querySelector('meta[name="twitter:title"]')?.getAttribute("content")?.trim();
  if (tw) return tw;
  const t = document.querySelector("title")?.textContent?.trim();
  if (t) return t.split(/[|\-–]/)[0]?.trim() || t;
  return text(document.querySelector("h1"));
}

function pickCompany(): string | null {
  const name = document.querySelector(
    '[data-testid="jobsearch-CompanyName"], .jobs-unified-top-card__company-name, .job-details-jobs-unified-top-card__company-name, a[data-control-name="job_card_company_link"]',
  );
  const fromDom = text(name);
  if (fromDom) return fromDom;
  const og = document.querySelector('meta[property="og:site_name"]')?.getAttribute("content")?.trim();
  if (og && !/seek/i.test(window.location.hostname)) {
    if (isLinkedInJobViewUrl(window.location.hostname, window.location.pathname) && /^linkedin$/i.test(og)) {
      return null;
    }
    return og;
  }
  return null;
}

function pickLocation(): string | null {
  const loc = document.querySelector(
    '[data-testid="job-location"], .job-details-jobs-unified-top-card__primary-description-container, .job-details-jobs-unified-top-card__bullet, .jobs-unified-top-card__bullet, .jobs-unified-top-card__workplace-type',
  );
  const s = text(loc);
  return s ? s.replace(/\s*·\s*/g, " · ").trim() : null;
}

function pickDescription(): string | null {
  const og = document.querySelector('meta[property="og:description"]')?.getAttribute("content")?.trim();
  if (og && og.length > 80) return og;
  const article = document.querySelector("article");
  if (article && (article.textContent?.length ?? 0) > 200) return article.textContent!.trim().slice(0, 20000);
  const desc = document.querySelector(
    '#job-details, [data-testid="jobsearch-JobComponent-description"], .jobs-description-content__text, .description__text, .job-description',
  );
  const t = text(desc);
  if (t && t.length > 80) return t.slice(0, 20000);
  const main = document.querySelector("main");
  const mt = text(main);
  if (mt && mt.length > 200) return mt.slice(0, 20000);
  return null;
}

function pickSalary(): string | null {
  const el = document.querySelector('[data-testid="job-salary"], .salary-snippet, .compensation__text');
  return text(el);
}

function pickPostedDate(): string | null {
  const time = document.querySelector("time[datetime]")?.getAttribute("datetime")?.trim();
  if (time) return time;
  return null;
}

function extractVisaRequirement(text: string | null | undefined): string | null {
  const raw = (text || "").replace(/\s+/g, " ").trim();
  if (!raw) return null;
  const patterns = [
    /(?:must|need|required|requires?|eligible|eligibility)[^.]{0,120}(?:work rights?|right to work|work authori[sz]ation|visa|citizen|resident|permanent resident|nz resident|new zealand resident)[^.]{0,160}\./i,
    /(?:work rights?|right to work|work authori[sz]ation|visa sponsorship|sponsorship|citizen|resident|permanent resident|nz resident|new zealand resident)[^.]{0,180}\./i,
    /(?:applicants?|candidates?)[^.]{0,120}(?:must|need|required)[^.]{0,160}(?:visa|work rights?|right to work|citizen|resident)[^.]{0,120}\./i,
  ];
  for (const pattern of patterns) {
    const hit = raw.match(pattern)?.[0]?.trim();
    if (hit && /work|visa|citizen|resident|sponsor/i.test(hit)) return hit.slice(0, 500);
  }
  const lower = raw.toLowerCase();
  if (/(visa sponsorship|not sponsor|unable to sponsor|must have.*right to work|must be.*citizen|must be.*resident)/i.test(raw)) {
    const idx = Math.max(
      0,
      Math.min(
        ...["visa", "sponsor", "right to work", "citizen", "resident"]
          .map((needle) => lower.indexOf(needle))
          .filter((i) => i >= 0),
      ) - 120,
    );
    return raw.slice(idx, idx + 420).trim();
  }
  return null;
}

function hostnameSource(): string {
  return window.location.hostname || "unknown";
}

function fallbackBodyText(): string {
  const selection = window.getSelection()?.toString().trim();
  if (selection && selection.length > 80) return selection.slice(0, 20000);
  const body = document.body?.innerText?.trim() ?? "";
  return body.slice(0, 20000);
}

/**
 * Generic DOM-first extraction with a safe fallback to visible page text.
 * Site-specific extractors can layer on top via `siteExtractors`.
 */
export function extractJobFromPage(): JobSavePayload {
  let merged = genericExtract();
  for (const ex of siteExtractors) {
    const partial = ex.tryExtract();
    if (!partial || !Object.keys(partial).length) continue;
    merged = {
      ...merged,
      ...partial,
      url: partial.url || merged.url,
      title: partial.title || merged.title,
      company: partial.company ?? merged.company,
      location: partial.location ?? merged.location,
      description: partial.description ?? merged.description,
      salary: partial.salary ?? merged.salary,
      visa_requirement: partial.visa_requirement ?? merged.visa_requirement,
      posted_date: partial.posted_date ?? merged.posted_date,
      source_website: partial.source_website ?? merged.source_website,
    };
  }
  return normalizePayload(merged);
}

function isSeekBrowseNotJobAd(): boolean {
  if (!isSeekHost(window.location.hostname)) return false;
  if (seekHasExtractableJobView()) return false;
  return true;
}

function genericExtract(): JobSavePayload {
  if (isSeekBrowseNotJobAd()) {
    return {
      title: "Open one SEEK job posting",
      company: null,
      location: null,
      description:
        "This SEEK page does not show a single job yet. Open a job (URL contains /job/ or /jobs/… with an ad id, or use the list + right-hand detail panel), then click Re-scan.",
      salary: null,
      visa_requirement: null,
      url: window.location.href,
      source_website: hostnameSource(),
      posted_date: null,
      status: "Saved",
    };
  }
  const jd = tryJobPostingJsonLd();
  const title = jd?.title || pickTitle() || "Untitled role";
  const description = (jd?.description ?? pickDescription()) || fallbackBodyText();
  const visaRequirement = extractVisaRequirement(description);
  return {
    title,
    company: jd?.company ?? pickCompany(),
    location: jd?.location ?? pickLocation(),
    description,
    salary: pickSalary(),
    visa_requirement: visaRequirement,
    url: window.location.href,
    source_website: hostnameSource(),
    posted_date: jd?.posted_date ?? pickPostedDate(),
    status: "Saved",
  };
}

function normalizePayload(p: JobSavePayload): JobSavePayload {
  return {
    ...p,
    title: (p.title || "Untitled role").trim().slice(0, 500),
    url: p.url || window.location.href,
    source_website: (p.source_website || hostnameSource()).slice(0, 200),
    description: (p.description || "").slice(0, 50000),
    visa_requirement: p.visa_requirement ? p.visa_requirement.trim().slice(0, 1000) : null,
  };
}
