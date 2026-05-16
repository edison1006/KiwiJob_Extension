import { FormEvent, useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { getApiBaseUrl } from "../lib/api";

export default function AuthPage() {
  const { user, login, loginWithOAuth, register } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
  const appleClientId = import.meta.env.VITE_APPLE_CLIENT_ID?.trim();

  const from = (location.state as { from?: string } | null)?.from || "/";

  useEffect(() => {
    if (!googleClientId || !googleButtonRef.current) return;
    const scriptId = "google-identity-services";
    const render = () => {
      if (!window.google || !googleButtonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response) => {
          if (!response.credential) {
            setError("Google did not return a sign-in token.");
            return;
          }
          setBusy(true);
          setError("");
          void loginWithOAuth("google", response.credential)
            .then(() => navigate(from, { replace: true }))
            .catch((err) => setError(err instanceof Error ? err.message : String(err)))
            .finally(() => setBusy(false));
        },
      });
      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline",
        size: "large",
        width: googleButtonRef.current.clientWidth || 360,
        text: mode === "register" ? "signup_with" : "signin_with",
      });
    };
    const existing = document.getElementById(scriptId);
    if (existing) {
      render();
      return;
    }
    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = render;
    document.head.appendChild(script);
  }, [from, googleClientId, loginWithOAuth, mode, navigate]);

  useEffect(() => {
    if (!appleClientId) return;
    const scriptId = "appleid-auth-js";
    const init = () => {
      window.AppleID?.auth.init({
        clientId: appleClientId,
        scope: "name email",
        redirectURI: window.location.origin,
        usePopup: true,
      });
    };
    const existing = document.getElementById(scriptId);
    if (existing) {
      init();
      return;
    }
    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";
    script.async = true;
    script.defer = true;
    script.onload = init;
    document.head.appendChild(script);
  }, [appleClientId]);

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

  async function signInWithApple() {
    if (!window.AppleID) {
      setError("Apple sign-in is still loading. Try again in a moment.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await window.AppleID.auth.signIn();
      const idToken = result.authorization?.id_token;
      if (!idToken) throw new Error("Apple did not return a sign-in token.");
      await loginWithOAuth("apple", idToken);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (user) return <Navigate to={from} replace />;

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

        {googleClientId || appleClientId ? (
          <div className="mb-5 space-y-3">
            {googleClientId ? <div ref={googleButtonRef} className="min-h-10 w-full overflow-hidden rounded-xl" /> : null}
            {appleClientId ? (
              <button
                type="button"
                disabled={busy}
                className="flex w-full items-center justify-center rounded-xl border border-slate-900 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
                onClick={() => void signInWithApple()}
              >
                Continue with Apple
              </button>
            ) : null}
            <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <span className="h-px flex-1 bg-slate-200" />
              or
              <span className="h-px flex-1 bg-slate-200" />
            </div>
          </div>
        ) : null}

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
