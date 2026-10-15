/**
 * Variant matrix generator: the cartesian product of variant axes (e.g. size × color),
 * with deterministic SKUs. Used by the admin "generate variants" action and CSV import.
 */
export interface AxisValue {
  code: string;
}

export interface VariantAxis<V extends AxisValue = AxisValue> {
  attributeKey: string;
  values: readonly V[];
}

export interface VariantCombination<V extends AxisValue = AxisValue> {
  /** attributeKey → chosen value, in axis order. */
  options: Array<{ attributeKey: string; value: V }>;
  sku: string;
  /** Stable identity of the combination, independent of SKU prefix. */
  key: string;
}

export const MAX_VARIANTS_PER_PRODUCT = 500;

export class VariantMatrixError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VariantMatrixError';
  }
}

export function sanitizeSkuPart(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function combinationKey(options: Array<{ attributeKey: string; code: string }>): string {
  return [...options]
    .sort((a, b) => a.attributeKey.localeCompare(b.attributeKey))
    .map((o) => `${o.attributeKey}=${o.code}`)
    .join('|');
}

export function generateVariantMatrix<V extends AxisValue>(
  axes: readonly VariantAxis<V>[],
  skuPrefix: string,
): VariantCombination<V>[] {
  const prefix = sanitizeSkuPart(skuPrefix);
  if (!prefix) throw new VariantMatrixError('SKU prefix must contain letters or digits');
  if (axes.length === 0) return [{ options: [], sku: prefix, key: '' }];

  const seen = new Set<string>();
  for (const axis of axes) {
    if (seen.has(axis.attributeKey)) throw new VariantMatrixError(`Duplicate axis ${axis.attributeKey}`);
    seen.add(axis.attributeKey);
    if (axis.values.length === 0) throw new VariantMatrixError(`Axis ${axis.attributeKey} has no values`);
    const codes = new Set(axis.values.map((v) => v.code));
    if (codes.size !== axis.values.length) throw new VariantMatrixError(`Axis ${axis.attributeKey} has duplicate values`);
  }

  const total = axes.reduce((n, a) => n * a.values.length, 1);
  if (total > MAX_VARIANTS_PER_PRODUCT) {
    throw new VariantMatrixError(`${total} variants exceeds the limit of ${MAX_VARIANTS_PER_PRODUCT}`);
  }

  let combos: Array<Array<{ attributeKey: string; value: V }>> = [[]];
  for (const axis of axes) {
    combos = combos.flatMap((partial) => axis.values.map((value) => [...partial, { attributeKey: axis.attributeKey, value }]));
  }

  const skus = new Set<string>();
  return combos.map((options) => {
    let sku = [prefix, ...options.map((o) => sanitizeSkuPart(o.value.code))].filter(Boolean).join('-');
    // Codes that sanitize to the same text (e.g. "x l" and "x-l") get a numeric suffix.
    for (let i = 2; skus.has(sku); i++) sku = `${sku.replace(/-\d+$/, '')}-${i}`;
    skus.add(sku);
    return {
      options,
      sku,
      key: combinationKey(options.map((o) => ({ attributeKey: o.attributeKey, code: o.value.code }))),
    };
  });
}

/**
 * Compare an existing variant set with a freshly generated matrix: which combinations are new,
 * and which existing ones are no longer part of it (to deactivate, never delete: orders reference them).
 */
export function diffVariantMatrix<V extends AxisValue>(
  existingKeys: readonly string[],
  generated: readonly VariantCombination<V>[],
): { toCreate: VariantCombination<V>[]; toDeactivate: string[]; unchanged: string[] } {
  const existing = new Set(existingKeys);
  const next = new Set(generated.map((g) => g.key));
  return {
    toCreate: generated.filter((g) => !existing.has(g.key)),
    toDeactivate: existingKeys.filter((k) => !next.has(k)),
    unchanged: existingKeys.filter((k) => next.has(k)),
  };
}
