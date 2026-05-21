import { FormEvent, useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { getApiBaseUrl } from "../lib/api";

export default function AuthPage() {
  const { user, login, loginWithOAuth, register } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryMode = new URLSearchParams(location.search).get("mode");
  const [mode, setMode] = useState<"login" | "register">(queryMode === "register" ? "register" : "login");
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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f7f2ff] px-4 py-10 text-slate-950">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-brand-300/35 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-18rem] right-[-12rem] h-[36rem] w-[36rem] rounded-full bg-fuchsia-200/45 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.24] [background-image:linear-gradient(rgba(109,63,195,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(109,63,195,0.16)_1px,transparent_1px)] [background-size:72px_72px]" />
      <section className="relative grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-white/70 bg-white/70 shadow-[0_40px_120px_-80px_rgba(85,44,159,0.75)] backdrop-blur-xl lg:grid-cols-[1fr_440px]">
        <div className="relative hidden min-h-[600px] flex-col justify-between border-r border-brand-100/80 bg-gradient-to-br from-brand-900 via-brand-700 to-[#7b3fc9] p-10 text-white lg:flex">
          <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />
          <div>
            <div className="mb-14 flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center overflow-hidden rounded-2xl border border-white/20 bg-white/10">
                <img src="/kiwijob-logo.png" alt="KiwiJob" className="h-full w-full object-cover" />
              </span>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-white">KiwiJob</h1>
                <p className="text-xs text-brand-100/80">Career command center</p>
              </div>
            </div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-brand-100">Dashboard sync</p>
            <h2 className="mt-4 max-w-md bg-gradient-to-br from-white to-brand-100 bg-clip-text text-5xl font-bold tracking-tight text-transparent">
              Keep your job search data connected.
            </h2>
            <p className="mt-5 max-w-md text-base leading-7 text-brand-50/85">
              Sign in once to share resumes, matches, applications, and insights between the dashboard and the Chrome extension.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {["CV", "Jobs", "Match"].map((item) => (
              <div key={item} className="rounded-2xl border border-white/15 bg-white/10 p-4">
                <div className="h-1 w-10 rounded-full bg-gradient-to-r from-brand-100 to-fuchsia-200" />
                <div className="mt-4 text-sm font-semibold text-white">{item}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 sm:p-8">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <img src="/kiwijob-logo.png" alt="KiwiJob" className="h-12 w-12 rounded-xl object-cover" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-950">KiwiJob</h1>
              <p className="text-sm text-slate-500">Sign in to sync dashboard and extension data.</p>
            </div>
          </div>

          <div className="mb-5 grid grid-cols-2 rounded-full border border-brand-100 bg-brand-50/70 p-1 text-sm font-semibold">
          <button
            type="button"
            className={`rounded-full px-3 py-2 transition ${
              mode === "login" ? "bg-white text-brand-900 shadow-sm" : "text-brand-700/65 hover:text-brand-900"
            }`}
            onClick={() => setMode("login")}
          >
            Login
          </button>
          <button
            type="button"
            className={`rounded-full px-3 py-2 transition ${
              mode === "register" ? "bg-white text-brand-900 shadow-sm" : "text-brand-700/65 hover:text-brand-900"
            }`}
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
                className="mt-1 w-full rounded-xl border border-brand-100 bg-[#fbf9ff] px-3 py-2.5 text-slate-950 shadow-sm outline-none placeholder:text-slate-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-300/20"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
              />
            </label>
          ) : null}
          <label className="block text-sm font-semibold text-slate-700">
            Email
            <input
              className="mt-1 w-full rounded-xl border border-brand-100 bg-[#fbf9ff] px-3 py-2.5 text-slate-950 shadow-sm outline-none placeholder:text-slate-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-300/20"
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
              className="mt-1 w-full rounded-xl border border-brand-100 bg-[#fbf9ff] px-3 py-2.5 text-slate-950 shadow-sm outline-none placeholder:text-slate-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-300/20"
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
            className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white shadow-[0_18px_50px_-25px_rgba(109,63,195,0.95)] transition hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? "Please wait..." : mode === "register" ? "Create account" : "Login"}
          </button>
        </form>

        {mode === "register" ? (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <span className="h-px flex-1 bg-brand-100" />
              register with
              <span className="h-px flex-1 bg-brand-100" />
            </div>
            {googleClientId ? (
              <div ref={googleButtonRef} className="min-h-10 w-full overflow-hidden rounded-xl" />
            ) : (
              <button
                type="button"
                disabled
                title="Set VITE_GOOGLE_CLIENT_ID to enable Google registration."
                className="flex w-full items-center justify-center rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-2.5 text-sm font-bold text-slate-400"
              >
                Continue with Google
              </button>
            )}
            <button
              type="button"
              disabled={busy || !appleClientId}
              title={appleClientId ? "Continue with Apple" : "Set VITE_APPLE_CLIENT_ID to enable Apple registration."}
              className="flex w-full items-center justify-center rounded-xl border border-brand-100 bg-[#fbf9ff] px-4 py-2.5 text-sm font-bold text-slate-950 shadow-sm hover:bg-brand-50 disabled:bg-brand-50/60 disabled:text-slate-400 disabled:shadow-none"
              onClick={() => void signInWithApple()}
            >
              Continue with Apple
            </button>
          </div>
        ) : null}

        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          API: <span className="font-medium text-slate-700">{getApiBaseUrl()}</span>
        </p>
        </div>
      </section>
    </main>
  );
}
