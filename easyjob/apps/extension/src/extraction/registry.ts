import { linkedInSiteExtractor } from "./linkedin";
import { seekSiteExtractor } from "./seek";
import type { SiteExtractor } from "./types";

/** Per-site layers merged after generic + JSON-LD extraction. */
export const siteExtractors: SiteExtractor[] = [linkedInSiteExtractor, seekSiteExtractor];

export type { SiteExtractor } from "./types";
