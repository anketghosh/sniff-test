// Authenticity analysis engine. Pure TypeScript, runs in the browser (imports, demos) and on the server (Apify).
//
// Four checks, each scored 0-100 (higher = more trustworthy), combined with fixed weights:
//   Content  35%  near-duplicate wording (TF-IDF cosine) and generic template text
//   Profiles 25%  share of reviewers whose account has only one or very few reviews
//   Timing   20%  bursts of reviews in a single day/week (Z-score on review counts)
//   Ratings  20%  polarised 1★/5★ distributions and implausibly perfect ratings
// A check whose data is missing (e.g. no exact dates) is skipped and the weights renormalised.

import type {
  AnalyzedReview,
  AuditResult,
  FlagKey,
  Insight,
  Pillar,
  PlaceInfo,
  Review,
  ReviewFlag,
  Severity,
  TimelineBucket,
  Verdict,
} from './types';

const DUPLICATE_THRESHOLD = 0.8;
const MIN_TOKENS_FOR_DUPLICATE = 6;
const FLAG_THRESHOLD = 0.45;

const FLAG_WEIGHTS: Record<FlagKey, number> = {
  duplicate: 0.5, // raised up to 0.8 with similarity
  generic: 0.2,
  single_account: 0.3,
  new_account: 0.1,
  burst: 0.3,
  no_text: 0.1,
};

export const FLAG_LABELS: Record<FlagKey, string> = {
  duplicate: 'Copied text',
  generic: 'Generic wording',
  single_account: 'One-review account',
  new_account: 'New account',
  burst: 'Review spike',
  no_text: 'No written review',
};

const STOPWORDS = new Set(
  `a an the and or but if then so of to in on at for from by with without about as is are was were be been being am
  i me my we our us you your he she they them their it its this that these those there here what which who whom
  do does did doing have has had having will would can could should shall may might must not no nor too very just
  also only own same than such s t don didn doesn isn wasn aren weren won wouldn couldn shouldn ll ve re d m o y
  all any both each few more most other some again further once up down out off over under into through during
  before after above below between because until while how when where why im ive its dont didnt cant wont`
    .split(/\s+/)
    .filter(Boolean),
);

// Words that carry sentiment but no specifics. Reviews made almost entirely of these are "template-like".
const GENERIC_WORDS = new Set(
  `best great good amazing awesome excellent outstanding fantastic wonderful perfect superb incredible nice love loved
  lovely highly recommend recommended recommendation must definitely absolutely truly really super top tier quality
  service services staff team experience experiences place everything everyone always ever stars star five 5 friendly
  professional fast quick helpful kind polite place spot worth worst terrible horrible awful bad poor scam scammers
  avoid rude unprofessional disappointing disappointed waste never again rip off thanks thank 10 happy satisfied
  beyond expectations needs time times thing things job work done`
    .split(/\s+/)
    .filter(Boolean),
);

// ---------- text utilities ----------

export function cleanText(text: string): string {
  return text
    .replace(/\(Translated by Google\)\s*/gi, '')
    .replace(/\(Original\)[\s\S]*$/i, '')
    .replace(/\s*…?\s*More$/i, '')
    .trim();
}

function words(text: string): string[] {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

function contentTokens(text: string): string[] {
  return words(text).filter((w) => !STOPWORDS.has(w) && w.length > 1);
}

type SparseVector = Map<string, number>;

function buildTfidf(docs: string[][]): SparseVector[] {
  const termsPerDoc = docs.map((tokens) => {
    const terms = [...tokens];
    for (let i = 0; i < tokens.length - 1; i++) terms.push(`${tokens[i]}_${tokens[i + 1]}`);
    return terms;
  });
  const df = new Map<string, number>();
  for (const terms of termsPerDoc) for (const t of new Set(terms)) df.set(t, (df.get(t) ?? 0) + 1);
  const n = docs.length;
  return termsPerDoc.map((terms) => {
    const tf = new Map<string, number>();
    for (const t of terms) tf.set(t, (tf.get(t) ?? 0) + 1);
    const vec: SparseVector = new Map();
    let norm = 0;
    for (const [t, f] of tf) {
      const w = (1 + Math.log(f)) * (Math.log((n + 1) / ((df.get(t) ?? 0) + 1)) + 1);
      vec.set(t, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [t, w] of vec) vec.set(t, w / norm);
    return vec;
  });
}

function cosine(a: SparseVector, b: SparseVector): number {
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [t, w] of small) {
    const v = large.get(t);
    if (v) dot += w * v;
  }
  return dot;
}

// ---------- helpers ----------

const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));
const round1 = (v: number) => Math.round(v * 10) / 10;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const isExtreme = (r: number | null) => r === null || r === 1 || r === 5;
const DAY = 86_400_000;

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function mean(values: number[]) {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

// ---------- main ----------

export function analyzeReviews(rawReviews: Review[], place: PlaceInfo, source: AuditResult['source']): AuditResult {
  const reviews = rawReviews.map((r) => ({ ...r, text: cleanText(r.text ?? '') }));
  const n = reviews.length;
  const flags: ReviewFlag[][] = reviews.map(() => []);
  const scores: number[] = reviews.map(() => 0);
  const similarTo: AnalyzedReview['similarTo'][] = reviews.map(() => undefined);

  const addFlag = (i: number, key: FlagKey, detail: string, weight = FLAG_WEIGHTS[key]) => {
    flags[i].push({ key, label: FLAG_LABELS[key], detail });
    scores[i] += weight;
  };

  // --- Content: near-duplicates ---
  const tokens = reviews.map((r) => contentTokens(r.text));
  const eligible = tokens.map((t, i) => (t.length >= MIN_TOKENS_FOR_DUPLICATE ? i : -1)).filter((i) => i >= 0);
  const vectors = buildTfidf(eligible.map((i) => tokens[i]));
  const bestMatch = new Map<number, { j: number; sim: number }>();
  for (let a = 0; a < eligible.length; a++) {
    for (let b = a + 1; b < eligible.length; b++) {
      const sim = cosine(vectors[a], vectors[b]);
      if (sim < DUPLICATE_THRESHOLD) continue;
      const [i, j] = [eligible[a], eligible[b]];
      if ((bestMatch.get(i)?.sim ?? 0) < sim) bestMatch.set(i, { j, sim });
      if ((bestMatch.get(j)?.sim ?? 0) < sim) bestMatch.set(j, { j: i, sim });
    }
  }
  for (const [i, { j, sim }] of bestMatch) {
    const s = Math.min(1, sim);
    similarTo[i] = { id: reviews[j].id, author: reviews[j].author, similarity: s };
    addFlag(
      i,
      'duplicate',
      `${Math.round(s * 100)}% similar to a review by ${reviews[j].author}`,
      FLAG_WEIGHTS.duplicate + 0.3 * ((s - DUPLICATE_THRESHOLD) / (1 - DUPLICATE_THRESHOLD)),
    );
  }

  // --- Content: generic template text / rating-only ---
  reviews.forEach((r, i) => {
    const w = words(r.text);
    if (w.length === 0) {
      if (r.rating === 1 || r.rating === 5) addFlag(i, 'no_text', 'Star rating only, no written review');
      return;
    }
    const ct = tokens[i];
    if (w.length <= 20 && ct.length >= 2 && isExtreme(r.rating)) {
      const genericShare = ct.filter((t) => GENERIC_WORDS.has(t)).length / ct.length;
      if (genericShare >= 0.75) addFlag(i, 'generic', 'Short, generic praise or complaint with no specific details');
    }
  });

  // --- Profiles ---
  reviews.forEach((r, i) => {
    if (r.authorReviewCount === null) return;
    if (r.authorReviewCount <= 1) addFlag(i, 'single_account', "This is the reviewer's only review on Google");
    else if (r.authorReviewCount <= 3)
      addFlag(i, 'new_account', `Reviewer has written only ${r.authorReviewCount} reviews in total`);
  });

  // --- Timing: bursts ---
  const exact = reviews
    .map((r, i) => ({ i, t: r.date && r.datePrecision === 'exact' ? Date.parse(r.date) : NaN }))
    .filter((x) => !Number.isNaN(x.t));
  let timeline: AuditResult['timeline'] = null;
  let burstReviewCount = 0;
  let biggestBurst: { start: string; count: number; usual: number; unit: 'day' | 'week' } | null = null;
  const timingUsable = exact.length >= 15 && exact.length / Math.max(n, 1) >= 0.6;
  if (exact.length >= 2) {
    const minT = Math.min(...exact.map((x) => x.t));
    const maxT = Math.max(...exact.map((x) => x.t));
    const unit: 'day' | 'week' = maxT - minT <= 180 * DAY ? 'day' : 'week';
    const size = unit === 'day' ? DAY : 7 * DAY;
    const origin = Math.floor(minT / DAY) * DAY;
    const bucketCount = Math.floor((maxT - origin) / size) + 1;
    const counts = new Array<number>(bucketCount).fill(0);
    const members: number[][] = counts.map(() => []);
    for (const { i, t } of exact) {
      const b = Math.floor((t - origin) / size);
      counts[b]++;
      members[b].push(i);
    }
    const mu = counts.reduce((s, c) => s + c, 0) / bucketCount;
    const sd = Math.sqrt(counts.reduce((s, c) => s + (c - mu) ** 2, 0) / bucketCount);
    const buckets: TimelineBucket[] = counts.map((c, b) => {
      const z = sd > 0 ? (c - mu) / sd : 0;
      const burst = timingUsable && bucketCount >= 5 && c >= Math.max(6, 5 * mu) && z >= 3.5;
      return { start: new Date(origin + b * size).toISOString(), count: c, burst };
    });
    buckets.forEach((bk, b) => {
      if (!bk.burst) return;
      burstReviewCount += bk.count;
      if (!biggestBurst || bk.count > biggestBurst.count)
        biggestBurst = { start: bk.start, count: bk.count, usual: mu, unit };
      for (const i of members[b]) {
        if (isExtreme(reviews[i].rating))
          addFlag(i, 'burst', `Posted during an unusual spike (${bk.count} reviews ${unit === 'day' ? 'on' : 'in the week of'} ${formatDay(bk.start)})`);
      }
    });
    timeline = { unit, buckets };
  }

  // --- Per-review suspicion ---
  const analyzed: AnalyzedReview[] = reviews.map((r, i) => {
    let s = scores[i];
    if (r.isLocalGuide && (r.authorReviewCount ?? 0) >= 10) s *= 0.6;
    s = Math.min(1, s);
    return { ...r, suspicion: s, flagged: s >= FLAG_THRESHOLD, flags: flags[i], similarTo: similarTo[i] };
  });

  const flagCounts = { duplicate: 0, generic: 0, single_account: 0, new_account: 0, burst: 0, no_text: 0 } as Record<FlagKey, number>;
  for (const r of analyzed) for (const f of r.flags) flagCounts[f.key]++;
  const flaggedCount = analyzed.filter((r) => r.flagged).length;

  // --- Pillar scores ---
  const withText = reviews.filter((r) => r.text.length > 0).length;
  const contentScore =
    withText >= 5 ? clamp(100 - (flagCounts.duplicate / withText) * 220 - (flagCounts.generic / withText) * 60) : null;

  const known = reviews.filter((r) => r.authorReviewCount !== null).length;
  let profileScore: number | null = null;
  if (known >= 10 && known / Math.max(n, 1) >= 0.5) {
    const single = flagCounts.single_account / known;
    const fresh = flagCounts.new_account / known;
    const penalty = (single <= 0.3 ? single * 100 : 30 + (single - 0.3) * 180) + fresh * 20;
    profileScore = clamp(100 - penalty);
  }

  const timingScore = timingUsable ? clamp(100 - (burstReviewCount / exact.length) * 160) : null;

  const starCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>;
  const rated = reviews.filter((r) => r.rating !== null) as (Review & { rating: number })[];
  for (const r of rated) starCounts[Math.min(5, Math.max(1, Math.round(r.rating))) as 1 | 2 | 3 | 4 | 5]++;
  const sampleRatingRaw = mean(rated.map((r) => r.rating));
  const adjustedRaw = mean(analyzed.filter((r) => !r.flagged && r.rating !== null).map((r) => r.rating as number));
  const sampleRating = sampleRatingRaw === null ? null : round1(sampleRatingRaw);
  const adjustedRating = adjustedRaw === null ? sampleRating : round1(adjustedRaw);
  const reference = place.statedRating ?? sampleRating;
  const ratingShift = reference !== null && adjustedRating !== null ? round1(adjustedRating - reference) : 0;

  let ratingScore: number | null = null;
  let polarised = false;
  let tooPerfect = false;
  const p1 = rated.length ? starCounts[1] / rated.length : 0;
  const p5 = rated.length ? starCounts[5] / rated.length : 0;
  const mid = rated.length ? (starCounts[2] + starCounts[3] + starCounts[4]) / rated.length : 0;
  if (rated.length >= 10) {
    const midFactor = mid < 0.15 ? 1 : Math.max(0, 1 - (mid - 0.15) / 0.15);
    const bimodal = Math.min(p1 / 0.2, 1) * Math.min(p5 / 0.4, 1) * midFactor;
    polarised = bimodal >= 0.6;
    const perfectPenalty = rated.length >= 20 && p5 >= 0.95 ? Math.min(25, ((p5 - 0.95) / 0.05) * 25) : 0;
    tooPerfect = perfectPenalty > 0;
    const shiftPenalty = Math.abs(ratingShift) >= 0.2 ? Math.min(40, Math.abs(ratingShift) * 40) : 0;
    ratingScore = clamp(100 - 60 * bimodal - perfectPenalty - shiftPenalty);
  }

  const pillars: Pillar[] = [
    {
      key: 'content',
      name: 'Review text',
      description: 'Looks for copied or near-identical wording and short, generic template reviews.',
      weight: 0.35,
      score: contentScore,
      note: contentScore === null ? 'Too few written reviews to check' : `${flagCounts.duplicate} copied, ${flagCounts.generic} generic`,
    },
    {
      key: 'profiles',
      name: 'Reviewer accounts',
      description: 'Checks how many reviewers have only ever written one or two reviews.',
      weight: 0.25,
      score: profileScore,
      note:
        profileScore === null
          ? 'Reviewer history not available for this source'
          : `${pct(flagCounts.single_account / known)} one-review accounts`,
    },
    {
      key: 'timing',
      name: 'Posting pattern',
      description: 'Detects sudden spikes where many reviews arrive on the same day or week.',
      weight: 0.2,
      score: timingScore,
      note: timingScore === null ? (exact.length ? 'Too few dated reviews' : 'Needs exact review dates') : burstReviewCount ? `${burstReviewCount} reviews in spikes` : 'No unusual spikes',
    },
    {
      key: 'ratings',
      name: 'Rating pattern',
      description: 'Flags polarised 1★ vs 5★ splits, suspiciously perfect ratings, and how far suspicious reviews move the average.',
      weight: 0.2,
      score: ratingScore,
      note:
        ratingScore === null
          ? 'Too few star ratings to check'
          : polarised
            ? 'Polarised ratings'
            : tooPerfect
              ? 'Almost all 5★'
              : Math.abs(ratingShift) >= 0.2
                ? `Suspicious reviews shift the average by ${Math.abs(ratingShift).toFixed(1)}★`
                : 'Natural spread',
    },
  ];

  const active = pillars.filter((p) => p.score !== null);
  const trustScore = active.length
    ? Math.round(active.reduce((s, p) => s + p.weight * (p.score as number), 0) / active.reduce((s, p) => s + p.weight, 0))
    : Math.round(clamp(100 - (flaggedCount / Math.max(n, 1)) * 150));
  const verdict: Verdict = trustScore >= 80 ? 'trustworthy' : trustScore >= 60 ? 'mixed' : 'risky';

  // --- Plain-language insights ---
  const insights: Insight[] = [];
  const push = (severity: Severity, title: string, detail: string) => insights.push({ severity, title, detail });

  if (flagCounts.duplicate > 0) {
    push(
      flagCounts.duplicate / Math.max(withText, 1) >= 0.05 ? 'bad' : 'warn',
      `${flagCounts.duplicate} reviews share near-identical wording`,
      'Copy-pasted or lightly reworded text is one of the strongest signs of coordinated fake reviews.',
    );
  }
  if (profileScore !== null) {
    const single = flagCounts.single_account / known;
    if (single >= 0.3)
      push('bad', `${pct(single)} of reviewers have only ever written this one review`, 'Throwaway accounts created just to post one review are a common fake-review tactic.');
    else if (single >= 0.15)
      push('info', `${pct(single)} of reviewers are one-review accounts`, 'Somewhat normal for local businesses, but worth keeping in mind.');
    else push('good', 'Most reviewers have a real review history', 'Reviewers here typically have written reviews for other places too.');
  }
  if (biggestBurst) {
    const b = biggestBurst as { start: string; count: number; usual: number; unit: 'day' | 'week' };
    push(
      'bad',
      `Spike of ${b.count} reviews ${b.unit === 'day' ? 'on' : 'in the week of'} ${formatDay(b.start)}`,
      `That is about ${Math.max(2, Math.round(b.count / Math.max(b.usual, 0.1)))}× the usual rate (≈${round1(b.usual)} per ${b.unit}). Sudden waves often come from paid review campaigns or review-bombing.`,
    );
  } else if (timingScore !== null) {
    push('good', 'Reviews arrive at a steady pace', 'No sudden waves of reviews were found in the analysed period.');
  }
  if (polarised)
    push('warn', `Ratings are polarised: ${pct(p1)} 1★ vs ${pct(p5)} 5★`, 'Very few middle ratings can indicate both fake praise and review-bombing.');
  if (tooPerfect)
    push('warn', `${pct(p5)} of ratings are 5★`, 'Real businesses almost always get some mixed reviews. A near-perfect record deserves a closer look.');
  if (flagCounts.generic >= 3)
    push('info', `${flagCounts.generic} short, generic reviews`, 'Reviews like "Great service, highly recommend!" say nothing specific and are easy to fake.');
  if (reference !== null && adjustedRating !== null) {
    const diff = ratingShift;
    if (Math.abs(diff) >= 0.3)
      push(
        'warn',
        `Rating ${diff < 0 ? 'drops' : 'rises'} from ${reference.toFixed(1)} to ${adjustedRating.toFixed(1)} without suspicious reviews`,
        diff < 0
          ? 'Suspicious reviews appear to be inflating the rating.'
          : 'Suspicious reviews appear to be dragging the rating down, possibly a review-bombing attack.',
      );
    else push('good', 'Removing suspicious reviews barely changes the rating', `The rating stays around ${adjustedRating.toFixed(1)}★.`);
  }
  if (timingScore === null && n > 0)
    push(
      'info',
      'Posting pattern not checked',
      exact.length === 0
        ? 'This source does not include exact review dates, so spikes could not be detected.'
        : `Only ${exact.length} reviews have exact dates; at least 15 are needed to spot spikes reliably.`,
    );

  const order: Record<Severity, number> = { bad: 0, warn: 1, info: 2, good: 3 };
  insights.sort((a, b) => order[a.severity] - order[b.severity]);

  analyzed.sort((a, b) => b.suspicion - a.suspicion || (Date.parse(b.date ?? '') || 0) - (Date.parse(a.date ?? '') || 0));

  return {
    source,
    place,
    analyzedAt: new Date().toISOString(),
    sampleSize: n,
    trustScore,
    verdict,
    sampleRating,
    adjustedRating,
    pillars,
    insights,
    starCounts,
    timeline,
    flagCounts,
    flaggedCount,
    reviews: analyzed,
  };
}
