import { useEffect, useState } from "react";
import type { ResumeDTO } from "@easyjob/shared";
import { fetchResumes, uploadResume } from "../lib/api";

export default function CvUploadPage() {
  const [items, setItems] = useState<ResumeDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">CV upload</h1>
        <p className="mt-1 text-sm text-slate-600">Upload a PDF or DOCX. Text is extracted server-side for AI matching.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <label className="block text-sm font-semibold text-slate-900">Upload</label>
        <p className="mt-1 text-xs text-slate-600">Max 15MB for MVP.</p>
        <input
          className="mt-4 block w-full text-sm text-slate-700 file:mr-4 file:rounded-lg file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-700"
          type="file"
          accept=".pdf,.docx"
          disabled={busy}
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
        {error ? <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</div> : null}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Uploaded CVs</h2>
        {!items ? (
          <div className="mt-3 text-sm text-slate-600">Loading…</div>
        ) : items.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
            No CV on file yet.
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {items.map((r) => (
              <li key={r.id} className="py-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{r.filename}</div>
                    <div className="text-xs text-slate-500">{new Date(r.created_at).toLocaleString()}</div>
                  </div>
                </div>
                <p className="mt-2 text-sm text-slate-700">{r.text_preview}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
