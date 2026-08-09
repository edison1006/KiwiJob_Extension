import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../auth";
import type { JobSearchResult } from "../lib/api";
import { saveJobRemote, searchJobsRemote } from "../lib/api";

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

function logoFallbackText(company: string | null | undefined): string {
  const value = (company || "").trim();
  if (!value) return "KJ";
  const words = value.split(/\s+/).filter(Boolean);
  return (words[0]?.[0] || "") + (words[1]?.[0] || "");
}

function formatJobDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function compactJobSummary(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 280) return normalized;
  const preview = normalized.slice(0, 280);
  const sentenceEnd = Math.max(preview.lastIndexOf(". "), preview.lastIndexOf("! "), preview.lastIndexOf("? "));
  const cutAt = sentenceEnd >= 140 ? sentenceEnd + 1 : preview.lastIndexOf(" ");
  return `${preview.slice(0, cutAt > 0 ? cutAt : 280).trim()}…`;
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return <>{text}</>;
  const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  const normalizedTerms = new Set(terms.map((term) => term.toLowerCase()));
  return (
    <>
      {text.split(pattern).map((part, index) =>
        normalizedTerms.has(part.toLowerCase()) ? (
          <mark key={`${part}-${index}`} className="rounded bg-amber-100 px-0.5 text-inherit">{part}</mark>
        ) : part,
      )}
    </>
  );
}

function CompanyLogo({ company, sourceName, url }: { company?: string | null; sourceName: string; url?: string | null }) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [url]);

  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5">
      {url && !imageFailed ? (
        <img
          src={url}
          alt={`${company || sourceName} logo`}
          className="h-full w-full object-contain"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="text-sm font-bold uppercase text-slate-600">{logoFallbackText(company)}</span>
      )}
    </div>
  );
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
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [filters, setFilters] = useState<SearchFilters>({
    keywords: "",
    location: "All New Zealand",
    jobType: "",
    minSalary: "",
  });
  const [results, setResults] = useState<JobSearchResult[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [savingUrl, setSavingUrl] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const debounceTimerRef = useRef<number | undefined>(undefined);

  const selectedSources = SOURCES;
  const sourceLinks = useMemo(
    () => selectedSources.map((source) => ({ source, url: source.buildUrl(filters) })),
    [filters],
  );
  function update<K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function openAll() {
    for (const { url } of sourceLinks) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  async function fetchRealJobs(nextFilters: SearchFilters = filters) {
    if (!user || !selectedSources.length) return;
    const requestId = ++requestIdRef.current;
    setSearchBusy(true);
    setSearchError(null);
    try {
      const data = await searchJobsRemote({
        ...nextFilters,
        sources: selectedSources.map((source) => source.id),
      });
      if (requestId !== requestIdRef.current) return;
      setResults(data);
      if (!data.length) setSearchError("No concrete job cards were found. Try SEEK first, broaden your filters, or open the source site.");
    } catch (e) {
      if (requestId !== requestIdRef.current) return;
      setSearchError(e instanceof Error ? e.message : "Could not fetch job listings.");
    } finally {
      if (requestId !== requestIdRef.current) return;
      setSearchBusy(false);
    }
  }

  useEffect(() => {
    window.clearTimeout(debounceTimerRef.current);
    if (authLoading || !user) {
      setResults([]);
      setSearchError(null);
      setSearchBusy(false);
      return;
    }
    debounceTimerRef.current = window.setTimeout(() => {
      void fetchRealJobs(filters);
    }, 280);
    return () => window.clearTimeout(debounceTimerRef.current);
  }, [authLoading, user?.id, filters.keywords, filters.location, filters.jobType, filters.minSalary]);

  async function saveResult(result: JobSearchResult) {
    if (savingUrl) return;
    setSavingUrl(result.job.url);
    try {
      const saved = await saveJobRemote({ ...result.job, status: result.job.status ?? "Saved" });
      navigate(`/jobs/${saved.id}`);
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Could not save this job.");
    } finally {
      setSavingUrl(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="border-b border-slate-200 pb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Find NZ jobs</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
              Search once, fetch real job cards from supported boards, then save useful roles directly into KiwiJob.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!sourceLinks.length || searchBusy}
              onClick={() => void fetchRealJobs(filters)}
              className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {searchBusy ? "Fetching jobs…" : "Refresh jobs"}
            </button>
            <button
              type="button"
              disabled={!sourceLinks.length}
              onClick={openAll}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Open selected sites
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
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

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Real job results</h2>
                <p className="text-sm text-slate-600">Concrete postings fetched from supported sources.</p>
              </div>
              {results.length ? <span className="text-xs font-semibold text-slate-500">{results.length} found</span> : null}
            </div>
            {searchError ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{searchError}</div> : null}
            {results.length ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {results.map((result) => (
                  <article key={`${result.source_id}-${result.job.url}`} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <CompanyLogo company={result.job.company} sourceName={result.source_name} url={result.company_logo_url} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Detected</p>
                        <dl className="mt-2 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-sm text-slate-800">
                          <dt className="text-slate-500">Title</dt>
                          <dd className="min-w-0 break-words">
                            <a href={result.job.url} target="_blank" rel="noreferrer" className="font-semibold hover:text-brand-700 hover:underline">
                              <HighlightedText text={result.job.title} query={filters.keywords} />
                            </a>
                          </dd>
                          <dt className="text-slate-500">Company</dt>
                          <dd className="min-w-0 break-words">{result.job.company || "Not provided"}</dd>
                          <dt className="text-slate-500">Location</dt>
                          <dd className="min-w-0 break-words">{result.job.location || "Not provided"}</dd>
                          <dt className="text-slate-500">Salary</dt>
                          <dd className="min-w-0 break-words">{result.job.salary || "Not disclosed"}</dd>
                          {result.job.employment_type ? (
                            <>
                              <dt className="text-slate-500">Employment</dt>
                              <dd className="min-w-0 break-words">{result.job.employment_type}</dd>
                            </>
                          ) : null}
                          {result.job.workplace_type ? (
                            <>
                              <dt className="text-slate-500">Workplace</dt>
                              <dd className="min-w-0 break-words">{result.job.workplace_type}</dd>
                            </>
                          ) : null}
                          {formatJobDate(result.job.posted_date) ? (
                            <>
                              <dt className="text-slate-500">Posted</dt>
                              <dd>{formatJobDate(result.job.posted_date)}</dd>
                            </>
                          ) : null}
                          {formatJobDate(result.job.closing_date) ? (
                            <>
                              <dt className="text-slate-500">Closes</dt>
                              <dd>{formatJobDate(result.job.closing_date)}</dd>
                            </>
                          ) : null}
                        </dl>
                      </div>
                    </div>
                    <p className="mt-3 text-xs font-medium text-slate-500">Data source: {result.source_name}</p>
                    {result.job.description ? (
                      <p className="mt-2 line-clamp-3 break-words text-xs leading-relaxed text-slate-600">
                        <HighlightedText text={compactJobSummary(result.job.description)} query={filters.keywords} />
                      </p>
                    ) : (
                      <p className="mt-2 text-xs italic text-slate-500">No description was provided in the search result. Open the full job description for details.</p>
                    )}
                    <div className="mt-auto flex flex-wrap gap-2 pt-4">
                      <button
                        type="button"
                        disabled={savingUrl === result.job.url}
                        onClick={() => void saveResult(result)}
                        className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {savingUrl === result.job.url ? "Saving…" : "Save to tracker"}
                      </button>
                      <a
                        href={result.job.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                      >
                        Open JD
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-5 py-8 text-sm text-slate-600">
                Click <span className="font-semibold text-slate-800">Fetch real jobs</span> to load specific postings for your current filters.
              </div>
            )}
          </section>

          <details className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm text-slate-600">
            <summary className="cursor-pointer font-semibold text-slate-900">Open source search pages</summary>
            <div className="mt-3 flex flex-wrap gap-2">
              {sourceLinks.map(({ source, url }) => (
                <a
                  key={source.id}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  {source.name} search
                </a>
              ))}
            </div>
          </details>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950">
            <h2 className="font-semibold">How this works</h2>
            <p className="mt-2">
              KiwiJob fetches supported search pages, extracts concrete job cards, and lets you save them to your tracker. If a site blocks server-side fetching, open it directly.
            </p>
          </div>
      </section>
    </div>
  );
}
