import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { getApiBaseUrl, probeApiHealth } from "../lib/api";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
    isActive ? "bg-brand-600 text-white shadow-sm" : "text-slate-700 hover:bg-slate-100"
  }`;

export function AppLayout() {
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [mockUserId, setMockUserId] = useState(() => localStorage.getItem("easyjob_mock_user_id") ?? "");

  useEffect(() => {
    void probeApiHealth().then(setApiOk);
  }, []);

  function persistMockUser() {
    const t = mockUserId.trim();
    if (t) localStorage.setItem("easyjob_mock_user_id", t);
    else localStorage.removeItem("easyjob_mock_user_id");
    void probeApiHealth().then(setApiOk);
  }

  const apiBase = getApiBaseUrl();

  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-slate-200 bg-white lg:flex lg:min-h-screen lg:w-64 lg:flex-col lg:border-b-0 lg:border-r">
        <div className="border-b border-slate-100 px-5 py-4">
          <img
            src="/easyjob-logo.svg"
            alt="EasyJob"
            className="h-14 w-auto max-w-[11rem] object-contain object-left"
            width={176}
            height={98}
          />
          <div className="mt-2 text-xs text-slate-500">Application workspace · v1.0</div>
        </div>
        <nav className="space-y-1 px-3 pb-4">
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

        <div className="mt-auto border-t border-slate-100 px-4 py-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                apiOk === null ? "bg-slate-300" : apiOk ? "bg-emerald-500" : "bg-rose-500"
              }`}
              title={apiOk === null ? "Checking API…" : apiOk ? "API reachable" : "API unreachable"}
            />
            API
          </div>
          <p className="mt-1 break-all font-mono text-[10px] leading-snug text-slate-500">{apiBase}</p>
          <a
            className="mt-1 inline-block text-[10px] font-medium text-brand-700 hover:underline"
            href={`${apiBase}/health`}
            target="_blank"
            rel="noreferrer"
          >
            Open /health
          </a>
          <label className="mt-3 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Mock user id
          </label>
          <input
            className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900"
            value={mockUserId}
            placeholder="default from API"
            inputMode="numeric"
            onChange={(e) => setMockUserId(e.target.value)}
            onBlur={persistMockUser}
          />
          <p className="mt-1 text-[10px] leading-snug text-slate-500">Sent as X-Mock-User-Id. Match the extension if you use both.</p>
        </div>
      </aside>
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
