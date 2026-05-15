import { Link } from "react-router-dom";

/** Simplify-style “Jobs” — external job discovery; not in KiwiJob 1.0 scope. */
export default function BrowseJobsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Jobs</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          In-app job search and discovery (like a job board) is not part of KiwiJob 1.0. Save roles from employer sites with the{" "}
          <span className="font-medium text-slate-800">Chrome extension</span>, then manage them in{" "}
          <Link className="font-medium text-brand-700 hover:underline" to="/tracker">
            Job tracker
          </Link>
          .
        </p>
      </div>
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-600">
        Coming in a future release.
      </div>
    </div>
  );
}
