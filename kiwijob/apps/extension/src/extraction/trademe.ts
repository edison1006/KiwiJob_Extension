import type { JobSavePayload } from "@kiwijob/shared";

import type { SiteExtractor } from "./types";

function t(el: Element | null | undefined): string | null {
  const s = el?.textContent?.trim().replace(/\s+/g, " ");
  return s && s.length ? s : null;
}

function firstTextIn(root: Element | null, selectors: string[]): string | null {
  if (!root) return null;
  for (const sel of selectors) {
    const hit = t(root.querySelector(sel));
    if (hit) return hit;
  }
  return null;
}

export function isTradeMeHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "trademe.co.nz" || h.endsWith(".trademe.co.nz");
}

function isTradeMeJobDetailUrl(pathname: string): boolean {
  return /\/a\/jobs\/.+\/listing\/\d+/i.test(pathname) || /\/jobs\/.+-\d+\.htm$/i.test(pathname);
}

/** Narrow DOM to the open listing so we do not pick “similar jobs” or site chrome. */
function jobListingRoot(): Element | null {
  const main = document.querySelector("main");
  if (main) {
    const titleHit =
      main.querySelector("[data-testid='listing-title']") ||
      main.querySelector("[data-testid='job-listing-title']") ||
      main.querySelector("[data-test='listing-title']");
    if (titleHit) {
      const art = titleHit.closest("article");
      if (art) return art;
      const section = titleHit.closest("section");
      if (section) return section;
    }
    const h1 = main.querySelector("h1");
    if (h1) {
      const art = h1.closest("article");
      if (art) return art;
    }
    const firstArticle = main.querySelector("article");
    if (firstArticle) return firstArticle;
  }

  const listingId = window.location.pathname.match(/\/listing\/(\d+)/i)?.[1];
  if (listingId) {
    const byHref = document.querySelector(`main a[href*="/listing/${listingId}"], a[href*="/listing/${listingId}"]`);
    const scope = byHref?.closest("article") || byHref?.closest("main");
    if (scope) return scope;
  }

  return (
    document.querySelector("tm-job-listing") ||
    document.querySelector("[data-testid='job-listing']") ||
    document.querySelector("main article") ||
    document.querySelector("main") ||
    null
  );
}

function pickTitle(root: Element | null): string | null {
  const title =
    firstTextIn(root, [
      "[data-testid='listing-title']",
      "[data-testid='job-listing-title']",
      "[data-test='listing-title']",
      "h1[class*='listing']",
      "h1",
    ]) || null;
  if (!title || /trade\s*me\s*jobs/i.test(title)) return null;
  return title;
}

function pickCompany(root: Element | null): string | null {
  return firstTextIn(root, [
    "[data-testid='job-ad-company']",
    "[data-testid='company-name']",
    "[data-test='company-name']",
    "a[href*='/a/jobs/company/']",
    "a[href*='/jobs/company/']",
  ]);
}

function pickCompanyUrl(root: Element | null): string | null {
  const link = root?.querySelector("a[href*='/a/jobs/company/'], a[href*='/jobs/company/']") as HTMLAnchorElement | null;
  return link?.href || null;
}

function pickLocation(root: Element | null): string | null {
  const loc =
    firstTextIn(root, [
      "[data-testid='job-ad-location']",
      "[data-testid='listing-location']",
      "[data-test='listing-location']",
      "[data-testid='job-location']",
    ]) || null;
  if (loc) return loc;
  if (!root) return null;
  for (const el of Array.from(root.querySelectorAll("[class*='location']"))) {
    if (!root.contains(el)) continue;
    const s = t(el);
    if (!s || s.length < 3 || s.length > 200) continue;
    if (/\blisted\s*:/i.test(s)) continue;
    if (/similar\s+jobs|recommended|more\s+jobs/i.test(s)) continue;
    return s;
  }
  return null;
}

function pickListedLine(root: Element | null): string | null {
  if (!root) return null;
  for (const el of Array.from(root.querySelectorAll("time, [class*='listed'], [data-testid*='listed']"))) {
    const s = t(el);
    if (s && /\blisted\b/i.test(s) && s.length < 120) return s.replace(/\s+/g, " ").trim();
  }
  const hay = root.textContent || "";
  const m = hay.match(/\bListed\s*:?\s*[^.\n]{1,80}/i);
  return m ? m[0].replace(/\s+/g, " ").trim() : null;
}

function pickSalary(root: Element | null): string | null {
  const fromTestId =
    firstTextIn(root, [
      "[data-testid='job-ad-salary']",
      "[data-testid='listing-salary']",
      "[data-test='salary']",
      "[data-testid='salary-range']",
    ]) || null;
  if (fromTestId) return fromTestId;

  if (!root) return null;
  for (const h of Array.from(root.querySelectorAll("h2, h3, h4, h5, p, span"))) {
    const label = t(h);
    if (!label || !/company\s+benefits|salary|remuneration|pay\s+range/i.test(label)) continue;
    let walk: Element | null = h.nextElementSibling;
    for (let i = 0; i < 6 && walk; i++, walk = walk.nextElementSibling) {
      const block = t(walk);
      if (block && /\$\s*[\d,.]+/.test(block)) {
        const line = block
          .split(/\n/)
          .map((x) => x.trim())
          .find((x) => /\$\s*[\d,.]+/.test(x));
        if (line) return line.replace(/\s+/g, " ").slice(0, 240);
      }
    }
  }

  const block = t(root);
  if (block) {
    const mm = block.match(/\$\s*[\d,.]+\s*-\s*\$\s*[\d,.]+(?:\s*(?:p\.?\s*a\.?|per\s+annum|\/yr))?/i);
    if (mm) return mm[0].replace(/\s+/g, " ").trim();
  }
  return null;
}

function pickDescription(root: Element | null): string | null {
  const desc =
    firstTextIn(root, [
      "[data-testid='job-description']",
      "[data-test='job-description']",
      "[class*='job-description']",
    ]) || null;
  return desc && desc.length > 80 ? desc.slice(0, 50000) : null;
}

function pickEmploymentType(root: Element | null): string | null {
  const raw = t(root) || "";
  const hits = ["Full time", "Part time", "Contract", "Temp", "Casual", "Permanent"].filter((label) => new RegExp(`\\b${label}\\b`, "i").test(raw));
  return hits.length ? [...new Set(hits)].slice(0, 3).join(", ") : null;
}

function pickWorkplaceType(root: Element | null, location: string | null): string | null {
  const raw = `${location || ""} ${t(root) || ""}`;
  if (/\bremote\b|work from home/i.test(raw)) return "Remote";
  if (/\bhybrid\b/i.test(raw)) return "Hybrid";
  if (location) return "On-site";
  return null;
}

function tradeMeExternalId(): string | null {
  return window.location.pathname.match(/\/listing\/(\d+)/i)?.[1] || window.location.pathname.match(/-(\d+)\.htm$/i)?.[1] || null;
}

export const tradeMeSiteExtractor: SiteExtractor = {
  id: "trademe",
  tryExtract(): Partial<JobSavePayload> | null {
    if (!isTradeMeHost(window.location.hostname)) return null;
    if (!isTradeMeJobDetailUrl(window.location.pathname)) return null;

    const root = jobListingRoot();
    const title = pickTitle(root);
    const company = pickCompany(root);
    let location = pickLocation(root);
    const listed = pickListedLine(root);
    if (listed) {
      location = location ? `${location} | ${listed}` : listed;
    }
    const description = pickDescription(root);
    const salary = pickSalary(root);
    const employmentType = pickEmploymentType(root);
    const workplaceType = pickWorkplaceType(root, location);
    const companyUrl = pickCompanyUrl(root);

    if (!title && !company && !location && !description && !salary) return null;
    const out: Partial<JobSavePayload> = {};
    if (title) out.title = title;
    if (company) out.company = company;
    if (location) out.location = location;
    if (description) out.description = description;
    if (salary) out.salary = salary;
    if (employmentType) out.employment_type = employmentType;
    if (workplaceType) out.workplace_type = workplaceType;
    if (companyUrl) out.company_url = companyUrl;
    out.apply_url = window.location.href;
    const externalId = tradeMeExternalId();
    if (externalId) out.external_job_id = externalId;
    out.source_website = "trademe.co.nz";
    return out;
  },
};
