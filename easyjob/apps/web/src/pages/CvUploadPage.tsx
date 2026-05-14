import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ResumeDTO } from "@easyjob/shared";
import { fetchResumes, uploadResume } from "../lib/api";

type DocTab = "resumes" | "cover" | "templates";

const stroke = { stroke: "currentColor", strokeWidth: 2, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function IconDoc({ className = "h-5 w-5 text-slate-500" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path {...stroke} d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path {...stroke} d="M14 2v6h6" />
    </svg>
  );
}

function IconLayout({ className = "h-5 w-5 text-slate-500" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <rect {...stroke} x="3" y="3" width="7" height="9" rx="1" />
      <rect {...stroke} x="14" y="3" width="7" height="5" rx="1" />
      <rect {...stroke} x="14" y="12" width="7" height="9" rx="1" />
      <rect {...stroke} x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  );
}

function IconChat({ className = "h-5 w-5 text-slate-500" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path {...stroke} d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}

function IconSparkle({ className = "h-3.5 w-3.5 text-teal-600" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M12 2l1.2 4.2L17 7l-3.8 1L12 12l-1.2-4.8L7 7l3.8-1L12 2zm8 10l-2.2.6L17 14l.6-2.2L15 11l2.2-.6L17 8l.6 2.2L19 11zm-8 10l-1.2-4.2L7 17l3.8-1L12 22l1.2-4.8L17 17l-3.8 1L12 22z" />
    </svg>
  );
}

function IconPencil({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path {...stroke} d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function IconChevronDownSm({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path {...stroke} d="M6 9l6 6 6-6" />
    </svg>
  );
}

function IconUpload({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path {...stroke} d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
    </svg>
  );
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

type ActionCardProps = {
  icon: ReactNode;
  title: ReactNode;
  description: string;
  onPlus?: () => void;
  disabled?: boolean;
  dim?: boolean;
};

function ActionCard({ icon, title, description, onPlus, disabled, dim }: ActionCardProps) {
  return (
    <div className={`relative rounded-2xl border border-slate-200/90 bg-white p-4 pr-12 shadow-sm ${dim ? "opacity-60" : ""}`}>
      <button
        type="button"
        disabled={disabled || !onPlus}
        onClick={onPlus}
        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-lg font-light text-slate-500 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Add"
      >
        +
      </button>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">{icon}</div>
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">{description}</p>
        </div>
      </div>
    </div>
  );
}

export default function CvUploadPage() {
  const [items, setItems] = useState<ResumeDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<DocTab>("resumes");
  const [search, setSearch] = useState("");
  const [filter] = useState<"all">("all");
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    const data = await fetchResumes();
    setItems(data);
  }

  useEffect(() => {
    refresh().catch((e: Error) => setError(e.message));
  }, []);

  async function onFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await uploadResume(file);
      await refresh();
      setSelected(new Set());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const filtered = (items ?? []).filter((r) => r.filename.toLowerCase().includes(search.trim().toLowerCase()));

  function toggleRow(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    if (!filtered.length) return;
    const all = filtered.every((r) => selected.has(r.id));
    if (all) setSelected(new Set());
    else setSelected(new Set(filtered.map((r) => r.id)));
  }

  function tabBtn(id: DocTab, label: string, icon: ReactNode) {
    return (
      <button
        key={id}
        type="button"
        className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition ${
          tab === id ? "border-teal-600 text-teal-700" : "border-transparent text-slate-500 hover:text-slate-800"
        }`}
        onClick={() => setTab(id)}
      >
        {icon}
        {label}
      </button>
    );
  }

  return (
    <div className="-mx-4 -mt-4 min-h-[calc(100vh-6rem)] bg-slate-50 px-4 py-6 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">My Documents</h1>
          <p className="mt-2 text-sm text-slate-600">Manage and tailor all of your job search documents here!</p>
        </header>

        <input ref={fileRef} className="hidden" type="file" accept=".pdf,.docx" disabled={busy} onChange={(e) => void onFile(e.target.files?.[0] ?? null)} />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <ActionCard
            icon={<IconDoc />}
            title="New Resume"
            description="Craft and tailor to job description."
            onPlus={() => fileRef.current?.click()}
            disabled={busy}
          />
          <ActionCard icon={<IconDoc />} title="New Cover Letter" description="Create and customize with AI." dim disabled />
          <ActionCard
            icon={<IconLayout />}
            title={
              <>
                New Template
                <IconSparkle />
              </>
            }
            description="Create a reusable cover letter template."
            dim
            disabled
          />
          <ActionCard
            icon={<IconChat />}
            title={
              <>
                Question Response
                <IconSparkle />
              </>
            }
            description="Generate tailored responses to application questions."
            dim
            disabled
          />
        </div>

        <div className="border-b border-slate-200">
          <div className="flex gap-1">
            {tabBtn("resumes", "Resumes", <IconDoc className={tab === "resumes" ? "h-5 w-5 text-teal-600" : "h-5 w-5"} />)}
            {tabBtn("cover", "Cover Letters", <IconDoc className={tab === "cover" ? "h-5 w-5 text-teal-600" : "h-5 w-5"} />)}
            {tabBtn("templates", "Templates", <IconLayout className={tab === "templates" ? "h-5 w-5 text-teal-600" : "h-5 w-5"} />)}
          </div>
        </div>

        {tab !== "resumes" ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
            <p className="text-sm font-semibold text-slate-800">Nothing here yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
              {tab === "cover" ? "Cover letters are not available in this build." : "Templates are not available in this build."}
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                <span>
                  <span className="font-semibold text-slate-900">{selected.size}</span> selected
                </span>
                <button
                  type="button"
                  disabled
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-400"
                  title="Bulk delete is not available in this build."
                >
                  <span aria-hidden>🗑</span> Delete
                </button>
              </div>
              <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-end lg:max-w-2xl">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-teal-600 bg-white px-4 py-2.5 text-sm font-semibold text-teal-700 shadow-sm hover:bg-teal-50 disabled:opacity-50"
                >
                  <IconUpload />
                  Upload
                </button>
                <select
                  value={filter}
                  disabled
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 shadow-sm"
                  aria-label="Filter"
                  title="Only “All” in this MVP"
                >
                  <option value="all">All</option>
                </select>
                <div className="relative min-w-0 flex-1 sm:min-w-[12rem]">
                  <input
                    type="search"
                    placeholder="Search"
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-3 pr-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{error}</div> : null}

            {!items ? (
              <div className="text-sm text-slate-600">Loading…</div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-100 text-left text-[11px] font-bold uppercase tracking-wide text-slate-600">
                      <tr>
                        <th className="w-12 px-3 py-3">
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                            checked={filtered.length > 0 && filtered.every((r) => selected.has(r.id))}
                            onChange={toggleAllVisible}
                            aria-label="Select all"
                          />
                        </th>
                        <th className="px-4 py-3">Resume name</th>
                        <th className="px-4 py-3">Created</th>
                        <th className="px-4 py-3">Last edited</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-600">
                            {search.trim() ? "No documents match your search." : "No resumes yet. Use New Resume or Upload to add a PDF/DOCX."}
                          </td>
                        </tr>
                      ) : (
                        filtered.map((r) => (
                          <tr key={r.id} className="hover:bg-slate-50/90">
                            <td className="px-3 py-3">
                              <input
                                type="checkbox"
                                className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                                checked={selected.has(r.id)}
                                onChange={() => toggleRow(r.id)}
                                aria-label={`Select ${r.filename}`}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-start gap-2">
                                <IconDoc className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                                <div>
                                  <div className="font-semibold text-slate-900">{r.filename}</div>
                                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                                    <span className="rounded-md bg-teal-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-800">
                                      Uploaded
                                    </span>
                                    {items.length === 1 ? (
                                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                                        Default
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-600">{fmtDate(r.created_at)}</td>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-600">{fmtDate(r.created_at)}</td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-3">
                                <button
                                  type="button"
                                  disabled
                                  className="inline-flex items-center gap-1 text-sm font-semibold text-teal-600 opacity-50"
                                  title="Editor not in this MVP"
                                >
                                  <IconPencil />
                                  Edit
                                </button>
                                <details className="relative">
                                  <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-sm font-semibold text-slate-600 marker:hidden hover:text-slate-900 [&::-webkit-details-marker]:hidden">
                                    More
                                    <IconChevronDownSm />
                                  </summary>
                                  <div className="absolute right-0 z-20 mt-1 min-w-[10rem] rounded-lg border border-slate-200 bg-white py-1 text-left text-sm shadow-lg">
                                    <button type="button" disabled className="block w-full px-3 py-2 text-left text-slate-400">
                                      Download
                                    </button>
                                  </div>
                                </details>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
