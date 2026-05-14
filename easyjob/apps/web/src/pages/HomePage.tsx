import { Link } from "react-router-dom";

export default function HomePage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Home</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Welcome to EasyJob. Jump into your pipeline or upload a CV for match analysis.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          to="/tracker"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow-md"
        >
          <h2 className="font-semibold text-slate-900">Job tracker</h2>
          <p className="mt-2 text-sm text-slate-600">Saved roles, statuses, CSV export, and filters.</p>
        </Link>
        <Link
          to="/matches"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow-md"
        >
          <h2 className="font-semibold text-slate-900">Matches</h2>
          <p className="mt-2 text-sm text-slate-600">Applications with a stored match score.</p>
        </Link>
        <Link
          to="/documents"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow-md"
        >
          <h2 className="font-semibold text-slate-900">Documents</h2>
          <p className="mt-2 text-sm text-slate-600">Upload and manage your CV files.</p>
        </Link>
        <Link
          to="/analytics"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow-md"
        >
          <h2 className="font-semibold text-slate-900">Analytics</h2>
          <p className="mt-2 text-sm text-slate-600">Summary stats for your applications.</p>
        </Link>
      </div>
    </div>
  );
}
