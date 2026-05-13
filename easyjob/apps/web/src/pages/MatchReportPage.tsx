import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { MatchAnalysis } from "@easyjob/shared";
import { analyzeMatch, fetchMatch } from "../lib/api";

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <div className="mt-2 text-sm text-slate-600">None detected.</div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

export default function MatchReportPage() {
  const { jobId } = useParams();
  const id = useMemo(() => Number(jobId), [jobId]);
  const [data, setData] = useState<MatchAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setData(null);
    setError(null);
    if (!Number.isFinite(id)) return;
    void fetchMatch(id)
      .then(setData)
      .catch(() => setData(null));
  }, [id]);

  async function run() {
    if (!Number.isFinite(id)) return;
    setBusy(true);
    setError(null);
    try {
      const m = await analyzeMatch(id);
      setData(m);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!Number.isFinite(id)) {
    return <div className="text-sm text-slate-600">Invalid id.</div>;
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">Match report</h1>
          <p className="mt-2 text-sm text-slate-600">
            No analysis found yet. Upload a CV, then generate a match for this application.
          </p>
          {error ? <div className="mt-4 text-sm text-rose-700">{error}</div> : null}
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={run}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? "Running…" : "Run analysis"}
            </button>
            <Link className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50" to={`/jobs/${id}`}>
              Back to job
            </Link>
            <Link className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50" to="/cv">
              CV upload
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">AI match</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Match report</h1>
          <p className="mt-1 text-sm text-slate-600">Structured comparison of your CV against the saved job description.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={run}
            className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-900 hover:bg-brand-100 disabled:opacity-50"
          >
            {busy ? "Refreshing…" : "Refresh analysis"}
          </button>
          <Link className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50" to={`/jobs/${id}`}>
            Job detail
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-brand-600 to-indigo-700 p-6 text-white shadow-sm lg:col-span-1">
          <div className="text-sm font-medium text-white/80">Overall score</div>
          <div className="mt-2 text-5xl font-semibold tracking-tight">{Math.round(data.score)}</div>
          <div className="mt-2 text-sm text-white/80">out of 100</div>
          {data.risk_flags?.length ? (
            <div className="mt-6 rounded-xl bg-white/10 p-3 text-sm">
              <div className="font-semibold">Risk flags</div>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {data.risk_flags.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="space-y-4 lg:col-span-2">
          <div className="grid gap-4 md:grid-cols-2">
            <List title="Matched skills" items={data.matched_skills} />
            <List title="Missing skills" items={data.missing_skills} />
            <List title="Matched experience" items={data.matched_experience} />
            <List title="Missing experience" items={data.missing_experience} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">ATS keywords to add</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.ats_keywords.length ? (
              data.ats_keywords.map((k) => (
                <span key={k} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-800 ring-1 ring-slate-200">
                  {k}
                </span>
              ))
            ) : (
              <div className="text-sm text-slate-600">No suggestions returned.</div>
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">CV summary suggestion</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{data.cv_summary_suggestion || "—"}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Bullet point improvements</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
          {(data.bullet_point_suggestions || []).map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Cover letter draft</h2>
        <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-800">{data.cover_letter_draft || "—"}</pre>
      </div>
    </div>
  );
}
