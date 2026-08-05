import { Link } from "react-router";

/**
 * Simplify-style hero + CTA. Job “recommendations” are out of scope for 1.0; this nudges CV upload for match quality.
 */
export function DashboardHero() {
  return (
    <div className="relative mb-8 overflow-hidden rounded-[30px] border border-white/10 bg-[#160c31] p-5 text-white shadow-[0_30px_90px_-54px_rgba(47,25,96,0.95)] sm:p-7">
      <div className="app-aurora pointer-events-none absolute -right-16 -top-28 h-72 w-72 rounded-full bg-violet-500/35 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-1/3 h-52 w-52 rounded-full bg-fuchsia-500/20 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.12)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:linear-gradient(to_right,black,transparent)]" />
      <div className="relative grid gap-5 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-violet-100 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,.9)]" />
            Match engine ready
          </div>
          <h2 className="mt-4 text-xl font-bold tracking-tight text-white sm:text-3xl">Turn every job description into a clearer next move.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-violet-100/70">
            Upload your latest CV, then run Analyze match from the Chrome extension. KiwiJob will compare only what the JD actually asks for.
          </p>
        </div>
        <Link
          to="/documents"
          className="group interactive-card inline-flex items-center justify-center rounded-full border border-white/20 bg-white px-5 py-3 text-sm font-bold text-brand-900 shadow-[0_18px_55px_-24px_rgba(196,181,253,0.95)] hover:bg-violet-50"
        >
          Upload CV <span className="ml-2 transition group-hover:translate-x-1">→</span>
        </Link>
      </div>
    </div>
  );
}
