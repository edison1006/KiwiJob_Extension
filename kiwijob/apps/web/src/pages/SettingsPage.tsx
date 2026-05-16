import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { ApplicantAutofillProfile } from "@kiwijob/shared";
import { EMPTY_APPLICANT_AUTOFILL_PROFILE } from "@kiwijob/shared";
import { useAuth } from "../auth";
import { deleteAccount, fetchApplicantProfile, saveApplicantProfile } from "../lib/api";

function scrollToHash() {
  const id = window.location.hash.replace(/^#/, "") || "profile";
  requestAnimationFrame(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

export default function SettingsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [applicant, setApplicant] = useState<ApplicantAutofillProfile>(() => ({ ...EMPTY_APPLICANT_AUTOFILL_PROFILE }));
  const [applicantLoading, setApplicantLoading] = useState(true);
  const [applicantSaving, setApplicantSaving] = useState(false);
  const [applicantMsg, setApplicantMsg] = useState<string | null>(null);
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);

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

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Settings</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">Local preferences and links. Nothing here is required for core flows.</p>
      </div>

      <section id="profile" className="scroll-mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Account</h2>
            <p className="mt-1 text-sm text-slate-600">Dashboard and Chrome extension use this account to keep your data separated.</p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            onClick={() => void logout().then(() => navigate("/login", { replace: true }))}
          >
            Sign out
          </button>
        </div>
        <dl className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Name</dt>
            <dd className="mt-1 font-semibold text-slate-950">{user?.display_name || "Not provided"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</dt>
            <dd className="mt-1 font-semibold text-slate-950">{user?.email}</dd>
          </div>
        </dl>
      </section>

      <section id="applicant-profile" className="scroll-mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Application profile (autofill)</h2>
        <p className="mt-1 text-sm text-slate-600">
          Used by the Chrome extension when you choose “Fill form with KiwiJob profile” on a job application page. Data is stored on the KiwiJob
          API under your logged-in account.
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
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 sm:col-span-2">
              GitHub URL
              <input
                type="url"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                value={applicant.githubUrl}
                onChange={(e) => setApplicant((p) => ({ ...p, githubUrl: e.target.value }))}
                placeholder="https://github.com/…"
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
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Work authorization
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                value={applicant.workAuthorization}
                onChange={(e) => setApplicant((p) => ({ ...p, workAuthorization: e.target.value }))}
                placeholder="e.g. Yes, authorized to work in New Zealand"
              />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Sponsorship
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                value={applicant.sponsorship}
                onChange={(e) => setApplicant((p) => ({ ...p, sponsorship: e.target.value }))}
                placeholder="e.g. No"
              />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Salary expectation
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                value={applicant.salaryExpectation}
                onChange={(e) => setApplicant((p) => ({ ...p, salaryExpectation: e.target.value }))}
                placeholder="e.g. NZD 120,000"
              />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Notice / availability
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                value={applicant.noticePeriod}
                onChange={(e) => setApplicant((p) => ({ ...p, noticePeriod: e.target.value }))}
                placeholder="e.g. 2 weeks"
              />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 sm:col-span-2">
              Skills
              <textarea
                className="mt-1 min-h-24 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                value={applicant.skills}
                onChange={(e) => setApplicant((p) => ({ ...p, skills: e.target.value }))}
                placeholder="React, TypeScript, Python, SQL…"
              />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 sm:col-span-2">
              Professional summary
              <textarea
                className="mt-1 min-h-24 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                value={applicant.summary}
                onChange={(e) => setApplicant((p) => ({ ...p, summary: e.target.value }))}
                placeholder="Short profile used for unique application questions."
              />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 sm:col-span-2">
              Cover letter base
              <textarea
                className="mt-1 min-h-32 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                value={applicant.coverLetter}
                onChange={(e) => setApplicant((p) => ({ ...p, coverLetter: e.target.value }))}
                placeholder="Reusable answer for cover-letter and long-form motivation fields."
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
        <h2 className="text-lg font-semibold text-slate-900">Privacy and account data</h2>
        <p className="mt-1 text-sm text-slate-600">
          Review what KiwiJob stores and how deletion works before publishing or sharing the app.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50" to="/privacy">
            Privacy policy
          </Link>
          <button
            type="button"
            className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800 shadow-sm hover:bg-rose-100"
            onClick={() => {
              const ok = window.confirm("Delete your KiwiJob account and all resumes, jobs, matches, events, and insights data?");
              if (!ok) return;
              setDeleteMsg(null);
              void deleteAccount()
                .then(() => navigate("/login", { replace: true }))
                .catch((e: Error) => setDeleteMsg(e.message || "Delete failed"));
            }}
          >
            Delete my data
          </button>
        </div>
        {deleteMsg ? <p className="mt-3 text-sm text-rose-700">{deleteMsg}</p> : null}
      </section>
    </div>
  );
}
