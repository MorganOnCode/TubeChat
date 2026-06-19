import { NextRequest } from 'next/server';
import { validateByok } from '@/lib/providers';
import { byokTest } from '@/lib/providers.server';

/**
 * POST /api/byok/test — validate a user's provider + model + key with a minimal
 * 1-token call. Returns { ok: true } or { ok: false, code, error }. Always HTTP 200
 * on a key/model failure (the result is in the body) so the client parses cleanly.
 * The key is used transiently and never logged or persisted.
 */
export async function POST(request: NextRequest) {
    let raw: unknown;
    try {
        raw = await request.json();
    } catch {
        return Response.json({ ok: false, code: 'bad_request', error: 'Invalid request body' }, { status: 400 });
    }

    const v = validateByok(raw);
    if (!v.ok) return Response.json({ ok: false, code: 'bad_request', error: v.reason }, { status: 400 });

    const result = await byokTest(v.config);
    return Response.json(result);
}
