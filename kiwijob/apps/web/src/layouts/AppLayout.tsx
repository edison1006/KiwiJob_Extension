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
  `flex items-center rounded-lg px-3 py-2.5 text-base font-medium transition ${
    collapsed ? "gap-3 lg:justify-center lg:gap-0" : "gap-3"
  } ${
    isActive
      ? "border border-white/60 bg-white/45 text-slate-900 shadow-[0_8px_28px_-16px_rgba(37,99,235,0.75)] ring-1 ring-brand-500/15 backdrop-blur-xl"
      : "border border-transparent text-slate-700 hover:bg-slate-100"
  }`;

function navIconClass(isActive: boolean, collapsed: boolean) {
  return `${isActive ? "text-brand-700" : "text-slate-500"} ${collapsed ? "" : "lg:hidden"}`.trim();
}

const premiumGradientClass =
  "animate-[premium-gradient_3s_ease_infinite] bg-[linear-gradient(90deg,#7c3aed,#c026d3,#8b5cf6,#7c3aed)] bg-[length:220%_100%] bg-clip-text text-transparent";

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
    "rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30";

  return (
    <div className="min-h-screen lg:flex">
      <aside
        className={`relative z-30 flex w-full overflow-visible flex-col border-b border-slate-200 bg-white transition-[width] duration-200 lg:min-h-screen lg:shrink-0 lg:border-b-0 lg:border-r ${
          sidebarCollapsed ? "lg:w-20" : "lg:w-64"
        }`}
      >
        <div className={`border-b border-slate-100 px-4 py-5 ${sidebarCollapsed ? "lg:px-3" : ""}`}>
          <div className={`flex items-start gap-2 ${sidebarCollapsed ? "lg:justify-center" : "justify-between"}`}>
            <img
              src="/kiwijob-logo.png"
              alt="KiwiJob"
              className={`h-12 w-auto object-contain object-left transition-all ${sidebarCollapsed ? "lg:max-w-12" : "max-w-[10rem]"}`}
              width={160}
              height={88}
            />
            <button
              type="button"
              className="hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:inline-flex"
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={toggleSidebar}
            >
              <svg className={`h-5 w-5 transition ${sidebarCollapsed ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          <div className={`mt-2 text-[11px] font-medium tracking-wide text-slate-400 ${sidebarCollapsed ? "lg:text-center" : ""}`}>
            {sidebarCollapsed ? <span className="hidden lg:inline">v1</span> : "v1.0"}
          </div>
        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-1 pt-2" aria-label="Primary">
          <NavLink to="/" end className={({ isActive }) => `${linkClass({ isActive, collapsed: sidebarCollapsed })}`} title="Home">
            {({ isActive }) => (
              <>
                <span className={navIconClass(isActive, sidebarCollapsed)}>
                  <IconHome />
                </span>
                <span className={sidebarCollapsed ? "lg:hidden" : ""}>Home</span>
              </>
            )}
          </NavLink>
          <NavLink to="/matches" className={({ isActive }) => `${linkClass({ isActive, collapsed: sidebarCollapsed })}`} title="Matches">
            {({ isActive }) => (
              <>
                <span className={navIconClass(isActive, sidebarCollapsed)}>
                  <IconHeart />
                </span>
                <span className={sidebarCollapsed ? "lg:hidden" : ""}>Matches</span>
              </>
            )}
          </NavLink>
          <NavLink to="/browse" className={({ isActive }) => `${linkClass({ isActive, collapsed: sidebarCollapsed })}`} title="Jobs">
            {({ isActive }) => (
              <>
                <span className={navIconClass(isActive, sidebarCollapsed)}>
                  <IconBriefcase />
                </span>
                <span className={sidebarCollapsed ? "lg:hidden" : ""}>Jobs</span>
              </>
            )}
          </NavLink>
          <NavLink to="/tracker" className={({ isActive }) => `${linkClass({ isActive, collapsed: sidebarCollapsed })}`} title="Job tracker">
            {({ isActive }) => (
              <>
                <span className={navIconClass(isActive, sidebarCollapsed)}>
                  <IconJobTracker />
                </span>
                <span className={sidebarCollapsed ? "lg:hidden" : ""}>Job tracker</span>
              </>
            )}
          </NavLink>
          <NavLink to="/documents" className={({ isActive }) => `${linkClass({ isActive, collapsed: sidebarCollapsed })}`} title="Documents">
            {({ isActive }) => (
              <>
                <span className={navIconClass(isActive, sidebarCollapsed)}>
                  <IconDocument />
                </span>
                <span className={sidebarCollapsed ? "lg:hidden" : ""}>Documents</span>
              </>
            )}
          </NavLink>
          <NavLink to="/services" className={({ isActive }) => `${linkClass({ isActive, collapsed: sidebarCollapsed })}`} title="Cover Letter">
            {({ isActive }) => (
              <>
                <span className={navIconClass(isActive, sidebarCollapsed)}>
                  <IconServices />
                </span>
                <span className={sidebarCollapsed ? "lg:hidden" : ""}>Cover Letter</span>
              </>
            )}
          </NavLink>

          <NavLink to="/interview-assistant" className={({ isActive }) => `${linkClass({ isActive, collapsed: sidebarCollapsed })}`} title="Interview Assistant">
            {({ isActive }) => (
              <>
                <span className={navIconClass(isActive, sidebarCollapsed)}>
                  <IconRefer />
                </span>
                <span className={sidebarCollapsed ? "lg:hidden" : ""}>Interview Assistant</span>
              </>
            )}
          </NavLink>
          <NavLink to="/premium" className={({ isActive }) => `${linkClass({ isActive, collapsed: sidebarCollapsed })}`} title="Premium">
            {() => (
              <>
                <span className={`${premiumGradientClass} ${sidebarCollapsed ? "" : "lg:hidden"}`}>
                  <IconMembership />
                </span>
                <span className={`${premiumGradientClass} ${sidebarCollapsed ? "lg:hidden" : ""}`}>Premium</span>
              </>
            )}
          </NavLink>
        </nav>

        <div className={`sticky bottom-0 z-20 mt-auto flex shrink-0 items-center gap-1 border-t border-slate-100 bg-white px-2 py-2 shadow-[0_-6px_18px_-14px_rgba(15,23,42,0.4)] ${sidebarCollapsed ? "lg:w-full lg:flex-col lg:px-2" : ""}`}>
          <div className={`flex shrink-0 items-center justify-center gap-0.5 ${sidebarCollapsed ? "lg:w-full lg:flex-col" : ""}`}>
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
          <div className={`mx-1 h-6 w-px shrink-0 self-center bg-slate-200 ${sidebarCollapsed ? "lg:h-px lg:w-8" : ""}`} aria-hidden />
          <UserMenu displayName={displayName} onSignOut={signOut} variant="sidebar" compactRow />
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
