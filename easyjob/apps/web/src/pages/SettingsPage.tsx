import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import type { ApplicantAutofillProfile } from "@easyjob/shared";
import { EMPTY_APPLICANT_AUTOFILL_PROFILE } from "@easyjob/shared";
import { EASYJOB_PREFS_EVENT, readDisplayName, writeDisplayName } from "../components/UserMenu";
import { fetchApplicantProfile, saveApplicantProfile } from "../lib/api";

function scrollToHash() {
  const id = window.location.hash.replace(/^#/, "") || "profile";
  requestAnimationFrame(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

export default function SettingsPage() {
  const location = useLocation();
  const [draft, setDraft] = useState(() => readDisplayName());
  const [applicant, setApplicant] = useState<ApplicantAutofillProfile>(() => ({ ...EMPTY_APPLICANT_AUTOFILL_PROFILE }));
  const [applicantLoading, setApplicantLoading] = useState(true);
  const [applicantSaving, setApplicantSaving] = useState(false);
  const [applicantMsg, setApplicantMsg] = useState<string | null>(null);
  const privacyUrl = import.meta.env.VITE_PRIVACY_URL?.trim();

  useEffect(() => {
    let cancelled = false;
    setApplicantLoading(true);
    setApplicantMsg(null);
    void fetchApplicantProfile()
      .then((p) => {
        if (!cancelled) setApplicant({ ...EMPTY_APPLICANT_AUTOFILL_PROFILE, ...p });
      })
      .catch((e: Error) => {
        if (!cancelled) setApplicantMsg(e.message || "Could not load profile");
      })
      .finally(() => {
        if (!cancelled) setApplicantLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

      <section id="applicant-profile" className="scroll-mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Application profile (autofill)</h2>
        <p className="mt-1 text-sm text-slate-600">
          Used by the Chrome extension when you choose “Fill form with EasyJob profile” on a job application page. Data is stored on the EasyJob
          API for the current mock user (same id as in the extension). Empty fields may be filled from site cookies when the extension runs.
        </p>
        {applicantLoading ? (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="mt-4 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Full name
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                value={applicant.fullName}
                onChange={(e) => setApplicant((p) => ({ ...p, fullName: e.target.value }))}
                autoComplete="name"
              />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Email
              <input
                type="email"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                value={applicant.email}
                onChange={(e) => setApplicant((p) => ({ ...p, email: e.target.value }))}
                autoComplete="email"
              />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Phone
              <input
                type="tel"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                value={applicant.phone}
                onChange={(e) => setApplicant((p) => ({ ...p, phone: e.target.value }))}
                autoComplete="tel"
              />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              LinkedIn URL
              <input
                type="url"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                value={applicant.linkedInUrl}
                onChange={(e) => setApplicant((p) => ({ ...p, linkedInUrl: e.target.value }))}
                placeholder="https://linkedin.com/in/…"
              />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 sm:col-span-2">
              Portfolio / website URL
              <input
                type="url"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                value={applicant.portfolioUrl}
                onChange={(e) => setApplicant((p) => ({ ...p, portfolioUrl: e.target.value }))}
                placeholder="https://…"
              />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              City
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                value={applicant.city}
                onChange={(e) => setApplicant((p) => ({ ...p, city: e.target.value }))}
              />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Country
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                value={applicant.country}
                onChange={(e) => setApplicant((p) => ({ ...p, country: e.target.value }))}
              />
            </label>
            <div className="sm:col-span-2">
              <button
                type="button"
                disabled={applicantSaving}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
                onClick={() => {
                  setApplicantSaving(true);
                  setApplicantMsg(null);
                  void saveApplicantProfile(applicant)
                    .then((saved) => {
                      setApplicant(saved);
                      setApplicantMsg("Saved.");
                    })
                    .catch((e: Error) => setApplicantMsg(e.message || "Save failed"))
                    .finally(() => setApplicantSaving(false));
                }}
              >
                {applicantSaving ? "Saving…" : "Save application profile"}
              </button>
              {applicantMsg ? <p className="mt-2 text-sm text-slate-600">{applicantMsg}</p> : null}
            </div>
          </div>
        )}
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
