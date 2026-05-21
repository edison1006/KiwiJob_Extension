import { Link } from "react-router-dom";

/**
 * Simplify-style hero + CTA. Job “recommendations” are out of scope for 1.0; this nudges CV upload for match quality.
 */
export function DashboardHero() {
  return (
    <div className="mb-8 overflow-hidden rounded-[28px] border border-brand-100 bg-white/72 p-5 shadow-[0_24px_70px_-58px_rgba(109,63,195,0.72)] backdrop-blur sm:p-6">
      <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <div className="inline-flex rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">
            Match ready
          </div>
          <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">Get cleaner JD-to-CV match scores</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Upload your latest CV, then run Analyze match from the Chrome extension. KiwiJob will compare only what the JD actually asks for.
          </p>
        </div>
        <Link
          to="/documents"
          className="inline-flex items-center justify-center rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_45px_-25px_rgba(109,63,195,0.95)] transition hover:bg-brand-700"
        >
          Upload CV
        </Link>
      </div>
    </div>
  );
}
