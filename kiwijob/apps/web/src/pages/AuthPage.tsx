import { FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { getApiBaseUrl } from "../lib/api";

export default function AuthPage() {
  const { user, login, register } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from || "/";
  if (user) return <Navigate to={from} replace />;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "register") await register(email, password, displayName);
      else await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <img src="/kiwijob-logo.png" alt="KiwiJob" className="h-12 w-12 rounded-xl object-cover" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">KiwiJob</h1>
            <p className="text-sm text-slate-500">Sign in to sync dashboard and extension data.</p>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
          <button
            type="button"
            className={`rounded-lg px-3 py-2 ${mode === "login" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
            onClick={() => setMode("login")}
          >
            Login
          </button>
          <button
            type="button"
            className={`rounded-lg px-3 py-2 ${mode === "register" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
            onClick={() => setMode("register")}
          >
            Register
          </button>
        </div>

        <form className="space-y-4" onSubmit={submit}>
          {mode === "register" ? (
            <label className="block text-sm font-semibold text-slate-700">
              Name
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-slate-950 shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
              />
            </label>
          ) : null}
          <label className="block text-sm font-semibold text-slate-700">
            Email
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-slate-950 shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Password
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-slate-950 shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              minLength={8}
              required
            />
          </label>

          {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div> : null}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? "Please wait..." : mode === "register" ? "Create account" : "Login"}
          </button>
        </form>

        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          API: <span className="font-medium text-slate-700">{getApiBaseUrl()}</span>
        </p>
      </section>
    </main>
  );
}
