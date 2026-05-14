import type { JobSavePayload } from "@easyjob/shared";

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
    h === "www.seek.com"
  );
}

function pickShortH1AvoidingSiteChrome(): string | null {
  const nodes = document.querySelectorAll("main h1, article h1, [role='main'] h1, h1");
  const bad = /SEEK|Indeed|LinkedIn|Glassdoor|Trade Me|Careers/i;
  for (const el of Array.from(nodes)) {
    const s = t(el);
    if (!s || s.length < 2 || s.length > 200) continue;
    if (bad.test(s)) continue;
    return s;
  }
  return null;
}

/** SEEK-specific DOM fields (JSON-LD + generic may still miss location/company on some builds). */
export const seekSiteExtractor: SiteExtractor = {
  id: "seek",
  tryExtract(): Partial<JobSavePayload> | null {
    if (!isSeekHost(window.location.hostname)) return null;
    if (!/\/job\b/i.test(window.location.pathname)) return null;
    const title =
      t(document.querySelector('[data-automation="job-detail-title"]')) ||
      t(document.querySelector('[data-automation="jobDetailTitle"]')) ||
      t(document.querySelector('[data-testid="job-detail-title"]')) ||
      pickShortH1AvoidingSiteChrome() ||
      t(document.querySelector("article h1")) ||
      t(document.querySelector("main h1")) ||
      null;
    const company =
      t(document.querySelector('[data-automation="advertiser-name"]')) ||
      t(document.querySelector('a[data-automation="advertiser-name"]')) ||
      t(document.querySelector('[data-testid="advertiser-name"]')) ||
      t(document.querySelector('[data-automation="job-ad-advertiser"]')) ||
      null;
    const location =
      t(document.querySelector('[data-automation="job-detail-location"]')) ||
      t(document.querySelector('[data-automation="jobDetailLocation"]')) ||
      t(document.querySelector('[data-automation="locationAndWorkArrangement"]')) ||
      t(document.querySelector('[data-testid="job-detail-location"]')) ||
      t(document.querySelector('[data-automation="job-ad-location"]')) ||
      null;
    if (!title && !company && !location) return null;
    const out: Partial<JobSavePayload> = {};
    if (title) out.title = title;
    if (company) out.company = company;
    if (location) out.location = location;
    return out;
  },
};
