import { Link } from "react-router-dom";

export default function HomePage() {
  const cards = [
    {
      to: "/tracker",
      title: "Job tracker",
      body: "Saved roles, statuses, CSV export, and filters.",
      metric: "Pipeline",
      accent: "from-brand-300 to-brand-600",
    },
    {
      to: "/matches",
      title: "Matches",
      body: "Applications with a stored match score.",
      metric: "AI score",
      accent: "from-fuchsia-300 to-brand-500",
    },
    {
      to: "/documents",
      title: "Documents",
      body: "Upload and manage your CV files.",
      metric: "CV vault",
      accent: "from-violet-300 to-purple-700",
    },
    {
      to: "/analytics",
      title: "Analytics",
      body: "Summary stats for your applications.",
      metric: "Insights",
      accent: "from-indigo-300 to-fuchsia-500",
    },
  ];
  const stats = [
    { label: "Active roles", value: "12" },
    { label: "Interviews", value: "4" },
    { label: "Avg match", value: "86%" },
  ];

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-[32px] border border-white/80 bg-white/78 p-6 shadow-[0_28px_90px_-62px_rgba(109,63,195,0.72)] backdrop-blur-xl sm:p-8 lg:p-10">
        <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-brand-300/70 to-transparent" />
        <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-brand-200/55 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/2 h-64 w-64 rounded-full bg-fuchsia-100/70 blur-3xl" />

        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-stretch">
          <div className="flex flex-col justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-brand-50/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">
                KiwiJob dashboard
              </div>
              <h1 className="mt-5 max-w-2xl bg-gradient-to-br from-brand-900 via-slate-950 to-brand-600 bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-6xl">
                A quieter command center for your job search.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">
                Track roles, compare JD-to-CV matches, manage documents, and keep your extension data synced in one polished workspace.
              </p>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/browse"
                className="rounded-full border border-brand-500/15 bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_46px_-26px_rgba(109,63,195,0.9)] transition hover:bg-brand-700"
              >
                Browse jobs
              </Link>
              <Link
                to="/documents"
                className="rounded-full border border-brand-100 bg-white px-5 py-2.5 text-sm font-semibold text-brand-800 shadow-sm transition hover:border-brand-200 hover:bg-brand-50"
              >
                Upload CV
              </Link>
            </div>
          </div>

          <div className="relative rounded-[28px] border border-brand-100/80 bg-[#fbf9ff]/86 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
            <div className="flex items-center gap-3">
              <img src="/kiwijob-logo.png" alt="KiwiJob" className="h-12 w-12 rounded-2xl object-cover shadow-sm" />
              <div>
                <div className="text-sm font-semibold text-slate-950">Pipeline snapshot</div>
                <div className="text-xs text-slate-500">Synced from dashboard and extension</div>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-2">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-white/80 bg-white/80 p-3 text-center shadow-sm">
                  <div className="text-xl font-bold tracking-tight text-slate-950">{stat.value}</div>
                  <div className="mt-1 text-[11px] font-medium text-slate-500">{stat.label}</div>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-2xl border border-brand-100 bg-white p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Match quality</span>
                <span className="text-brand-700">High</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-brand-100">
                <div className="h-full w-[82%] rounded-full bg-gradient-to-r from-brand-500 to-fuchsia-400" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="group relative min-h-44 overflow-hidden rounded-[24px] border border-white/75 bg-white/72 p-6 shadow-[0_24px_70px_-58px_rgba(109,63,195,0.58)] backdrop-blur transition hover:-translate-y-0.5 hover:border-brand-200 hover:bg-white hover:shadow-[0_30px_80px_-56px_rgba(109,63,195,0.82)]"
          >
            <div className={`absolute inset-x-8 top-0 h-px bg-gradient-to-r ${card.accent} opacity-0 transition group-hover:opacity-100`} />
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{card.metric}</p>
                <h2 className="mt-4 text-xl font-semibold text-slate-950">{card.title}</h2>
              </div>
              <span className={`h-10 w-10 rounded-xl bg-gradient-to-br ${card.accent} opacity-85 shadow-[0_20px_70px_-28px_rgba(109,63,195,0.9)]`} />
            </div>
            <p className="mt-5 max-w-sm text-sm leading-6 text-slate-600">{card.body}</p>
            <div className="mt-6 text-sm font-medium text-brand-700 opacity-0 transition group-hover:opacity-100">Open</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
