import { useMemo, useState } from "react";

type JobType = "" | "fulltime" | "parttime" | "contract" | "casual" | "remote";

type Source = {
  id: string;
  name: string;
  shortName: string;
  logoText: string;
  description: string;
  strengths: string[];
  color: string;
  sampleCompany: string;
  sampleTitle: string;
  sampleLocation: string;
  sampleMode: string;
  buildUrl: (filters: SearchFilters) => string;
};

type SearchFilters = {
  keywords: string;
  location: string;
  jobType: JobType;
  minSalary: string;
};

const NZ_LOCATIONS = [
  "All New Zealand",
  "Auckland",
  "Wellington",
  "Christchurch",
  "Hamilton",
  "Tauranga",
  "Dunedin",
  "Lower Hutt",
  "Queenstown",
  "Remote",
];

const QUICK_SEARCHES = ["Data Analyst", "Software Engineer", "Business Analyst", "Marketing", "Project Manager", "Graduate"];

function clean(value: string): string {
  return value.trim();
}

function joinedQuery(filters: SearchFilters): string {
  return [filters.keywords, filters.jobType === "remote" ? "remote" : ""].map(clean).filter(Boolean).join(" ");
}

function addParams(base: string, params: Record<string, string | undefined>): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    const v = value?.trim();
    if (v) url.searchParams.set(key, v);
  }
  return url.toString();
}

function seekSlug(value: string): string {
  return clean(value).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function seekUrl(filters: SearchFilters): string {
  const keywords = seekSlug(joinedQuery(filters));
  const location = filters.location === "All New Zealand" || filters.location === "Remote" ? "" : seekSlug(filters.location);
  const path = keywords ? `${keywords}-jobs` : "jobs";
  const locPath = location ? `/in-${location}` : "";
  const url = new URL(`https://nz.seek.com/${path}${locPath}`);
  if (filters.minSalary) url.searchParams.set("salaryrange", `${filters.minSalary}-`);
  if (filters.jobType === "fulltime") url.searchParams.set("worktype", "242");
  if (filters.jobType === "parttime") url.searchParams.set("worktype", "243");
  if (filters.jobType === "contract") url.searchParams.set("worktype", "244");
  if (filters.jobType === "casual") url.searchParams.set("worktype", "245");
  return url.toString();
}

function tradeMeUrl(filters: SearchFilters): string {
  return addParams("https://www.trademe.co.nz/a/jobs/search", {
    search_string: joinedQuery(filters),
    location: filters.location === "All New Zealand" ? "" : filters.location,
  });
}

function linkedInUrl(filters: SearchFilters): string {
  const url = new URL("https://www.linkedin.com/jobs/search/");
  const query = joinedQuery(filters);
  if (query) url.searchParams.set("keywords", query);
  url.searchParams.set("location", filters.location === "All New Zealand" ? "New Zealand" : filters.location);
  if (filters.jobType === "fulltime") url.searchParams.set("f_JT", "F");
  if (filters.jobType === "parttime") url.searchParams.set("f_JT", "P");
  if (filters.jobType === "contract") url.searchParams.set("f_JT", "C");
  if (filters.jobType === "remote") url.searchParams.set("f_WT", "2");
  return url.toString();
}

function indeedUrl(filters: SearchFilters): string {
  return addParams("https://nz.indeed.com/jobs", {
    q: joinedQuery(filters),
    l: filters.location === "All New Zealand" ? "" : filters.location,
  });
}

function joraUrl(filters: SearchFilters): string {
  return addParams("https://nz.jora.com/jobs", {
    q: joinedQuery(filters),
    l: filters.location === "All New Zealand" ? "" : filters.location,
  });
}

function govtUrl(filters: SearchFilters): string {
  return addParams("https://jobs.govt.nz/jobs", {
    q: joinedQuery(filters),
    location: filters.location === "All New Zealand" ? "" : filters.location,
  });
}

const SOURCES: Source[] = [
  {
    id: "seek",
    name: "SEEK NZ",
    shortName: "SEEK",
    logoText: "S",
    description: "Largest general-purpose marketplace for professional and operational roles.",
    strengths: ["high volume", "salary filters", "strong employer coverage"],
    color: "bg-blue-600",
    sampleCompany: "SEEK",
    sampleTitle: "Recommended roles",
    sampleLocation: "New Zealand",
    sampleMode: "Hybrid / On site",
    buildUrl: seekUrl,
  },
  {
    id: "trademe",
    name: "Trade Me Jobs",
    shortName: "TM",
    logoText: "TM",
    description: "Strong New Zealand local coverage across trades, healthcare, retail, and regional roles.",
    strengths: ["local NZ listings", "regional breadth", "many frontline roles"],
    color: "bg-emerald-600",
    sampleCompany: "Trade Me",
    sampleTitle: "Local job listings",
    sampleLocation: "New Zealand",
    sampleMode: "On site",
    buildUrl: tradeMeUrl,
  },
  {
    id: "linkedin",
    name: "LinkedIn Jobs",
    shortName: "in",
    logoText: "in",
    description: "Best for network-led search, recruiters, technology, business, and remote-friendly roles.",
    strengths: ["recruiter network", "company research", "professional roles"],
    color: "bg-sky-700",
    sampleCompany: "LinkedIn",
    sampleTitle: "Network-matched roles",
    sampleLocation: "New Zealand",
    sampleMode: "Remote / Hybrid",
    buildUrl: linkedInUrl,
  },
  {
    id: "indeed",
    name: "Indeed NZ",
    shortName: "Indeed",
    logoText: "i",
    description: "Broad metasearch-style coverage with many direct employer and agency postings.",
    strengths: ["wide coverage", "simple search", "company postings"],
    color: "bg-indigo-600",
    sampleCompany: "Indeed",
    sampleTitle: "Fresh job matches",
    sampleLocation: "New Zealand",
    sampleMode: "Flexible",
    buildUrl: indeedUrl,
  },
  {
    id: "jora",
    name: "Jora NZ",
    shortName: "Jora",
    logoText: "J",
    description: "Fast aggregated search across employer sites, government roles, and job boards.",
    strengths: ["aggregated listings", "quick scan", "broad keyword matching"],
    color: "bg-amber-600",
    sampleCompany: "Jora",
    sampleTitle: "Aggregated openings",
    sampleLocation: "New Zealand",
    sampleMode: "All types",
    buildUrl: joraUrl,
  },
  {
    id: "govt",
    name: "jobs.govt.nz",
    shortName: "Govt",
    logoText: "NZ",
    description: "Official government jobs portal for public sector and agency vacancies.",
    strengths: ["public sector", "stable listings", "agency roles"],
    color: "bg-slate-700",
    sampleCompany: "NZ Government",
    sampleTitle: "Public sector vacancies",
    sampleLocation: "New Zealand",
    sampleMode: "Agency role",
    buildUrl: govtUrl,
  },
];

export default function BrowseJobsPage() {
  const [filters, setFilters] = useState<SearchFilters>({
    keywords: "Data Analyst",
    location: "All New Zealand",
    jobType: "",
    minSalary: "",
  });
  const [enabled, setEnabled] = useState<Set<string>>(() => new Set(SOURCES.map((s) => s.id)));

  const selectedSources = useMemo(() => SOURCES.filter((s) => enabled.has(s.id)), [enabled]);
  const sourceLinks = useMemo(
    () => selectedSources.map((source) => ({ source, url: source.buildUrl(filters) })),
    [filters, selectedSources],
  );
  const displayTitle = clean(filters.keywords) || "Matching roles";
  const displayLocation = filters.location === "All New Zealand" ? "New Zealand" : filters.location;
  const displayType =
    filters.jobType === "fulltime"
      ? "Full-Time"
      : filters.jobType === "parttime"
        ? "Part-Time"
        : filters.jobType === "contract"
          ? "Contract"
          : filters.jobType === "casual"
            ? "Casual"
            : filters.jobType === "remote"
              ? "Remote"
              : "All Types";

  function update<K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function toggleSource(id: string) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openAll() {
    for (const { url } of sourceLinks) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className="space-y-6">
      <section className="border-b border-slate-200 pb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Find NZ jobs</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
              Search once, then jump into New Zealand’s main job boards with the same filters. Use the Chrome extension on any result page to save roles back into KiwiJob.
            </p>
          </div>
          <button
            type="button"
            disabled={!sourceLinks.length}
            onClick={openAll}
            className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Open selected sites
          </button>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-4">
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">Keywords</span>
              <input
                value={filters.keywords}
                onChange={(e) => update("keywords", e.target.value)}
                placeholder="Role, skill, company"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">Location</span>
              <select
                value={filters.location}
                onChange={(e) => update("location", e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              >
                {NZ_LOCATIONS.map((location) => (
                  <option key={location}>{location}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">Work type</span>
              <select
                value={filters.jobType}
                onChange={(e) => update("jobType", e.target.value as JobType)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              >
                <option value="">Any type</option>
                <option value="fulltime">Full time</option>
                <option value="parttime">Part time</option>
                <option value="contract">Contract</option>
                <option value="casual">Casual</option>
                <option value="remote">Remote</option>
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">Minimum salary</span>
              <input
                value={filters.minSalary}
                onChange={(e) => update("minSalary", e.target.value.replace(/\D/g, ""))}
                placeholder="Optional"
                inputMode="numeric"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            {QUICK_SEARCHES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => update("keywords", q)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm ${
                  filters.keywords === q
                    ? "border-brand-200 bg-brand-50 text-brand-800"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {q}
              </button>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {sourceLinks.map(({ source, url }) => (
              <article key={source.id} className="overflow-hidden rounded-2xl border border-slate-300 bg-slate-50 shadow-sm transition hover:border-slate-400 hover:shadow-md">
                <div className="p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-xl font-black tracking-tighter text-slate-950 shadow-sm ring-1 ring-black/5">
                        {source.logoText}
                    </div>
                    <button
                      type="button"
                      aria-label={`Save ${source.name} search`}
                      title="Save search"
                      className="shrink-0 rounded-lg p-2 text-slate-700 hover:bg-white hover:text-slate-950"
                    >
                      <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M6 4h12v17l-6-4-6 4V4z" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>

                  <h2 className="mt-5 text-2xl font-bold leading-tight tracking-tight text-slate-950 sm:text-[1.9rem]">{displayTitle || source.sampleTitle}</h2>

                  <div className="mt-6 flex flex-wrap gap-3">
                    <span className="inline-flex items-center rounded-full bg-slate-200/70 px-4 py-2 text-lg font-semibold text-slate-600">
                      {displayType}
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full bg-slate-200/70 px-4 py-2 text-lg font-semibold text-slate-600">
                      <svg className="h-5 w-5 text-cyan-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 21s7-5.2 7-12A7 7 0 0 0 5 9c0 6.8 7 12 7 12z" />
                        <circle cx="12" cy="9" r="2.5" />
                      </svg>
                      {displayLocation || source.sampleLocation}
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full bg-slate-200/70 px-4 py-2 text-lg font-semibold text-slate-600">
                      <svg className="h-5 w-5 text-cyan-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
                        <path d="M16 8h2a2 2 0 0 1 2 2v11" />
                        <path d="M8 7h.01M12 7h.01M8 11h.01M12 11h.01M8 15h.01M12 15h.01" />
                      </svg>
                      {filters.jobType === "remote" ? "Online" : source.sampleMode}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-200 bg-white/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Source</p>
                    <p className="truncate text-sm font-semibold text-slate-800">{source.name}</p>
                  </div>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-700"
                  >
                    View jobs
                  </a>
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h2 className="text-sm font-semibold text-slate-900">Sources</h2>
            <div className="mt-3 space-y-2">
              {SOURCES.map((source) => (
                <label key={source.id} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm shadow-sm">
                  <span className="font-medium text-slate-700">{source.name}</span>
                  <input type="checkbox" checked={enabled.has(source.id)} onChange={() => toggleSource(source.id)} />
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950">
            <h2 className="font-semibold">How this works</h2>
            <p className="mt-2">
              KiwiJob opens each site’s own search page with your filters. This keeps results fresh and avoids brittle scraping. Save useful roles with the extension when you land on a job ad.
            </p>
          </div>
        </aside>
      </section>
    </div>
  );
}
