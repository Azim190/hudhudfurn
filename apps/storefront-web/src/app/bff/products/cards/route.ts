import { apiFetch, errorResponse } from '@hudhud/web-core';
import { NextResponse, type NextRequest } from 'next/server';

/** Public product cards by id (compare, recently viewed, guest wishlist). */
export async function GET(req: NextRequest) {
  const ids = (req.nextUrl.searchParams.get('ids') ?? '').split(',').filter((id) => /^[0-9a-f-]{36}$/.test(id)).slice(0, 24);
  if (ids.length === 0) return NextResponse.json([]);
  try {
    const cards = await apiFetch(`/products-cards?ids=${ids.join(',')}`, { revalidate: 60, tags: ['catalog'] });
    return NextResponse.json(cards, { headers: { 'Cache-Control': 'public, max-age=60' } });
  } catch (err) {
    return errorResponse(err);
  }
}
