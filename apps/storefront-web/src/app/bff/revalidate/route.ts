import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';

const ALLOWED_TAGS = new Set(['catalog', 'content', 'store-info']);

/** Called by the API after catalog/content changes (shared secret, constant-time compared). */
export async function POST(req: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  const given = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return NextResponse.json({ code: 'unauthorized' }, { status: 401 });
  }
  const { tags } = (await req.json().catch(() => ({}))) as { tags?: unknown };
  const valid = Array.isArray(tags) ? tags.filter((t): t is string => typeof t === 'string' && ALLOWED_TAGS.has(t)) : [];
  for (const tag of valid) revalidateTag(tag);
  return NextResponse.json({ revalidated: valid });
}
