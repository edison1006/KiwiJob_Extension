export type BgRequest =
  | { type: "AUTH_STATE" }
  | { type: "AUTH_LOGIN"; email: string; password: string }
  | { type: "AUTH_REGISTER"; email: string; password: string; displayName?: string }
  | { type: "AUTH_LOGOUT" }
  | { type: "SAVE_JOB"; payload: unknown }
  | { type: "TRACK_EVENT"; payload: unknown }
  | { type: "PREVIEW_MATCH"; payload: unknown }
  | { type: "ANALYZE_MATCH"; jobId: number }
  | { type: "GET_MATCH"; jobId: number }
  | { type: "GET_INSIGHTS"; days: number; start?: string; end?: string }
  | { type: "GET_RESUMES" }
  | { type: "GET_CV_PROFILE"; resumeId?: number }
  | { type: "AUTOFILL_ACTIVE_TAB" }
  | { type: "GET_API_BASE" }
  | { type: "SET_API_BASE"; apiBase: string };

export type ContentToPanelMessage =
  | { type: "KIWIJOB_JOB_CHANGED"; payload: unknown };

export type BgResponse =
  | { ok: true; data?: unknown }
  | { ok: false; error: string };
