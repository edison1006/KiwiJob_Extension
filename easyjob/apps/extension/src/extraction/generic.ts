import type { JobSavePayload } from "@easyjob/shared";
import { siteExtractors } from "./registry";

function text(el: Element | null | undefined): string | null {
  const t = el?.textContent?.trim();
  return t && t.length ? t : null;
}

function pickTitle(): string | null {
  const og = document.querySelector('meta[property="og:title"]')?.getAttribute("content")?.trim();
  if (og) return og;
  const tw = document.querySelector('meta[name="twitter:title"]')?.getAttribute("content")?.trim();
  if (tw) return tw;
  const t = document.querySelector("title")?.textContent?.trim();
  if (t) return t.split(/[|\-–]/)[0]?.trim() || t;
  const h1 = text(document.querySelector("h1"));
  return h1;
}

function pickCompany(): string | null {
  const og = document.querySelector('meta[property="og:site_name"]')?.getAttribute("content")?.trim();
  if (og) return og;
  const name = document.querySelector(
    '[data-testid="jobsearch-CompanyName"], .jobs-unified-top-card__company-name, a[data-control-name="job_card_company_link"]',
  );
  return text(name);
}

function pickLocation(): string | null {
  const loc = document.querySelector(
    '[data-testid="job-location"], .jobs-unified-top-card__bullet, .jobs-unified-top-card__workplace-type',
  );
  return text(loc);
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
  const base = genericExtract();
  for (const ex of siteExtractors) {
    const partial = ex.tryExtract();
    if (partial) {
      return normalizePayload({
        ...base,
        ...partial,
        url: partial.url || base.url,
        title: partial.title || base.title,
      });
    }
  }
  return normalizePayload(base);
}

function genericExtract(): JobSavePayload {
  const title = pickTitle() || "Untitled role";
  const description = pickDescription() || fallbackBodyText();
  return {
    title,
    company: pickCompany(),
    location: pickLocation(),
    description,
    salary: pickSalary(),
    url: window.location.href,
    source_website: hostnameSource(),
    posted_date: pickPostedDate(),
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
  };
}
