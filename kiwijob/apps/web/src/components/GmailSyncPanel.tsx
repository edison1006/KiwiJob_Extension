import { useEffect, useRef, useState } from "react";
import {
  dismissGmailOnboarding,
  fetchGmailStatus,
  linkGmailAccount,
  unlinkGmailAccount,
  type GmailIntegrationStatus,
} from "../lib/api";

export function GmailSyncPanel({ onboarding = false, onDone }: { onboarding?: boolean; onDone?: () => void }) {
  const [status, setStatus] = useState<GmailIntegrationStatus | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
  const installUrl = import.meta.env.VITE_GMAIL_ADDON_INSTALL_URL?.trim();

  useEffect(() => {
    void fetchGmailStatus()
      .then(setStatus)
      .catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
  }, []);

  useEffect(() => {
    if (!status || status.connected || !googleClientId || !googleButtonRef.current) return;
    const render = () => {
      if (!window.google || !googleButtonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response) => {
          if (!response.credential) {
            setMessage("Google did not return a sign-in token.");
            return;
          }
          setBusy(true);
          setMessage("");
          void linkGmailAccount(response.credential)
            .then((next) => {
              setStatus(next);
              setMessage(`Connected ${next.email_address}. Return to Gmail and reopen KiwiJob.`);
            })
            .catch((error) => setMessage(error instanceof Error ? error.message : String(error)))
            .finally(() => setBusy(false));
        },
      });
      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline",
        size: "large",
        width: googleButtonRef.current.clientWidth || 420,
        text: "continue_with",
      });
    };
    const existing = document.getElementById("google-identity-services");
    if (existing) {
      render();
      return;
    }
    const script = document.createElement("script");
    script.id = "google-identity-services";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = render;
    document.head.appendChild(script);
  }, [googleClientId, status]);

  async function openInstallPage() {
    if (onboarding) {
      await dismissGmailOnboarding();
      onDone?.();
    }
    if (installUrl) window.open(installUrl, "_blank", "noopener,noreferrer");
  }

  if (!status) return <p className="text-sm text-slate-500">Loading Gmail Add-on availability…</p>;

  return (
    <div>
      {!status.configured ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          The KiwiJob Gmail Add-on is being prepared. No mailbox access is connected to your KiwiJob account.
        </div>
      ) : (
        <>
          <div className={`rounded-xl border px-4 py-3 ${status.connected ? "border-emerald-200 bg-emerald-50" : "border-violet-200 bg-violet-50"}`}>
            {status.connected ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-emerald-950">Gmail connected</p>
                  <p className="mt-1 text-sm text-emerald-800">{status.email_address}</p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-lg border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                  onClick={() => {
                    setBusy(true);
                    setMessage("");
                    void unlinkGmailAccount()
                      .then(() => {
                        setStatus((current) => current ? { ...current, connected: false, email_address: null } : current);
                        setMessage("Gmail disconnected from this KiwiJob account.");
                      })
                      .catch((error) => setMessage(error instanceof Error ? error.message : String(error)))
                      .finally(() => setBusy(false));
                  }}
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <div>
                <p className="text-sm font-bold text-violet-950">Connect the Gmail address used by the Add-on</p>
                <p className="mt-1 text-sm leading-5 text-violet-800">This links a verified Google identity to your current KiwiJob account. Your existing tracker stays here.</p>
                {googleClientId ? <div ref={googleButtonRef} className={`mt-3 min-h-11 max-w-md overflow-hidden rounded-xl ${busy ? "pointer-events-none opacity-60" : ""}`} /> : (
                  <p className="mt-3 text-sm text-rose-700">Google account linking is not configured.</p>
                )}
              </div>
            )}
          </div>
          <p className="text-sm leading-6 text-slate-600">
            Install the KiwiJob Gmail Add-on, open a recruitment email, and select KiwiJob in Gmail&apos;s right-hand side panel. KiwiJob reads only that open message and automatically syncs reliable results; ambiguous results require confirmation.
          </p>
          <ol className="mt-4 space-y-2 text-sm text-slate-700">
            <li><strong>1.</strong> Install the Gmail Add-on.</li>
            <li><strong>2.</strong> Open a recruitment response in Gmail.</li>
            <li><strong>3.</strong> Select <strong>Analyze this email</strong>. Reliable results sync automatically.</li>
          </ol>
          {installUrl ? (
            <button type="button" onClick={() => void openInstallPage()} className="mt-5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-brand-700">
              Install Gmail Add-on
            </button>
          ) : (
            <p className="mt-4 text-xs leading-5 text-slate-500">The installation button will appear when the Google Workspace deployment URL is configured.</p>
          )}
        </>
      )}
      {message ? <p className="mt-3 text-sm text-rose-700">{message}</p> : null}
    </div>
  );
}
