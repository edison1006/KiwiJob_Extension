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

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
    isActive ? "bg-brand-600 text-white shadow-sm ring-1 ring-brand-600/20" : "text-slate-700 hover:bg-slate-100"
  }`;

/** Same footprint as an inactive nav row (for Refer disclosure trigger). */
const referSummaryClass =
  "flex cursor-pointer list-none items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition marker:hidden hover:bg-slate-100 [&::-webkit-details-marker]:hidden";

function navIconClass(isActive: boolean) {
  return isActive ? "text-white" : "text-slate-500";
}

export function AppLayout() {
  const [mockUserId, setMockUserId] = useState(() => localStorage.getItem("kiwijob_mock_user_id") ?? "");
  const [displayName, setDisplayName] = useState(() => readDisplayName());

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

  const issuesUrl = import.meta.env.VITE_ISSUES_URL?.trim();

  const utilBtn =
    "rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30";

  return (
    <div className="min-h-screen lg:flex">
      <aside className="relative z-10 flex w-full flex-col border-b border-slate-200 bg-white lg:min-h-screen lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="border-b border-slate-100 px-4 py-5">
          <img
            src="/kiwijob-logo.svg"
            alt="KiwiJob"
            className="h-12 w-auto max-w-[10rem] object-contain object-left"
            width={160}
            height={88}
          />
          <div className="mt-2 text-[11px] font-medium tracking-wide text-slate-400">v1.0</div>
        </div>

        <nav className="shrink-0 space-y-0.5 px-2 pb-1 pt-2" aria-label="Primary">
          <NavLink to="/" end className={({ isActive }) => `${linkClass({ isActive })}`}>
            {({ isActive }) => (
              <>
                <span className={navIconClass(isActive)}>
                  <IconHome />
                </span>
                Home
              </>
            )}
          </NavLink>
          <NavLink to="/matches" className={({ isActive }) => `${linkClass({ isActive })}`}>
            {({ isActive }) => (
              <>
                <span className={navIconClass(isActive)}>
                  <IconHeart />
                </span>
                Matches
              </>
            )}
          </NavLink>
          <NavLink to="/browse" className={({ isActive }) => `${linkClass({ isActive })}`}>
            {({ isActive }) => (
              <>
                <span className={navIconClass(isActive)}>
                  <IconBriefcase />
                </span>
                Jobs
              </>
            )}
          </NavLink>
          <NavLink to="/tracker" className={({ isActive }) => `${linkClass({ isActive })}`}>
            {({ isActive }) => (
              <>
                <span className={navIconClass(isActive)}>
                  <IconJobTracker />
                </span>
                Job tracker
              </>
            )}
          </NavLink>
          <NavLink to="/documents" className={({ isActive }) => `${linkClass({ isActive })}`}>
            {({ isActive }) => (
              <>
                <span className={navIconClass(isActive)}>
                  <IconDocument />
                </span>
                Documents
              </>
            )}
          </NavLink>
          <NavLink to="/services" className={({ isActive }) => `${linkClass({ isActive })}`}>
            {({ isActive }) => (
              <>
                <span className={navIconClass(isActive)}>
                  <IconServices />
                </span>
                Services
              </>
            )}
          </NavLink>

          <details className="group/refer">
            <summary className={referSummaryClass}>
              <span className="text-slate-500">
                <IconRefer />
              </span>
              <span className="min-w-0 flex-1 text-left">Refer</span>
              <IconChevronDown className="transition group-open/refer:rotate-180" />
            </summary>
            <div className="border-l border-slate-200 py-1.5 pl-3 pr-1 text-[11px] leading-relaxed text-slate-600">
              Referrals and credits are <span className="font-semibold text-slate-800">not in KiwiJob 1.0</span>. Share the repo with friends, or check back later.
            </div>
          </details>
        </nav>

        <div className="relative z-20 mt-auto flex shrink-0 items-center gap-1 border-t border-slate-100 bg-white px-2 py-2">
          <div className="flex shrink-0 items-center justify-center gap-0.5">
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
          <div className="mx-1 h-6 w-px shrink-0 self-center bg-slate-200" aria-hidden />
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
