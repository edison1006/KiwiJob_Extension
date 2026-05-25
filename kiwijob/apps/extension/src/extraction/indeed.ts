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

function pickEmploymentType(): string | null {
  const raw = document.body?.innerText?.slice(0, 6000) || "";
  const hits = ["Full-time", "Part-time", "Contract", "Temporary", "Casual", "Permanent", "Internship"].filter((label) =>
    new RegExp(`\\b${label}\\b`, "i").test(raw),
  );
  return hits.length ? [...new Set(hits)].slice(0, 3).join(", ") : null;
}

function pickWorkplaceType(location: string | null): string | null {
  const raw = `${location || ""} ${document.body?.innerText?.slice(0, 6000) || ""}`;
  if (/\bremote\b|work from home/i.test(raw)) return "Remote";
  if (/\bhybrid\b/i.test(raw)) return "Hybrid";
  if (location) return "On-site";
  return null;
}

function pickCompanyUrl(): string | null {
  const link = document.querySelector(
    "[data-testid='inlineHeader-companyName'] a, [data-testid='jobsearch-CompanyInfoContainer'] a, .jobsearch-CompanyInfoContainer a",
  ) as HTMLAnchorElement | null;
  return link?.href || null;
}

function indeedExternalId(): string | null {
  return new URLSearchParams(window.location.search).get("vjk") || window.location.pathname.match(/\/cmp\/[^/]+\/jobs\/([^/?]+)/i)?.[1] || null;
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
    const employmentType = pickEmploymentType();
    const workplaceType = pickWorkplaceType(location);
    const companyUrl = pickCompanyUrl();

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
    const externalId = indeedExternalId();
    if (externalId) out.external_job_id = externalId;
    out.source_website = "indeed.com";
    return out;
  },
};
