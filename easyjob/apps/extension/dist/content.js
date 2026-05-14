"use strict";
(() => {
  // src/extraction/seek.ts
  function t(el) {
    const s = el?.textContent?.trim();
    return s && s.length ? s : null;
  }
  function isSeekHost(hostname) {
    const h = hostname.toLowerCase();
    return /\.seek\.co\.nz$/i.test(h) || /\.seek\.com\.au$/i.test(h) || /^[a-z0-9-]+\.seek\.com$/i.test(h) || h === "www.seek.com";
  }
  function pickShortH1AvoidingSiteChrome() {
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
  var seekSiteExtractor = {
    id: "seek",
    tryExtract() {
      if (!isSeekHost(window.location.hostname)) return null;
      const title = t(document.querySelector('[data-automation="job-detail-title"]')) || t(document.querySelector('[data-automation="jobDetailTitle"]')) || t(document.querySelector('[data-testid="job-detail-title"]')) || pickShortH1AvoidingSiteChrome() || t(document.querySelector("article h1")) || t(document.querySelector("main h1")) || null;
      const company = t(document.querySelector('[data-automation="advertiser-name"]')) || t(document.querySelector('a[data-automation="advertiser-name"]')) || t(document.querySelector('[data-testid="advertiser-name"]')) || t(document.querySelector('[data-automation="job-ad-advertiser"]')) || null;
      const location = t(document.querySelector('[data-automation="job-detail-location"]')) || t(document.querySelector('[data-automation="jobDetailLocation"]')) || t(document.querySelector('[data-automation="locationAndWorkArrangement"]')) || t(document.querySelector('[data-testid="job-detail-location"]')) || t(document.querySelector('[data-automation="job-ad-location"]')) || null;
      if (!title && !company && !location) return null;
      const out = {};
      if (title) out.title = title;
      if (company) out.company = company;
      if (location) out.location = location;
      return out;
    }
  };

  // src/extraction/registry.ts
  var siteExtractors = [seekSiteExtractor];

  // src/extraction/generic.ts
  function text(el) {
    const t2 = el?.textContent?.trim();
    return t2 && t2.length ? t2 : null;
  }
  function jsonLdTypeMatches(types, needle) {
    if (types === needle) return true;
    if (Array.isArray(types)) return types.includes(needle);
    return false;
  }
  function flattenJsonLdValue(data, out) {
    if (data == null) return;
    if (Array.isArray(data)) {
      for (const item of data) flattenJsonLdValue(item, out);
      return;
    }
    if (typeof data !== "object") return;
    const o = data;
    const graph = o["@graph"];
    if (Array.isArray(graph)) {
      for (const item of graph) flattenJsonLdValue(item, out);
      return;
    }
    out.push(o);
  }
  function collectJsonLdObjects() {
    const out = [];
    for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
      try {
        const raw = script.textContent?.trim();
        if (!raw) continue;
        flattenJsonLdValue(JSON.parse(raw), out);
      } catch {
      }
    }
    return out;
  }
  function orgNameFromJsonLd(org) {
    if (org == null) return null;
    if (typeof org === "string") return org.trim() || null;
    if (Array.isArray(org)) return orgNameFromJsonLd(org[0]);
    if (typeof org !== "object") return null;
    const o = org;
    if (typeof o.name === "string" && o.name.trim()) return o.name.trim();
    return null;
  }
  function formatJsonLdPostalAddress(address) {
    if (address == null) return null;
    if (typeof address === "string") return address.trim() || null;
    if (typeof address !== "object") return null;
    const a = address;
    const loc = typeof a.addressLocality === "string" ? a.addressLocality.trim() : "";
    const region = typeof a.addressRegion === "string" ? a.addressRegion.trim() : "";
    const parts = [loc, region].filter(Boolean);
    return parts.length ? parts.join(", ") : null;
  }
  function formatJsonLdJobLocation(jobLocation) {
    if (jobLocation == null) return null;
    if (typeof jobLocation === "string") return jobLocation.trim() || null;
    if (Array.isArray(jobLocation)) {
      const parts = jobLocation.map(formatJsonLdJobLocation).filter((x) => Boolean(x?.trim()));
      return parts.length ? parts.join(" \xB7 ") : null;
    }
    if (typeof jobLocation !== "object") return null;
    const loc = jobLocation;
    if (jsonLdTypeMatches(loc["@type"], "Place")) {
      const name = typeof loc.name === "string" ? loc.name.trim() : "";
      const addr = formatJsonLdPostalAddress(loc.address);
      if (name && addr) return `${name} (${addr})`;
      return addr || name || null;
    }
    if (loc.address) return formatJsonLdPostalAddress(loc.address);
    return typeof loc.name === "string" ? loc.name.trim() || null : null;
  }
  function tryJobPostingJsonLd() {
    for (const node of collectJsonLdObjects()) {
      if (!jsonLdTypeMatches(node["@type"], "JobPosting")) continue;
      const title = typeof node.title === "string" ? node.title.trim() : "";
      const company = orgNameFromJsonLd(node.hiringOrganization);
      const location = formatJsonLdJobLocation(node.jobLocation);
      let description;
      if (typeof node.description === "string") {
        const stripped = node.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        if (stripped.length > 80) description = stripped.slice(0, 5e4);
      }
      const posted = typeof node.datePosted === "string" ? node.datePosted.trim() : "";
      if (!title && !company && !location && !description) continue;
      const out = {};
      if (title) out.title = title;
      if (company) out.company = company;
      if (location) out.location = location;
      if (description) out.description = description;
      if (posted) out.posted_date = posted;
      return out;
    }
    return null;
  }
  function pickH1JobTitle() {
    const path = window.location.pathname;
    const href = window.location.href;
    if (!/\/job\b|\/jobs\/view\/|\/viewjob\b/i.test(`${path}${href}`)) return null;
    return text(document.querySelector('[data-automation="job-detail-title"]')) || text(document.querySelector("article h1")) || text(document.querySelector("main h1")) || text(document.querySelector("h1"));
  }
  function pickTitle() {
    const h1 = pickH1JobTitle();
    if (h1 && h1.length < 280) return h1;
    const og = document.querySelector('meta[property="og:title"]')?.getAttribute("content")?.trim();
    if (og) return og;
    const tw = document.querySelector('meta[name="twitter:title"]')?.getAttribute("content")?.trim();
    if (tw) return tw;
    const t2 = document.querySelector("title")?.textContent?.trim();
    if (t2) return t2.split(/[|\-–]/)[0]?.trim() || t2;
    return text(document.querySelector("h1"));
  }
  function pickCompany() {
    const name = document.querySelector(
      '[data-testid="jobsearch-CompanyName"], .jobs-unified-top-card__company-name, a[data-control-name="job_card_company_link"]'
    );
    const fromDom = text(name);
    if (fromDom) return fromDom;
    const og = document.querySelector('meta[property="og:site_name"]')?.getAttribute("content")?.trim();
    if (og && !/seek/i.test(window.location.hostname)) return og;
    return null;
  }
  function pickLocation() {
    const loc = document.querySelector(
      '[data-testid="job-location"], .jobs-unified-top-card__bullet, .jobs-unified-top-card__workplace-type'
    );
    return text(loc);
  }
  function pickDescription() {
    const og = document.querySelector('meta[property="og:description"]')?.getAttribute("content")?.trim();
    if (og && og.length > 80) return og;
    const article = document.querySelector("article");
    if (article && (article.textContent?.length ?? 0) > 200) return article.textContent.trim().slice(0, 2e4);
    const desc = document.querySelector(
      '#job-details, [data-testid="jobsearch-JobComponent-description"], .jobs-description-content__text, .description__text, .job-description'
    );
    const t2 = text(desc);
    if (t2 && t2.length > 80) return t2.slice(0, 2e4);
    const main = document.querySelector("main");
    const mt = text(main);
    if (mt && mt.length > 200) return mt.slice(0, 2e4);
    return null;
  }
  function pickSalary() {
    const el = document.querySelector('[data-testid="job-salary"], .salary-snippet, .compensation__text');
    return text(el);
  }
  function pickPostedDate() {
    const time = document.querySelector("time[datetime]")?.getAttribute("datetime")?.trim();
    if (time) return time;
    return null;
  }
  function hostnameSource() {
    return window.location.hostname || "unknown";
  }
  function fallbackBodyText() {
    const selection = window.getSelection()?.toString().trim();
    if (selection && selection.length > 80) return selection.slice(0, 2e4);
    const body = document.body?.innerText?.trim() ?? "";
    return body.slice(0, 2e4);
  }
  function extractJobFromPage() {
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
        posted_date: partial.posted_date ?? merged.posted_date,
        source_website: partial.source_website ?? merged.source_website
      };
    }
    return normalizePayload(merged);
  }
  function genericExtract() {
    const jd = tryJobPostingJsonLd();
    const title = jd?.title || pickTitle() || "Untitled role";
    const description = (jd?.description ?? pickDescription()) || fallbackBodyText();
    return {
      title,
      company: jd?.company ?? pickCompany(),
      location: jd?.location ?? pickLocation(),
      description,
      salary: pickSalary(),
      url: window.location.href,
      source_website: hostnameSource(),
      posted_date: jd?.posted_date ?? pickPostedDate(),
      status: "Saved"
    };
  }
  function normalizePayload(p) {
    return {
      ...p,
      title: (p.title || "Untitled role").trim().slice(0, 500),
      url: p.url || window.location.href,
      source_website: (p.source_website || hostnameSource()).slice(0, 200),
      description: (p.description || "").slice(0, 5e4)
    };
  }

  // src/seekNativeSave.ts
  function isSeekJobDetailPath() {
    return /\/job\b/i.test(window.location.pathname);
  }
  function isSeekJobSaveClickTarget(target) {
    if (!target || !(target instanceof Element)) return false;
    const btn = target.closest("button");
    if (!btn) return false;
    const da = (btn.getAttribute("data-automation") || "").toLowerCase();
    if (da.includes("quick") || da.includes("apply")) return false;
    if (da.includes("savejob") || da.includes("save-job") || da.includes("job-save") || da.includes("favouritejob")) {
      return true;
    }
    const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
    if (aria.includes("save") && (aria.includes("job") || aria.includes("advert"))) return true;
    const text2 = (btn.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (text2 === "save") {
      const inMain = btn.closest("main, [role='main'], article");
      return Boolean(inMain);
    }
    return false;
  }
  var lastSaveAt = 0;
  var lastSaveUrl = "";
  function showToast(message, ok) {
    const id = "easyjob-native-save-toast";
    document.getElementById(id)?.remove();
    const div = document.createElement("div");
    div.id = id;
    const bg = ok ? "#ecfdf5" : "#fef2f2";
    const fg = ok ? "#065f46" : "#991b1b";
    const border = ok ? "#a7f3d0" : "#fecaca";
    div.setAttribute(
      "style",
      `position:fixed;top:16px;right:16px;z-index:2147483646;max-width:320px;padding:12px 14px;border-radius:10px;
    font:13px/1.35 system-ui,-apple-system,sans-serif;box-shadow:0 4px 24px rgba(0,0,0,.15);
    background:${bg};color:${fg};border:1px solid ${border};`
    );
    div.textContent = message;
    document.body.appendChild(div);
    window.setTimeout(() => div.remove(), 5e3);
  }
  function initSeekNativeSaveOnClick() {
    if (!isSeekHost(window.location.hostname)) return;
    document.addEventListener(
      "click",
      (ev) => {
        if (!isSeekJobDetailPath()) return;
        if (!isSeekJobSaveClickTarget(ev.target)) return;
        const urlKey = window.location.href.split("#")[0].split("?")[0];
        const now = Date.now();
        if (now - lastSaveAt < 1800 && urlKey === lastSaveUrl) return;
        lastSaveAt = now;
        lastSaveUrl = urlKey;
        let payload;
        try {
          payload = extractJobFromPage();
        } catch (e) {
          showToast(`EasyJob: could not read job \u2014 ${e.message}`, false);
          return;
        }
        const body = { ...payload, status: "Saved" };
        chrome.runtime.sendMessage({ type: "SAVE_JOB", payload: body }, (resp) => {
          const err = chrome.runtime.lastError;
          if (err) {
            showToast(`EasyJob: ${err.message}`, false);
            return;
          }
          if (!resp) {
            showToast("EasyJob: no response from extension.", false);
            return;
          }
          if (!resp.ok) {
            showToast(`EasyJob: ${resp.error}`, false);
            return;
          }
          const id = resp.data?.id;
          showToast(id != null ? `EasyJob: saved (application #${id}).` : "EasyJob: saved.", true);
        });
      },
      false
    );
  }

  // src/content.ts
  initSeekNativeSaveOnClick();
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "EXTRACT_JOB") {
      try {
        const payload = extractJobFromPage();
        sendResponse({ ok: true, data: payload });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
      return true;
    }
    return false;
  });
})();
