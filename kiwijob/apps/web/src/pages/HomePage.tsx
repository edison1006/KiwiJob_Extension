import { type CSSProperties, type PointerEvent, useRef } from "react";
import { Link } from "react-router";

const jobSources = [
  { name: "SEEK", position: "left-[10%] top-[17%]", delay: "0s" },
  { name: "LinkedIn", position: "right-[9%] top-[17%]", delay: "-.8s" },
  { name: "Trade Me", position: "left-[3%] top-[48%]", delay: "-1.6s" },
  { name: "Indeed", position: "right-[4%] top-[48%]", delay: "-2.4s" },
  { name: "Jora", position: "left-[14%] bottom-[13%]", delay: "-3.2s" },
  { name: "Glassdoor", position: "right-[11%] bottom-[13%]", delay: "-4s" },
];

function SourceLogo({ name }: { name: string }) {
  if (name === "SEEK") {
    return <span className="font-sans text-2xl font-black lowercase tracking-[-0.08em] text-[#16264b]">seek</span>;
  }
  if (name === "LinkedIn") {
    return (
      <span className="flex items-center text-lg font-bold tracking-[-0.04em] text-slate-800">
        Linked<span className="ml-1 grid h-6 w-6 place-items-center rounded-[4px] bg-[#0a66c2] text-sm font-black leading-none text-white">in</span>
      </span>
    );
  }
  if (name === "Trade Me") {
    return (
      <span className="flex items-center gap-1.5 text-lg font-extrabold tracking-[-0.04em] text-slate-800">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-[#00b9d6] text-[10px] font-black text-white">TM</span>
        Trade Me
      </span>
    );
  }
  if (name === "Indeed") {
    return (
      <span className="relative text-xl font-bold lowercase tracking-[-0.055em] text-[#7cb9ff]">
        <span className="absolute -left-0.5 -top-1.5 h-2 w-4 rotate-[-18deg] rounded-[50%] border-t-2 border-[#7cb9ff]" aria-hidden />
        indeed
      </span>
    );
  }
  if (name === "Jora") {
    return <span className="text-2xl font-black tracking-[-0.06em] text-[#ff8558]">Jora</span>;
  }
  return (
    <span className="flex items-center gap-1.5 text-base font-bold tracking-[-0.035em] text-slate-800">
      <span className="relative h-7 w-4 border-y-[3px] border-[#66e19f] before:absolute before:left-0 before:top-0 before:h-3 before:w-[3px] before:bg-[#66e19f] after:absolute after:bottom-0 after:right-0 after:h-3 after:w-[3px] after:bg-[#66e19f]" aria-hidden />
      glassdoor
    </span>
  );
}

function JobNetworkOrbit() {
  return (
    <div className="group relative min-h-[30rem] py-5 text-slate-950 sm:py-7">
      <div className="app-aurora pointer-events-none absolute left-1/2 top-1/2 -ml-48 -mt-48 h-[25rem] w-[25rem] rounded-full bg-violet-300/35 blur-[75px]" />
      <div className="app-aurora pointer-events-none absolute left-[58%] top-[47%] -ml-32 -mt-32 h-64 w-64 rounded-full bg-fuchsia-200/35 blur-[85px] [animation-delay:-6s]" />
      <div className="app-grid-drift pointer-events-none absolute inset-x-0 top-16 h-[23rem] opacity-[0.32] [background-image:linear-gradient(rgba(109,63,195,.11)_1px,transparent_1px),linear-gradient(90deg,rgba(109,63,195,.11)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,black_18%,transparent_72%)]" />

      <div className="relative z-10 flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-brand-600/70">Source intelligence</div>
          <h3 className="mt-2 text-xl font-bold tracking-tight text-slate-950">One search. Every signal.</h3>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-white/60 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700 shadow-[0_12px_36px_-24px_rgba(5,150,105,.7)] backdrop-blur">
          <span className="kiwijob-network-beacon h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Live sync
        </div>
      </div>

      <div className="relative mx-auto mt-3 h-[21rem] max-w-[27rem]">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand-300/20" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2">
          <div className="kiwijob-network-scan absolute inset-0 rounded-full opacity-50" />
        </div>
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 432 336" aria-hidden>
          <defs>
            <linearGradient id="networkLine" x1="0" x2="1">
              <stop offset="0" stopColor="#67e8f9" stopOpacity=".18" />
              <stop offset=".5" stopColor="#c084fc" stopOpacity=".8" />
              <stop offset="1" stopColor="#f0abfc" stopOpacity=".18" />
            </linearGradient>
          </defs>
          <g className="kiwijob-network-links" fill="none" stroke="url(#networkLine)" strokeLinecap="round" strokeWidth="1.5">
            <path d="M216 168 C150 130 100 80 57 66" />
            <path d="M216 168 C280 126 332 82 377 68" />
            <path d="M216 168 C142 166 77 164 30 168" />
            <path d="M216 168 C292 169 354 170 406 170" />
            <path d="M216 168 C153 210 104 258 67 282" />
            <path d="M216 168 C279 215 329 259 368 282" />
          </g>
        </svg>

        {jobSources.map((source) => (
          <div
            key={source.name}
            className={`kiwijob-network-node group/source absolute z-10 ${source.position}`}
            style={{ animationDelay: source.delay }}
            title={`${source.name} connected`}
            aria-label={`${source.name} connected`}
          >
            <div className="relative flex min-h-10 min-w-20 items-center justify-center px-2 drop-shadow-[0_12px_20px_rgba(64,35,112,.16)] transition duration-300 group-hover/source:scale-110 group-hover/source:brightness-110">
              <SourceLogo name={source.name} />
              <span className="absolute -right-1 top-0 h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,.95)]" aria-hidden />
            </div>
          </div>
        ))}

        <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
          <div className="kiwijob-network-core relative grid h-28 w-28 place-items-center rounded-full border border-white/70 bg-[#241442] shadow-[0_28px_75px_-28px_rgba(109,63,195,.75),inset_0_1px_0_rgba(255,255,255,.18)]">
            <div className="absolute inset-2 rounded-full border border-dashed border-violet-200/35" />
            <img src="/kiwijob-fern.png" alt="KiwiJob" className="relative z-10 h-14 w-14 object-contain brightness-0 invert" />
            <span className="absolute -bottom-2 rounded-full border border-white/10 bg-[#241442] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.18em] text-violet-200">KiwiJob AI</span>
          </div>
        </div>
      </div>

      <div className="relative z-10 mx-auto flex max-w-sm items-center justify-center gap-8 sm:gap-12">
        {[["6", "Sources"], ["< 2s", "Detection"], ["24/7", "Sync"]].map(([value, label], index) => (
          <div key={label} className="relative min-w-16 text-center">
            {index ? <span className="absolute -left-4 top-1/2 h-1 w-1 -translate-y-1/2 rounded-full bg-brand-300 sm:-left-6" aria-hidden /> : null}
            <div className="text-sm font-extrabold text-brand-900">{value}</div>
            <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</div>
          </div>
        ))}
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

  function trackHeroPointer(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--hero-x", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--hero-y", `${event.clientY - rect.top}px`);
  }

  return (
    <div className="space-y-6">
      <div
        className="relative overflow-hidden rounded-[34px] border border-white/10 bg-[#150b31] p-5 text-white shadow-[0_38px_110px_-58px_rgba(39,18,82,0.98)] sm:p-7 lg:p-9"
        onPointerMove={trackHeroPointer}
        style={{ "--hero-x": "70%", "--hero-y": "20%" } as CSSProperties}
      >
        <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-violet-300/80 to-transparent" />
        <div className="app-aurora pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-violet-500/40 blur-3xl" />
        <div className="app-aurora pointer-events-none absolute -bottom-28 left-1/3 h-72 w-72 rounded-full bg-fuchsia-500/20 blur-3xl [animation-delay:-8s]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_var(--hero-x)_var(--hero-y),rgba(255,255,255,.16),transparent_26rem)]" />
        <div className="app-grid-drift pointer-events-none absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(255,255,255,.16)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.16)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:linear-gradient(to_right,black,transparent_80%)]" />

        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_26rem] xl:grid-cols-[minmax(0,1fr)_28rem] lg:items-stretch">
          <div className="flex flex-col justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-violet-100 backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-300 shadow-[0_0_14px_rgba(240,171,252,.9)]" />
                KiwiJob command center
              </div>
              <h1 className="mt-5 max-w-3xl bg-gradient-to-br from-white via-violet-100 to-fuchsia-300 bg-clip-text text-4xl font-extrabold tracking-[-0.045em] text-transparent sm:text-6xl xl:text-7xl">
                Make your next career move feel inevitable.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-violet-100/70">
                One live workspace for job discovery, JD-to-CV intelligence, application momentum, and every document that gets you closer.
              </p>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/browse"
                className="interactive-card rounded-full border border-white/20 bg-white px-5 py-3 text-sm font-bold text-brand-900 shadow-[0_18px_50px_-22px_rgba(196,181,253,0.9)] hover:bg-violet-50"
              >
                Browse jobs
              </Link>
              <Link
                to="/documents"
                className="interactive-card rounded-full border border-white/15 bg-white/10 px-5 py-3 text-sm font-bold text-white backdrop-blur hover:bg-white/15"
              >
                Upload CV
              </Link>
            </div>
          </div>

          <div className="kiwijob-float relative rounded-[28px] border border-white/15 bg-white/[0.08] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_30px_80px_-42px_rgba(168,85,247,.85)] backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <img src="/kiwijob-logo.png" alt="KiwiJob" className="h-12 w-12 rounded-2xl object-cover shadow-sm" />
              <div>
                <div className="text-sm font-semibold text-white">Pipeline snapshot</div>
                <div className="text-xs text-violet-100/55">Synced from dashboard and extension</div>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-2">
              {stats.map((stat) => (
                <div key={stat.label} className="interactive-card rounded-2xl border border-white/10 bg-white/[0.07] p-3 text-center">
                  <div className="text-xl font-bold tracking-tight text-white">{stat.value}</div>
                  <div className="mt-1 text-[11px] font-medium text-violet-100/55">{stat.label}</div>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/10 p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-violet-100/55">
                <span>Match quality</span>
                <span className="text-emerald-300">High</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-[82%] rounded-full bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-300 shadow-[0_0_18px_rgba(217,70,239,.7)]" />
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
                className="interactive-card group relative min-w-[18rem] snap-start rounded-[24px] border border-brand-100/80 bg-white/76 p-5 shadow-[0_20px_58px_-50px_rgba(109,63,195,0.72)] hover:border-brand-200 hover:bg-white sm:min-w-[25rem] xl:min-w-[28rem] 2xl:min-w-[30rem]"
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
            className="interactive-card group relative min-h-44 overflow-hidden rounded-[24px] border border-white/75 bg-white/72 p-6 shadow-[0_24px_70px_-58px_rgba(109,63,195,0.58)] backdrop-blur hover:border-brand-200 hover:bg-white hover:shadow-[0_30px_80px_-56px_rgba(109,63,195,0.82)]"
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

      <section className="flex justify-center py-2">
        <div className="w-full max-w-[38rem]">
          <JobNetworkOrbit />
        </div>
      </section>
    </div>
  );
}
