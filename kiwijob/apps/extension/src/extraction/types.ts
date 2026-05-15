import type { JobSavePayload } from "@kiwijob/shared";

export type SiteExtractor = {
  id: string;
  /** Return partial fields when this extractor recognizes the page; otherwise null. */
  tryExtract: () => Partial<JobSavePayload> | null;
};
