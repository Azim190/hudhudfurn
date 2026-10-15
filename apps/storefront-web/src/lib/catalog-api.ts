import 'server-only';
import { ApiError, apiFetch } from '@hudhud/web-core';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import type { CategoryNode, CategoryPage, HomeContent, Listing, ProductDetail } from './catalog-types';

/**
 * Cached public catalog reads. Data is cached by Next for `REVALIDATE` seconds and dropped early
 * when the API calls /bff/revalidate with the `catalog` / `content` tags after an edit.
 */
const REVALIDATE = 300;

async function get<T>(path: string, tags: string[]): Promise<T> {
  try {
    return await apiFetch<T>(path, { revalidate: REVALIDATE, tags });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
}

export const getCategoryTree = cache(() => get<CategoryNode[]>('/categories', ['catalog']));
export const getCategory = cache((slug: string) => get<CategoryPage>(`/categories/${encodeURIComponent(slug)}`, ['catalog']));
export const getProduct = cache((slug: string) => get<ProductDetail>(`/products/${encodeURIComponent(slug)}`, ['catalog']));
export const getHome = cache(() => get<HomeContent>('/content/home', ['content', 'catalog']));
export const getCollection = cache((slug: string) =>
  get<{ id: string; nameAr: string; nameEn: string | null; slugAr: string; slugEn: string; descriptionAr: string | null; descriptionEn: string | null }>(
    `/collections/${encodeURIComponent(slug)}`,
    ['catalog'],
  ),
);

export interface ListingParams {
  category?: string;
  collection?: string;
  q?: string;
  sort?: string;
  page?: number;
  priceMin?: number;
  priceMax?: number;
  inStock?: boolean;
  facets?: Record<string, string[]>;
}

export function listingQuery(p: ListingParams, limit = 24): string {
  const qs = new URLSearchParams();
  if (p.category) qs.set('category', p.category);
  if (p.collection) qs.set('collection', p.collection);
  if (p.q) qs.set('q', p.q);
  if (p.sort) qs.set('sort', p.sort);
  if (p.page && p.page > 1) qs.set('page', String(p.page));
  if (p.priceMin !== undefined) qs.set('priceMin', String(p.priceMin));
  if (p.priceMax !== undefined) qs.set('priceMax', String(p.priceMax));
  if (p.inStock) qs.set('inStock', 'true');
  for (const [key, codes] of Object.entries(p.facets ?? {})) if (codes.length) qs.set(`f.${key}`, codes.join(','));
  qs.set('limit', String(limit));
  return qs.toString();
}

export const listProducts = cache((query: string) => get<Listing>(`/products?${query}`, ['catalog']));

/** Parse listing parameters from page searchParams (only known keys; values are validated by the API). */
export function parseListingParams(sp: Record<string, string | string[] | undefined>): ListingParams {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));
  const facets: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(sp)) {
    if (!key.startsWith('f.') || !value) continue;
    const attr = key.slice(2);
    if (!/^[a-z][a-z0-9_]{1,40}$/.test(attr)) continue;
    facets[attr] = (Array.isArray(value) ? value : [value]).flatMap((v) => v.split(',')).filter((c) => /^[a-z0-9][a-z0-9_.-]{0,63}$/.test(c));
  }
  const num = (k: string) => {
    const v = Number(one(k));
    return one(k) !== undefined && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined;
  };
  const sort = one('sort');
  return {
    q: one('q')?.slice(0, 200) || undefined,
    sort: sort && ['relevance', 'newest', 'price_asc', 'price_desc', 'rating', 'discount'].includes(sort) ? sort : undefined,
    page: Math.min(200, Math.max(1, num('page') ?? 1)),
    priceMin: num('priceMin'),
    priceMax: num('priceMax'),
    inStock: one('inStock') === 'true' || undefined,
    facets,
  };
}
