import { apiFetch, errorResponse } from '@hudhud/web-core';
import { NextResponse, type NextRequest } from 'next/server';
import { isUuid } from '@/lib/order-access';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ code: 'notFound' }, { status: 404 });
  try {
    return NextResponse.json(await apiFetch(`/geo/cities/${id}/districts`, { revalidate: 3600 }));
  } catch (err) {
    return errorResponse(err);
  }
}
