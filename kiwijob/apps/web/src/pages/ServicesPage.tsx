import { Link } from "react-router-dom";

export default function ServicesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Cover Letter</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Generate and refine role-specific cover letters from your saved job, CV, and application profile. Core profile data lives under{" "}
          <Link className="font-medium text-brand-700 hover:underline" to="/documents">
            Documents
          </Link>{" "}
          and{" "}
          <Link className="font-medium text-brand-700 hover:underline" to="/tracker">
            Job tracker
          </Link>
          .
        </p>
      </div>
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-600">
        Cover letter workspace coming next.
      </div>
    </div>
  );
}
