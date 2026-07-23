import { useEffect, useState } from "react";
import type { ApplicationListItem, CvOptimization, CvOptimizationSuggestion, ResumeDTO } from "@kiwijob/shared";
import {
  createCvOptimization, downloadCvOptimization, fetchCvOptimizations, fetchJobs,
  fetchResumes, updateCvOptimization,
} from "../lib/api";

export default function CvOptimizerPage() {
  const [jobs, setJobs] = useState<ApplicationListItem[]>([]);
  const [resumes, setResumes] = useState<ResumeDTO[]>([]);
  const [versions, setVersions] = useState<CvOptimization[]>([]);
  const [applicationId, setApplicationId] = useState(0);
  const [resumeId, setResumeId] = useState(0);
  const [current, setCurrent] = useState<CvOptimization | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    Promise.all([fetchJobs(), fetchResumes(), fetchCvOptimizations()])
      .then(([jobRows, resumeRows, saved]) => {
        setJobs(jobRows); setResumes(resumeRows); setVersions(saved);
        setApplicationId(jobRows[0]?.id ?? 0); setResumeId(resumeRows[0]?.id ?? 0);
        setCurrent(saved[0] ?? null);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
  }, []);

  async function generate() {
    if (!applicationId || !resumeId) return;
    setBusy(true); setMessage("Analyzing the JD and optimizing only evidence already present in your CV…");
    try {
      const created = await createCvOptimization(applicationId, resumeId);
      setCurrent(created); setVersions((rows) => [created, ...rows]);
      setMessage("Optimization created. Review every suggestion before downloading.");
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  function changeSuggestion(id: string, patch: Partial<CvOptimizationSuggestion>) {
    setCurrent((row) => {
      if (!row) return row;
      const existing = row.suggestions.find((item) => item.id === id);
      if (!existing) return row;
      const next = { ...existing, ...patch };
      let text = row.optimized_text;
      if (patch.accepted === false && existing.accepted && existing.suggested && text.includes(existing.suggested)) {
        text = text.replace(existing.suggested, existing.original);
      } else if (patch.accepted === true && !existing.accepted && next.suggested) {
        text = existing.original && text.includes(existing.original)
          ? text.replace(existing.original, next.suggested)
          : `${text.trim()}\n\n${next.section.toUpperCase()}\n${next.suggested}`;
      } else if (patch.suggested !== undefined && existing.accepted && text.includes(existing.suggested)) {
        text = text.replace(existing.suggested, patch.suggested);
      }
      return {
        ...row, optimized_text: text,
        suggestions: row.suggestions.map((item) => item.id === id ? next : item),
      };
    });
  }

  async function save(): Promise<CvOptimization | null> {
    if (!current) return null;
    setBusy(true);
    try {
      const saved = await updateCvOptimization(current.id, {
        title: current.title, optimized_text: current.optimized_text, suggestions: current.suggestions,
      });
      setCurrent(saved); setVersions((rows) => rows.map((row) => row.id === saved.id ? saved : row));
      setMessage("CV version saved."); return saved;
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); return null; }
    finally { setBusy(false); }
  }

  async function download() {
    const saved = await save();
    if (!saved) return;
    try { await downloadCvOptimization(saved.id, saved.title); setMessage("DOCX downloaded."); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-950">CV Optimizer</h1>
        <p className="mt-2 text-sm text-slate-600">Match one CV to a saved job, review evidence-based changes, and export a separate DOCX. Your original CV is never overwritten.</p>
      </div>
      <section className="grid gap-4 rounded-2xl border border-brand-100 bg-white/85 p-5 shadow-sm md:grid-cols-[1fr_1fr_auto]">
        <label className="text-sm font-semibold text-slate-700">Saved job
          <select className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" value={applicationId} onChange={(e) => setApplicationId(Number(e.target.value))}>
            {!jobs.length && <option value={0}>Save a job first</option>}
            {jobs.map((job) => <option key={job.id} value={job.id}>{job.job.title} — {job.job.company || "Unknown company"}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">Source CV
          <select className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" value={resumeId} onChange={(e) => setResumeId(Number(e.target.value))}>
            {!resumes.length && <option value={0}>Upload a CV first</option>}
            {resumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.filename}</option>)}
          </select>
        </label>
        <button disabled={busy || !applicationId || !resumeId} onClick={() => void generate()} className="self-end rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">{busy ? "Working…" : "Optimize CV"}</button>
      </section>
      {message && <div className="rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-900">{message}</div>}
      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-bold">Saved versions</div>
          <div className="mt-3 space-y-2">
            {versions.map((version) => <button key={version.id} onClick={() => setCurrent(version)} className={`w-full rounded-xl border p-3 text-left text-sm ${current?.id === version.id ? "border-brand-400 bg-brand-50" : "border-slate-200"}`}>
              <div className="font-semibold">{version.title}</div><div className="mt-1 text-xs text-slate-500">Match {Math.round(version.match_score)}%</div>
            </button>)}
            {!versions.length && <p className="text-sm text-slate-500">No optimized versions yet.</p>}
          </div>
        </aside>
        <main className="space-y-5">
          {current ? <>
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div><div className="text-xs font-bold uppercase text-brand-600">JD match</div><div className="text-4xl font-bold">{Math.round(current.match_score)}%</div></div>
              <div className="flex gap-2"><button disabled={busy} onClick={() => void save()} className="rounded-xl border border-brand-200 px-4 py-2 text-sm font-semibold">Save</button><button disabled={busy} onClick={() => void download()} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Download DOCX</button></div>
            </section>
            <section className="space-y-3"><h2 className="text-xl font-bold">Review suggestions</h2>
              {current.suggestions.map((item) => <article key={item.id} className={`rounded-2xl border bg-white p-5 shadow-sm ${item.accepted ? "border-emerald-200" : "border-slate-200 opacity-70"}`}>
                <div className="flex justify-between"><span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-800">{item.section}</span><label className="text-sm font-semibold"><input className="mr-2" type="checkbox" checked={item.accepted} onChange={(e) => changeSuggestion(item.id, { accepted: e.target.checked })}/>Accept</label></div>
                {item.original && <div className="mt-3 rounded-xl bg-rose-50 p-3 text-sm"><b>Before:</b> {item.original}</div>}
                <textarea rows={3} value={item.suggested} onChange={(e) => changeSuggestion(item.id, { suggested: e.target.value })} className="mt-3 w-full rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 text-sm"/>
                <p className="mt-2 text-xs text-slate-500">{item.reason}</p>
              </article>)}
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <label className="text-sm font-bold">Version title</label><input value={current.title} onChange={(e) => setCurrent({...current, title: e.target.value})} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5"/>
              <label className="mt-5 block text-sm font-bold">Final CV content</label><p className="mt-1 text-xs text-slate-500">Remove anything not supported by your real experience.</p>
              <textarea rows={28} value={current.optimized_text} onChange={(e) => setCurrent({...current, optimized_text: e.target.value})} className="mt-3 w-full rounded-xl border border-slate-200 p-4 font-mono text-sm leading-relaxed"/>
            </section>
          </> : <div className="rounded-2xl border border-dashed border-brand-200 bg-white/70 p-12 text-center text-slate-600">Choose a saved job and CV to create your first optimized version.</div>}
        </main>
      </div>
    </div>
  );
}
