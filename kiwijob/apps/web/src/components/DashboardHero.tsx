import { Link } from "react-router-dom";

/**
 * Simplify-style hero + CTA. Job “recommendations” are out of scope for 1.0; this nudges CV upload for match quality.
 */
export function DashboardHero() {
  return (
    <div className="mb-8 overflow-hidden rounded-2xl bg-gradient-to-r from-brand-600 to-sky-600 px-6 py-8 text-white shadow-md sm:px-10">
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-6 text-slate-900 shadow-sm sm:p-8">
        <div className="text-2xl" aria-hidden>
          🔥
        </div>
        <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">Get stronger match scores</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Upload a CV on the dashboard, then use <span className="font-medium text-slate-800">Analyze match</span> in the Chrome extension. Without an OpenAI key on the API, analysis still runs as a JD-only mock scorer.
        </p>
        <Link
          to="/documents"
          className="mt-5 inline-flex items-center justify-center rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          Upload or replace CV
        </Link>
      </div>
    </div>
  );
}
