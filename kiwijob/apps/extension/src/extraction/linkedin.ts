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

/** Section / marketing headings in the jobs left rail — not a job title. */
function isLinkedInListChromeTitle(raw: string | null | undefined): boolean {
  const s = (raw || "").trim().replace(/\s+/g, " ");
  if (!s || s.length < 3) return false;
  const lower = s.toLowerCase();
  const noiseExact = new Set(
    [
      "top job picks for you",
      "jobs you may be interested in",
      "recommended jobs for you",
      "similar jobs",
      "more jobs for you",
      "based on your profile",
      "in this job search",
      "your job alert",
      "recent job searches",
    ].map((x) => x.toLowerCase()),
  );
  if (noiseExact.has(lower)) return true;
  if (/^(top job|similar jobs|recommended jobs|more jobs|jobs you may|people also viewed|get the latest)/i.test(s)) return true;
  if (/\bfor you\s*$/i.test(s) && s.length < 60) return true;
  return false;
}

function linkedInLeftRailAncestor(el: Element | null): Element | null {
  if (!el) return null;
  return el.closest(
    ".jobs-search__left-rail,.jobs-search-results__list,.scaffold-layout__list-container,.scaffold-layout__list,aside.scaffold-layout__list,[class*='jobs-search-split-view__left-pane']",
  );
}

/** Right/detail column where the open job's top card lives (split-view search & collections). */
const LINKEDIN_JOB_DETAIL_SCOPES = [
  ".jobs-search__right-rail",
  ".jobs-search__job-details",
  ".scaffold-layout__detail",
  ".jobs-details__main-content",
  ".jobs-details",
];

function findTopCardInside(scope: Element): Element | null {
  return (
    scope.querySelector(".job-details-jobs-unified-top-card") ||
    scope.querySelector("[data-view-name='job-details-page-job-card']") ||
    scope.querySelector(".jobs-unified-top-card")
  );
}

function topCardVisibleArea(card: Element): number {
  const r = card.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return 0;
  return r.width * r.height;
}

export function isLinkedInJobViewUrl(hostname: string, pathname: string): boolean {
  const h = hostname.toLowerCase();
  if (!/(^|\.)linkedin\.com$/i.test(h)) return false;
  return /\/jobs\/view\//i.test(pathname) || /\/jobs\/collections\//i.test(pathname) || /\/jobs\/search\//i.test(pathname);
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
  for (const scopeSel of LINKEDIN_JOB_DETAIL_SCOPES) {
    for (const scope of Array.from(document.querySelectorAll(scopeSel))) {
      const card = findTopCardInside(scope);
      if (!card) continue;
      const title = pickTitleFromTopCard(card);
      if (title && !isLinkedInListChromeTitle(title)) return card;
    }
  }

  const candidates = document.querySelectorAll(".job-details-jobs-unified-top-card, .jobs-unified-top-card");
  let best: Element | null = null;
  let bestArea = 0;
  for (const card of Array.from(candidates)) {
    if (linkedInLeftRailAncestor(card)) continue;
    const title = pickTitleFromTopCard(card);
    if (!title || isLinkedInListChromeTitle(title)) continue;
    const area = topCardVisibleArea(card);
    if (area > bestArea) {
      bestArea = area;
      best = card;
    }
  }
  if (best) return best;

  return (
    document.querySelector(".job-details-jobs-unified-top-card") ||
    document.querySelector("[data-view-name='job-details-page-job-card']") ||
    document.querySelector("div[class*='jobs-unified-top-card__job-title']")?.closest("div.jobs-unified-top-card, article") ||
    document.querySelector(".jobs-unified-top-card")
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
    firstTextIn(root, [
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
    firstTextIn(root, [
      ".job-details-jobs-unified-top-card__primary-description-container",
      ".job-details-jobs-unified-top-card__tertiary-description-container",
      ".job-details-jobs-unified-top-card__bullet",
      ".jobs-unified-top-card__bullet",
      ".jobs-unified-top-card__primary-description-container",
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

/** Prefer DOM when it is a real job title; ignore list-rail chrome even if og:title is missing. */
function resolveLinkedInJobTitle(domTitle: string | null, metaTitle: string | undefined): string | null {
  const d = domTitle?.trim() || "";
  const m = (metaTitle || "").trim();
  const dOk = Boolean(d && !isLinkedInListChromeTitle(d));
  const mOk = Boolean(m && !isLinkedInListChromeTitle(m));
  if (dOk && mOk) return preferRicherTitle(d, m) || d;
  if (dOk) return preferRicherTitle(d, m || undefined) || d;
  if (mOk) return m;
  if (m) return m;
  if (d) return d;
  return null;
}

export const linkedInSiteExtractor: SiteExtractor = {
  id: "linkedin",
  tryExtract(): Partial<JobSavePayload> | null {
    if (!isLinkedInJobViewUrl(window.location.hostname, window.location.pathname)) return null;

    const root = jobTopCardRoot();
    const meta = metaTitleCompany();
    const domTitle = pickTitleFromTopCard(root);
    const title = resolveLinkedInJobTitle(domTitle, meta.title);

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
