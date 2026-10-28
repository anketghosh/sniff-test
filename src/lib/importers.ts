// Turns pasted/uploaded content into Reviews. Supports:
//   - CSV / TSV with a header row (flexible column names)
//   - JSON arrays, including Apify Google Maps Reviews Scraper exports
//   - Text copied straight from the Google Maps reviews panel (best effort; Google's copy has no star values)

import type { DatePrecision, PlaceInfo, Review } from './types';

export interface ImportResult {
  format: 'csv' | 'json' | 'apify' | 'maps-text' | 'plain-text';
  place: PlaceInfo;
  reviews: Review[];
  warnings: string[];
}

// ---------- shared helpers ----------

const DAY = 86_400_000;

export function parseRelativeDate(input: string, now = Date.now()): string | null {
  const s = input.toLowerCase().replace(/^edited\s+/, '').trim();
  if (s === 'yesterday') return new Date(now - DAY).toISOString();
  if (s === 'today' || s === 'just now') return new Date(now).toISOString();
  const m = s.match(/^(a|an|one|\d+)\s+(minute|hour|day|week|month|year)s?\s+ago$/);
  if (!m) return null;
  const qty = /^\d+$/.test(m[1]) ? Number(m[1]) : 1;
  const unit = { minute: 60_000, hour: 3_600_000, day: DAY, week: 7 * DAY, month: 30 * DAY, year: 365 * DAY }[m[2] as 'day'];
  return new Date(now - qty * unit).toISOString();
}

function parseAnyDate(value: string): { date: string | null; precision: DatePrecision; relative?: string } {
  const v = value.trim();
  if (!v) return { date: null, precision: 'none' };
  const rel = parseRelativeDate(v);
  if (rel) return { date: rel, precision: 'approx', relative: v };
  const t = Date.parse(v);
  if (!Number.isNaN(t)) return { date: new Date(t).toISOString(), precision: 'exact' };
  return { date: null, precision: 'none' };
}

function parseRating(value: unknown): number | null {
  if (typeof value === 'number') return value >= 1 && value <= 5 ? value : null;
  if (typeof value !== 'string') return null;
  const m = value.match(/(\d+(?:\.\d+)?)/);
  if (!m) return (value.match(/★/g)?.length ?? 0) || null;
  const n = Number(m[1]);
  return n >= 1 && n <= 5 ? n : null;
}

function parseCount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const m = value.replace(/,/g, '').match(/\d+/);
  return m ? Number(m[0]) : null;
}

function parseBool(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return /^(true|yes|1|y)$/i.test(value.trim());
  return undefined;
}

const emptyPlace = (name: string): PlaceInfo => ({ name, statedRating: null, totalReviews: null });

// Column aliases (lower-cased, non-alphanumerics stripped)
const ALIASES = {
  author: ['author', 'name', 'reviewer', 'reviewername', 'user', 'username', 'authorname'],
  rating: ['rating', 'stars', 'star', 'score', 'reviewrating'],
  text: ['text', 'review', 'reviewtext', 'comment', 'content', 'body', 'message', 'texttranslated'],
  date: ['date', 'publishedatdate', 'published', 'publishedat', 'time', 'timestamp', 'createdat', 'reviewdate', 'publishat'],
  count: ['reviewernumberofreviews', 'reviewerreviews', 'authorreviewscount', 'reviewscount', 'reviewercount', 'numberofreviews', 'userreviews'],
  guide: ['islocalguide', 'localguide', 'guide'],
};

const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');

function pick(row: Record<string, unknown>, field: keyof typeof ALIASES): unknown {
  for (const [k, v] of Object.entries(row)) if (ALIASES[field].includes(norm(k))) return v;
  return undefined;
}

function rowToReview(row: Record<string, unknown>, idx: number): Review {
  const d = parseAnyDate(String(pick(row, 'date') ?? ''));
  return {
    id: `imp-${idx}`,
    author: String(pick(row, 'author') ?? '').trim() || `Reviewer ${idx + 1}`,
    rating: parseRating(pick(row, 'rating')),
    text: String(pick(row, 'text') ?? ''),
    date: d.date,
    datePrecision: d.precision,
    relativeDate: d.relative,
    authorReviewCount: parseCount(pick(row, 'count')),
    isLocalGuide: parseBool(pick(row, 'guide')),
  };
}

// ---------- Apify export ----------

export interface ApifyReviewItem {
  title?: string;
  url?: string;
  address?: string;
  totalScore?: number;
  reviewsCount?: number;
  reviewId?: string;
  reviewUrl?: string;
  name?: string;
  reviewerNumberOfReviews?: number;
  isLocalGuide?: boolean;
  stars?: number | null;
  text?: string | null;
  textTranslated?: string | null;
  publishAt?: string;
  publishedAtDate?: string;
  responseFromOwnerText?: string | null;
}

export function mapApifyItems(items: ApifyReviewItem[], fallbackUrl?: string): { place: PlaceInfo; reviews: Review[] } {
  const first = items[0];
  const place: PlaceInfo = {
    name: first?.title ?? 'Unknown place',
    url: first?.url ?? fallbackUrl,
    address: first?.address,
    statedRating: typeof first?.totalScore === 'number' ? first.totalScore : null,
    totalReviews: typeof first?.reviewsCount === 'number' ? first.reviewsCount : null,
  };
  const reviews: Review[] = items
    .filter((it) => it.reviewId || it.name)
    .map((it, idx) => ({
      id: it.reviewId ?? `r${idx}`,
      author: it.name?.trim() || 'Anonymous',
      rating: typeof it.stars === 'number' ? it.stars : null,
      text: it.text ?? it.textTranslated ?? '',
      date: it.publishedAtDate ?? null,
      datePrecision: it.publishedAtDate ? 'exact' : 'none',
      relativeDate: it.publishAt,
      authorReviewCount: typeof it.reviewerNumberOfReviews === 'number' ? it.reviewerNumberOfReviews : null,
      isLocalGuide: it.isLocalGuide,
      hasOwnerResponse: Boolean(it.responseFromOwnerText),
      url: it.reviewUrl,
    }));
  return { place, reviews };
}

// ---------- CSV ----------

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

function looksLikeCsv(text: string): string | null {
  const header = text.split(/\r?\n/, 1)[0].toLowerCase();
  const known = Object.values(ALIASES).flat();
  for (const d of ['\t', ',', ';']) {
    const cols = header.split(d).map(norm);
    if (cols.length >= 2 && cols.filter((c) => known.includes(c)).length >= 2) return d;
  }
  return null;
}

// ---------- Google Maps copied text ----------

const META_RE = /^(?:local guide\s*·\s*)?(\d[\d,]*)\s+reviews?\b|^local guide\b/i;
const DATE_RE = /^(?:edited\s+)?(?:a|an|one|\d+)\s+(?:minute|hour|day|week|month|year)s?\s+ago\b|^(?:edited\s+)?yesterday$/i;
const NOISE_RE = /^(like|share|more|new|photos?|translated by google|see original|\+\d+|\d+:\d+|\d+|report review|helpful\??|response from the owner.*|·)$/i;
const ASPECT_RE = /^(food|service|atmosphere|rooms|location|value|price|quality)\s*:\s*([1-5])\b/i;

function parseMapsText(text: string): Review[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const nextNonEmpty = (from: number) => {
    for (let k = from; k < lines.length; k++) if (lines[k]) return k;
    return -1;
  };
  const reviews: Review[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!META_RE.test(lines[i])) continue;
    let nameIdx = i - 1;
    while (nameIdx >= 0 && !lines[nameIdx]) nameIdx--;
    if (nameIdx < 0) continue;
    const author = lines[nameIdx];
    const countMatch = lines[i].match(/(\d[\d,]*)\s+reviews?/i);
    const authorReviewCount = countMatch ? Number(countMatch[1].replace(/,/g, '')) : null;
    const isLocalGuide = /local guide/i.test(lines[i]);

    let j = i + 1;
    let dateLine = '';
    for (; j < Math.min(lines.length, i + 8); j++) {
      if (DATE_RE.test(lines[j])) {
        dateLine = lines[j].match(DATE_RE)![0];
        j++;
        break;
      }
    }
    if (!dateLine) j = i + 1;

    const body: string[] = [];
    const aspects: number[] = [];
    let ownerResponse = false;
    for (; j < lines.length; j++) {
      const line = lines[j];
      const k = nextNonEmpty(j + 1);
      if (line && k >= 0 && META_RE.test(lines[k]) && !META_RE.test(line)) break; // next review's name
      if (META_RE.test(line)) break;
      if (/^response from the owner/i.test(line)) ownerResponse = true;
      if (ownerResponse || !line || NOISE_RE.test(line)) continue;
      const aspect = line.match(ASPECT_RE);
      if (aspect) {
        aspects.push(Number(aspect[2]));
        continue;
      }
      if (/^(visited in|wait time|reservation|price per person|meal type|recommended dishes|parking|kid-friendliness)/i.test(line)) continue;
      body.push(line.replace(/\s*…?\s*More$/, ''));
    }
    const date = dateLine ? parseRelativeDate(dateLine) : null;
    reviews.push({
      id: `maps-${reviews.length}`,
      author,
      rating: aspects.length ? Math.round(aspects.reduce((s, v) => s + v, 0) / aspects.length) : null,
      text: body.join(' ').trim(),
      date,
      datePrecision: date ? 'approx' : 'none',
      relativeDate: dateLine || undefined,
      authorReviewCount,
      isLocalGuide,
      hasOwnerResponse: ownerResponse,
    });
    i = j - 1;
  }
  return reviews;
}

// ---------- entry point ----------

export function importReviews(content: string, placeName = 'Imported reviews'): ImportResult {
  const text = content.replace(/^﻿/, '').trim();
  const warnings: string[] = [];
  if (!text) throw new Error('Nothing to analyse. Paste some reviews or choose a file first.');

  if (text.startsWith('[') || text.startsWith('{')) {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('This looks like JSON but could not be read. Check that the file is complete.');
    }
    const arr = Array.isArray(data) ? data : ((data as { reviews?: unknown[]; items?: unknown[] }).reviews ?? (data as { items?: unknown[] }).items ?? [data]);
    const rows = arr.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null);
    if (rows.some((r) => 'stars' in r && ('reviewerNumberOfReviews' in r || 'reviewId' in r))) {
      const { place, reviews } = mapApifyItems(rows as ApifyReviewItem[]);
      return { format: 'apify', place, reviews, warnings };
    }
    const reviews = rows.map(rowToReview);
    return { format: 'json', place: emptyPlace(placeName), reviews: reviews.filter((r) => r.text || r.rating !== null), warnings };
  }

  const delimiter = looksLikeCsv(text);
  if (delimiter) {
    const [header, ...body] = parseDelimited(text, delimiter);
    const reviews = body
      .map((cells) => Object.fromEntries(header.map((h, k) => [h, cells[k] ?? ''])))
      .map(rowToReview)
      .filter((r) => r.text || r.rating !== null);
    if (reviews.every((r) => r.rating === null)) warnings.push('No rating column found, so star-based checks were skipped.');
    if (reviews.every((r) => r.authorReviewCount === null))
      warnings.push('No reviewer review-count column found, so the reviewer-account check was skipped.');
    return { format: 'csv', place: emptyPlace(placeName), reviews, warnings };
  }

  const fromMaps = parseMapsText(text);
  if (fromMaps.length >= 2) {
    if (fromMaps.every((r) => r.rating === null))
      warnings.push('Text copied from Google Maps does not include star ratings, so rating checks were skipped. Use the link tab or a CSV for full results.');
    warnings.push('Dates copied from Google Maps are approximate ("3 months ago"), so spike detection was skipped.');
    return { format: 'maps-text', place: emptyPlace(placeName), reviews: fromMaps, warnings };
  }

  const paragraphs = text.split(/\n\s*\n|\r?\n/).map((p) => p.trim()).filter((p) => p.length > 0);
  warnings.push('Treated each line as one review. Without names, ratings or dates only the text checks can run.');
  return {
    format: 'plain-text',
    place: emptyPlace(placeName),
    reviews: paragraphs.map((p, idx) => ({
      id: `txt-${idx}`,
      author: `Reviewer ${idx + 1}`,
      rating: null,
      text: p,
      date: null,
      datePrecision: 'none',
      authorReviewCount: null,
    })),
    warnings,
  };
}
