import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { useAuth } from "../auth";
import { getApiBaseUrl, identifyAccount } from "../lib/api";

type AuthMode = "login" | "register";
type AuthStep = "email" | "credentials";

function PasswordVisibilityIcon({ visible }: { visible: boolean }) {
  return visible ? (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.3A10.7 10.7 0 0 1 12 4c6 0 9.5 8 9.5 8a15 15 0 0 1-2.1 3.2M6.2 6.2C3.8 8 2.5 12 2.5 12s3.5 8 9.5 8a10.2 10.2 0 0 0 4-.8" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.7 12.9c0-2.4 2-3.6 2.1-3.7a4.5 4.5 0 0 0-3.5-1.9c-1.5-.2-2.9.9-3.6.9-.8 0-1.9-.9-3.1-.9a4.7 4.7 0 0 0-4 2.4c-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3.1 2.4 1.2 0 1.7-.8 3.3-.8 1.5 0 2 .8 3.3.8 1.4 0 2.3-1.2 3.1-2.4a10.5 10.5 0 0 0 1.4-2.9 4.2 4.2 0 0 1-3.3-3.7ZM14.3 5.8A4.2 4.2 0 0 0 15.3 2a4.3 4.3 0 0 0-2.9 1.4 4 4 0 0 0-1.1 3.1 3.6 3.6 0 0 0 3-0.7Z" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="#0A66C2" aria-hidden>
      <path d="M20.5 3h-17A2.5 2.5 0 0 0 1 5.5v13A2.5 2.5 0 0 0 3.5 21h17a2.5 2.5 0 0 0 2.5-2.5v-13A2.5 2.5 0 0 0 20.5 3ZM8 18H5V9h3v9ZM6.5 7.8A1.8 1.8 0 1 1 6.5 4a1.8 1.8 0 0 1 0 3.8ZM19 18h-3v-4.4c0-2.7-3-2.5-3 0V18h-3V9h3v1.4c1.4-2.5 6-2.7 6 2.4V18Z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.9c-2.8.6-3.4-1.2-3.4-1.2-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 0 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5A3.9 3.9 0 0 1 6.6 8c-.1-.3-.5-1.3.1-3.3 0 0 .8-.3 2.8 1a9.6 9.6 0 0 1 5 0c2-1.3 2.8-1 2.8-1 .6 2 .2 3 .1 3.3a3.9 3.9 0 0 1 1 2.7c0 3.9-2.4 4.7-4.6 5 .4.3.7 1 .7 2V21c0 .3.2.6.7.5A10 10 0 0 0 12 2Z" />
    </svg>
  );
}

export default function AuthPage() {
  const { user, login, loginWithOAuth, register } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const authQuery = new URLSearchParams(location.search);
  const queryMode = authQuery.get("mode");
  const queryProvider = authQuery.get("provider");
  const requestedProvider = ["google", "apple", "linkedin", "github"].includes(queryProvider || "")
    ? (queryProvider as "google" | "apple" | "linkedin" | "github")
    : null;
  const initialEmail = authQuery.get("email")?.trim() || "";
  const preferredMode: AuthMode = queryMode === "register" ? "register" : "login";
  const [step, setStep] = useState<AuthStep>(requestedProvider && initialEmail ? "credentials" : "email");
  const [mode, setMode] = useState<AuthMode>(preferredMode);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [passwordLoginAvailable, setPasswordLoginAvailable] = useState(!requestedProvider);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const googlePromptRequestedRef = useRef(false);
  const socialRedirectRequestedRef = useRef(false);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
  const appleClientId = import.meta.env.VITE_APPLE_CLIENT_ID?.trim();
  const queryReturnTo = authQuery.get("return_to") || "";
  const stateFrom = (location.state as { from?: string } | null)?.from || "";
  const from = (queryReturnTo.startsWith("/") && !queryReturnTo.startsWith("//") ? queryReturnTo : stateFrom) || "/";
  const inPageModal = new URLSearchParams(location.search).get("auth") === "login";

  function startSocialLogin(provider: "github" | "linkedin") {
    const url = new URL(`${getApiBaseUrl()}/auth/social/${provider}/start`);
    url.searchParams.set("return_to", from);
    window.location.assign(url.toString());
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeAuthModal();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    const oauthError = authQuery.get("oauth_error");
    if (oauthError) setError("Social sign-in was cancelled or could not be completed.");
    if (
      (requestedProvider === "github" || requestedProvider === "linkedin")
      && !socialRedirectRequestedRef.current
    ) {
      socialRedirectRequestedRef.current = true;
      startSocialLogin(requestedProvider);
    }
  }, [requestedProvider]);

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
        width: googleButtonRef.current.clientWidth || 420,
        text: step === "email" ? "continue_with" : mode === "register" ? "signup_with" : "signin_with",
      });
      if (requestedProvider === "google" && !googlePromptRequestedRef.current) {
        googlePromptRequestedRef.current = true;
        window.google.accounts.id.prompt();
      }
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
  }, [from, googleClientId, loginWithOAuth, mode, navigate, requestedProvider, step]);

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

  async function continueWithEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const identity = await identifyAccount(email);
      const nextMode = preferredMode === "register" ? "register" : identity.account_exists ? "login" : "register";
      setMode(nextMode);
      setPasswordLoginAvailable(identity.password_login_available || !identity.account_exists);
      setStep("credentials");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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

  function editEmail() {
    setStep("email");
    setPassword("");
    setError("");
    setPasswordLoginAvailable(true);
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setPassword("");
    setError("");
    setPasswordLoginAvailable(true);
  }

  if (user && inPageModal) {
    const next = new URLSearchParams(location.search);
    next.delete("auth");
    next.delete("mode");
    const search = next.toString();
    return <Navigate to={{ pathname: location.pathname, search: search ? `?${search}` : "" }} replace />;
  }
  if (user) return <Navigate to={from} replace />;

  const title = step === "email" ? "Log in or create account" : mode === "login" ? "Welcome back" : "Create your account";

  return (
    <main
      className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-slate-950/45 px-4 py-6 text-slate-950 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeAuthModal();
      }}
    >
      {!inPageModal ? (
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_10%,rgba(196,181,253,.7),transparent_38%),radial-gradient(circle_at_80%_80%,rgba(129,140,248,.55),transparent_40%),#f5f3ff]" />
      ) : null}
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        className="relative w-full max-w-[510px] overflow-hidden rounded-[22px] border border-white/70 bg-white shadow-[0_34px_100px_-36px_rgba(15,23,42,.72)]"
      >
        <div className="max-h-[calc(100vh-3rem)] overflow-y-auto px-7 py-8 sm:px-9">
          <button
            type="button"
            aria-label="Close"
            onClick={closeAuthModal}
            className="absolute right-5 top-5 rounded-full p-1.5 text-slate-700 transition hover:bg-slate-100 hover:text-slate-950"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25">
              <path d="M6 6l12 12M18 6l-12 12" strokeLinecap="round" />
            </svg>
          </button>

          <div className="pr-9">
            <div className="mb-5 flex items-center gap-2.5">
              <img src="/kiwijob-fern.png" alt="" className="h-9 w-9 object-contain" aria-hidden />
              <span className="font-mono text-sm font-extrabold tracking-tight text-brand-900">KiwiJob</span>
            </div>
            <h1 id="auth-title" className="text-[30px] font-bold leading-tight tracking-[-0.025em] text-slate-950">
              {title}
            </h1>
            {step === "email" ? (
              <p className="mt-2 max-w-md text-[15px] leading-6 text-slate-600">
                Save jobs, compare your CV, and keep every application moving in one place.
              </p>
            ) : null}
          </div>

          {step === "email" ? (
            <form className="mt-7" onSubmit={continueWithEmail}>
              <label className="block text-sm font-bold text-slate-900">
                Email <span className="text-rose-600">*</span>
                <input
                  className="mt-2 w-full rounded-xl border border-slate-400 bg-white px-4 py-3.5 text-base text-slate-950 outline-none placeholder:text-slate-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20"
                  type="email"
                  placeholder="name@email.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  autoFocus
                  required
                />
              </label>
              {error ? <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">{error}</div> : null}
              <button
                type="submit"
                disabled={busy}
                className="mt-5 w-full rounded-xl bg-brand-600 px-4 py-3.5 text-base font-bold text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 disabled:opacity-50"
              >
                {busy ? "Checking…" : "Continue"}
              </button>
            </form>
          ) : (
            <form className="mt-7 space-y-4" onSubmit={submitCredentials}>
              <label className="block text-sm font-bold text-slate-900">
                Email <span className="text-rose-600">*</span>
                <span className="mt-2 flex overflow-hidden rounded-xl border border-slate-400 bg-brand-50/60 focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-500/20">
                  <input
                    className="min-w-0 flex-1 bg-transparent px-4 py-3.5 text-base text-slate-950 outline-none"
                    value={email}
                    readOnly
                    autoComplete="email"
                  />
                  <button
                    type="button"
                    aria-label="Edit email"
                    onClick={editEmail}
                    className="border-l border-slate-300 bg-white px-4 text-slate-700 transition hover:bg-slate-50"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m4 16-.8 4 4-.8L18.5 7.9a2.1 2.1 0 0 0-3-3L4 16Z" strokeLinejoin="round" />
                    </svg>
                  </button>
                </span>
              </label>

              {mode === "register" ? (
                <label className="block text-sm font-bold text-slate-900">
                  Name
                  <input
                    className="mt-2 w-full rounded-xl border border-slate-400 bg-white px-4 py-3.5 text-base text-slate-950 outline-none placeholder:text-slate-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20"
                    placeholder="Your name"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    autoComplete="name"
                    autoFocus
                  />
                </label>
              ) : null}

              {passwordLoginAvailable || mode === "register" ? (
                <label className="block text-sm font-bold text-slate-900">
                  Password <span className="text-rose-600">*</span>
                  <span className="relative mt-2 block">
                    <input
                      className="w-full rounded-xl border border-slate-400 bg-white px-4 py-3.5 pr-12 text-base text-slate-950 outline-none placeholder:text-slate-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20"
                      type={passwordVisible ? "text" : "password"}
                      placeholder={mode === "login" ? "Enter your password" : "Create a password (8+ characters)"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete={mode === "register" ? "new-password" : "current-password"}
                      minLength={8}
                      autoFocus={mode === "login"}
                      required
                    />
                    <button
                      type="button"
                      aria-label={passwordVisible ? "Hide password" : "Show password"}
                      onClick={() => setPasswordVisible((current) => !current)}
                      className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-600 hover:text-slate-950"
                    >
                      <PasswordVisibilityIcon visible={passwordVisible} />
                    </button>
                  </span>
                </label>
              ) : (
                <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm leading-6 text-brand-900">
                  This account uses {requestedProvider === "apple" ? "Apple" : requestedProvider === "linkedin" ? "LinkedIn" : requestedProvider === "github" ? "GitHub" : requestedProvider === "google" ? "Google" : "social"} sign-in. Continue with the same provider below.
                </div>
              )}

              {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">{error}</div> : null}

              {passwordLoginAvailable || mode === "register" ? (
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-brand-600 px-4 py-3.5 text-base font-bold text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 disabled:opacity-50"
                >
                  {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
                </button>
              ) : null}

              <p className="text-center text-sm text-slate-600">
                {mode === "login" ? "New to KiwiJob?" : "Already have an account?"}{" "}
                <button
                  type="button"
                  className="font-bold text-brand-700 underline-offset-2 hover:underline"
                  onClick={() => switchMode(mode === "login" ? "register" : "login")}
                >
                  {mode === "login" ? "Create account" : "Log in"}
                </button>
              </p>
            </form>
          )}

          <div className="my-5 flex items-center gap-4 text-xs text-slate-500">
            <span className="h-px flex-1 bg-slate-200" />
            or continue with
            <span className="h-px flex-1 bg-slate-200" />
          </div>
          <div className="space-y-3">
            {googleClientId ? <div ref={googleButtonRef} className="min-h-11 w-full overflow-hidden rounded-xl" /> : null}
            <button
              type="button"
              disabled={busy}
              className="relative flex w-full items-center justify-center rounded-xl border border-[#0A66C2] bg-white px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-blue-50 disabled:opacity-50"
              onClick={() => startSocialLogin("linkedin")}
            >
              <span className="absolute left-4"><LinkedInIcon /></span>
              Continue with LinkedIn
            </button>
            <button
              type="button"
              disabled={busy}
              className="relative flex w-full items-center justify-center rounded-xl border border-slate-800 bg-white px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-slate-50 disabled:opacity-50"
              onClick={() => startSocialLogin("github")}
            >
              <span className="absolute left-4"><GitHubIcon /></span>
              Continue with GitHub
            </button>
            {appleClientId ? (
              <button
                type="button"
                disabled={busy}
                className="relative flex w-full items-center justify-center rounded-xl border border-slate-800 bg-white px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-slate-50 disabled:opacity-50"
                onClick={() => void signInWithApple()}
              >
                <span className="absolute left-4"><AppleIcon /></span>
                Continue with Apple
              </button>
            ) : null}
          </div>

          <p className="mt-6 text-xs leading-5 text-slate-500">
            By continuing, you agree to KiwiJob&apos;s{" "}
            <Link className="font-semibold text-brand-700 underline-offset-2 hover:underline" to="/terms">Terms of Use</Link>{" "}
            and acknowledge the{" "}
            <Link className="font-semibold text-brand-700 underline-offset-2 hover:underline" to="/privacy">Privacy Notice</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}
