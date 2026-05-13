export type BgRequest =
  | { type: "SAVE_JOB"; payload: unknown }
  | { type: "ANALYZE_MATCH"; jobId: number }
  | { type: "GET_API_BASE" }
  | { type: "SET_API_BASE"; apiBase: string };

export type BgResponse =
  | { ok: true; data?: unknown }
  | { ok: false; error: string };
