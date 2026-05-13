import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ApplicationListItem } from "@easyjob/shared";
import { StatusBadge } from "../components/StatusBadge";
import { fetchJobs } from "../lib/api";

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function JobsPage() {
  const [rows, setRows] = useState<ApplicationListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJobs()
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
        Could not load jobs. Is the API running? ({error})
      </div>
    );
  }

  if (!rows) {
    return <div className="text-sm text-slate-600">Loading applications…</div>;
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">📋</div>
        <h1 className="text-lg font-semibold text-slate-900">No saved jobs yet</h1>
        <p className="mt-2 text-sm text-slate-600">
          Use the EasyJob Chrome extension on a job posting page and click <span className="font-medium">Save Job</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Job applications</h1>
        <p className="mt-1 text-sm text-slate-600">Track status, match scores, and jump back to postings.</p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Saved</th>
                <th className="px-4 py-3">Match</th>
                <th className="px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/80">
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
