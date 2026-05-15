import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ApplicationDetail, ApplicationStatus } from "@kiwijob/shared";
import { APPLICATION_STATUSES } from "@kiwijob/shared";
import { StatusBadge } from "../components/StatusBadge";
import { analyzeMatch, deleteJob, fetchJob, updateJobStatus } from "../lib/api";

export default function JobDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const jobId = useMemo(() => Number(id), [id]);
  const [row, setRow] = useState<ApplicationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(jobId)) return;
    fetchJob(jobId)
      .then(setRow)
      .catch((e: Error) => setError(e.message));
  }, [jobId]);

  async function onStatusChange(status: ApplicationStatus) {
    if (!row) return;
    setBusy(true);
    try {
      const updated = await updateJobStatus(row.id, status);
      setRow((prev) => (prev ? { ...prev, status: updated.status, updated_at: updated.updated_at } : prev));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!row) return;
    if (!confirm("Delete this saved application?")) return;
    setBusy(true);
    try {
      await deleteJob(row.id);
      navigate("/");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onAnalyze() {
    if (!row) return;
    setBusy(true);
    try {
      await analyzeMatch(row.id);
      navigate(`/match/${row.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!Number.isFinite(jobId)) {
    return <div className="text-sm text-slate-600">Invalid job id.</div>;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
        {error}{" "}
        <Link className="font-medium text-brand-700 underline" to="/tracker">
          Back to list
        </Link>
      </div>
    );
  }

  if (!row) return <div className="text-sm text-slate-600">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Application</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{row.job.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span className="font-medium text-slate-800">{row.job.company ?? "Unknown company"}</span>
            <span>•</span>
            <span>{row.job.location ?? "Remote / unspecified"}</span>
            <span>•</span>
            <StatusBadge status={row.status} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
            href={row.job.url}
            target="_blank"
            rel="noreferrer"
          >
            Open original posting
          </a>
          <Link
            className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
            to={`/match/${row.id}`}
          >
            View match report
          </Link>
          <button
            type="button"
            disabled={busy}
            onClick={onAnalyze}
            className="inline-flex items-center justify-center rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-900 hover:bg-brand-100 disabled:opacity-50"
          >
            Run / refresh match
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDelete}
            className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-1">
          <h2 className="text-sm font-semibold text-slate-900">Application status</h2>
          <p className="mt-1 text-xs text-slate-600">Updates your tracker instantly.</p>
          <select
            className="mt-4 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
            value={row.status}
            disabled={busy}
            onChange={(e) => onStatusChange(e.target.value as ApplicationStatus)}
          >
            {APPLICATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Saved</dt>
              <dd className="text-slate-900">{new Date(row.saved_at).toLocaleString()}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Updated</dt>
              <dd className="text-slate-900">{new Date(row.updated_at).toLocaleString()}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Source</dt>
              <dd className="text-slate-900">{row.job.source_website}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Match score</dt>
              <dd className="text-slate-900">{row.match_score != null ? `${Math.round(row.match_score)}%` : "—"}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-900">Job description</h2>
          <p className="mt-1 text-xs text-slate-600">Pulled from the posting when you saved it.</p>
          <div className="mt-4 max-h-[520px] overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-800">
            {row.job.description?.trim() ? row.job.description : "No description captured — re-save from the page or paste later (post-MVP)."}
          </div>
        </div>
      </div>
    </div>
  );
}
