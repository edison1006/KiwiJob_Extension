import { useEffect, useState } from "react";
import {
  beginGmailConnect,
  confirmGmailSync,
  disconnectGmail,
  fetchGmailStatus,
  previewGmailSync,
  type GmailIntegrationStatus,
  type GmailSyncCandidate,
} from "../lib/api";

export function GmailSyncPanel({ onboarding = false, onDone }: { onboarding?: boolean; onDone?: () => void }) {
  const [status, setStatus] = useState<GmailIntegrationStatus | null>(null);
  const [candidates, setCandidates] = useState<GmailSyncCandidate[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function loadStatus() {
    try {
      setStatus(await fetchGmailStatus());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  async function connect() {
    setBusy(true);
    setMessage("");
    try {
      window.location.assign(await beginGmailConnect());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  }

  async function scan() {
    setBusy(true);
    setMessage("Scanning recent Gmail messages…");
    try {
      const rows = await previewGmailSync();
      setCandidates(rows);
      setSelected(new Set(rows.map((row) => row.email_event_id)));
      setMessage(rows.length ? `Found ${rows.length} suggested update${rows.length === 1 ? "" : "s"}. Review before syncing.` : "No new job-status updates were found.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function applySelected() {
    setBusy(true);
    setMessage("");
    try {
      const result = await confirmGmailSync([...selected]);
      setCandidates([]);
      setSelected(new Set());
      setMessage(`${result.updated_count} job application${result.updated_count === 1 ? "" : "s"} updated.`);
      await loadStatus();
      onDone?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await disconnectGmail();
      setCandidates([]);
      setStatus(await fetchGmailStatus());
      setMessage("Gmail disconnected.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  if (!status) return <p className="text-sm text-slate-500">Loading Gmail connection…</p>;

  return (
    <div>
      {!status.configured ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Gmail sync is not configured on the KiwiJob server.
        </div>
      ) : !status.connected ? (
        <div>
          <p className="text-sm leading-6 text-slate-600">
            KiwiJob will read likely application-response emails and show proposed tracker updates. Nothing is changed until you approve the list.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void connect()}
            className="mt-4 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? "Connecting…" : "Connect Gmail"}
          </button>
        </div>
      ) : (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-950">{status.email_address}</div>
              <div className="mt-0.5 text-xs text-emerald-700">Gmail connected</div>
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => void scan()} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50">
                {busy ? "Working…" : "Scan Gmail"}
              </button>
              {!onboarding ? (
                <button type="button" disabled={busy} onClick={() => void disconnect()} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  Disconnect
                </button>
              ) : null}
            </div>
          </div>

          {candidates.length ? (
            <div className="mt-5">
              <div className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
                {candidates.map((row) => (
                  <label key={row.email_event_id} className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600"
                      checked={selected.has(row.email_event_id)}
                      onChange={(event) => {
                        setSelected((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(row.email_event_id);
                          else next.delete(row.email_event_id);
                          return next;
                        });
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-slate-950">{row.company || "Unknown company"} · {row.job_title}</span>
                      <span className="mt-1 block text-sm text-slate-700">{row.current_status} → <strong className="text-brand-700">{row.proposed_status}</strong></span>
                      <span className="mt-1 block truncate text-xs text-slate-500">{row.subject}</span>
                    </span>
                    <span className="text-xs font-semibold text-slate-500">{Math.round(row.confidence * 100)}%</span>
                  </label>
                ))}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void applySelected()}
                className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Sync {selected.size} selected update{selected.size === 1 ? "" : "s"} to KiwiJob
              </button>
            </div>
          ) : null}
        </div>
      )}
      {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}
    </div>
  );
}
