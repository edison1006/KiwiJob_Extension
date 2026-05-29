import { FormEvent, useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { getApiBaseUrl } from "../lib/api";

function AuthPage() {
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
  const inPageModal = new URLSearchParams(location.search).get("auth") === "login";

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

  function closeAuthModal() {
    if (inPageModal) {
      const next = new URLSearchParams(location.search);
      next.delete("auth");
      next.delete("mode");
      const search = next.toString();
      navigate({ pathname: location.pathname, search: search ? `?${search}` : "" }, { replace: true });
      return;
    }
    if (window.history.length > 1) navigate(-1);
    else navigate("/privacy", { replace: true });
  }

  if (user && inPageModal) {
    const next = new URLSearchParams(location.search);
    next.delete("auth");
    next.delete("mode");
    const search = next.toString();
    return <Navigate to={{ pathname: location.pathname, search: search ? `?${search}` : "" }} replace />;
  }
  if (user) return <Navigate to={from} replace />;

  return (
    <main className="fixed inset-0 z-[120] flex items-center justify-center bg-black/25 px-4 py-10 text-slate-900 backdrop-blur-[1px]">
      <section className="relative w-full max-w-[430px] rounded-3xl border border-slate-200 bg-white/95 p-7 shadow-[0_36px_100px_-62px_rgba(15,23,42,0.78)] backdrop-blur">
        <button
          type="button"
          aria-label="Close"
          onClick={closeAuthModal}
          className="absolute right-4 top-4 rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6l-12 12" strokeLinecap="round" />
          </svg>
        </button>

        <h1 className="text-[35px] font-semibold tracking-tight text-slate-900">Log in or create account</h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">Learn on your own time from top universities and businesses.</p>

        <form className="mt-7 space-y-3" onSubmit={submit}>
          {mode === "register" ? (
            <label className="block text-sm font-semibold text-slate-700">
              Name
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-slate-950 outline-none placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
              />
            </label>
          ) : null}
          <label className="block text-sm font-semibold text-slate-700">
            Email <span className="text-rose-600">*</span>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-slate-950 outline-none placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
              type="email"
              placeholder="name@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Password
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-slate-950 outline-none placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
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
            className="mt-2 w-full rounded-xl bg-[#2459cc] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#1f4eb5] disabled:opacity-50"
          >
            {busy ? "Please wait..." : "Continue"}
          </button>
        </form>

        <p className="mt-3 text-center text-xs text-slate-600">
          {mode === "login" ? "New here?" : "Already have an account?"}{" "}
          <button
            type="button"
            className="font-semibold text-[#2459cc] underline-offset-2 hover:underline"
            onClick={() => setMode(mode === "login" ? "register" : "login")}
          >
            {mode === "login" ? "Create account" : "Log in"}
          </button>
        </p>

        <div className="mt-4 flex items-center gap-3 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          or
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <div className="mt-4 space-y-3">
          {googleClientId ? (
            <div ref={googleButtonRef} className="min-h-11 w-full overflow-hidden rounded-xl border border-slate-300" />
          ) : (
            <button
              type="button"
              disabled
              title="Set VITE_GOOGLE_CLIENT_ID to enable Google sign-in."
              className="flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-400"
            >
              Continue with Google
            </button>
          )}

          <button
            type="button"
            disabled
            title="Facebook sign-in is not enabled in this build."
            className="flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-500"
          >
            Continue with Facebook
          </button>

          <button
            type="button"
            disabled={busy || !appleClientId}
            title={appleClientId ? "Continue with Apple" : "Set VITE_APPLE_CLIENT_ID to enable Apple sign-in."}
            className="flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:text-slate-400"
            onClick={() => void signInWithApple()}
          >
            Continue with Apple
          </button>
        </div>

        <p className="mt-6 text-[11px] leading-relaxed text-slate-500">
          By continuing, you agree to our Terms of Use and Privacy Notice. API endpoint: <span className="font-medium">{getApiBaseUrl()}</span>
        </p>
      </section>
    </main>
  );
}

export default AuthPage;
