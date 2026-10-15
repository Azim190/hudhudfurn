import { BadRequestException } from '@nestjs/common';
import { groupFacets } from '../search/search.service';
import { availableQuantity, effectivePrice } from './catalog.presenter';
import { parsePairs } from './import-export.service';
import { splitFacetParams } from './public-catalog.controller';

describe('splitFacetParams', () => {
  it('separates f.<key> filters from ordinary parameters', () => {
    expect(splitFacetParams({ 'f.color': 'black,navy', 'f.size': ['m', 'l,m'], page: '2', q: 'عباية' })).toEqual({
      facets: { color: ['black', 'navy'], size: ['m', 'l'] },
      rest: { page: '2', q: 'عباية' },
    });
  });

  it('rejects malformed keys and codes (no filter injection)', () => {
    expect(() => splitFacetParams({ 'f.Color': 'x' })).toThrow(BadRequestException);
    expect(() => splitFacetParams({ 'f.color': 'black" OR price > 0' })).toThrow(BadRequestException);
  });
});

describe('groupFacets', () => {
  it('groups "key:code" tokens by attribute', () => {
    expect(groupFacets({ 'color:black': 3, 'color:navy': 1, 'size:m': 2, broken: 9 })).toEqual({
      color: { black: 3, navy: 1 },
      size: { m: 2 },
    });
  });
});

describe('parsePairs', () => {
  it('parses key=code lists', () => {
    expect(parsePairs('fabric=crepe; occasion=daily,work')).toEqual([
      { key: 'fabric', codes: ['crepe'] },
      { key: 'occasion', codes: ['daily', 'work'] },
    ]);
    expect(parsePairs('  ')).toEqual([]);
    expect(() => parsePairs('fabric')).toThrow(/Malformed/);
  });
});

describe('presenter pricing and availability', () => {
  it('uses the variant price when set, otherwise the product price with its compare-at', () => {
    expect(effectivePrice({ basePrice: 10000, compareAtPrice: 12000 }, { price: null, compareAtPrice: null })).toEqual({
      price: 10000,
      compareAtPrice: 12000,
      discountPercent: 16,
    });
    expect(effectivePrice({ basePrice: 10000, compareAtPrice: 12000 }, { price: 15000, compareAtPrice: null })).toEqual({
      price: 15000,
      compareAtPrice: null,
      discountPercent: 0,
    });
  });

  it('sums sellable stock across active locations only', () => {
    const stock = [
      { onHand: 5, reserved: 2, location: { isActive: true } },
      { onHand: 9, reserved: 0, location: { isActive: false } },
      { onHand: 1, reserved: 3, location: { isActive: true } },
    ];
    expect(availableQuantity({ stock } as never)).toBe(3);
  });
});
