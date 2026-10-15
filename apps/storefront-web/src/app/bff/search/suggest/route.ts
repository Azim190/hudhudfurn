import { apiFetch, errorResponse } from '@hudhud/web-core';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json({ products: [] });
  try {
    const data = await apiFetch(`/search/suggest?q=${encodeURIComponent(q)}`, { revalidate: 60, tags: ['catalog'] });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'public, max-age=60' } });
  } catch (err) {
    return errorResponse(err);
  }
}
