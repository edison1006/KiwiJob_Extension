export type BgRequest =
  | { type: "SAVE_JOB"; payload: unknown }
  | { type: "TRACK_EVENT"; payload: unknown }
  | { type: "ANALYZE_MATCH"; jobId: number }
  | { type: "GET_INSIGHTS"; days: number; start?: string; end?: string }
  | { type: "AUTOFILL_ACTIVE_TAB" }
  | { type: "GET_API_BASE" }
  | { type: "SET_API_BASE"; apiBase: string };

export type ContentToPanelMessage =
  | { type: "KIWIJOB_JOB_CHANGED"; payload: unknown };

export type BgResponse =
  | { ok: true; data?: unknown }
  | { ok: false; error: string };
