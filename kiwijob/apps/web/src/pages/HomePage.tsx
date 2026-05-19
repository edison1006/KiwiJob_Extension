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

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] p-7 shadow-[0_30px_90px_-55px_rgba(139,92,246,0.9)] backdrop-blur-xl sm:p-10">
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-brand-300/80 to-transparent" />
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-brand-500/15 blur-3xl" />
        <div className="max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-brand-300/85">KiwiJob dashboard</p>
          <h1 className="mt-4 max-w-2xl bg-gradient-to-br from-white to-zinc-500 bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-6xl">
            Your career search, organized in one place.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-400">
            Jump into your pipeline, compare job matches, upload CVs, and keep every application moving with the same data
            your browser extension captures.
          </p>
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/browse"
            className="rounded-full border border-brand-300/25 bg-brand-500/15 px-5 py-2.5 text-sm font-semibold text-brand-100 shadow-[0_0_40px_-18px_rgba(139,92,246,0.95)] transition hover:bg-brand-500/20"
          >
            Browse jobs
          </Link>
          <Link
            to="/documents"
            className="rounded-full border border-white/10 bg-[#09090b] px-5 py-2.5 text-sm font-semibold text-zinc-300 transition hover:border-white/20 hover:text-white"
          >
            Upload CV
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="group relative min-h-44 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/55 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] transition hover:border-brand-300/35 hover:bg-zinc-900/75"
          >
            <div className={`absolute inset-x-8 top-0 h-px bg-gradient-to-r ${card.accent} opacity-0 transition group-hover:opacity-100`} />
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">{card.metric}</p>
                <h2 className="mt-4 text-xl font-semibold text-zinc-100">{card.title}</h2>
              </div>
              <span className={`h-10 w-10 rounded-xl bg-gradient-to-br ${card.accent} opacity-80 shadow-[0_20px_70px_-28px_rgba(139,92,246,0.95)]`} />
            </div>
            <p className="mt-5 max-w-sm text-sm leading-6 text-zinc-400">{card.body}</p>
            <div className="mt-6 text-sm font-medium text-brand-200 opacity-0 transition group-hover:opacity-100">Open</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
