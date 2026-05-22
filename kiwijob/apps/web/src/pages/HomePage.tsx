import { type CSSProperties, useRef } from "react";
import { Link } from "react-router-dom";

const jobSources = [
  { name: "SEEK", angle: "0deg", counterAngle: "0deg", tone: "bg-[#121a44] text-white" },
  { name: "in", label: "LinkedIn", angle: "45deg", counterAngle: "-45deg", tone: "bg-[#0a66c2] text-white" },
  { name: "TM", label: "Trade Me", angle: "90deg", counterAngle: "-90deg", tone: "bg-[#00a6d6] text-white" },
  { name: "indeed", angle: "135deg", counterAngle: "-135deg", tone: "bg-white text-[#2557a7]" },
  { name: "Jora", angle: "180deg", counterAngle: "-180deg", tone: "bg-[#f26b21] text-white" },
  { name: "GD", label: "Glassdoor", angle: "225deg", counterAngle: "-225deg", tone: "bg-[#0caa41] text-white" },
  { name: "NZ", label: "Recruit NZ", angle: "270deg", counterAngle: "-270deg", tone: "bg-brand-700 text-white" },
  { name: "Job", label: "Job boards", angle: "315deg", counterAngle: "-315deg", tone: "bg-white text-brand-800" },
];

function JobNetworkOrbit() {
  return (
    <div className="group relative min-h-[28rem] overflow-hidden rounded-[28px] bg-transparent p-5">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(196,181,253,0.44),transparent_56%)]" />
      <div className="pointer-events-none absolute inset-8 rounded-full border border-dashed border-brand-200/70" />
      <div className="pointer-events-none absolute inset-16 rounded-full border border-dashed border-fuchsia-200/60" />

      <div className="relative mx-auto flex h-full min-h-[25.5rem] max-w-[25.5rem] items-center justify-center transition duration-500 group-hover:scale-[1.07]">
        <div className="kiwijob-orbit absolute inset-0">
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 400" aria-hidden>
            <g stroke="rgba(109,63,195,0.34)" strokeDasharray="8 12" strokeLinecap="round" strokeWidth="1.8">
              <line x1="200" y1="200" x2="200" y2="68" />
              <line x1="200" y1="200" x2="292" y2="108" />
              <line x1="200" y1="200" x2="332" y2="200" />
              <line x1="200" y1="200" x2="292" y2="292" />
              <line x1="200" y1="200" x2="200" y2="332" />
              <line x1="200" y1="200" x2="108" y2="292" />
              <line x1="200" y1="200" x2="68" y2="200" />
              <line x1="200" y1="200" x2="108" y2="108" />
            </g>
          </svg>

          {jobSources.map((source) => (
            <div
              key={source.label ?? source.name}
              className="kiwijob-orbit-position absolute left-1/2 top-1/2"
              style={
                {
                  "--node-angle": source.angle,
                  "--node-counter-angle": source.counterAngle,
                } as CSSProperties
              }
            >
              <div className="kiwijob-orbit-node flex flex-col items-center gap-1">
                <div
                  className={`grid h-14 min-w-14 place-items-center rounded-2xl border border-white/80 px-3 text-sm font-black tracking-tight shadow-[0_18px_46px_-30px_rgba(109,63,195,0.9)] ${source.tone}`}
                  title={source.label ?? source.name}
                >
                  {source.name}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="relative z-10 grid h-28 w-28 place-items-center rounded-[1.75rem] border border-white/80 bg-white/82 p-3.5 shadow-[0_30px_80px_-42px_rgba(109,63,195,0.95)] backdrop-blur">
          <img src="/kiwijob-logo.png" alt="KiwiJob" className="h-full w-full rounded-[1.35rem] object-cover" />
        </div>
      </div>
    </div>
  );
}

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
  const guideSteps = [
    {
      to: "/documents",
      title: "Upload your CV",
      body: "Add your latest resume so Profile and Match can stay accurate.",
      done: true,
    },
    {
      to: "/settings#profile",
      title: "Complete profile",
      body: "Confirm your contact info, skills, visa status, links, and preferences.",
      done: true,
    },
    {
      to: "/browse",
      title: "Connect job sources",
      body: "Search across SEEK, LinkedIn, Trade Me, Indeed, and other NZ job boards.",
      done: false,
    },
    {
      to: "/tracker",
      title: "Save target jobs",
      body: "Capture each role, source, JD, status, and application stage in one place.",
      done: false,
    },
    {
      to: "/matches",
      title: "Analyze match",
      body: "Compare the JD requirements against your selected CV before applying.",
      done: false,
    },
    {
      to: "/analytics",
      title: "Review outcomes",
      body: "Track replies, interviews, results, title trends, and weekly progress.",
      done: false,
    },
  ];
  const completedSteps = guideSteps.filter((step) => step.done).length;
  const progressPct = Math.round((completedSteps / guideSteps.length) * 100);
  const guideRef = useRef<HTMLDivElement>(null);
  const stats = [
    { label: "Active roles", value: "12" },
    { label: "Interviews", value: "4" },
    { label: "Avg match", value: "86%" },
  ];

  function scrollGuide(direction: "left" | "right") {
    guideRef.current?.scrollBy({ left: direction === "left" ? -420 : 420, behavior: "smooth" });
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-[32px] border border-white/80 bg-white/78 p-5 shadow-[0_28px_90px_-62px_rgba(109,63,195,0.72)] backdrop-blur-xl sm:p-7 lg:p-9">
        <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-brand-300/70 to-transparent" />
        <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-brand-200/55 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/2 h-64 w-64 rounded-full bg-fuchsia-100/70 blur-3xl" />

        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_26rem] xl:grid-cols-[minmax(0,1fr)_28rem] lg:items-stretch">
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

      <section className="overflow-hidden rounded-[32px] border border-white/80 bg-white/78 p-5 shadow-[0_28px_90px_-62px_rgba(109,63,195,0.72)] backdrop-blur-xl sm:p-7 lg:p-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-center">
          <div>
            <div className="inline-flex rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">
              Guided setup
            </div>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">Get started with KiwiJob</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Complete a few focused steps to move from job discovery to tracked applications, match analysis, and interview outcomes.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-brand-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-600 to-fuchsia-400"
                style={{ width: `${progressPct}%` }}
                aria-hidden
              />
            </div>
            <div className="min-w-12 text-right text-lg font-bold text-brand-700">
              {completedSteps}/{guideSteps.length}
            </div>
          </div>
        </div>

        <div className="mt-8 flex items-stretch gap-4">
          <div className="hidden shrink-0 flex-col justify-center rounded-[24px] border border-brand-100 bg-white/70 p-2.5 shadow-sm sm:flex">
            <button
              type="button"
              className="grid h-11 w-11 place-items-center rounded-full bg-white text-2xl text-brand-600 shadow-[0_14px_34px_-22px_rgba(109,63,195,0.9)] transition hover:bg-brand-50"
              aria-label="Previous setup steps"
              onClick={() => scrollGuide("left")}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              className="mt-3 grid h-11 w-11 place-items-center rounded-full bg-white text-2xl text-brand-600 shadow-[0_14px_34px_-22px_rgba(109,63,195,0.9)] transition hover:bg-brand-50"
              aria-label="Next setup steps"
              onClick={() => scrollGuide("right")}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          <div
            ref={guideRef}
            className="flex flex-1 snap-x gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {guideSteps.map((step, index) => (
              <Link
                key={step.title}
                to={step.to}
                className="group relative min-w-[18rem] snap-start rounded-[24px] border border-brand-100/80 bg-white/76 p-5 shadow-[0_20px_58px_-50px_rgba(109,63,195,0.72)] transition hover:-translate-y-0.5 hover:border-brand-200 hover:bg-white sm:min-w-[25rem] xl:min-w-[28rem] 2xl:min-w-[30rem]"
              >
                <div className="flex items-start gap-4">
                  <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl border text-sm font-bold ${
                    step.done ? "border-brand-200 bg-brand-600 text-white" : "border-brand-100 bg-brand-50 text-brand-700"
                  }`}>
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold tracking-tight text-slate-950">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{step.body}</p>
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-between">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    step.done ? "bg-emerald-50 text-emerald-700" : "bg-brand-50 text-brand-700"
                  }`}>
                    {step.done ? "Complete" : "Next step"}
                  </span>
                  <span className="text-sm font-semibold text-brand-700 opacity-0 transition group-hover:opacity-100">Open</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

      <section className="flex justify-center py-4">
        <div className="w-full max-w-[34rem]">
          <JobNetworkOrbit />
        </div>
      </section>
    </div>
  );
}
