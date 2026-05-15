import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  IconBell,
  IconBriefcase,
  IconChevronDown,
  IconDocument,
  IconHeart,
  IconHelp,
  IconHome,
  IconJobTracker,
  IconMegaphone,
  IconRefer,
  IconServices,
} from "../components/nav/SidebarIcons";
import { UserMenu, KIWIJOB_PREFS_EVENT, readDisplayName, writeDisplayName } from "../components/UserMenu";

const LS_SIDEBAR_COLLAPSED = "kiwijob_sidebar_collapsed";

const linkClass = ({ isActive, collapsed }: { isActive: boolean; collapsed: boolean }) =>
  `flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition ${
    collapsed ? "justify-center gap-0" : "gap-3"
  } ${
    isActive ? "bg-brand-600 text-white shadow-sm ring-1 ring-brand-600/20" : "text-slate-700 hover:bg-slate-100"
  }`;

/** Same footprint as an inactive nav row (for Refer disclosure trigger). */
const referSummaryClass = (collapsed: boolean) =>
  `flex cursor-pointer list-none items-center rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition marker:hidden hover:bg-slate-100 [&::-webkit-details-marker]:hidden ${
    collapsed ? "justify-center gap-0" : "gap-3"
  }`;

function navIconClass(isActive: boolean) {
  return isActive ? "text-white" : "text-slate-500";
}

export function AppLayout() {
  const [mockUserId, setMockUserId] = useState(() => localStorage.getItem("kiwijob_mock_user_id") ?? "");
  const [displayName, setDisplayName] = useState(() => readDisplayName());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem(LS_SIDEBAR_COLLAPSED) === "1");

  useEffect(() => {
    const sync = () => {
      setDisplayName(readDisplayName());
      setMockUserId(localStorage.getItem("kiwijob_mock_user_id") ?? "");
    };
    window.addEventListener(KIWIJOB_PREFS_EVENT, sync);
    return () => window.removeEventListener(KIWIJOB_PREFS_EVENT, sync);
  }, []);

  function clearLocalSession() {
    localStorage.removeItem("kiwijob_mock_user_id");
    writeDisplayName("");
    setMockUserId("");
    setDisplayName("");
  }

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current;
      localStorage.setItem(LS_SIDEBAR_COLLAPSED, next ? "1" : "0");
      return next;
    });
  }

  const issuesUrl = import.meta.env.VITE_ISSUES_URL?.trim();

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
              src="/kiwijob-logo.svg"
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

        <nav className="shrink-0 space-y-0.5 px-2 pb-1 pt-2" aria-label="Primary">
          <NavLink to="/" end className={({ isActive }) => `${linkClass({ isActive, collapsed: sidebarCollapsed })}`} title="Home">
            {({ isActive }) => (
              <>
                <span className={navIconClass(isActive)}>
                  <IconHome />
                </span>
                <span className={sidebarCollapsed ? "lg:hidden" : ""}>Home</span>
              </>
            )}
          </NavLink>
          <NavLink to="/matches" className={({ isActive }) => `${linkClass({ isActive, collapsed: sidebarCollapsed })}`} title="Matches">
            {({ isActive }) => (
              <>
                <span className={navIconClass(isActive)}>
                  <IconHeart />
                </span>
                <span className={sidebarCollapsed ? "lg:hidden" : ""}>Matches</span>
              </>
            )}
          </NavLink>
          <NavLink to="/browse" className={({ isActive }) => `${linkClass({ isActive, collapsed: sidebarCollapsed })}`} title="Jobs">
            {({ isActive }) => (
              <>
                <span className={navIconClass(isActive)}>
                  <IconBriefcase />
                </span>
                <span className={sidebarCollapsed ? "lg:hidden" : ""}>Jobs</span>
              </>
            )}
          </NavLink>
          <NavLink to="/tracker" className={({ isActive }) => `${linkClass({ isActive, collapsed: sidebarCollapsed })}`} title="Job tracker">
            {({ isActive }) => (
              <>
                <span className={navIconClass(isActive)}>
                  <IconJobTracker />
                </span>
                <span className={sidebarCollapsed ? "lg:hidden" : ""}>Job tracker</span>
              </>
            )}
          </NavLink>
          <NavLink to="/documents" className={({ isActive }) => `${linkClass({ isActive, collapsed: sidebarCollapsed })}`} title="Documents">
            {({ isActive }) => (
              <>
                <span className={navIconClass(isActive)}>
                  <IconDocument />
                </span>
                <span className={sidebarCollapsed ? "lg:hidden" : ""}>Documents</span>
              </>
            )}
          </NavLink>
          <NavLink to="/services" className={({ isActive }) => `${linkClass({ isActive, collapsed: sidebarCollapsed })}`} title="Services">
            {({ isActive }) => (
              <>
                <span className={navIconClass(isActive)}>
                  <IconServices />
                </span>
                <span className={sidebarCollapsed ? "lg:hidden" : ""}>Services</span>
              </>
            )}
          </NavLink>

          <details className="group/refer">
            <summary className={referSummaryClass(sidebarCollapsed)} title="Refer">
              <span className="text-slate-500">
                <IconRefer />
              </span>
              <span className={`min-w-0 flex-1 text-left ${sidebarCollapsed ? "lg:hidden" : ""}`}>Refer</span>
              <IconChevronDown className={`transition group-open/refer:rotate-180 ${sidebarCollapsed ? "lg:hidden" : ""}`} />
            </summary>
            <div className={`border-l border-slate-200 py-1.5 pl-3 pr-1 text-[11px] leading-relaxed text-slate-600 ${sidebarCollapsed ? "lg:hidden" : ""}`}>
              Referrals and credits are <span className="font-semibold text-slate-800">not in KiwiJob 1.0</span>. Share the repo with friends, or check back later.
            </div>
          </details>
        </nav>

        <div className={`relative z-20 mt-auto flex shrink-0 items-center gap-1 border-t border-slate-100 bg-white px-2 py-2 ${sidebarCollapsed ? "lg:w-full lg:flex-col lg:px-2" : ""}`}>
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
          <UserMenu displayName={displayName} mockUserId={mockUserId} onSignOut={clearLocalSession} variant="sidebar" compactRow />
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
