import { useEffect, useState, type CSSProperties, type PointerEvent } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useAuth } from "../auth";
import AuthPage from "../pages/AuthPage";
import {
  IconBell,
  IconBriefcase,
  IconDocument,
  IconHeart,
  IconHelp,
  IconHome,
  IconJobTracker,
  IconMembership,
  IconMegaphone,
  IconRefer,
  IconServices,
} from "../components/nav/SidebarIcons";
import { UserMenu } from "../components/UserMenu";
import { GmailSyncPanel } from "../components/GmailSyncPanel";
import { dismissGmailOnboarding, fetchGmailStatus } from "../lib/api";

const LS_SIDEBAR_COLLAPSED = "kiwijob_sidebar_collapsed";

const linkClass = ({ isActive, collapsed }: { isActive: boolean; collapsed: boolean }) =>
  `group relative flex items-center overflow-hidden rounded-2xl px-2.5 py-2 text-[15px] font-semibold transition-all duration-300 ${
    collapsed ? "justify-center gap-0" : "gap-2.5"
  } ${
    isActive
      ? "border border-white/15 bg-white/[0.12] text-white shadow-[0_18px_55px_-30px_rgba(167,139,250,0.85)] before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-gradient-to-b before:from-violet-300 before:to-fuchsia-400"
      : "border border-transparent text-violet-100/65 hover:border-white/10 hover:bg-white/[0.07] hover:text-white"
  }`;

function navIconClass(isActive: boolean, collapsed: boolean) {
  return `grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-all duration-300 ${
    isActive
      ? "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-[0_12px_30px_-12px_rgba(168,85,247,0.95)]"
      : "bg-white/[0.045] text-violet-200/55 group-hover:-rotate-3 group-hover:bg-white/10 group-hover:text-violet-100"
  } ${collapsed ? "" : ""}`.trim();
}

const premiumGradientClass =
  "animate-[premium-gradient_3s_ease_infinite] bg-[linear-gradient(90deg,#c4b5fd,#8b5cf6,#e879f9,#c4b5fd)] bg-[length:220%_100%] bg-clip-text text-transparent";

export function AppLayout() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem(LS_SIDEBAR_COLLAPSED) === "1");
  const [gmailPromptOpen, setGmailPromptOpen] = useState(false);
  const [gmailPromptBusy, setGmailPromptBusy] = useState(false);
  const authModalOpen = new URLSearchParams(location.search).get("auth") === "login";

  const requiresAccount =
    location.pathname === "/matches"
    || location.pathname === "/browse"
    || location.pathname === "/tracker"
    || location.pathname === "/documents"
    || location.pathname === "/cv-optimizer"
    || location.pathname === "/settings"
    || location.pathname === "/services"
    || location.pathname === "/interview-assistant"
    || location.pathname === "/analytics"
    || location.pathname.startsWith("/jobs/")
    || location.pathname.startsWith("/match/");

  useEffect(() => {
    if (!loading && !user && requiresAccount && !authModalOpen) openAuthModal("login");
  }, [authModalOpen, loading, location.pathname, requiresAccount, user]);

  useEffect(() => {
    if (!user) {
      setGmailPromptOpen(false);
      return;
    }
    void fetchGmailStatus()
      .then((status) => setGmailPromptOpen(status.configured && status.prompt_required))
      .catch(() => setGmailPromptOpen(false));
  }, [user?.id]);

  function closeGmailPrompt() {
    setGmailPromptOpen(false);
    const next = new URLSearchParams(location.search);
    next.delete("gmail");
    next.delete("message");
    const search = next.toString();
    navigate({ pathname: location.pathname, search: search ? `?${search}` : "" }, { replace: true });
  }

  async function skipGmailPrompt() {
    setGmailPromptBusy(true);
    try {
      await dismissGmailOnboarding();
      closeGmailPrompt();
    } finally {
      setGmailPromptBusy(false);
    }
  }

  async function signOut() {
    await logout();
    navigate("/login", { replace: true });
  }

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current;
      localStorage.setItem(LS_SIDEBAR_COLLAPSED, next ? "1" : "0");
      return next;
    });
  }

  function openAuthModal(mode: "login" | "register" = "login") {
    const next = new URLSearchParams(location.search);
    next.set("auth", "login");
    next.set("mode", mode);
    navigate({ pathname: location.pathname, search: `?${next.toString()}` }, { replace: false });
  }

  const issuesUrl = import.meta.env.VITE_ISSUES_URL?.trim();
  const displayName = user?.display_name || user?.email || "Account";

  const utilBtn = `group/tool relative grid h-10 w-10 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.045] text-violet-200/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-300 hover:-translate-y-0.5 hover:border-violet-300/25 hover:bg-white/[0.12] hover:text-white hover:shadow-[0_12px_30px_-16px_rgba(139,92,246,0.9)] focus:outline-none focus:ring-2 focus:ring-violet-300/30 ${
    sidebarCollapsed ? "h-8 w-8" : "flex-1"
  }`;

  function trackPointer(event: PointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--pointer-x", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--pointer-y", `${event.clientY - rect.top}px`);
  }

  return (
    <div className="flex min-h-screen bg-[#f7f4ff] text-slate-950">
      <aside
        className={`relative z-30 flex min-h-screen shrink-0 overflow-visible flex-col border-r border-white/10 bg-[#120b29] shadow-[24px_0_90px_-58px_rgba(36,18,76,0.95)] transition-[width] duration-300 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-80 before:bg-[radial-gradient(circle_at_48%_0%,rgba(139,92,246,0.32),transparent_65%)] after:pointer-events-none after:absolute after:inset-0 after:bg-[linear-gradient(135deg,rgba(255,255,255,0.035),transparent_35%,rgba(217,70,239,0.035))] ${
          sidebarCollapsed ? "w-20" : "w-64"
        }`}
      >
        <div className={`relative z-10 border-b border-white/10 px-4 py-5 ${sidebarCollapsed ? "px-2 py-4" : ""}`}>
          <div className={`relative flex items-start gap-2 ${sidebarCollapsed ? "justify-center" : "justify-between"}`}>
            <div className={`flex items-center ${sidebarCollapsed ? "justify-center" : ""}`}>
              {sidebarCollapsed ? (
                <div className="relative grid h-12 w-12 place-items-center rounded-[18px] border border-white/10 bg-gradient-to-br from-white/[0.14] to-violet-400/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,.12),0_16px_42px_-22px_rgba(139,92,246,.95)]">
                  <span className="pointer-events-none absolute inset-1 rounded-[14px] bg-[radial-gradient(circle_at_35%_25%,rgba(255,255,255,.12),transparent_58%)]" />
                  <img src="/kiwijob-fern.png" alt="KiwiJob" className="relative z-10 h-9 w-9 object-contain brightness-0 invert" />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="kiwijob-pulse-ring grid h-12 w-12 place-items-center rounded-2xl bg-white/10">
                    <img src="/kiwijob-fern.png" alt="" className="h-10 w-9 object-contain brightness-0 invert" aria-hidden />
                  </div>
                  <div>
                    <span className="font-mono text-lg font-extrabold tracking-tight text-white">KiwiJob</span>
                    <span className="block text-[9px] font-semibold uppercase tracking-[0.24em] text-violet-300/65">Career OS</span>
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              className={`grid place-items-center text-violet-200/60 transition-all duration-300 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/40 ${
                sidebarCollapsed
                  ? "absolute -right-6 top-1/2 z-30 h-8 w-8 -translate-y-1/2 rounded-full border border-white/15 bg-[#241442]/95 shadow-[0_10px_28px_-12px_rgba(36,20,66,.95)] backdrop-blur-xl hover:scale-105 hover:border-violet-300/35 hover:bg-[#34205c]"
                  : "rounded-xl p-2 hover:bg-white/10"
              }`}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={toggleSidebar}
            >
              <svg className={`transition ${sidebarCollapsed ? "h-4 w-4 rotate-180" : "h-5 w-5"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>

        <nav className="relative z-10 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-1 pt-3" aria-label="Primary">
          <NavLink to="/" end className={({ isActive }) => `${linkClass({ isActive, collapsed: sidebarCollapsed })}`} title="Home">
            {({ isActive }) => (
              <>
                <span className={navIconClass(isActive, sidebarCollapsed)}>
                  <IconHome />
                </span>
                <span className={sidebarCollapsed ? "hidden" : ""}>Home</span>
              </>
            )}
          </NavLink>
          <NavLink to="/matches" className={({ isActive }) => `${linkClass({ isActive, collapsed: sidebarCollapsed })}`} title="Matches">
            {({ isActive }) => (
              <>
                <span className={navIconClass(isActive, sidebarCollapsed)}>
                  <IconHeart />
                </span>
                <span className={sidebarCollapsed ? "hidden" : ""}>Matches</span>
              </>
            )}
          </NavLink>
          <NavLink to="/browse" className={({ isActive }) => `${linkClass({ isActive, collapsed: sidebarCollapsed })}`} title="Jobs">
            {({ isActive }) => (
              <>
                <span className={navIconClass(isActive, sidebarCollapsed)}>
                  <IconBriefcase />
                </span>
                <span className={sidebarCollapsed ? "hidden" : ""}>Jobs</span>
              </>
            )}
          </NavLink>
          <NavLink to="/tracker" className={({ isActive }) => `${linkClass({ isActive, collapsed: sidebarCollapsed })}`} title="Job tracker">
            {({ isActive }) => (
              <>
                <span className={navIconClass(isActive, sidebarCollapsed)}>
                  <IconJobTracker />
                </span>
                <span className={sidebarCollapsed ? "hidden" : ""}>Job tracker</span>
              </>
            )}
          </NavLink>
          <NavLink to="/documents" className={({ isActive }) => `${linkClass({ isActive, collapsed: sidebarCollapsed })}`} title="Documents">
            {({ isActive }) => (
              <>
                <span className={navIconClass(isActive, sidebarCollapsed)}>
                  <IconDocument />
                </span>
                <span className={sidebarCollapsed ? "hidden" : ""}>Documents</span>
              </>
            )}
          </NavLink>
          <NavLink to="/cv-optimizer" className={({ isActive }) => `${linkClass({ isActive, collapsed: sidebarCollapsed })}`} title="CV Optimizer">
            {({ isActive }) => (
              <>
                <span className={navIconClass(isActive, sidebarCollapsed)}>
                  <IconHeart />
                </span>
                <span className={sidebarCollapsed ? "hidden" : ""}>CV Optimizer</span>
              </>
            )}
          </NavLink>
          <NavLink to="/services" className={({ isActive }) => `${linkClass({ isActive, collapsed: sidebarCollapsed })}`} title="Cover Letter">
            {({ isActive }) => (
              <>
                <span className={navIconClass(isActive, sidebarCollapsed)}>
                  <IconServices />
                </span>
                <span className={sidebarCollapsed ? "hidden" : ""}>Cover Letter</span>
              </>
            )}
          </NavLink>

          <NavLink to="/interview-assistant" className={({ isActive }) => `${linkClass({ isActive, collapsed: sidebarCollapsed })}`} title="Interview Assistant">
            {({ isActive }) => (
              <>
                <span className={navIconClass(isActive, sidebarCollapsed)}>
                  <IconRefer />
                </span>
                <span className={sidebarCollapsed ? "hidden" : ""}>Interview Assistant</span>
              </>
            )}
          </NavLink>
          <NavLink
            to="/premium"
            className={({ isActive }) =>
              `group/premium relative mt-1 overflow-hidden border border-white/[0.14] bg-white/[0.075] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.14),0_18px_45px_-28px_rgba(217,70,239,.9)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-fuchsia-300/35 hover:bg-white/[0.12] hover:shadow-[inset_0_1px_0_rgba(255,255,255,.2),0_22px_48px_-25px_rgba(217,70,239,.95)] ${
                sidebarCollapsed ? "mx-auto grid h-11 w-11 place-items-center rounded-2xl" : "flex items-center justify-between rounded-2xl px-3 py-2.5"
              } ${isActive ? "border-fuchsia-300/40 bg-white/[0.14]" : ""}`
            }
            title="Premium"
          >
            <span className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-fuchsia-200/90 to-transparent" />
            <span className="pointer-events-none absolute -right-4 -top-8 h-16 w-16 rounded-full bg-fuchsia-400/20 blur-xl transition duration-500 group-hover/premium:scale-150" />
            <span className={`relative z-10 flex items-center ${sidebarCollapsed ? "justify-center" : "gap-2.5"}`}>
              <span className="grid h-7 w-7 place-items-center rounded-xl bg-gradient-to-br from-violet-400/30 to-fuchsia-400/30 text-fuchsia-100 shadow-[inset_0_1px_0_rgba(255,255,255,.2)]">
                <IconMembership className="h-4 w-4" />
              </span>
              <span className={`${premiumGradientClass} text-sm font-extrabold tracking-wide ${sidebarCollapsed ? "hidden" : ""}`}>Premium</span>
            </span>
            {!sidebarCollapsed ? (
              <span className="relative z-10 rounded-full border border-fuchsia-200/15 bg-fuchsia-300/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.16em] text-fuchsia-100/80">
                Pro
              </span>
            ) : null}
          </NavLink>
        </nav>

        <div className={`sticky bottom-0 z-20 mt-auto shrink-0 border-t border-white/10 bg-[#120b29]/92 p-2.5 shadow-[0_-24px_70px_-54px_rgba(139,92,246,0.75)] backdrop-blur-xl ${sidebarCollapsed ? "w-full px-2" : ""}`}>
          {!sidebarCollapsed ? (
            <div className="mb-2 flex items-center justify-between px-1.5">
              <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-violet-200/35">Quick access</span>
              <span className="inline-flex items-center gap-1.5 text-[9px] font-semibold text-emerald-300/65">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_9px_rgba(110,231,183,.9)]" />
                All systems ready
              </span>
            </div>
          ) : null}
          <div className={`items-center rounded-2xl border border-white/[0.08] bg-black/10 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] ${sidebarCollapsed ? "grid grid-cols-2 gap-1" : "flex gap-1"}`}>
            <button type="button" className={utilBtn} title="Product updates" aria-label="Announcements">
              <IconMegaphone className="h-[18px] w-[18px]" />
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-fuchsia-400 shadow-[0_0_8px_rgba(232,121,249,.9)]" aria-hidden />
            </button>
            {issuesUrl ? (
              <a href={issuesUrl} target="_blank" rel="noreferrer" className={utilBtn} title="Help & support" aria-label="Help">
                <IconHelp className="h-[18px] w-[18px]" />
              </a>
            ) : (
              <button type="button" className={utilBtn} title="Set VITE_ISSUES_URL in .env.local for a help link (e.g. GitHub Issues)." aria-label="Help">
                <IconHelp className="h-[18px] w-[18px]" />
              </button>
            )}
            <button type="button" className={utilBtn} title="No in-app notifications in this MVP." aria-label="Notifications">
              <IconBell className="h-[18px] w-[18px]" />
            </button>
            <div className={`shrink-0 bg-white/10 ${sidebarCollapsed ? "hidden" : "mx-0.5 h-6 w-px"}`} aria-hidden />
            {user ? (
              <UserMenu displayName={displayName} onSignOut={signOut} variant="sidebar" compactRow />
            ) : (
              <button
                type="button"
                className={`rounded-xl border border-white/10 bg-white px-3 py-2 text-xs font-bold text-brand-900 shadow-[0_12px_32px_-18px_rgba(196,181,253,.85)] transition hover:-translate-y-0.5 hover:bg-violet-50 ${sidebarCollapsed ? "grid h-8 w-8 place-items-center p-0" : "ml-1"}`}
                onClick={() => openAuthModal("login")}
                title="Log in"
              >
                {sidebarCollapsed ? "↗" : "Log in"}
              </button>
            )}
          </div>
        </div>
      </aside>
      <main
        className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-[#f8f6ff]"
        onPointerMove={trackPointer}
        style={{ "--pointer-x": "50%", "--pointer-y": "20%" } as CSSProperties}
      >
        <div className="app-aurora pointer-events-none absolute -left-24 -top-36 h-[34rem] w-[34rem] rounded-full bg-violet-300/35 blur-[110px]" />
        <div className="app-aurora pointer-events-none absolute -right-28 top-28 h-[30rem] w-[30rem] rounded-full bg-fuchsia-200/30 blur-[120px] [animation-delay:-7s]" />
        <div className="app-grid-drift pointer-events-none absolute inset-0 opacity-[0.42] [background-image:linear-gradient(rgba(109,63,195,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(109,63,195,0.08)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_var(--pointer-x)_var(--pointer-y),rgba(255,255,255,0.95),transparent_22rem)] opacity-80" />
        <div className="relative z-10 w-full flex-1 px-3 py-6 sm:px-5 lg:px-6 xl:px-8">
          <div key={location.pathname} className="route-stage">
            <Outlet />
          </div>
        </div>
      </main>
      {authModalOpen ? <AuthPage /> : null}
      {gmailPromptOpen && user ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center overflow-y-auto bg-slate-950/45 px-4 py-6 backdrop-blur-[2px]">
          <section role="dialog" aria-modal="true" aria-labelledby="gmail-sync-title" className="w-full max-w-2xl rounded-3xl border border-white/70 bg-white p-6 shadow-[0_34px_100px_-36px_rgba(15,23,42,.72)] sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">Optional Gmail Add-on</p>
                <h2 id="gmail-sync-title" className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Update your tracker from the email you open</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">KiwiJob does not scan your mailbox. The Add-on reads only the open message, automatically syncs reliable results, and asks before applying ambiguous ones.</p>
              </div>
              <button type="button" aria-label="Close" className="rounded-full p-2 text-slate-500 hover:bg-slate-100" onClick={closeGmailPrompt}>✕</button>
            </div>
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <GmailSyncPanel onboarding onDone={closeGmailPrompt} />
            </div>
            <div className="mt-5 flex justify-end">
              <button type="button" disabled={gmailPromptBusy} onClick={() => void skipGmailPrompt()} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">
                Not now
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
