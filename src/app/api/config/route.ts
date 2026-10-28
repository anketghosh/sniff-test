// GET /api/config — tells the UI whether link analysis (Apify) is configured. Never exposes the token itself.

import { connection } from 'next/server';
import { apifyConfigured } from '@/lib/apify';

export async function GET() {
  await connection(); // read env at request time, not at build time
  return Response.json({ apify: apifyConfigured() });
}
