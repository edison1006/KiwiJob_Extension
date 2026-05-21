import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
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

const LS_SIDEBAR_COLLAPSED = "kiwijob_sidebar_collapsed";

const linkClass = ({ isActive, collapsed }: { isActive: boolean; collapsed: boolean }) =>
  `group flex items-center rounded-xl px-3 py-2.5 text-base font-medium transition ${
    collapsed ? "justify-center gap-0" : "gap-3"
  } ${
    isActive
      ? "border border-brand-200 bg-white text-brand-900 shadow-[0_18px_60px_-38px_rgba(109,63,195,0.55)]"
      : "border border-transparent text-slate-600 hover:bg-white/70 hover:text-brand-900"
  }`;

function navIconClass(isActive: boolean, collapsed: boolean) {
  return `${isActive ? "text-brand-600" : "text-slate-400 group-hover:text-brand-500"} ${collapsed ? "" : "hidden"}`.trim();
}

const premiumGradientClass =
  "animate-[premium-gradient_3s_ease_infinite] bg-[linear-gradient(90deg,#c4b5fd,#8b5cf6,#e879f9,#c4b5fd)] bg-[length:220%_100%] bg-clip-text text-transparent";

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem(LS_SIDEBAR_COLLAPSED) === "1");

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

  const issuesUrl = import.meta.env.VITE_ISSUES_URL?.trim();
  const displayName = user?.display_name || user?.email || "Account";

  const utilBtn =
    "rounded-xl p-2 text-slate-500 transition hover:bg-white/80 hover:text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300/30";

  return (
    <div className="flex min-h-screen bg-[#f6f1ff] text-slate-950">
      <aside
        className={`relative z-30 flex min-h-screen shrink-0 overflow-visible flex-col border-r border-brand-100/80 bg-white/78 shadow-[18px_0_70px_-60px_rgba(109,63,195,0.65)] backdrop-blur-xl transition-[width] duration-200 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-64 before:bg-[radial-gradient(circle_at_50%_0%,rgba(196,181,253,0.38),transparent_68%)] ${
          sidebarCollapsed ? "w-20" : "w-64"
        }`}
      >
        <div className={`relative border-b border-brand-100/80 px-4 py-5 ${sidebarCollapsed ? "px-3" : ""}`}>
          <div className={`flex items-start gap-2 ${sidebarCollapsed ? "justify-center" : "justify-between"}`}>
            <div className={`flex items-center gap-3 ${sidebarCollapsed ? "justify-center" : ""}`}>
              <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-brand-100 bg-white shadow-[0_16px_45px_-24px_rgba(109,63,195,0.7)]">
                <img src="/kiwijob-logo.png" alt="KiwiJob" className="h-full w-full object-cover" width={40} height={40} />
              </span>
              <div className={sidebarCollapsed ? "hidden" : ""}>
                <div className="text-base font-bold tracking-tight text-slate-950">KiwiJob</div>
                <div className="text-xs text-slate-500">Career command center</div>
              </div>
            </div>
            <button
              type="button"
              className="inline-flex rounded-xl p-2 text-slate-500 hover:bg-white/80 hover:text-brand-700"
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={toggleSidebar}
            >
              <svg className={`h-5 w-5 transition ${sidebarCollapsed ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>

        <nav className="relative flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-1 pt-3" aria-label="Primary">
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
          <NavLink to="/premium" className={({ isActive }) => `${linkClass({ isActive, collapsed: sidebarCollapsed })}`} title="Premium">
            {() => (
              <>
                <span className={`${premiumGradientClass} ${sidebarCollapsed ? "" : "hidden"}`}>
                  <IconMembership />
                </span>
                <span className={`${premiumGradientClass} ${sidebarCollapsed ? "hidden" : ""}`}>Premium</span>
              </>
            )}
          </NavLink>
        </nav>

        <div className={`sticky bottom-0 z-20 mt-auto flex shrink-0 items-center gap-1 border-t border-brand-100/80 bg-white/82 px-2 py-2 shadow-[0_-24px_70px_-54px_rgba(109,63,195,0.55)] backdrop-blur ${sidebarCollapsed ? "w-full flex-col px-2" : ""}`}>
          <div className={`flex shrink-0 items-center justify-center gap-0.5 ${sidebarCollapsed ? "w-full flex-col" : ""}`}>
            <button type="button" className={utilBtn} title="Product updates — see GitHub releases or changelog in the repo." aria-label="Announcements">
              <IconMegaphone />
            </button>
            {issuesUrl ? (
              <a href={issuesUrl} target="_blank" rel="noreferrer" className={utilBtn} title="Help & support" aria-label="Help">
                <IconHelp />
              </a>
            ) : (
              <button type="button" className={utilBtn} title="Set VITE_ISSUES_URL in .env.local for a help link (e.g. GitHub Issues)." aria-label="Help">
                <IconHelp />
              </button>
            )}
            <button type="button" className={utilBtn} title="No in-app notifications in this MVP." aria-label="Notifications">
              <IconBell />
            </button>
          </div>
          <div className={`mx-1 h-6 w-px shrink-0 self-center bg-brand-100 ${sidebarCollapsed ? "h-px w-8" : ""}`} aria-hidden />
          <UserMenu displayName={displayName} onSignOut={signOut} variant="sidebar" compactRow />
        </div>
      </aside>
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(circle_at_50%_0%,rgba(196,181,253,0.42),rgba(245,243,255,0.72)_42%,transparent_76%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.42] [background-image:linear-gradient(rgba(109,63,195,0.09)_1px,transparent_1px),linear-gradient(90deg,rgba(109,63,195,0.09)_1px,transparent_1px)] [background-size:64px_64px]" />
        <div className="relative mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
