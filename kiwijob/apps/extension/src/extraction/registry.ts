import { indeedSiteExtractor } from "./indeed";
import { linkedInSiteExtractor } from "./linkedin";
import { seekSiteExtractor } from "./seek";
import { tradeMeSiteExtractor } from "./trademe";
import type { SiteExtractor } from "./types";

/** Per-site layers merged after generic + JSON-LD extraction. */
export const siteExtractors: SiteExtractor[] = [linkedInSiteExtractor, seekSiteExtractor, indeedSiteExtractor, tradeMeSiteExtractor];

export type { SiteExtractor } from "./types";
