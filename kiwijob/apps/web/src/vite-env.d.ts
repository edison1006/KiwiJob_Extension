/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** GitHub Issues (or support) URL for the “Report an issue” menu link */
  readonly VITE_ISSUES_URL?: string;
  /** Public privacy policy URL (for production, https://app.kiwijob.co.nz/privacy) */
  readonly VITE_PRIVACY_URL?: string;
  /** Hosted checkout/payment link for the Pro plan. */
  readonly VITE_PRO_CHECKOUT_URL?: string;
  /** Hosted checkout/payment link for the Premium plan. */
  readonly VITE_PREMIUM_CHECKOUT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
