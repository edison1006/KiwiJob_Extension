import { Link } from "react-router-dom";

export default function ServicesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Services</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Extra services (resume reviews, coaching, etc.) are not bundled in this MVP. Core flows live under{" "}
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
        Coming in a future release.
      </div>
    </div>
  );
}
