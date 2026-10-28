// POST /api/audit  { url, maxReviews?, refresh?, token? }
// Streams newline-delimited JSON (AuditEvent) so the UI can show live progress while Apify collects reviews.
// `token` is the visitor's own Apify key; without it the server's APIFY_TOKEN is used.

import { analyzeReviews } from '@/lib/analysis';
import { UserFacingError, cleanToken, fetchReviews, resolveMapsUrl } from '@/lib/apify';
import type { AuditEvent, AuditResult } from '@/lib/types';

export const maxDuration = 300;

const CACHE_TTL_MS = 6 * 60 * 60_000;
const globalCache = globalThis as unknown as { __auditCache?: Map<string, { at: number; result: AuditResult }> };
const cache = (globalCache.__auditCache ??= new Map());

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { url?: unknown; maxReviews?: unknown; refresh?: unknown; token?: unknown } | null;
  const url = typeof body?.url === 'string' ? body.url : '';
  const maxReviews = Math.round(Math.min(500, Math.max(20, Number(body?.maxReviews) || 150)));
  const refresh = body?.refresh === true;
  const token = cleanToken(body?.token) ?? process.env.APIFY_TOKEN ?? null;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AuditEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
        } catch {
          // client went away
        }
      };
      try {
        if (!token) {
          throw new UserFacingError('Link checks need an Apify key. Open “Apify key” under the search box and add your free key.');
        }
        send({ type: 'progress', stage: 'resolving', message: 'Checking the link…' });
        const mapsUrl = await resolveMapsUrl(url);

        const key = `${mapsUrl}|${maxReviews}`;
        const hit = cache.get(key);
        if (hit && !refresh && Date.now() - hit.at < CACHE_TTL_MS) {
          send({ type: 'result', result: hit.result, cached: true });
          return;
        }

        const { place, reviews } = await fetchReviews(
          token,
          mapsUrl,
          maxReviews,
          (stage, message) => send({ type: 'progress', stage, message }),
          request.signal,
        );
        if (reviews.length === 0) {
          throw new UserFacingError('No reviews were found. Make sure the link opens a specific business on Google Maps.');
        }
        send({ type: 'progress', stage: 'analyzing', message: `Analysing ${reviews.length} reviews…` });
        const result = analyzeReviews(reviews, place, 'apify');
        cache.set(key, { at: Date.now(), result });
        send({ type: 'result', result, cached: false });
      } catch (err) {
        if (request.signal.aborted) return;
        console.error('[audit]', err);
        send({
          type: 'error',
          message: err instanceof UserFacingError ? err.message : 'Something went wrong while collecting reviews. Please try again.',
        });
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
