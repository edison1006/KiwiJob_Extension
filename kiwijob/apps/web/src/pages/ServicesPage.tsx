import { useEffect, useMemo, useState } from "react";
import type { ApplicantAutofillProfile, ApplicationListItem, ResumeDTO } from "@kiwijob/shared";
import { Link } from "react-router";
import { fetchApplicantProfile, fetchJobs, fetchResumes, generateCoverLetter } from "../lib/api";

const DRAFT_KEY = "kiwijob_cover_letter_draft_v1";
const stroke = { stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

type Mode = "idle" | "write" | "ai" | "templates";
type CoverLetterCard = { title: string; description: string; action: string; icon: "write" | "ai" | "template"; mode: Mode };
type Template = { id: string; name: string; description: string; body: string };

const cards: CoverLetterCard[] = [
  { title: "Write", description: "Start from a blank cover letter and edit it in your own words.", action: "Start writing", icon: "write", mode: "write" },
  { title: "AI Generate", description: "Generate a tailored draft from your CV, saved job, and profile details.", action: "Generate with AI", icon: "ai", mode: "ai" },
  { title: "Template", description: "Choose a reusable structure and customize it for each application.", action: "Browse templates", icon: "template", mode: "templates" },
];

const templates: Template[] = [
  {
    id: "professional",
    name: "Professional",
    description: "A clear, traditional structure suitable for most roles.",
    body: "Dear Hiring Manager,\n\nI am writing to apply for the {role} position at {company}. My experience and skills align well with the requirements of this opportunity, and I am excited by the prospect of contributing to your team.\n\nIn my previous work, I have developed relevant capabilities and a practical, outcome-focused approach. I would welcome the opportunity to bring this experience to {company} and help deliver strong results.\n\nThank you for considering my application. I would be pleased to discuss my suitability for the role.\n\nKind regards,\n{name}",
  },
  {
    id: "concise",
    name: "Concise",
    description: "A short, direct letter for fast-moving hiring teams.",
    body: "Dear Hiring Manager,\n\nI am excited to apply for the {role} role at {company}. My background is a strong match for the position, particularly my relevant skills and hands-on experience.\n\nI am drawn to this opportunity and would value the chance to contribute to {company}. Thank you for your consideration.\n\nKind regards,\n{name}",
  },
  {
    id: "career-change",
    name: "Career change",
    description: "Highlights transferable skills and motivation for a new direction.",
    body: "Dear Hiring Manager,\n\nI am pleased to apply for the {role} position at {company}. While my experience has developed across a different path, it has given me highly transferable strengths including problem solving, communication, adaptability, and a strong commitment to learning.\n\nI am motivated to bring these strengths to {company}, build quickly on my existing knowledge, and make a meaningful contribution to the team.\n\nThank you for considering my application. I would welcome the opportunity to discuss how my experience can support your goals.\n\nKind regards,\n{name}",
  },
];

function CardIcon({ icon }: { icon: CoverLetterCard["icon"] }) {
  if (icon === "ai") return <svg className="h-6 w-6" viewBox="0 0 24 24" aria-hidden><path {...stroke} d="M12 3l1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4L12 3z" /><path {...stroke} d="M19 14l.7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7L19 14z" /></svg>;
  if (icon === "template") return <svg className="h-6 w-6" viewBox="0 0 24 24" aria-hidden><rect {...stroke} x="4" y="3" width="16" height="18" rx="2" /><path {...stroke} d="M8 8h8M8 12h8M8 16h5" /></svg>;
  return <svg className="h-6 w-6" viewBox="0 0 24 24" aria-hidden><path {...stroke} d="M12 20h9" /><path {...stroke} d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>;
}

function fillTemplate(template: Template, job: ApplicationListItem | undefined, profile: ApplicantAutofillProfile | null) {
  return template.body
    .replaceAll("{role}", job?.job.title || "[Job title]")
    .replaceAll("{company}", job?.job.company || "[Company]")
    .replaceAll("{name}", profile?.fullName || "[Your name]");
}

export default function ServicesPage() {
  const [mode, setMode] = useState<Mode>("idle");
  const [jobs, setJobs] = useState<ApplicationListItem[]>([]);
  const [resumes, setResumes] = useState<ResumeDTO[]>([]);
  const [profile, setProfile] = useState<ApplicantAutofillProfile | null>(null);
  const [jobId, setJobId] = useState("");
  const [resumeId, setResumeId] = useState("");
  const [tone, setTone] = useState("concise and professional");
  const [instructions, setInstructions] = useState("");
  const [title, setTitle] = useState("Untitled cover letter");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedJob = useMemo(() => jobs.find((item) => String(item.id) === jobId), [jobs, jobId]);

  useEffect(() => {
    Promise.all([fetchJobs(), fetchResumes(), fetchApplicantProfile()])
      .then(([jobRows, resumeRows, applicant]) => {
        setJobs(jobRows);
        setResumes(resumeRows);
        setProfile(applicant);
        if (jobRows[0]) setJobId(String(jobRows[0].id));
        if (resumeRows[0]) setResumeId(String(resumeRows[0].id));
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  function openMode(next: Mode) {
    setError("");
    setNotice("");
    setMode(next);
    if (next === "write") {
      setTitle("Untitled cover letter");
      setContent("");
    }
  }

  function useTemplate(template: Template) {
    setTitle(`${template.name}${selectedJob ? ` — ${selectedJob.job.title}` : ""}`);
    setContent(fillTemplate(template, selectedJob, profile));
    setMode("write");
    setNotice("Template added. Replace any bracketed placeholders and tailor the letter before sending.");
  }

  async function onGenerate() {
    if (!jobId) {
      setError("Choose a saved job before generating a tailored cover letter.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await generateCoverLetter({
        job_id: Number(jobId),
        resume_id: resumeId ? Number(resumeId) : undefined,
        tone,
        extra_instructions: instructions,
      });
      setContent(result.cover_letter);
      setTitle(`${selectedJob?.job.title || "Cover letter"} — ${selectedJob?.job.company || "Draft"}`);
      setMode("write");
      setNotice(result.source === "ai" ? "AI draft generated. Review and edit every detail before sending." : "A basic draft was created. Review and personalize it before sending.");
      if (result.warnings.length) setNotice((current) => `${current} ${result.warnings.join(" ")}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function saveDraft() {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, content, jobId, savedAt: new Date().toISOString() }));
    setNotice("Draft saved in this browser.");
  }

  function loadDraft() {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) {
      setError("No saved draft was found in this browser.");
      return;
    }
    try {
      const draft = JSON.parse(raw) as { title?: string; content?: string; jobId?: string };
      setTitle(draft.title || "Untitled cover letter");
      setContent(draft.content || "");
      if (draft.jobId) setJobId(draft.jobId);
      setMode("write");
      setError("");
      setNotice("Saved draft loaded.");
    } catch {
      setError("The saved draft could not be opened.");
    }
  }

  async function copyLetter() {
    if (!content.trim()) return;
    await navigator.clipboard.writeText(content);
    setNotice("Cover letter copied to clipboard.");
  }

  function downloadLetter() {
    if (!content.trim()) return;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${title.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "") || "cover-letter"}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Cover Letter</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">Generate and refine role-specific cover letters from your saved job, CV, and application profile. Core profile data lives under <Link className="font-medium text-brand-700 hover:underline" to="/documents">Documents</Link> and <Link className="font-medium text-brand-700 hover:underline" to="/tracker">Job tracker</Link>.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <article key={card.title} className={`flex min-h-56 flex-col rounded-2xl border bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow-md ${mode === card.mode ? "border-brand-400 ring-2 ring-brand-100" : "border-slate-200"}`}>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700"><CardIcon icon={card.icon} /></div>
            <h2 className="mt-5 text-lg font-semibold text-slate-900">{card.title}</h2>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{card.description}</p>
            <button type="button" onClick={() => openMode(card.mode)} className="mt-5 inline-flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700">{card.action}</button>
          </article>
        ))}
      </div>

      {error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div> : null}
      {notice ? <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}

      {mode === "idle" ? (
        <div className="flex items-center justify-between rounded-2xl border border-dashed border-brand-200 bg-white/60 p-5 text-sm text-slate-600">
          <span>Choose one of the three options above to create a cover letter.</span>
          <button type="button" onClick={loadDraft} className="font-semibold text-brand-700 hover:underline">Open saved draft</button>
        </div>
      ) : null}

      {mode === "ai" ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-xl font-semibold text-slate-900">Generate a tailored draft</h2><p className="mt-1 text-sm text-slate-600">KiwiJob uses the selected job, CV, and your application profile. It will not knowingly invent experience.</p></div>
            <button type="button" onClick={() => setMode("idle")} className="text-sm font-semibold text-slate-500 hover:text-slate-800">Close</button>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Saved job<select value={jobId} onChange={(e) => setJobId(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="">Choose a job…</option>{jobs.map((job) => <option key={job.id} value={job.id}>{job.job.title} — {job.job.company || "Unknown company"}</option>)}</select></label>
            <label className="text-sm font-medium text-slate-700">CV<select value={resumeId} onChange={(e) => setResumeId(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="">Use profile only</option>{resumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.filename}</option>)}</select></label>
            <label className="text-sm font-medium text-slate-700">Tone<select value={tone} onChange={(e) => setTone(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option>concise and professional</option><option>warm and enthusiastic</option><option>confident and direct</option><option>formal and traditional</option></select></label>
            <label className="text-sm font-medium text-slate-700">Extra instructions<input value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. Emphasize data engineering projects" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label>
          </div>
          {!jobs.length ? <p className="mt-4 text-sm text-amber-700">No saved jobs found. Add a role to your Job tracker first.</p> : null}
          {!resumes.length ? <p className="mt-2 text-sm text-amber-700">No CV found. You can generate from your profile, or upload a CV under Documents.</p> : null}
          <button type="button" disabled={busy || !jobId} onClick={() => void onGenerate()} className="mt-6 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Generating…" : "Generate draft"}</button>
        </section>
      ) : null}

      {mode === "templates" ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-xl font-semibold text-slate-900">Choose a template</h2><p className="mt-1 text-sm text-slate-600">Placeholders are filled from your selected tracker job and profile.</p></div><label className="text-sm font-medium text-slate-700">Use details from<select value={jobId} onChange={(e) => setJobId(e.target.value)} className="ml-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">No saved job</option>{jobs.map((job) => <option key={job.id} value={job.id}>{job.job.title} — {job.job.company || "Unknown company"}</option>)}</select></label></div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">{templates.map((template) => <article key={template.id} className="flex flex-col rounded-xl border border-slate-200 p-4"><h3 className="font-semibold text-slate-900">{template.name}</h3><p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{template.description}</p><button type="button" onClick={() => useTemplate(template)} className="mt-5 rounded-xl border border-brand-200 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">Use template</button></article>)}</div>
        </section>
      ) : null}

      {mode === "write" ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <input aria-label="Cover letter title" value={title} onChange={(e) => setTitle(e.target.value)} className="min-w-0 flex-1 border-0 border-b border-transparent bg-transparent px-0 py-1 text-xl font-semibold text-slate-900 outline-none focus:border-brand-300" />
            <div className="flex flex-wrap gap-2"><button type="button" onClick={loadDraft} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Open saved</button><button type="button" onClick={saveDraft} className="rounded-lg border border-brand-200 px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">Save draft</button><button type="button" disabled={!content.trim()} onClick={() => void copyLetter()} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">Copy</button><button type="button" disabled={!content.trim()} onClick={downloadLetter} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">Download .txt</button></div>
          </div>
          <textarea aria-label="Cover letter content" value={content} onChange={(e) => setContent(e.target.value)} placeholder="Write your cover letter here…" className="mt-5 min-h-[32rem] w-full resize-y rounded-xl border border-slate-200 bg-slate-50/40 p-5 text-[15px] leading-7 text-slate-800 outline-none focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-500/10" />
          <div className="mt-2 flex justify-between text-xs text-slate-500"><span>Review names, dates, skills, and claims before sending.</span><span>{content.trim() ? content.trim().split(/\s+/).length : 0} words</span></div>
        </section>
      ) : null}
    </div>
  );
}
