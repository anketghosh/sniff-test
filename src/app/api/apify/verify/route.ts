// POST /api/apify/verify  { token } → { ok: true, username } | { ok: false, message }
// Lets the key panel confirm a visitor's Apify key works before they run a check. The key is not stored.

import { UserFacingError, cleanToken, verifyToken } from '@/lib/apify';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  const token = cleanToken(body?.token);
  if (!token) {
    return Response.json({ ok: false, message: 'That doesn’t look like an Apify key. It should start with “apify_api_”.' });
  }
  try {
    const { username } = await verifyToken(token);
    return Response.json({ ok: true, username });
  } catch (err) {
    return Response.json({
      ok: false,
      message: err instanceof UserFacingError ? 'Apify didn’t accept this key. Copy it again from Settings → API & Integrations.' : 'Couldn’t reach Apify right now. Try again in a moment.',
    });
  }
}
