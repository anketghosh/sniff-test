// Shared data contracts between the importers, the Apify client, the analysis engine and the UI.

export type DatePrecision = 'exact' | 'approx' | 'none';

export interface Review {
  id: string;
  author: string;
  rating: number | null; // 1-5, null when the source has no star value
  text: string;
  date: string | null; // ISO timestamp
  datePrecision: DatePrecision;
  relativeDate?: string; // e.g. "3 months ago", as shown on Google
  authorReviewCount: number | null; // lifetime reviews written by this reviewer
  isLocalGuide?: boolean;
  hasOwnerResponse?: boolean;
  url?: string;
}

export interface PlaceInfo {
  name: string;
  url?: string;
  statedRating: number | null; // Google's displayed average
  totalReviews: number | null; // Google's displayed review count
  address?: string;
}

export type FlagKey = 'duplicate' | 'generic' | 'single_account' | 'new_account' | 'burst' | 'no_text';

export interface ReviewFlag {
  key: FlagKey;
  label: string;
  detail: string;
}

export interface AnalyzedReview extends Review {
  suspicion: number; // 0..1
  flagged: boolean;
  flags: ReviewFlag[];
  similarTo?: { id: string; author: string; similarity: number };
}

export type PillarKey = 'content' | 'profiles' | 'timing' | 'ratings';

export interface Pillar {
  key: PillarKey;
  name: string;
  description: string;
  weight: number;
  score: number | null; // null when the data can't support this check
  note: string;
}

export type Severity = 'good' | 'info' | 'warn' | 'bad';

export interface Insight {
  severity: Severity;
  title: string;
  detail: string;
}

export interface TimelineBucket {
  start: string; // ISO date
  count: number;
  burst: boolean;
}

export type Verdict = 'trustworthy' | 'mixed' | 'risky';

export interface AuditResult {
  source: 'apify' | 'import' | 'demo';
  place: PlaceInfo;
  analyzedAt: string;
  sampleSize: number;
  trustScore: number;
  verdict: Verdict;
  sampleRating: number | null; // average of every review we analysed
  adjustedRating: number | null; // average after removing flagged reviews
  pillars: Pillar[];
  insights: Insight[];
  starCounts: Record<1 | 2 | 3 | 4 | 5, number>;
  timeline: { unit: 'day' | 'week'; buckets: TimelineBucket[] } | null;
  flagCounts: Record<FlagKey, number>;
  flaggedCount: number;
  reviews: AnalyzedReview[]; // sorted most suspicious first
}

// NDJSON events streamed by /api/audit
export type AuditEvent =
  | { type: 'progress'; stage: 'resolving' | 'starting' | 'scraping' | 'analyzing'; message: string }
  | { type: 'result'; result: AuditResult; cached: boolean }
  | { type: 'error'; message: string };
