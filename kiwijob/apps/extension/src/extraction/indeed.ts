import type { JobSavePayload } from "@kiwijob/shared";

import type { SiteExtractor } from "./types";

function t(el: Element | null | undefined): string | null {
  const s = el?.textContent?.trim().replace(/\s+/g, " ");
  return s && s.length ? s : null;
}

function firstText(selectors: string[]): string | null {
  for (const sel of selectors) {
    const hit = t(document.querySelector(sel));
    if (hit) return hit;
  }
  return null;
}

export function isIndeedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "indeed.com" || h.endsWith(".indeed.com");
}

function isIndeedJobDetailUrl(pathname: string, search: string): boolean {
  return /\/viewjob\b/i.test(pathname) || /\/rc\/clk\b/i.test(pathname) || /(?:^|[?&])vjk=/i.test(search);
}

function cleanIndeedTitle(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw
    .replace(/\s*-\s*job post\s*$/i, "")
    .replace(/\s*-\s*Indeed\.com?\s*$/i, "")
    .trim();
  return s.length ? s : null;
}

function pickTitle(): string | null {
  return cleanIndeedTitle(
    firstText([
      "h1[data-testid='jobsearch-JobInfoHeader-title']",
      "[data-testid='jobsearch-JobInfoHeader-title']",
      ".jobsearch-JobInfoHeader-title",
      "h1.jobsearch-JobInfoHeader-title",
      "main h1",
      "h1",
    ]),
  );
}

function pickCompany(): string | null {
  const direct = firstText([
    "[data-testid='inlineHeader-companyName'] a",
    "[data-testid='inlineHeader-companyName']",
    "[data-testid='jobsearch-CompanyInfoContainer'] a",
    "[data-testid='jobsearch-CompanyInfoContainer'] [data-company-name='true']",
    "[data-company-name='true']",
    ".jobsearch-CompanyInfoContainer a",
    ".jobsearch-InlineCompanyRating a",
  ]);
  if (direct && !/^indeed$/i.test(direct)) return direct;
  return null;
}

function pickLocation(): string | null {
  return firstText([
    "[data-testid='job-location']",
    "[data-testid='inlineHeader-companyLocation']",
    ".jobsearch-JobInfoHeader-subtitle div:last-child",
    ".jobsearch-CompanyInfoContainer [data-testid='job-location']",
  ]);
}

function pickDescription(): string | null {
  const desc = firstText([
    "#jobDescriptionText",
    "[data-testid='jobsearch-JobComponent-description']",
    ".jobsearch-jobDescriptionText",
  ]);
  return desc && desc.length > 80 ? desc.slice(0, 50000) : null;
}

function pickSalary(): string | null {
  return firstText([
    "#salaryInfoAndJobType",
    "[data-testid='jobsearch-JobMetadataHeader-item']",
    "[aria-label='Pay']",
    ".js-match-insights-provider [data-testid='attribute_snippet_testid']",
  ]);
}

export const indeedSiteExtractor: SiteExtractor = {
  id: "indeed",
  tryExtract(): Partial<JobSavePayload> | null {
    if (!isIndeedHost(window.location.hostname)) return null;
    if (!isIndeedJobDetailUrl(window.location.pathname, window.location.search)) return null;

    const title = pickTitle();
    const company = pickCompany();
    const location = pickLocation();
    const description = pickDescription();
    const salary = pickSalary();

    if (!title && !company && !location && !description && !salary) return null;
    const out: Partial<JobSavePayload> = {};
    if (title) out.title = title;
    if (company) out.company = company;
    if (location) out.location = location;
    if (description) out.description = description;
    if (salary) out.salary = salary;
    return out;
  },
};
