import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ApplicationDetail, ApplicationNote, ApplicationStatus, ApplicationTimelineEvent, JobPostUpdatePayload } from "@kiwijob/shared";
import { APPLICATION_STATUSES } from "@kiwijob/shared";
import { StatusBadge } from "../components/StatusBadge";
import {
  analyzeMatch,
  createApplicationNote,
  deleteApplicationNote,
  deleteJob,
  fetchJob,
  updateApplicationNote,
  updateJobDetails,
  updateJobStatus,
} from "../lib/api";

function fmtDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function eventLabel(event: ApplicationTimelineEvent) {
  const labels: Record<string, string> = {
    application_started: "Application started",
    application_submitted: "Application submitted",
    assessment_detected: "Assessment detected",
    email_assessment: "Assessment email",
    email_interview: "Interview email",
    email_offer: "Offer email",
    email_rejection: "Rejection email",
    email_reply: "Email reply",
    email_reply_detected: "Email reply",
    interview_detected: "Interview detected",
    job_viewed: "Job viewed",
    note_added: "Note added",
    offer_detected: "Offer detected",
    rejection_detected: "Rejection detected",
    reply_detected: "Reply detected",
    status_updated: "Status updated",
    withdrawn_detected: "Withdrawn",
  };
  return labels[event.event_type] ?? event.event_type.replace(/_/g, " ");
}

function dateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return String(iso).slice(0, 10);
  }
}

function nullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function jobCompleteness(row: ApplicationDetail): { score: number; missing: string[] } {
  const checks: Array<[string, unknown]> = [
    ["company", row.job.company],
    ["location", row.job.location],
    ["description", row.job.description && row.job.description.length > 160],
    ["salary", row.job.salary],
    ["employment type", row.job.employment_type],
    ["workplace", row.job.workplace_type],
    ["posted date", row.job.posted_date],
    ["apply URL", row.job.apply_url || row.job.url],
  ];
  const missing = checks.filter(([, value]) => !value).map(([label]) => label);
  return { score: Math.round(((checks.length - missing.length) / checks.length) * 100), missing };
}

type JobEditForm = {
  title: string;
  company: string;
  location: string;
  salary: string;
  employment_type: string;
  workplace_type: string;
  visa_requirement: string;
  url: string;
  apply_url: string;
  company_url: string;
  external_job_id: string;
  source_website: string;
  posted_date: string;
  closing_date: string;
  description: string;
};

function formFromRow(row: ApplicationDetail): JobEditForm {
  return {
    title: row.job.title,
    company: row.job.company ?? "",
    location: row.job.location ?? "",
    salary: row.job.salary ?? "",
    employment_type: row.job.employment_type ?? "",
    workplace_type: row.job.workplace_type ?? "",
    visa_requirement: row.job.visa_requirement ?? "",
    url: row.job.url,
    apply_url: row.job.apply_url ?? "",
    company_url: row.job.company_url ?? "",
    external_job_id: row.job.external_job_id ?? "",
    source_website: row.job.source_website,
    posted_date: dateInputValue(row.job.posted_date),
    closing_date: dateInputValue(row.job.closing_date),
    description: row.job.description ?? "",
  };
}

export default function JobDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const jobId = useMemo(() => Number(id), [id]);
  const [row, setRow] = useState<ApplicationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingJob, setEditingJob] = useState(false);
  const [jobForm, setJobForm] = useState<JobEditForm | null>(null);

  useEffect(() => {
    if (!Number.isFinite(jobId)) return;
    fetchJob(jobId)
      .then((data) => {
        setRow(data);
        setJobForm(formFromRow(data));
      })
      .catch((e: Error) => setError(e.message));
  }, [jobId]);

  async function onStatusChange(status: ApplicationStatus) {
    if (!row) return;
    setBusy(true);
    try {
      await updateJobStatus(row.id, status);
      const fresh = await fetchJob(row.id);
      setRow(fresh);
      setJobForm(formFromRow(fresh));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!row) return;
    if (!confirm("Delete this saved application?")) return;
    setBusy(true);
    try {
      await deleteJob(row.id);
      navigate("/");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onAnalyze() {
    if (!row) return;
    setBusy(true);
    try {
      await analyzeMatch(row.id);
      navigate(`/match/${row.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onSaveNote() {
    if (!row) return;
    const content = noteDraft.trim();
    if (!content) return;
    setBusy(true);
    try {
      let saved: ApplicationNote;
      if (editingNoteId) {
        saved = await updateApplicationNote(row.id, editingNoteId, content);
        setRow((prev) =>
          prev
            ? {
                ...prev,
                notes: prev.notes.map((note) => (note.id === saved.id ? saved : note)),
              }
            : prev,
        );
      } else {
        saved = await createApplicationNote(row.id, content);
        const fresh = await fetchJob(row.id);
        setRow(fresh);
      }
      setEditingNoteId(null);
      setNoteDraft("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteNote(noteId: number) {
    if (!row) return;
    if (!confirm("Delete this note?")) return;
    setBusy(true);
    try {
      await deleteApplicationNote(row.id, noteId);
      setRow((prev) => (prev ? { ...prev, notes: prev.notes.filter((note) => note.id !== noteId) } : prev));
      if (editingNoteId === noteId) {
        setEditingNoteId(null);
        setNoteDraft("");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function startEditNote(note: ApplicationNote) {
    setEditingNoteId(note.id);
    setNoteDraft(note.content);
  }

  function updateJobForm<K extends keyof JobEditForm>(key: K, value: JobEditForm[K]) {
    setJobForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function onSaveJobDetails() {
    if (!row || !jobForm) return;
    const payload: JobPostUpdatePayload = {
      title: jobForm.title.trim(),
      company: nullableText(jobForm.company),
      location: nullableText(jobForm.location),
      salary: nullableText(jobForm.salary),
      employment_type: nullableText(jobForm.employment_type),
      workplace_type: nullableText(jobForm.workplace_type),
      visa_requirement: nullableText(jobForm.visa_requirement),
      url: jobForm.url.trim(),
      apply_url: nullableText(jobForm.apply_url),
      company_url: nullableText(jobForm.company_url),
      external_job_id: nullableText(jobForm.external_job_id),
      source_website: jobForm.source_website.trim() || "unknown",
      posted_date: jobForm.posted_date ? new Date(`${jobForm.posted_date}T00:00:00`).toISOString() : null,
      closing_date: jobForm.closing_date ? new Date(`${jobForm.closing_date}T00:00:00`).toISOString() : null,
      description: nullableText(jobForm.description),
    };
    setBusy(true);
    try {
      await updateJobDetails(row.id, payload);
      const fresh = await fetchJob(row.id);
      setRow(fresh);
      setJobForm(formFromRow(fresh));
      setEditingJob(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!Number.isFinite(jobId)) {
    return <div className="text-sm text-slate-600">Invalid job id.</div>;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
        {error}{" "}
        <Link className="font-medium text-brand-700 underline" to="/tracker">
          Back to list
        </Link>
      </div>
    );
  }

  if (!row) return <div className="text-sm text-slate-600">Loading…</div>;
  const completeness = jobCompleteness(row);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Application</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{row.job.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span className="font-medium text-slate-800">{row.job.company ?? "Unknown company"}</span>
            <span>•</span>
            <span>{row.job.location ?? "Remote / unspecified"}</span>
            <span>•</span>
            <StatusBadge status={row.status} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
            href={row.job.url}
            target="_blank"
            rel="noreferrer"
          >
            Open original posting
          </a>
          <Link
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
            to={`/match/${row.id}`}
          >
            View match report
          </Link>
          <button
            type="button"
            disabled={busy}
            onClick={onAnalyze}
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            Run / refresh match
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDelete}
            className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-1">
          <h2 className="text-sm font-semibold text-slate-900">Application status</h2>
          <p className="mt-1 text-xs text-slate-600">Updates your tracker instantly.</p>
          <select
            className="mt-4 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
            value={row.status}
            disabled={busy}
            onChange={(e) => onStatusChange(e.target.value as ApplicationStatus)}
          >
            {APPLICATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Saved</dt>
              <dd className="text-slate-900">{fmtDateTime(row.saved_at)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Updated</dt>
              <dd className="text-slate-900">{fmtDateTime(row.updated_at)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Source</dt>
              <dd className="text-slate-900">{row.job.source_website}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Captured</dt>
              <dd className="text-slate-900">{completeness.score}%</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Match score</dt>
              <dd className="text-slate-900">{row.match_score != null ? `${Math.round(row.match_score)}%` : "—"}</dd>
            </div>
          </dl>
          {completeness.missing.length ? (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950">
              Missing: {completeness.missing.slice(0, 5).join(", ")}
              {completeness.missing.length > 5 ? "..." : ""}
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-900">
              Job profile looks complete.
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Job information</h2>
              <p className="mt-1 text-xs text-slate-600">Review captured fields and fill any gaps before matching or applying.</p>
            </div>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              disabled={busy}
              onClick={() => {
                setEditingJob((prev) => !prev);
                setJobForm(formFromRow(row));
              }}
            >
              {editingJob ? "Cancel" : "Edit fields"}
            </button>
          </div>

          {editingJob && jobForm ? (
            <div className="mt-5 space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-600">Title</span>
                  <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={jobForm.title} onChange={(e) => updateJobForm("title", e.target.value)} />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-600">Company</span>
                  <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={jobForm.company} onChange={(e) => updateJobForm("company", e.target.value)} />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-600">Location</span>
                  <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={jobForm.location} onChange={(e) => updateJobForm("location", e.target.value)} />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-600">Salary</span>
                  <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={jobForm.salary} onChange={(e) => updateJobForm("salary", e.target.value)} />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-600">Employment type</span>
                  <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={jobForm.employment_type} placeholder="Full-time, Contract..." onChange={(e) => updateJobForm("employment_type", e.target.value)} />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-600">Workplace</span>
                  <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={jobForm.workplace_type} placeholder="On-site, Hybrid, Remote" onChange={(e) => updateJobForm("workplace_type", e.target.value)} />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-600">Posted date</span>
                  <input type="date" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={jobForm.posted_date} onChange={(e) => updateJobForm("posted_date", e.target.value)} />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-600">Closing date</span>
                  <input type="date" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={jobForm.closing_date} onChange={(e) => updateJobForm("closing_date", e.target.value)} />
                </label>
                <label className="space-y-1.5 md:col-span-2">
                  <span className="text-xs font-semibold text-slate-600">Apply URL</span>
                  <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={jobForm.apply_url} onChange={(e) => updateJobForm("apply_url", e.target.value)} />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-600">Company URL</span>
                  <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={jobForm.company_url} onChange={(e) => updateJobForm("company_url", e.target.value)} />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-600">External job ID</span>
                  <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={jobForm.external_job_id} onChange={(e) => updateJobForm("external_job_id", e.target.value)} />
                </label>
              </div>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-600">Visa / work rights</span>
                <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={jobForm.visa_requirement} onChange={(e) => updateJobForm("visa_requirement", e.target.value)} />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-600">Description</span>
                <textarea className="min-h-72 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm leading-relaxed" value={jobForm.description} onChange={(e) => updateJobForm("description", e.target.value)} />
              </label>
              <button
                type="button"
                disabled={busy || !jobForm.title.trim() || !jobForm.url.trim()}
                onClick={() => void onSaveJobDetails()}
                className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save job information
              </button>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <div className="grid gap-3 text-sm md:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-3"><span className="text-xs font-semibold text-slate-500">Employment</span><div className="mt-1 text-slate-900">{row.job.employment_type || "—"}</div></div>
                <div className="rounded-xl bg-slate-50 p-3"><span className="text-xs font-semibold text-slate-500">Workplace</span><div className="mt-1 text-slate-900">{row.job.workplace_type || "—"}</div></div>
                <div className="rounded-xl bg-slate-50 p-3"><span className="text-xs font-semibold text-slate-500">Salary</span><div className="mt-1 text-slate-900">{row.job.salary || "—"}</div></div>
                <div className="rounded-xl bg-slate-50 p-3"><span className="text-xs font-semibold text-slate-500">Closing</span><div className="mt-1 text-slate-900">{row.job.closing_date ? fmtDateTime(row.job.closing_date) : "—"}</div></div>
              </div>
              <div className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-800">
                {row.job.description?.trim() ? row.job.description : "No description captured. Edit fields to paste the JD before running match."}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Notes</h2>
              <p className="mt-1 text-xs text-slate-600">Keep interview prep, recruiter details, and next steps with the application.</p>
            </div>
            {editingNoteId ? (
              <button
                type="button"
                className="text-xs font-medium text-slate-500 hover:text-slate-800"
                onClick={() => {
                  setEditingNoteId(null);
                  setNoteDraft("");
                }}
              >
                Cancel edit
              </button>
            ) : null}
          </div>

          <div className="mt-4 space-y-3">
            <textarea
              className="min-h-28 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              placeholder="Add a quick note..."
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
            />
            <button
              type="button"
              disabled={busy || !noteDraft.trim()}
              className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void onSaveNote()}
            >
              {editingNoteId ? "Save note" : "Add note"}
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {row.notes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                No notes yet.
              </div>
            ) : (
              row.notes.map((note) => (
                <article key={note.id} className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-xs text-slate-500">
                      {fmtDateTime(note.created_at)}
                      {note.is_edited ? " · edited" : ""}
                    </div>
                    <div className="flex gap-2 text-xs font-medium">
                      <button type="button" className="text-brand-700 hover:underline" onClick={() => startEditNote(note)}>
                        Edit
                      </button>
                      <button type="button" className="text-rose-700 hover:underline" onClick={() => void onDeleteNote(note.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{note.content}</p>
                </article>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Timeline</h2>
          <p className="mt-1 text-xs text-slate-600">Extension, email, notes, and manual status activity.</p>
          <div className="mt-5 space-y-4">
            {row.timeline.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                No activity captured yet.
              </div>
            ) : (
              row.timeline.map((event) => (
                <div key={event.id} className="relative border-l border-slate-200 pl-4">
                  <span className="absolute -left-1.5 top-1.5 h-3 w-3 rounded-full border-2 border-white bg-brand-500 shadow" aria-hidden />
                  <div className="text-sm font-medium capitalize text-slate-900">{eventLabel(event)}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>{fmtDateTime(event.occurred_at)}</span>
                    <span>·</span>
                    <span>{event.source}</span>
                    {event.status_after ? (
                      <>
                        <span>·</span>
                        <StatusBadge status={event.status_after} />
                      </>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
