import { useEffect, useMemo, useState } from "react";
import type { AnalyticsSummary } from "@easyjob/shared";
import { fetchAnalytics } from "../lib/api";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAnalytics()
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  const byStatus = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.by_status).map(([name, value]) => ({ name, value }));
  }, [data]);

  const bySource = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.by_source).map(([name, value]) => ({ name, value }));
  }, [data]);

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
        Could not load analytics. ({error})
      </div>
    );
  }

  if (!data) return <div className="text-sm text-slate-600">Loading analytics…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Analytics</h1>
        <p className="mt-1 text-sm text-slate-600">Lightweight pipeline metrics for your saved applications.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Saved</div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">{data.total_saved}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Applied</div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">{data.total_applied}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Avg match score</div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">{data.average_match_score != null ? `${data.average_match_score}%` : "—"}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Interviews</div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">{data.interview_count}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rejections</div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">{data.rejection_count}</div>
        </div>
      </div>

      {data.total_saved === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-600">
          Save a few roles from the extension to populate charts.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">Applications by status</div>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byStatus}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={70} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#2563eb" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">Applications by source</div>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bySource}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={70} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
