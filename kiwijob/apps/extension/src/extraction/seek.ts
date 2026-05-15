import type { JobSavePayload } from "@kiwijob/shared";

import type { SiteExtractor } from "./types";

function t(el: Element | null | undefined): string | null {
  const s = el?.textContent?.trim();
  return s && s.length ? s : null;
}

export function isSeekHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    /\.seek\.co\.nz$/i.test(h) ||
    /\.seek\.com\.au$/i.test(h) ||
    /^[a-z0-9-]+\.seek\.com$/i.test(h) ||
    h === "www.seek.com" ||
    h === "seek.com"
  );
}

function h1CandidatesInScope(scope: Element | Document): Element[] {
  if (scope === document || scope instanceof Document) {
    return Array.from(document.querySelectorAll("main h1, article h1, [role='main'] h1, h1"));
  }
  const el = scope as Element;
  const out: Element[] = [];
  const direct = el.querySelector(":scope > h1");
  if (direct) out.push(direct);
  for (const h of Array.from(el.querySelectorAll("h1"))) {
    if (!out.includes(h)) out.push(h);
  }
  return out;
}

function pickShortH1AvoidingSiteChrome(scope: Element | Document): string | null {
  const bad = /SEEK|Indeed|LinkedIn|Glassdoor|Trade Me|Careers|Job vacancies|Find your ideal job|Recommended|All jobs/i;
  for (const el of h1CandidatesInScope(scope)) {
    const s = t(el);
    if (!s || s.length < 2 || s.length > 200) continue;
    if (bad.test(s)) continue;
    return s;
  }
  return null;
}

function seekHasInlineJobDetail(): boolean {
  if (!isSeekHost(window.location.hostname)) return false;
  const sels = [
    '[data-automation="job-detail-title"]',
    '[data-automation="jobDetailTitle"]',
    '[data-testid="job-detail-title"]',
  ];
  for (const sel of sels) {
    const el = document.querySelector(sel);
    const s = t(el);
    if (s && s.length >= 2 && s.length < 280) return true;
  }
  return false;
}

function pickFirst(scope: Element | Document, selectors: string[]): string | null {
  for (const sel of selectors) {
    const hit = t(scope.querySelector(sel));
    if (hit && hit.length < 500) return hit;
  }
  return null;
}

function pickCompanyLoose(main: Element): string | null {
  const s =
    pickFirst(main, [
      '[data-automation="advertiser-name"]',
      'a[data-automation="advertiser-name"]',
      '[data-automation="Advertiser-name"]',
      '[data-testid="advertiser-name"]',
      '[data-automation="job-ad-advertiser"]',
      '[data-automation="job-advertiser-name"]',
    ]) ||
    t(main.querySelector('a[href*="/company/"]')) ||
    t(main.querySelector('a[href*="/companies/"]')) ||
    null;
  return s && s.length < 200 ? s : null;
}

/** Full-page or SPA shell: main shows a single job (title + company signals). */
function seekStandaloneJobInMain(): boolean {
  if (!isSeekHost(window.location.hostname)) return false;
  const main = document.querySelector("main");
  if (!main) return false;
  const h1 = pickShortH1AvoidingSiteChrome(main);
  if (!h1) return false;
  return Boolean(pickCompanyLoose(main));
}

/**
 * SPA may keep a generic `/jobs/...` path while showing a job; og:type or inline job hooks still indicate detail.
 */
function seekDomLooksLikeJobAd(): boolean {
  if (!isSeekHost(window.location.hostname)) return false;
  if (seekHasInlineJobDetail()) return true;
  const og = document.querySelector('meta[property="og:type"]')?.getAttribute("content")?.trim().toLowerCase();
  if (og && (og.includes("job") || og === "article")) return true;
  const main = document.querySelector("main");
  if (!main) return false;
  const h1 = pickShortH1AvoidingSiteChrome(main);
  if (!h1 || h1.length < 6) return false;
  if (main.querySelector('[data-automation="job-detail-title"], [data-automation="jobDetailTitle"]')) return true;
  if (main.querySelector('a[href*="/job/"]')) return true;
  return seekStandaloneJobInMain();
}

function seekLikelySearchOnlyPath(path: string): boolean {
  const p = path.toLowerCase();
  return (
    /job-search|saved-jobs|\/recommended|\/applied|\/shortlist|employer\/|\/companies\/|\/sign-in|\/login/i.test(p) ||
    /^\/jobs\/?$/i.test(p)
  );
}

/** True when the current SEEK page is showing one job we can scrape (URL or DOM). */
export function seekHasExtractableJobView(): boolean {
  if (!isSeekHost(window.location.hostname)) return false;
  const path = window.location.pathname;
  if (/\/job\//i.test(path)) return true;
  if (/\/jobs\//i.test(path)) {
    if (seekLikelySearchOnlyPath(path)) return false;
    if (/\d{4,}/.test(path)) return true;
  }
  if (seekHasInlineJobDetail()) return true;
  if (seekDomLooksLikeJobAd()) return true;
  return false;
}

function pickSeekSalaryFallback(scope: Element | Document): string | null {
  const raw = (scope instanceof Document ? document.body : scope)?.textContent ?? "";
  const m = raw.match(
    /\$\s*[\d,.]+\s*[\u2013\u2014\-]\s*\$\s*[\d,.]+\s*(?:per\s+hour|p\.?\s*h\.?|\/hr|p\.?\s*a\.?|per\s+annum|\/yr)?/i,
  );
  return m ? m[0].replace(/\s+/g, " ").trim().slice(0, 120) : null;
}

function formattedText(el: Element | null | undefined): string {
  if (!el) return "";
  const rendered = "innerText" in el ? (el as HTMLElement).innerText : "";
  return rendered || el.textContent || "";
}

function cleanDescription(raw: string): string | null {
  const withBreaks = raw
    .replace(/\r\n?/g, "\n")
    .replace(/([a-z.)])(?=(Responsibilities|Requirements|Desirable|What we offer|About the role|About you|Benefits)\b)/g, "$1\n\n")
    .replace(/([a-z.)])(?=Must have\b)/g, "$1\n")
    .replace(/([a-z.)])(?=Please note\b)/g, "$1\n\n");
  const lines = withBreaks
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line && !/^(show more|show less|apply now|quick apply|save)$/i.test(line));
  const s = lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (s.length < 160) return null;
  return s.slice(0, 50000);
}

function pickSeekDescription(scope: Element | Document): string | null {
  const selectors = [
    '[data-automation="jobAdDetails"]',
    '[data-automation="job-ad-details"]',
    '[data-automation="jobAdDescription"]',
    '[data-automation="job-ad-description"]',
    '[data-automation="jobDescription"]',
    '[data-automation="job-description"]',
    '[data-automation="job-detail-description"]',
    '[data-testid="job-description"]',
    '[data-testid="job-detail-description"]',
    '[data-testid="jobAdDetails"]',
    '[class*="job-description" i]',
    '[class*="jobDescription" i]',
  ];

  for (const sel of selectors) {
    const hit = scope.querySelector(sel);
    const cleaned = cleanDescription(formattedText(hit));
    if (cleaned) return cleaned;
  }

  const headingRegex =
    /about the role|about you|what you('|’)ll be doing|responsibilities|requirements|skills and experience|the successful candidate|job description|key duties/i;
  const blocks = Array.from(scope.querySelectorAll("section, article, div"))
    .map((el) => ({ el, text: cleanDescription(formattedText(el)) }))
    .filter((item): item is { el: Element; text: string } => Boolean(item.text));
  const headingMatch = blocks.find(({ el, text }) => {
    const heading = el.querySelector("h2, h3, h4")?.textContent ?? "";
    return headingRegex.test(`${heading} ${text}`);
  });
  if (headingMatch) return headingMatch.text;

  const longest = blocks.sort((a, b) => b.text.length - a.text.length)[0]?.text;
  return longest && longest.length > 260 ? longest : null;
}

function seekJobDetailRoot(): Element | null {
  const titleSel =
    '[data-automation="job-detail-title"], [data-automation="jobDetailTitle"], [data-testid="job-detail-title"]';
  const hit = document.querySelector(titleSel);
  if (hit) {
    const panel =
      hit.closest('[data-automation="jobsearch-job-detail-content"]') ||
      hit.closest('[data-automation="JobSearch-JobDetails"]') ||
      hit.closest('[data-automation="jobSearchJobDetails"]') ||
      hit.closest('[data-testid="job-details-panel"]') ||
      hit.closest('[data-testid="job-details-drawer"]') ||
      hit.closest('[role="dialog"]') ||
      hit.closest("aside") ||
      hit.closest("article");
    if (panel) return panel;
  }
  return (
    document.querySelector('[data-automation="jobsearch-job-detail-content"]') ||
    document.querySelector('[data-automation="JobSearch-JobDetails"]') ||
    document.querySelector('[data-automation="jobSearchJobDetails"]') ||
    null
  );
}

function seekExtractionScope(): Element | Document {
  const root = seekJobDetailRoot();
  if (root) return root;
  const main = document.querySelector("main");
  return main ?? document;
}

export const seekSiteExtractor: SiteExtractor = {
  id: "seek",
  tryExtract(): Partial<JobSavePayload> | null {
    if (!isSeekHost(window.location.hostname)) return null;
    if (!seekHasExtractableJobView()) return null;

    const scope = seekExtractionScope();

    const title =
      pickFirst(scope, [
        '[data-automation="job-detail-title"]',
        '[data-automation="jobDetailTitle"]',
        '[data-testid="job-detail-title"]',
        '[data-automation="job-title"]',
        '[data-automation="jobTitle"]',
      ]) || pickShortH1AvoidingSiteChrome(scope);

    let company = pickFirst(scope, [
      '[data-automation="advertiser-name"]',
      'a[data-automation="advertiser-name"]',
      '[data-automation="Advertiser-name"]',
      '[data-testid="advertiser-name"]',
      '[data-automation="job-ad-advertiser"]',
      '[data-automation="job-advertiser-name"]',
    ]);
    if (!company && scope instanceof Element) {
      company =
        t(scope.querySelector('a[href*="/company/"]')) ||
        t(scope.querySelector('a[href*="/companies/"]')) ||
        (scope.tagName === "MAIN" ? pickCompanyLoose(scope) : null);
    }

    const location = pickFirst(scope, [
      '[data-automation="job-detail-location"]',
      '[data-automation="jobDetailLocation"]',
      '[data-automation="locationAndWorkArrangement"]',
      '[data-testid="job-detail-location"]',
      '[data-automation="job-ad-location"]',
      '[data-automation="job-location"]',
    ]);

    let salary = pickFirst(scope, [
      '[data-automation="jobsearch-salary-info"]',
      '[data-automation="salary-info"]',
      '[data-automation="job-detail-salary"]',
      '[data-automation="jobDetailSalary"]',
      '[data-testid="job-salary"]',
      '[data-automation="job-summary-salary"]',
      '[data-automation="search-serp-job-salary"]',
    ]);
    if (!salary) salary = pickSeekSalaryFallback(scope);
    const description = pickSeekDescription(scope);

    if (!title && !company && !location && !salary && !description) return null;
    const out: Partial<JobSavePayload> = {};
    if (title) out.title = title;
    if (company) out.company = company;
    if (location) out.location = location;
    if (salary) out.salary = salary;
    if (description) out.description = description;
    return out;
  },
};
