import { NavLink, Outlet } from "react-router-dom";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
    isActive ? "bg-brand-600 text-white shadow-sm" : "text-slate-700 hover:bg-slate-100"
  }`;

export function AppLayout() {
  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-slate-200 bg-white lg:w-64 lg:border-b-0 lg:border-r">
        <div className="border-b border-slate-100 px-5 py-4">
          <img
            src="/easyjob-logo.svg"
            alt="EasyJob"
            className="h-14 w-auto max-w-[11rem] object-contain object-left"
            width={176}
            height={98}
          />
          <div className="mt-2 text-xs text-slate-500">Application workspace</div>
        </div>
        <nav className="space-y-1 px-3 pb-6">
          <NavLink to="/" end className={linkClass}>
            Job applications
          </NavLink>
          <NavLink to="/cv" className={linkClass}>
            CV upload
          </NavLink>
          <NavLink to="/analytics" className={linkClass}>
            Analytics
          </NavLink>
        </nav>
      </aside>
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
