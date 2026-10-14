import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROLES,
  expandGrants,
  hasAllPermissions,
  isPermission,
  PERMISSIONS,
  ROLE_KEYS,
} from './permissions';

const role = (key: string) => DEFAULT_ROLES.find((r) => r.key === key)!;

describe('expandGrants', () => {
  it('expands * to every permission', () => {
    expect(expandGrants(['*'])).toEqual([...PERMISSIONS]);
  });

  it('expands prefix wildcards', () => {
    const perms = expandGrants(['inventory.*']);
    expect(perms).toEqual(['inventory.read', 'inventory.adjust', 'inventory.transfer', 'inventory.stocktake']);
  });

  it('applies denials after grants', () => {
    const perms = expandGrants(['*', '!settings.payments']);
    expect(perms).not.toContain('settings.payments');
    expect(perms).toHaveLength(PERMISSIONS.length - 1);
  });

  it('ignores unknown keys', () => {
    expect(expandGrants(['nope.read'])).toEqual([]);
  });
});

describe('default roles', () => {
  it('defines every role key exactly once', () => {
    expect(DEFAULT_ROLES.map((r) => r.key).sort()).toEqual([...ROLE_KEYS].sort());
  });

  it('gives every role at least one permission and bilingual names', () => {
    for (const r of DEFAULT_ROLES) {
      expect(expandGrants(r.grants).length).toBeGreaterThan(0);
      expect(r.nameAr).toMatch(/[؀-ۿ]/);
      expect(r.nameEn).toMatch(/[A-Za-z]/);
    }
  });

  it('lets only the owner manage payment credentials', () => {
    const holders = DEFAULT_ROLES.filter((r) => expandGrants(r.grants).includes('settings.payments'));
    expect(holders.map((r) => r.key)).toEqual(['owner']);
  });

  it('restricts technicians to the technician app', () => {
    expect(expandGrants(role('technician').grants)).toEqual(['services.technician']);
  });

  it('lets accountants see finance reports but not edit the catalog', () => {
    const perms = expandGrants(role('accountant').grants);
    expect(perms).toContain('reports.finance');
    expect(perms).not.toContain('catalog.product.write');
  });
});

describe('helpers', () => {
  it('isPermission narrows strings', () => {
    expect(isPermission('orders.read')).toBe(true);
    expect(isPermission('orders.fly')).toBe(false);
  });

  it('hasAllPermissions accepts sets and arrays', () => {
    expect(hasAllPermissions(new Set(['orders.read', 'orders.update']), ['orders.read'])).toBe(true);
    expect(hasAllPermissions(['orders.read'], ['orders.read', 'orders.update'])).toBe(false);
    expect(hasAllPermissions([], [])).toBe(true);
  });
});
