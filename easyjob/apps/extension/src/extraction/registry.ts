import type { JobSavePayload } from "@easyjob/shared";

export type SiteExtractor = {
  id: string;
  /** Return partial fields when this extractor recognizes the page; otherwise null. */
  tryExtract: () => Partial<JobSavePayload> | null;
};

/** Placeholder registry for SEEK / LinkedIn / Indeed / Trade Me / career sites. */
export const siteExtractors: SiteExtractor[] = [
  // Example stub — implement per-site later without changing the pipeline.
  // { id: "linkedin", tryExtract: () => null },
];
