import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { ApplicationListItem } from "@kiwijob/shared";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@kiwijob/shared";
import { DashboardHero } from "../components/DashboardHero";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { deleteJob, fetchJobs } from "../lib/api";

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function escapeCsvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportApplicationsCsv(rows: ApplicationListItem[]) {
  const headers = ["id", "title", "company", "location", "status", "source", "url", "saved_at", "updated_at", "match_score"];
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        r.id,
        r.job.title,
        r.job.company ?? "",
        r.job.location ?? "",
        r.status,
        r.job.source_website,
        r.job.url,
        r.saved_at,
        r.updated_at,
        r.match_score ?? "",
      ]
        .map(escapeCsvCell)
        .join(","),
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kiwijob-applications-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

type TrackerTab = "active" | "archived";

export default function JobsPage() {
  const location = useLocation();
  const isMatchesRoute = location.pathname === "/matches";
  const isTrackerRoute = location.pathname === "/tracker";
  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const savedFromExtensionId = useMemo(() => {
    const raw = query.get("saved");
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [query]);

  const [rows, setRows] = useState<ApplicationListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trackerTab, setTrackerTab] = useState<TrackerTab>("active");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | "">("");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkFeedback, setBulkFeedback] = useState<string | null>(null);

  useEffect(() => {
    fetchJobs()
      .then((data) => {
        setRows(data);
        if (savedFromExtensionId && data.some((r) => r.id === savedFromExtensionId)) {
          setTrackerTab("active");
          setSearch("");
          setStatusFilter("");
          setBulkFeedback(`Saved application #${savedFromExtensionId} from the extension.`);
          window.setTimeout(() => setBulkFeedback(null), 6000);
          window.setTimeout(() => document.getElementById(`application-${savedFromExtensionId}`)?.scrollIntoView({ block: "center" }), 80);
        }
      })
      .catch((e: Error) => setError(e.message));
  }, [query, savedFromExtensionId]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    let list = rows;

    if (isMatchesRoute) {
      list = list.filter((r) => r.match_score != null);
    } else if (isTrackerRoute) {
      if (trackerTab === "active") list = list.filter((r) => r.status !== "Withdrawn");
      else list = list.filter((r) => r.status === "Withdrawn");
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const blob = [r.job.title, r.job.company, r.job.location, r.job.source_website].filter(Boolean).join(" ").toLowerCase();
        return blob.includes(q);
      });
    }

    if (statusFilter) list = list.filter((r) => r.status === statusFilter);

    return list;
  }, [rows, isMatchesRoute, isTrackerRoute, trackerTab, search, statusFilter]);

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!filtered.length) return;
    const allOn = filtered.every((r) => selected.has(r.id));
    if (allOn) setSelected(new Set());
    else setSelected(new Set(filtered.map((r) => r.id)));
  }

  async function bulkDeleteSelected() {
    if (selected.size === 0 || bulkBusy) return;
    const ids = [...selected];
    const n = ids.length;
    if (!window.confirm(`Delete ${n} application${n === 1 ? "" : "s"}? This cannot be undone.`)) return;
    setBulkBusy(true);
    setBulkFeedback(null);
    try {
      const results = await Promise.allSettled(ids.map((id) => deleteJob(id)));
      const failed: { id: number; message: string }[] = [];
      results.forEach((r, i) => {
        if (r.status === "rejected") failed.push({ id: ids[i], message: r.reason instanceof Error ? r.reason.message : String(r.reason) });
      });
      const okIds = ids.filter((_, i) => results[i].status === "fulfilled");
      setSelected((prev) => {
        const next = new Set(prev);
        okIds.forEach((id) => next.delete(id));
        return next;
      });
      const fresh = await fetchJobs();
      setRows(fresh);
      if (failed.length) {
        setBulkFeedback(
          `Removed ${okIds.length} of ${n}. Failed: ${failed.map((f) => `#${f.id} (${f.message})`).join("; ")}`,
        );
      } else {
        setBulkFeedback(`Deleted ${n} application${n === 1 ? "" : "s"}.`);
      }
      window.setTimeout(() => setBulkFeedback(null), 8000);
    } catch (e) {
      setBulkFeedback(e instanceof Error ? e.message : "Bulk delete failed.");
      window.setTimeout(() => setBulkFeedback(null), 8000);
    } finally {
      setBulkBusy(false);
    }
  }

  const toolbar = (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden>
            🔍
          </span>
          <input
            type="search"
            placeholder="Search roles, companies, or locations…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            value={statusFilter}
            onChange={(e) => setStatusFilter((e.target.value || "") as ApplicationStatus | "")}
          >
            <option value="">All statuses</option>
            {APPLICATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 text-xs font-semibold">
            <button
              type="button"
              className={`rounded-lg px-3 py-1.5 ${viewMode === "table" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
              onClick={() => setViewMode("table")}
            >
              Table
            </button>
            <button
              type="button"
              className={`rounded-lg px-3 py-1.5 ${viewMode === "cards" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
              onClick={() => setViewMode("cards")}
            >
              Cards
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        {bulkFeedback ? (
          <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 sm:order-first sm:w-auto">{bulkFeedback}</div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="font-medium text-slate-800">{selected.size} selected</span>
          <button
            type="button"
            disabled={selected.size === 0 || bulkBusy}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
            title="Delete selected rows from the server."
            onClick={() => void bulkDeleteSelected()}
          >
            {bulkBusy ? "Deleting…" : "🗑 Delete"}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            onClick={() => exportApplicationsCsv(filtered)}
          >
            ⤓ Export CSV
          </button>
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-1 rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5 font-semibold text-slate-400"
            title="Import CSV is not available in this MVP build."
          >
            ⤒ Import CSV
          </button>
        </div>
        <details className="relative sm:text-right">
          <summary className="inline-flex cursor-pointer list-none items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 [&::-webkit-details-marker]:hidden">
            <span>＋</span> Add application
            <span className="text-xs opacity-80">▼</span>
          </summary>
          <div className="absolute right-0 z-10 mt-2 w-[min(100vw-2rem,22rem)] rounded-xl border border-slate-200 bg-white p-4 text-left text-sm text-slate-600 shadow-lg sm:w-80">
            <p className="font-medium text-slate-900">Save from a live job posting</p>
            <p className="mt-2 leading-relaxed">
              Install the <span className="font-semibold text-slate-800">KiwiJob</span> Chrome extension, open a job page (e.g. SEEK{" "}
              <span className="font-mono text-xs">/job/…</span>), then use <span className="font-semibold">Save job</span> in the side panel.
            </p>
          </div>
        </details>
      </div>
    </div>
  );

  if (error) {
    return (
      <div className="space-y-8">
        <PageHeader
          title={isMatchesRoute ? "Matches" : "Your job tracker"}
          subtitle={
            isMatchesRoute
              ? "Applications where a match score has been computed (extension or dashboard)."
              : "Track every application in one place — no more endless spreadsheets."
          }
        />
        <DashboardHero />
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">Could not load jobs. Is the API running? ({error})</div>
      </div>
    );
  }

  if (!rows) {
    return (
      <div className="space-y-8">
        <PageHeader title={isMatchesRoute ? "Matches" : "Your job tracker"} subtitle="Loading your applications…" />
        <DashboardHero />
        <div className="text-sm text-slate-600">Loading applications…</div>
      </div>
    );
  }

  const pageTitle = isMatchesRoute ? "Matches" : "Your job tracker";
  const pageSubtitle = isMatchesRoute
    ? "Roles where KiwiJob has stored a JD↔CV or JD-only heuristic match score."
    : "No more endless spreadsheets — keep track of roles, statuses, and match scores in one workspace.";

  const headerActions = isTrackerRoute ? (
    <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs font-semibold text-slate-600">
      <button
        type="button"
        className={`rounded-lg px-3 py-2 ${trackerTab === "active" ? "bg-white text-slate-900 shadow-sm" : ""}`}
        onClick={() => setTrackerTab("active")}
      >
        Active
      </button>
      <button
        type="button"
        className={`rounded-lg px-3 py-2 ${trackerTab === "archived" ? "bg-white text-slate-900 shadow-sm" : ""}`}
        onClick={() => setTrackerTab("archived")}
      >
        Archived
      </button>
    </div>
  ) : null;

  if (rows.length === 0) {
    return (
      <div className="space-y-8">
        <PageHeader title={pageTitle} subtitle={pageSubtitle} actions={headerActions} />
        <DashboardHero />
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-16 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white text-4xl shadow-sm">📋</div>
          <h2 className="mt-6 text-xl font-semibold text-slate-900">Add your first job application</h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-600">
            Use the KiwiJob extension on a job posting, or connect the API and refresh. Everything you save shows up here with status and match
            tools.
          </p>
        </div>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="space-y-8">
        <PageHeader title={pageTitle} subtitle={pageSubtitle} actions={headerActions} />
        {isTrackerRoute ? <DashboardHero /> : null}
        {toolbar}
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-600 shadow-sm">
          No applications match your filters. Try clearing search or status, or switch tabs.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader title={pageTitle} subtitle={pageSubtitle} actions={headerActions} />
      {isTrackerRoute ? <DashboardHero /> : null}
      {toolbar}

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          Showing <span className="font-semibold text-slate-800">{filtered.length}</span> of {rows.length} saved
        </span>
        <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => setSearch("")}>
          Clear search
        </button>
      </div>

      {viewMode === "table" ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300"
                      aria-label="Select all visible"
                      checked={filtered.length > 0 && filtered.every((r) => selected.has(r.id))}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Saved</th>
                  <th className="px-4 py-3">Match</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    id={`application-${r.id}`}
                    className={`hover:bg-slate-50/80 ${
                      savedFromExtensionId === r.id ? "bg-emerald-50/90 ring-1 ring-inset ring-emerald-200" : ""
                    }`}
                  >
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        className="rounded border-slate-300"
                        checked={selected.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                        aria-label={`Select ${r.job.title}`}
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <Link className="text-brand-700 hover:underline" to={`/jobs/${r.id}`}>
                        {r.job.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{r.job.company ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-700">{r.job.location ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-700">{r.job.source_website}</td>
                    <td className="px-4 py-3 text-slate-600">{fmtDate(r.saved_at)}</td>
                    <td className="px-4 py-3 text-slate-700">{r.match_score != null ? `${Math.round(r.match_score)}%` : "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{fmtDate(r.updated_at)}</td>
                    <td className="px-4 py-3">
                      <Link className="font-medium text-brand-700 hover:underline" to={`/jobs/${r.id}`}>
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((r) => (
            <Link
              key={r.id}
              id={`application-${r.id}`}
              to={`/jobs/${r.id}`}
              className={`rounded-2xl border bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow-md ${
                savedFromExtensionId === r.id ? "border-emerald-300 ring-2 ring-emerald-100" : "border-slate-200"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-slate-900">{r.job.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{r.job.company ?? "—"}</p>
                </div>
                <StatusBadge status={r.status} />
              </div>
              <p className="mt-3 text-xs text-slate-500">{r.job.location ?? "—"} · {r.job.source_website}</p>
              <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                <span>Match {r.match_score != null ? `${Math.round(r.match_score)}%` : "—"}</span>
                <span>{fmtDate(r.updated_at)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
