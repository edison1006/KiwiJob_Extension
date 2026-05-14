import type { JobSavePayload } from "@easyjob/shared";

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

export function isLinkedInJobViewUrl(hostname: string, pathname: string): boolean {
  const h = hostname.toLowerCase();
  if (!/(^|\.)linkedin\.com$/i.test(h)) return false;
  return /\/jobs\/view\//i.test(pathname) || /\/jobs\/collections\//i.test(pathname);
}

/** LinkedIn uses `Title | Company | LinkedIn` in document title and og:title. */
function parsePipeTitleMeta(raw: string | null | undefined): { title?: string; company?: string } {
  if (!raw) return {};
  const parts = raw
    .split("|")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (parts.length < 2) return {};
  const tail = parts[parts.length - 1];
  if (!/linkedin/i.test(tail)) return {};
  const title = parts[0];
  const company = parts.length >= 3 ? parts[parts.length - 2] : undefined;
  return { title, company };
}

function metaTitleCompany(): { title?: string; company?: string } {
  const og = document.querySelector('meta[property="og:title"]')?.getAttribute("content")?.trim();
  const fromOg = parsePipeTitleMeta(og);
  if (fromOg.title) return fromOg;
  return parsePipeTitleMeta(document.title);
}

function jobTopCardRoot(): Element | null {
  return (
    document.querySelector(".job-details-jobs-unified-top-card") ||
    document.querySelector(".jobs-unified-top-card") ||
    document.querySelector("[data-view-name='job-details-page-job-card']") ||
    document.querySelector("div[class*='jobs-unified-top-card__job-title']")?.closest("div.jobs-unified-top-card, article") ||
    null
  );
}

/** Prefer the longest plausible job title inside the top card (avoids truncated first h1). */
function pickTitleFromTopCard(root: Element | null): string | null {
  if (!root) return null;
  const specificSelectors = [
    "h1.job-details-jobs-unified-top-card__job-title",
    ".job-details-jobs-unified-top-card__job-title",
    ".jobs-unified-top-card__job-title",
    "[data-testid='jobsearch-JobInfoHeader-title']",
  ];
  const candidates: string[] = [];
  for (const sel of specificSelectors) {
    for (const el of Array.from(root.querySelectorAll(sel))) {
      const s = t(el);
      if (s && s.length >= 2 && s.length < 400 && !/^linkedin$/i.test(s)) candidates.push(s);
    }
  }
  if (candidates.length) return candidates.reduce((a, b) => (a.length >= b.length ? a : b));
  for (const el of Array.from(root.querySelectorAll("h1"))) {
    const s = t(el);
    if (s && s.length >= 2 && s.length < 400 && !/^linkedin$/i.test(s)) candidates.push(s);
  }
  if (!candidates.length) return null;
  return candidates.reduce((a, b) => (a.length >= b.length ? a : b));
}

function pickCompanyFromTopCard(root: Element | null): string | null {
  const direct =
    firstText([
      ".job-details-jobs-unified-top-card__company-name a",
      ".job-details-jobs-unified-top-card__company-name",
      ".jobs-unified-top-card__company-name a",
      ".jobs-unified-top-card__company-name",
      "[data-testid='jobsearch-CompanyName']",
      "a.job-details-jobs-unified-top-card__primary-description-link",
    ]) || null;
  if (direct) return direct;
  if (!root) return null;
  const companyLink = root.querySelector('a[href*="/company/"]');
  const fromLink = t(companyLink);
  if (fromLink && !/^\s*see\s+more\s*$/i.test(fromLink)) return fromLink;
  return null;
}

/** Location / workplace chips (e.g. New Zealand · Remote · Full-time). */
function pickLocationLine(root: Element | null): string | null {
  const direct =
    firstText([
      ".job-details-jobs-unified-top-card__primary-description-container",
      ".job-details-jobs-unified-top-card__tertiary-description-container",
      ".job-details-jobs-unified-top-card__bullet",
      ".jobs-unified-top-card__bullet",
      "[data-testid='job-location']",
      "[data-testid='job-workplace-types']",
    ]) || null;
  if (direct) return direct.replace(/\s*·\s*/g, " · ").trim();

  if (!root) return null;
  const chipRoot =
    root.querySelector(".job-details-jobs-unified-top-card__primary-description-container") ||
    root.querySelector(".job-details-jobs-unified-top-card__primary-description") ||
    root.querySelector(".jobs-unified-top-card__primary-description");
  if (!chipRoot) return null;
  const chips = chipRoot.querySelectorAll(".tvm__text, span[class*='text-body-small']");
  const bits = Array.from(chips)
    .map((el) => el.textContent?.trim().replace(/\s+/g, " "))
    .filter((s): s is string => Boolean(s && s.length > 0 && s.length < 120));
  if (!bits.length) return t(chipRoot);
  return [...new Set(bits)].join(" · ");
}

function preferRicherTitle(domTitle: string | null, metaTitle: string | undefined): string | null {
  const d = (domTitle || "").trim();
  const m = (metaTitle || "").trim();
  if (!m) return d || null;
  if (!d) return m;
  if (m.length > d.length && m.startsWith(d)) return m;
  if (m.includes(" - ") && !d.includes(" - ") && m.length >= d.length) return m;
  if (d.length > m.length) return d;
  return m.length >= d.length ? m : d;
}

export const linkedInSiteExtractor: SiteExtractor = {
  id: "linkedin",
  tryExtract(): Partial<JobSavePayload> | null {
    if (!isLinkedInJobViewUrl(window.location.hostname, window.location.pathname)) return null;

    const root = jobTopCardRoot();
    const meta = metaTitleCompany();
    const domTitle = pickTitleFromTopCard(root);
    const title = preferRicherTitle(domTitle, meta.title) || meta.title || domTitle;

    const company = pickCompanyFromTopCard(root) || meta.company || null;
    const location = pickLocationLine(root);

    if (!title && !company && !location) return null;
    const out: Partial<JobSavePayload> = {};
    if (title) out.title = title;
    if (company) out.company = company;
    if (location) out.location = location;
    return out;
  },
};
