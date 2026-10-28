// Server-only: fetches Google Maps reviews through Apify's "Google Maps Reviews Scraper" actor.
// https://apify.com/compass/google-maps-reviews-scraper — the free plan's monthly credit covers a few thousand reviews.
//
// The token comes from the visitor (saved in their browser and sent with each request) or, as a fallback,
// from the APIFY_TOKEN environment variable. Tokens are never logged or stored on the server.

import { type ApifyReviewItem, mapApifyItems } from './importers';
import type { PlaceInfo, Review } from './types';

const API = 'https://api.apify.com/v2';
const ACTOR = process.env.APIFY_ACTOR_ID || 'compass~google-maps-reviews-scraper';
const RUN_TIMEOUT_MS = 5 * 60_000;

export class UserFacingError extends Error {}

export function apifyConfigured() {
  return Boolean(process.env.APIFY_TOKEN);
}

/** Returns a sanitised visitor token, or null if it doesn't look like one. */
export function cleanToken(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const t = input.trim();
  return /^[A-Za-z0-9_-]{10,200}$/.test(t) ? t : null;
}

// ---------- URL validation ----------

const SHORT_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl', 'g.co']);

function isGoogleMapsUrl(u: URL) {
  const host = u.hostname.toLowerCase();
  if (/^maps\.google\.[a-z.]+$/.test(host)) return true;
  return /^(www\.)?google\.[a-z.]+$/.test(host) && u.pathname.startsWith('/maps');
}

/** Validates the link and expands short links (maps.app.goo.gl/...) to the full Google Maps URL. */
export async function resolveMapsUrl(input: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new UserFacingError('That does not look like a link. Paste a Google Maps link to a business.');
  }
  for (let hop = 0; hop < 5 && SHORT_HOSTS.has(url.hostname.toLowerCase()); hop++) {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
    const next = res.headers.get('location');
    if (!next) throw new UserFacingError('Could not expand that short link. Try copying the full link from Google Maps.');
    url = new URL(next, url);
  }
  if (!isGoogleMapsUrl(url)) {
    throw new UserFacingError('Please paste a Google Maps link (google.com/maps/... or maps.app.goo.gl/...).');
  }
  return url.toString();
}

// ---------- Apify API ----------

async function apify<T>(token: string, path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    signal,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
  });
  if (res.status === 401) throw new UserFacingError('Your Apify key was rejected. Open “Apify key” under the search box and check it.');
  if (res.status === 402 || res.status === 403) {
    throw new UserFacingError('Apify refused the request. The free monthly credit on this key may be used up. Try pasting reviews instead.');
  }
  if (!res.ok) throw new Error(`Apify ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json() as Promise<T>;
}

/** Checks a token against Apify and returns the account's username. */
export async function verifyToken(token: string): Promise<{ username: string; plan?: string }> {
  const { data } = await apify<{ data: { username?: string; plan?: { id?: string } } }>(token, '/users/me', {}, AbortSignal.timeout(10_000));
  return { username: data.username ?? 'your account', plan: data.plan?.id };
}

interface RunInfo {
  id: string;
  status: 'READY' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'ABORTING' | 'ABORTED' | 'TIMING-OUT' | 'TIMED-OUT';
  defaultDatasetId: string;
  statusMessage?: string;
}

export interface FetchProgress {
  (stage: 'starting' | 'scraping', message: string): void;
}

export async function fetchReviews(
  token: string,
  mapsUrl: string,
  maxReviews: number,
  onProgress: FetchProgress,
  signal: AbortSignal,
): Promise<{ place: PlaceInfo; reviews: Review[] }> {
  onProgress('starting', 'Starting the review collector…');
  const { data: started } = await apify<{ data: RunInfo }>(
    token,
    `/acts/${ACTOR}/runs`,
    {
      method: 'POST',
      body: JSON.stringify({
        startUrls: [{ url: mapsUrl }],
        maxReviews,
        reviewsSort: 'newest',
        language: 'en',
        reviewsOrigin: 'google',
        personalData: true,
      }),
    },
    signal,
  );

  const abortRun = () => apify(token, `/actor-runs/${started.id}/abort`, { method: 'POST' }).catch(() => {});
  signal.addEventListener('abort', abortRun, { once: true });

  try {
    const deadline = Date.now() + RUN_TIMEOUT_MS;
    let run = started;
    while (!['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(run.status)) {
      if (Date.now() > deadline) {
        await abortRun();
        throw new UserFacingError('Collecting reviews took too long. Try a smaller number of reviews.');
      }
      ({ data: run } = await apify<{ data: RunInfo }>(token, `/actor-runs/${run.id}?waitForFinish=5`, {}, signal));
      const { data: ds } = await apify<{ data: { itemCount: number } }>(token, `/datasets/${run.defaultDatasetId}`, {}, signal);
      onProgress('scraping', ds.itemCount ? `Collected ${ds.itemCount} of up to ${maxReviews} reviews…` : 'Opening the place on Google Maps…');
    }
    if (run.status !== 'SUCCEEDED') {
      throw new UserFacingError(`The review collector stopped (${run.status.toLowerCase()}). ${run.statusMessage ?? ''}`.trim());
    }

    const items = await apify<ApifyReviewItem[]>(token, `/datasets/${run.defaultDatasetId}/items?clean=true&format=json`, {}, signal);
    return mapApifyItems(items, mapsUrl);
  } finally {
    signal.removeEventListener('abort', abortRun);
  }
}
