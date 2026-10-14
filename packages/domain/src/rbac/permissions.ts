/**
 * Permission catalog shared by the API (guards, seed) and the admin UI (menu gating).
 * Keys are `<area>.<resource>.<action>` or `<area>.<action>`.
 */
export const PERMISSIONS = [
  'dashboard.view',

  'catalog.category.read',
  'catalog.category.write',
  'catalog.attribute.read',
  'catalog.attribute.write',
  'catalog.product.read',
  'catalog.product.write',
  'catalog.product.publish',
  'catalog.product.import',
  'catalog.media.write',
  'catalog.review.moderate',

  'inventory.read',
  'inventory.adjust',
  'inventory.transfer',
  'inventory.stocktake',

  'orders.read',
  'orders.update',
  'orders.refund',
  'orders.cancel',

  'returns.read',
  'returns.decide',

  'invoicing.read',
  'invoicing.issue',

  'workshop.read',
  'workshop.update',

  'services.read',
  'services.manage',
  'services.assign',
  'services.technician',

  'customers.read',
  'customers.update',
  'customers.block',
  'customers.privacy',

  'marketing.read',
  'marketing.write',

  'reports.sales',
  'reports.finance',

  'settings.read',
  'settings.write',
  'settings.configurator',
  'settings.payments',

  'rbac.read',
  'rbac.write',

  'audit.view',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_KEYS = [
  'owner',
  'admin',
  'store_manager',
  'catalog_editor',
  'order_processor',
  'warehouse',
  'technician',
  'accountant',
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

export interface RoleDefinition {
  key: RoleKey;
  nameAr: string;
  nameEn: string;
  /** Permission keys or wildcard patterns (`*`, `catalog.*`). */
  grants: readonly string[];
}

export const DEFAULT_ROLES: readonly RoleDefinition[] = [
  { key: 'owner', nameAr: 'المالك', nameEn: 'Owner', grants: ['*'] },
  {
    key: 'admin',
    nameAr: 'مدير النظام',
    nameEn: 'Administrator',
    // Everything except managing payment-provider credentials, which stays with the owner.
    grants: ['*', '!settings.payments'],
  },
  {
    key: 'store_manager',
    nameAr: 'مدير المتجر',
    nameEn: 'Store Manager',
    grants: [
      'dashboard.view',
      'catalog.*',
      'inventory.*',
      'orders.*',
      'returns.*',
      'invoicing.read',
      'workshop.*',
      'services.read',
      'services.manage',
      'services.assign',
      'customers.read',
      'customers.update',
      'customers.block',
      'marketing.*',
      'reports.sales',
      'settings.read',
      'settings.configurator',
    ],
  },
  {
    key: 'catalog_editor',
    nameAr: 'محرر الكتالوج',
    nameEn: 'Catalog Editor',
    grants: [
      'dashboard.view',
      'catalog.category.*',
      'catalog.attribute.*',
      'catalog.product.read',
      'catalog.product.write',
      'catalog.product.import',
      'catalog.media.write',
      'catalog.review.moderate',
      'inventory.read',
    ],
  },
  {
    key: 'order_processor',
    nameAr: 'معالج الطلبات',
    nameEn: 'Order Processor',
    grants: [
      'dashboard.view',
      'orders.read',
      'orders.update',
      'returns.read',
      'invoicing.read',
      'customers.read',
      'services.read',
      'services.assign',
      'inventory.read',
      'workshop.read',
    ],
  },
  {
    key: 'warehouse',
    nameAr: 'المستودع',
    nameEn: 'Warehouse',
    grants: ['inventory.*', 'orders.read', 'workshop.read', 'workshop.update', 'catalog.product.read'],
  },
  {
    key: 'technician',
    nameAr: 'فني القياس والتركيب',
    nameEn: 'Technician',
    grants: ['services.technician'],
  },
  {
    key: 'accountant',
    nameAr: 'المحاسب',
    nameEn: 'Accountant',
    grants: ['dashboard.view', 'orders.read', 'invoicing.*', 'reports.*', 'returns.read', 'orders.refund'],
  },
];

function matches(pattern: string, permission: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('.*')) return permission.startsWith(pattern.slice(0, -1));
  return pattern === permission;
}

/**
 * Expand grant patterns into concrete permission keys. Patterns starting with `!` are denials
 * and always win over grants.
 */
export function expandGrants(grants: readonly string[]): Permission[] {
  const allow = grants.filter((g) => !g.startsWith('!'));
  const deny = grants.filter((g) => g.startsWith('!')).map((g) => g.slice(1));
  return PERMISSIONS.filter(
    (p) => allow.some((g) => matches(g, p)) && !deny.some((g) => matches(g, p)),
  );
}

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

/** True if `granted` satisfies every permission in `required`. */
export function hasAllPermissions(
  granted: ReadonlySet<string> | readonly string[],
  required: readonly Permission[],
): boolean {
  const set = granted instanceof Set ? granted : new Set(granted as readonly string[]);
  return required.every((p) => set.has(p));
}
