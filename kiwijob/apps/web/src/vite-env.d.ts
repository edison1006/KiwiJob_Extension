/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** GitHub Issues (or support) URL for the “Report an issue” menu link */
  readonly VITE_ISSUES_URL?: string;
  /** Public privacy policy URL (e.g. raw GitHub link to PRIVACY.md) */
  readonly VITE_PRIVACY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
