import { useEffect, useMemo, useState } from "react";
import type { ApplicationListItem } from "@kiwijob/shared";
import {
  evaluateInterviewAnswer,
  fetchJobs,
  generateInterviewQuestions,
  type InterviewFeedback,
  type InterviewQuestion,
  type InterviewType,
} from "../lib/api";

const STORAGE_KEY = "kiwijob_interview_session_v1";
const stroke = { stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

type InterviewCard = {
  type: InterviewType;
  title: string;
  description: string;
  action: string;
  icon: InterviewType;
};

type OccupationCategory = {
  value: string;
  label: string;
  technical: boolean;
};

type SavedSession = {
  type: InterviewType;
  occupationCategory: string;
  role: string;
  company: string;
  difficulty: "easy" | "medium" | "hard";
  questions: InterviewQuestion[];
  answers: Record<number, string>;
  feedback: Record<number, InterviewFeedback>;
  currentIndex: number;
};

const occupationCategories: OccupationCategory[] = [
  { value: "software_engineering", label: "Software Engineering & Development", technical: true },
  { value: "data_analytics", label: "Data, Analytics & AI", technical: true },
  { value: "cybersecurity_it", label: "Cybersecurity & IT Support", technical: true },
  { value: "cloud_devops", label: "Cloud, Infrastructure & DevOps", technical: true },
  { value: "qa_testing", label: "QA & Software Testing", technical: true },
  { value: "engineering", label: "Engineering (Civil, Mechanical, Electrical…)", technical: true },
  { value: "science_research", label: "Science & Research", technical: true },
  { value: "business_analysis", label: "Business Analysis & Consulting", technical: false },
  { value: "finance_accounting", label: "Finance & Accounting", technical: false },
  { value: "marketing_sales", label: "Marketing & Sales", technical: false },
  { value: "hr_people", label: "Human Resources & People", technical: false },
  { value: "operations_supply_chain", label: "Operations & Supply Chain", technical: false },
  { value: "customer_service", label: "Customer Service & Hospitality", technical: false },
  { value: "healthcare", label: "Healthcare", technical: false },
  { value: "education", label: "Education", technical: false },
  { value: "legal_policy", label: "Legal, Policy & Government", technical: false },
  { value: "creative_design", label: "Creative, Content & Design", technical: false },
  { value: "general", label: "General / Other", technical: false },
];

function inferOccupationCategory(title: string): string {
  const value = title.toLowerCase();
  if (/data|analyst|analytics|business intelligence|power bi|machine learning|ai engineer|statistic/.test(value)) return "data_analytics";
  if (/security|cyber|network|systems? administrator|it support|service desk/.test(value)) return "cybersecurity_it";
  if (/devops|cloud|platform engineer|site reliability|infrastructure/.test(value)) return "cloud_devops";
  if (/quality assurance|\bqa\b|test engineer|tester/.test(value)) return "qa_testing";
  if (/software|developer|programmer|frontend|backend|full.?stack|mobile engineer|web engineer/.test(value)) return "software_engineering";
  if (/civil|mechanical|electrical|structural|chemical|process engineer/.test(value)) return "engineering";
  if (/scientist|research|laboratory|chemist|biologist/.test(value)) return "science_research";
  if (/account|finance|financial|auditor|payroll/.test(value)) return "finance_accounting";
  if (/marketing|sales|account executive|business development/.test(value)) return "marketing_sales";
  if (/human resources|people|recruit|talent/.test(value)) return "hr_people";
  if (/customer|hospitality|retail|support agent/.test(value)) return "customer_service";
  if (/teacher|education|lecturer|tutor/.test(value)) return "education";
  if (/nurse|doctor|clinical|health|medical/.test(value)) return "healthcare";
  if (/law|legal|policy|advisor/.test(value)) return "legal_policy";
  if (/business analyst|consultant|strategy/.test(value)) return "business_analysis";
  if (/operations|supply chain|logistics|procurement/.test(value)) return "operations_supply_chain";
  if (/designer|content|creative|writer/.test(value)) return "creative_design";
  return "general";
}

const cards: InterviewCard[] = [
  { type: "behavioral", title: "Behavioral Interview", description: "Practice STAR answers for teamwork, conflict, leadership, and motivation questions.", action: "Practice behavioral", icon: "behavioral" },
  { type: "technical", title: "Technical Interview", description: "Technical-role practice for software, data, IT, engineering, QA, and science positions.", action: "Practice technical", icon: "technical" },
  { type: "panel", title: "Panel Interview", description: "Rehearse structured answers for multiple interviewers and cross-functional discussions.", action: "Prepare panel", icon: "panel" },
  { type: "case", title: "Case Study / Take-home Assignment", description: "Plan case studies, take-home tasks, presentation outlines, and follow-up notes.", action: "Start case prep", icon: "case" },
];

function CardIcon({ icon }: { icon: InterviewCard["icon"] }) {
  if (icon === "technical") return <svg className="h-6 w-6" viewBox="0 0 24 24" aria-hidden><path {...stroke} d="M8 9l-4 3 4 3M16 9l4 3-4 3M14 5l-4 14" /></svg>;
  if (icon === "panel") return <svg className="h-6 w-6" viewBox="0 0 24 24" aria-hidden><circle {...stroke} cx="7" cy="8" r="3" /><circle {...stroke} cx="17" cy="8" r="3" /><path {...stroke} d="M2.5 19a4.5 4.5 0 019 0M12.5 19a4.5 4.5 0 019 0" /></svg>;
  if (icon === "case") return <svg className="h-6 w-6" viewBox="0 0 24 24" aria-hidden><path {...stroke} d="M10 6h4M4 7a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V7z" /><path {...stroke} d="M8 13h8M8 17h5" /></svg>;
  return <svg className="h-6 w-6" viewBox="0 0 24 24" aria-hidden><path {...stroke} d="M12 20a8 8 0 100-16 8 8 0 000 16z" /><path {...stroke} d="M8.5 12.5l2.2 2.2 4.8-5.2" /></svg>;
}

function ScoreRing({ score }: { score: number }) {
  const colour = score >= 80 ? "text-emerald-600" : score >= 60 ? "text-brand-700" : "text-amber-600";
  return <div className={`grid h-20 w-20 shrink-0 place-items-center rounded-full border-8 border-current/10 bg-white text-xl font-black ${colour}`}>{score}</div>;
}

export default function InterviewAssistantPage() {
  const [selectedType, setSelectedType] = useState<InterviewType | null>(null);
  const [occupationCategory, setOccupationCategory] = useState("");
  const [jobs, setJobs] = useState<ApplicationListItem[]>([]);
  const [jobId, setJobId] = useState(0);
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [questionCount, setQuestionCount] = useState(5);
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [feedback, setFeedback] = useState<Record<number, InterviewFeedback>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showGuidance, setShowGuidance] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    fetchJobs().then(setJobs).catch(() => setJobs([]));
  }, []);

  useEffect(() => {
    if (!questions.length || !selectedType) return;
    const saved: SavedSession = { type: selectedType, occupationCategory, role, company, difficulty, questions, answers, feedback, currentIndex };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  }, [answers, company, currentIndex, difficulty, feedback, occupationCategory, questions, role, selectedType]);

  const currentQuestion = questions[currentIndex];
  const completedCount = Object.keys(feedback).length;
  const averageScore = useMemo(() => {
    const rows = Object.values(feedback);
    return rows.length ? Math.round(rows.reduce((total, item) => total + item.score, 0) / rows.length) : 0;
  }, [feedback]);

  function chooseType(type: InterviewType) {
    setSelectedType(type);
    const currentCategory = occupationCategories.find((item) => item.value === occupationCategory);
    if (type === "technical" && !currentCategory?.technical) setOccupationCategory("");
    setQuestions([]);
    setAnswers({});
    setFeedback({});
    setCurrentIndex(0);
    setFinished(false);
    setError("");
    setNotice("");
    window.setTimeout(() => document.getElementById("interview-setup")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function chooseJob(id: number) {
    setJobId(id);
    const row = jobs.find((item) => item.id === id);
    if (!row) return;
    setRole(row.job.title || "");
    setCompany(row.job.company || "");
    setJobDescription(row.job.description || "");
    const inferred = inferOccupationCategory(row.job.title || "");
    const inferredCategory = occupationCategories.find((item) => item.value === inferred);
    setOccupationCategory(selectedType === "technical" && !inferredCategory?.technical ? "" : inferred);
  }

  async function startSession() {
    if (!selectedType) return;
    if (!occupationCategory) {
      setError("Choose an occupation category before generating the session.");
      return;
    }
    if (selectedType === "technical" && !occupationCategories.find((item) => item.value === occupationCategory)?.technical) {
      setError("Technical Interview is available only for technical occupation categories.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await generateInterviewQuestions({
        interview_type: selectedType,
        occupation_category: occupationCategory,
        role,
        company,
        job_description: jobDescription,
        difficulty,
        question_count: questionCount,
      });
      setQuestions(result.questions);
      setAnswers({});
      setFeedback({});
      setCurrentIndex(0);
      setFinished(false);
      setShowGuidance(false);
      setNotice(result.source === "ai" ? "Your tailored practice session is ready." : "Practice session created from KiwiJob's structured question bank.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function reviewAnswer() {
    if (!selectedType || !currentQuestion) return;
    const answer = (answers[currentIndex] || "").trim();
    if (answer.length < 20) {
      setError("Write a little more before requesting feedback (at least 20 characters).");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await evaluateInterviewAnswer({ interview_type: selectedType, occupation_category: occupationCategory, role, question: currentQuestion.question, answer });
      setFeedback((rows) => ({ ...rows, [currentIndex]: result }));
      setNotice(result.source === "ai" ? "AI coaching feedback is ready." : "Structured coaching feedback is ready.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function restoreSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) throw new Error("No saved practice session was found in this browser.");
      const saved = JSON.parse(raw) as SavedSession;
      if (!saved.questions?.length) throw new Error("The saved session is empty.");
      setSelectedType(saved.type);
      setOccupationCategory(saved.occupationCategory || (saved.type === "technical" ? "" : "general"));
      setRole(saved.role || "");
      setCompany(saved.company || "");
      setDifficulty(saved.difficulty || "medium");
      setQuestions(saved.questions);
      setAnswers(saved.answers || {});
      setFeedback(saved.feedback || {});
      setCurrentIndex(Math.min(saved.currentIndex || 0, saved.questions.length - 1));
      setFinished(false);
      setNotice("Saved session restored.");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function resetSession() {
    setSelectedType(null);
    setOccupationCategory("");
    setQuestions([]);
    setAnswers({});
    setFeedback({});
    setCurrentIndex(0);
    setFinished(false);
    setError("");
    setNotice("");
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Interview Assistant</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">Build a role-specific practice session, write or rehearse each answer, and receive actionable coaching without inventing experience.</p>
        </div>
        {!questions.length ? <button type="button" onClick={restoreSession} className="rounded-xl border border-brand-200 bg-white px-4 py-2 text-sm font-bold text-brand-800 shadow-sm hover:bg-brand-50">Resume saved session</button> : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <article key={card.type} className={`flex min-h-56 flex-col rounded-2xl border bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow-md ${selectedType === card.type ? "border-brand-400 ring-2 ring-brand-100" : "border-slate-200"}`}>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700"><CardIcon icon={card.icon} /></div>
            <h2 className="mt-5 text-lg font-semibold text-slate-900">{card.title}</h2>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{card.description}</p>
            <button type="button" onClick={() => chooseType(card.type)} className="mt-5 inline-flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700">{card.action}</button>
          </article>
        ))}
      </div>

      {error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div> : null}
      {notice ? <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}

      {selectedType && !questions.length ? (
        <section id="interview-setup" className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs font-black uppercase tracking-[0.18em] text-brand-700">Session setup</p><h2 className="mt-2 text-2xl font-bold text-slate-950">Tailor the questions to your target role</h2><p className="mt-1 text-sm text-slate-600">Choose an occupation category, then select a saved job or enter the details manually. A full job description produces more specific questions.</p></div>
            <button type="button" onClick={resetSession} className="text-sm font-bold text-slate-500 hover:text-slate-900">Close</button>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700 md:col-span-2">Saved job (optional)
              <select value={jobId} onChange={(e) => chooseJob(Number(e.target.value))} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100">
                <option value={0}>Enter role details manually</option>
                {jobs.map((job) => <option key={job.id} value={job.id}>{job.job.title} — {job.job.company || "Unknown company"}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700 md:col-span-2">Occupation category
              <select value={occupationCategory} onChange={(e) => setOccupationCategory(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100">
                <option value="">Choose a category</option>
                {occupationCategories.filter((item) => selectedType !== "technical" || item.technical).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              {selectedType === "technical" ? <span className="mt-2 block text-xs font-medium text-brand-700">Technical Interview is limited to software, data, IT, engineering, QA, and science roles.</span> : null}
            </label>
            <label className="text-sm font-semibold text-slate-700">Target role
              <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Data Analyst" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
            </label>
            <label className="text-sm font-semibold text-slate-700">Company
              <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Optional" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
            </label>
            <label className="text-sm font-semibold text-slate-700">Difficulty
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3">
                <option value="easy">Warm-up</option><option value="medium">Realistic</option><option value="hard">Challenging</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">Number of questions
              <select value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3">
                {[3, 5, 7, 10].map((count) => <option key={count} value={count}>{count} questions</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700 md:col-span-2">Job description (recommended)
              <textarea rows={7} value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} placeholder="Paste the job description here for more relevant questions…" className="mt-2 w-full resize-y rounded-xl border border-slate-200 p-3 text-sm leading-6 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
            </label>
          </div>
          <div className="mt-6 flex justify-end"><button type="button" disabled={busy || !occupationCategory} onClick={() => void startSession()} className="rounded-xl bg-brand-600 px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Building session…" : "Generate practice session"}</button></div>
        </section>
      ) : null}

      {questions.length && !finished ? (
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-200 bg-slate-50/70 px-6 py-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div><p className="text-xs font-black uppercase tracking-[0.16em] text-brand-700">{cards.find((card) => card.type === selectedType)?.title}</p><h2 className="mt-1 text-xl font-bold text-slate-950">{role || "General interview practice"}{company ? ` · ${company}` : ""}</h2><p className="mt-1 text-xs font-semibold text-slate-500">{occupationCategories.find((item) => item.value === occupationCategory)?.label}</p></div>
              <div className="flex items-center gap-3 text-sm font-semibold text-slate-600"><span>{completedCount}/{questions.length} reviewed</span><button type="button" onClick={resetSession} className="rounded-lg border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50">New session</button></div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }} /></div>
          </header>

          <div className="grid lg:grid-cols-[minmax(0,1fr)_19rem]">
            <div className="p-6 sm:p-8">
              <div className="flex items-start gap-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-black text-brand-800">{currentIndex + 1}</span><div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Focus: {currentQuestion.focus}</p><h3 className="mt-2 text-xl font-bold leading-8 text-slate-950">{currentQuestion.question}</h3></div></div>

              <label className="mt-6 block text-sm font-bold text-slate-700">Your answer
                <textarea rows={10} value={answers[currentIndex] || ""} onChange={(e) => setAnswers((rows) => ({ ...rows, [currentIndex]: e.target.value }))} placeholder="Write your response or use this space to outline what you would say…" className="mt-2 w-full resize-y rounded-2xl border border-slate-200 bg-slate-50/40 p-4 text-[15px] leading-7 outline-none focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100" />
              </label>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500"><span>{(answers[currentIndex] || "").trim().split(/\s+/).filter(Boolean).length} words · saved automatically</span><button type="button" onClick={() => setShowGuidance((value) => !value)} className="font-bold text-brand-700 hover:underline">{showGuidance ? "Hide answer framework" : "Show answer framework"}</button></div>
              {showGuidance ? <div className="mt-4 rounded-2xl border border-brand-100 bg-brand-50/60 p-4"><p className="text-sm font-bold text-brand-900">Answer framework</p><ul className="mt-2 space-y-1.5 text-sm text-brand-900/80">{currentQuestion.guidance.map((item) => <li key={item} className="flex gap-2"><span>•</span><span>{item}</span></li>)}</ul></div> : null}

              <div className="mt-6 flex flex-wrap gap-3">
                <button type="button" disabled={busy || !(answers[currentIndex] || "").trim()} onClick={() => void reviewAnswer()} className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-40">{busy ? "Reviewing…" : feedback[currentIndex] ? "Review again" : "Get feedback"}</button>
                <button type="button" disabled={currentIndex === 0} onClick={() => { setCurrentIndex((index) => index - 1); setShowGuidance(false); }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40">Previous</button>
                {currentIndex < questions.length - 1 ? <button type="button" onClick={() => { setCurrentIndex((index) => index + 1); setShowGuidance(false); }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">Next question</button> : <button type="button" onClick={() => setFinished(true)} className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-800 hover:bg-emerald-100">Finish session</button>}
              </div>

              {feedback[currentIndex] ? <div className="mt-7 rounded-2xl border border-slate-200 bg-slate-50 p-5"><div className="flex flex-col gap-5 sm:flex-row"><ScoreRing score={feedback[currentIndex].score} /><div className="min-w-0 flex-1"><h4 className="text-lg font-bold text-slate-950">Coaching feedback</h4><p className="mt-1 text-sm leading-6 text-slate-600">{feedback[currentIndex].summary}</p><div className="mt-4 grid gap-4 md:grid-cols-2"><div><p className="text-sm font-bold text-emerald-800">What worked</p><ul className="mt-2 space-y-2 text-sm text-slate-700">{feedback[currentIndex].strengths.map((item) => <li key={item}>✓ {item}</li>)}</ul></div><div><p className="text-sm font-bold text-amber-800">Strengthen next</p><ul className="mt-2 space-y-2 text-sm text-slate-700">{feedback[currentIndex].improvements.map((item) => <li key={item}>→ {item}</li>)}</ul></div></div></div></div></div> : null}
            </div>

            <aside className="border-t border-slate-200 bg-slate-50/60 p-5 lg:border-l lg:border-t-0">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Session questions</p>
              <ol className="mt-4 space-y-2">{questions.map((question, index) => <li key={`${question.question}-${index}`}><button type="button" onClick={() => { setCurrentIndex(index); setShowGuidance(false); }} className={`flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${currentIndex === index ? "bg-brand-100 font-bold text-brand-950" : "text-slate-600 hover:bg-white"}`}><span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-black ${feedback[index] ? "bg-emerald-100 text-emerald-800" : "bg-white text-slate-500"}`}>{feedback[index] ? "✓" : index + 1}</span><span className="line-clamp-3">{question.question}</span></button></li>)}</ol>
            </aside>
          </div>
        </section>
      ) : null}

      {questions.length && finished ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center"><ScoreRing score={averageScore} /><div><p className="text-xs font-black uppercase tracking-[0.18em] text-brand-700">Session complete</p><h2 className="mt-2 text-2xl font-bold text-slate-950">{completedCount ? `Average coaching score: ${averageScore}/100` : "Practice answers saved"}</h2><p className="mt-1 text-sm text-slate-600">You reviewed {completedCount} of {questions.length} answers. Return to any question to improve it and request feedback again.</p></div></div>
          <div className="mt-6 grid gap-3 md:grid-cols-2">{questions.map((question, index) => <button type="button" key={`${question.question}-${index}`} onClick={() => { setCurrentIndex(index); setFinished(false); }} className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4 text-left hover:border-brand-300 hover:bg-brand-50/40"><span className="text-sm font-semibold text-slate-800"><span className="mr-2 text-slate-400">{index + 1}.</span>{question.focus}</span><span className="text-sm font-black text-brand-700">{feedback[index]?.score ?? "Not reviewed"}</span></button>)}</div>
          <div className="mt-6 flex flex-wrap gap-3"><button type="button" onClick={() => setFinished(false)} className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700">Continue practising</button><button type="button" onClick={resetSession} className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">Start a new session</button></div>
        </section>
      ) : null}
    </div>
  );
}
