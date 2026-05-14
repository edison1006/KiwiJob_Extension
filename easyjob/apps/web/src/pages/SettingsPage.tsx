import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { EASYJOB_PREFS_EVENT, readDisplayName, writeDisplayName } from "../components/UserMenu";

function scrollToHash() {
  const id = window.location.hash.replace(/^#/, "") || "profile";
  requestAnimationFrame(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

export default function SettingsPage() {
  const location = useLocation();
  const [draft, setDraft] = useState(() => readDisplayName());
  const privacyUrl = import.meta.env.VITE_PRIVACY_URL?.trim();

  useEffect(() => {
    scrollToHash();
  }, [location.pathname, location.hash]);

  useEffect(() => {
    const sync = () => setDraft(readDisplayName());
    window.addEventListener(EASYJOB_PREFS_EVENT, sync);
    return () => window.removeEventListener(EASYJOB_PREFS_EVENT, sync);
  }, []);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Settings</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">Local preferences and links. Nothing here is required for core flows.</p>
      </div>

      <section id="profile" className="scroll-mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Profile</h2>
        <p className="mt-1 text-sm text-slate-600">How you want to be addressed in the app (stored in this browser only).</p>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">Display name</label>
        <input
          className="mt-1 max-w-md rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          placeholder="e.g. Edison"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft.trim() !== readDisplayName().trim()) writeDisplayName(draft);
          }}
        />
      </section>

      <section id="preferences" className="scroll-mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Preferences</h2>
        <p className="mt-1 text-sm text-slate-600">More options will land here in a future release.</p>
        {privacyUrl ? (
          <a
            className="mt-4 inline-flex text-sm font-medium text-brand-700 hover:underline"
            href={privacyUrl}
            target="_blank"
            rel="noreferrer"
          >
            Privacy policy
          </a>
        ) : null}
      </section>
    </div>
  );
}
