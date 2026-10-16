import { roundHalfUp, type Halalas } from '../money/money';
import { compileFormula, FormulaError } from './formula';

/**
 * Made-to-measure configurator engine. Everything that varies by business decision lives in the
 * template (admin-edited): constants, formulas, heading styles with fullness ranges, and option
 * prices with their price basis. The engine validates the customer's inputs against the template,
 * evaluates the formulas and returns an itemised price plus the workshop specification.
 *
 * Units: lengths in mm, money in halalas (same VAT basis as catalog prices), fullness as a ratio.
 */
export const CONFIGURATOR_KINDS = ['CURTAIN', 'BLIND', 'ABAYA', 'SOFA_COVER'] as const;
export type ConfiguratorKind = (typeof CONFIGURATOR_KINDS)[number];

export const PRICE_BASES = ['FLAT', 'PER_METER', 'PER_SQM', 'PER_PANEL', 'PER_WIDTH_M', 'PER_PIECE'] as const;
export type PriceBasis = (typeof PRICE_BASES)[number];

/** Option groups where exactly one option is chosen (the default when the customer picks none). */
export const SINGLE_CHOICE_GROUPS = ['MOUNTING', 'LINING', 'TRACK', 'MOTOR', 'INSTALLATION', 'CONTROL', 'FABRIC', 'TAILORING'] as const;
/** Option groups where any number of options can be added. */
export const MULTI_CHOICE_GROUPS = ['ACCESSORY', 'EXTRA'] as const;
/** Sofa-cover pieces: each chosen with a quantity and dimensions. */
export const PIECE_GROUP = 'PIECE';

export interface HeadingStyleDef {
  code: string;
  nameAr: string;
  nameEn: string;
  fullnessMin: number;
  fullnessMax: number;
  fullnessDefault: number;
  /** Making (sewing) cost per metre of rail. */
  makingCostPerM: Halalas;
}

export interface OptionDef {
  group: string;
  code: string;
  nameAr: string;
  nameEn: string;
  priceBasis: PriceBasis;
  price: Halalas;
  isDefault?: boolean;
}

export interface TemplateDef {
  kind: ConfiguratorKind;
  version: number;
  constants: Record<string, number>;
  formulas: Record<string, string>;
  headingStyles: HeadingStyleDef[];
  options: OptionDef[];
}

export interface PieceInput {
  code: string;
  quantity: number;
  widthMm?: number;
  depthMm?: number;
  heightMm?: number;
}

export interface ConfigurationInputs {
  widthMm?: number;
  heightMm?: number;
  panels?: number;
  headingStyle?: string;
  fullness?: number;
  /** Single-choice groups: group → option code. */
  choices?: Record<string, string>;
  /** Multi-choice options (accessories, extras) by code. */
  extras?: string[];
  /** Abaya body measurements in mm: length, chest, shoulder, sleeve. */
  measurements?: Record<string, number>;
  pieces?: PieceInput[];
  photoIds?: string[];
  notes?: string;
}

export interface QuoteContext {
  /**
   * The chosen fabric/variant price: per metre of fabric (curtains), per m² (blinds), per garment
   * (abayas) or the starting price (sofa covers, used as a minimum).
   */
  basePrice: Halalas;
  /** Usable fabric width of the chosen fabric; falls back to constants.fabricWidth. */
  fabricWidthMm?: number | null;
}

export interface QuoteLine {
  key: string;
  group: string;
  nameAr: string;
  nameEn: string;
  quantity: number;
  unit: 'm' | 'm2' | 'panel' | 'piece' | 'item';
  unitPrice: Halalas;
  amount: Halalas;
}

export interface ValidationIssue {
  field: string;
  code: 'required' | 'range' | 'invalidOption' | 'tooMany' | 'tooFew' | 'formula';
  params?: Record<string, number | string>;
}

export interface Quote {
  valid: boolean;
  issues: ValidationIssue[];
  lines: QuoteLine[];
  total: Halalas;
  /** Workshop specification (cut list and choices). */
  specs: Record<string, number | string>;
  /** Chosen heading and options with their names, for summaries. */
  choices: Array<{ group: string; code: string; nameAr: string; nameEn: string }>;
}

/** Variables formulas may reference, per kind (constants are added on top). */
export const FORMULA_VARIABLES: Record<ConfiguratorKind, readonly string[]> = {
  CURTAIN: ['width', 'height', 'panels', 'fullness', 'fabricWidth'],
  BLIND: ['width', 'height'],
  ABAYA: ['length', 'chest', 'shoulder', 'sleeve'],
  SOFA_COVER: ['pieceCount', 'seatWidth'],
};

/** Formulas each kind needs. Defaults are applied when a template leaves one out. */
export const DEFAULT_FORMULAS: Record<ConfiguratorKind, Record<string, string>> = {
  CURTAIN: {
    // Fabric widths ("drops") per panel, rounded up to whole widths; at least one per panel.
    widths: 'panels * max(1, ceil((width * fullness / panels + 2 * sideHem + if(panels > 1, overlap / 2, 0)) / fabricWidth))',
    cutLength: 'roundUp(height + bottomHem + headingAllowance + patternRepeat, cutRounding)',
    fabricLength: 'widths * cutLength',
    railLength: 'width + 2 * railOverhang',
  },
  BLIND: {
    billableArea: 'max(minBillableArea, roundUp(width * height / 1000000, 0.01))',
    railLength: 'width',
  },
  ABAYA: {},
  SOFA_COVER: {
    fabricLength: 'roundUp(seatWidth * 1.6 + pieceCount * 400, 100)',
  },
};

/** Formula results each kind derives, in evaluation order (later ones may use earlier ones). */
const DERIVED: Record<ConfiguratorKind, string[]> = {
  CURTAIN: ['widths', 'cutLength', 'fabricLength', 'railLength'],
  BLIND: ['billableArea', 'railLength'],
  ABAYA: [],
  SOFA_COVER: ['fabricLength'],
};

export const DEFAULT_CONSTANTS: Record<ConfiguratorKind, Record<string, number>> = {
  CURTAIN: {
    minWidth: 300,
    maxWidth: 12000,
    minHeight: 300,
    maxHeight: 5000,
    maxPanels: 8,
    sideHem: 50,
    bottomHem: 150,
    headingAllowance: 100,
    overlap: 100,
    patternRepeat: 0,
    cutRounding: 100,
    fabricWidth: 1400,
    railOverhang: 100,
  },
  BLIND: { minWidth: 300, maxWidth: 3000, minHeight: 300, maxHeight: 3500, minBillableArea: 1 },
  ABAYA: { lengthMin: 1200, lengthMax: 1650, chestMin: 700, chestMax: 1600, shoulderMin: 300, shoulderMax: 600, sleeveMin: 450, sleeveMax: 750 },
  SOFA_COVER: { minPieceSide: 300, maxPieceSide: 4000, maxPieces: 20, minPhotos: 1, maxPhotos: 8 },
};

const ABAYA_MEASUREMENTS = ['length', 'chest', 'shoulder', 'sleeve'] as const;

export class ConfiguratorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfiguratorError';
  }
}

/** Check a template before it is saved: known kind, formulas compile against the allowed variables. */
export function validateTemplate(t: TemplateDef): void {
  if (!CONFIGURATOR_KINDS.includes(t.kind)) throw new ConfiguratorError(`Unknown kind ${t.kind}`);
  const constants = { ...DEFAULT_CONSTANTS[t.kind], ...t.constants };
  for (const [k, v] of Object.entries(constants)) if (!Number.isFinite(v)) throw new ConfiguratorError(`Constant ${k} must be a number`);
  const allowed = [...FORMULA_VARIABLES[t.kind], ...Object.keys(constants)];
  for (const key of DERIVED[t.kind]) {
    const source = t.formulas[key] ?? DEFAULT_FORMULAS[t.kind][key]!;
    try {
      compileFormula(source, allowed);
    } catch (err) {
      throw new ConfiguratorError(`Formula ${key}: ${(err as Error).message}`);
    }
    allowed.push(key);
  }
  for (const h of t.headingStyles) {
    if (!(h.fullnessMin > 0 && h.fullnessMin <= h.fullnessDefault && h.fullnessDefault <= h.fullnessMax && h.fullnessMax <= 5)) {
      throw new ConfiguratorError(`Heading ${h.code}: fullness must satisfy 0 < min ≤ default ≤ max ≤ 5`);
    }
    if (!Number.isInteger(h.makingCostPerM) || h.makingCostPerM < 0) throw new ConfiguratorError(`Heading ${h.code}: making cost must be whole halalas`);
  }
  for (const o of t.options) {
    if (!PRICE_BASES.includes(o.priceBasis)) throw new ConfiguratorError(`Option ${o.code}: unknown price basis`);
    if (!Number.isInteger(o.price) || o.price < 0) throw new ConfiguratorError(`Option ${o.code}: price must be whole halalas`);
  }
}

interface Measures {
  fabricMeters: number;
  areaSqm: number;
  panels: number;
  railMeters: number;
  pieces: number;
}

function optionLine(o: OptionDef, m: Measures, quantityOverride?: number): QuoteLine {
  const [quantity, unit]: [number, QuoteLine['unit']] =
    quantityOverride !== undefined
      ? [quantityOverride, 'piece']
      : o.priceBasis === 'PER_METER'
        ? [m.fabricMeters, 'm']
        : o.priceBasis === 'PER_SQM'
          ? [m.areaSqm, 'm2']
          : o.priceBasis === 'PER_PANEL'
            ? [m.panels, 'panel']
            : o.priceBasis === 'PER_WIDTH_M'
              ? [m.railMeters, 'm']
              : o.priceBasis === 'PER_PIECE'
                ? [m.pieces, 'piece']
                : [1, 'item'];
  return { key: `${o.group}:${o.code}`, group: o.group, nameAr: o.nameAr, nameEn: o.nameEn, quantity, unit, unitPrice: o.price, amount: roundHalfUp(o.price * quantity) };
}

const inRange = (v: number | undefined, min: number, max: number) => v !== undefined && Number.isFinite(v) && v >= min && v <= max;

/** Price a configuration. Never throws for bad customer input: problems are reported as issues. */
export function quoteConfiguration(template: TemplateDef, inputs: ConfigurationInputs, ctx: QuoteContext): Quote {
  const kind = template.kind;
  const c = { ...DEFAULT_CONSTANTS[kind], ...template.constants };
  const issues: ValidationIssue[] = [];
  const lines: QuoteLine[] = [];
  const specs: Quote['specs'] = { kind, templateVersion: template.version };
  const groups = new Map<string, OptionDef[]>();
  for (const o of template.options) groups.set(o.group, [...(groups.get(o.group) ?? []), o]);

  // Single-choice groups: chosen option, or the group default.
  const chosen: OptionDef[] = [];
  for (const [group, opts] of groups) {
    if (!(SINGLE_CHOICE_GROUPS as readonly string[]).includes(group)) continue;
    const code = inputs.choices?.[group];
    const pick = code ? opts.find((o) => o.code === code) : (opts.find((o) => o.isDefault) ?? opts[0]);
    if (!pick) {
      issues.push({ field: `choices.${group}`, code: 'invalidOption' });
      continue;
    }
    chosen.push(pick);
    specs[group.toLowerCase()] = pick.code;
  }
  for (const code of Object.keys(inputs.choices ?? {})) if (!groups.has(code)) issues.push({ field: `choices.${code}`, code: 'invalidOption' });
  const extras: OptionDef[] = [];
  for (const code of new Set(inputs.extras ?? [])) {
    const o = template.options.find((x) => x.code === code && (MULTI_CHOICE_GROUPS as readonly string[]).includes(x.group));
    if (!o) issues.push({ field: 'extras', code: 'invalidOption', params: { code } });
    else extras.push(o);
  }
  if (extras.length) specs.extras = extras.map((e) => e.code).join(',');

  const m: Measures = { fabricMeters: 0, areaSqm: 0, panels: 1, railMeters: 0, pieces: 0 };
  const vars: Record<string, number> = { ...c };
  const derive = (allowed: string[]) => {
    for (const key of DERIVED[kind]) {
      try {
        vars[key] = compileFormula(template.formulas[key] ?? DEFAULT_FORMULAS[kind][key]!, allowed).evaluate(vars);
        allowed.push(key);
      } catch (err) {
        if (!(err instanceof FormulaError)) throw err;
        issues.push({ field: `formula.${key}`, code: 'formula', params: { message: err.message } });
        return false;
      }
    }
    return true;
  };

  if (kind === 'CURTAIN' || kind === 'BLIND') {
    if (!inRange(inputs.widthMm, c.minWidth!, c.maxWidth!)) issues.push({ field: 'widthMm', code: inputs.widthMm === undefined ? 'required' : 'range', params: { min: c.minWidth!, max: c.maxWidth! } });
    if (!inRange(inputs.heightMm, c.minHeight!, c.maxHeight!)) issues.push({ field: 'heightMm', code: inputs.heightMm === undefined ? 'required' : 'range', params: { min: c.minHeight!, max: c.maxHeight! } });
  }

  if (kind === 'CURTAIN') {
    const panels = inputs.panels ?? 2;
    if (!Number.isInteger(panels) || panels < 1 || panels > c.maxPanels!) issues.push({ field: 'panels', code: 'range', params: { min: 1, max: c.maxPanels! } });
    const heading = inputs.headingStyle ? template.headingStyles.find((h) => h.code === inputs.headingStyle) : template.headingStyles[0];
    if (!heading) issues.push({ field: 'headingStyle', code: inputs.headingStyle ? 'invalidOption' : 'required' });
    const fullness = inputs.fullness ?? heading?.fullnessDefault;
    if (heading && !inRange(fullness, heading.fullnessMin, heading.fullnessMax)) issues.push({ field: 'fullness', code: 'range', params: { min: heading.fullnessMin, max: heading.fullnessMax } });
    if (issues.length === 0 && heading && fullness !== undefined) {
      Object.assign(vars, { width: inputs.widthMm!, height: inputs.heightMm!, panels, fullness, fabricWidth: ctx.fabricWidthMm || c.fabricWidth! });
      if (derive([...FORMULA_VARIABLES.CURTAIN, ...Object.keys(c)])) {
        m.fabricMeters = Math.round(vars.fabricLength!) / 1000;
        m.railMeters = Math.round(vars.railLength!) / 1000;
        m.panels = panels;
        m.areaSqm = (inputs.widthMm! * inputs.heightMm!) / 1_000_000;
        lines.push({ key: 'fabric', group: 'FABRIC', nameAr: 'القماش', nameEn: 'Fabric', quantity: m.fabricMeters, unit: 'm', unitPrice: ctx.basePrice, amount: roundHalfUp(ctx.basePrice * m.fabricMeters) });
        lines.push({ key: `HEADING:${heading.code}`, group: 'HEADING', nameAr: `خياطة ${heading.nameAr}`, nameEn: `${heading.nameEn} making`, quantity: m.railMeters, unit: 'm', unitPrice: heading.makingCostPerM, amount: roundHalfUp(heading.makingCostPerM * m.railMeters) });
        Object.assign(specs, {
          widthMm: inputs.widthMm!,
          heightMm: inputs.heightMm!,
          panels,
          headingStyle: heading.code,
          fullness,
          fabricWidthMm: vars.fabricWidth!,
          widths: vars.widths!,
          widthsPerPanel: vars.widths! / panels,
          cutLengthMm: Math.round(vars.cutLength!),
          fabricMeters: m.fabricMeters,
          railLengthMm: Math.round(vars.railLength!),
        });
      }
    }
  } else if (kind === 'BLIND') {
    if (issues.length === 0) {
      Object.assign(vars, { width: inputs.widthMm!, height: inputs.heightMm! });
      if (derive([...FORMULA_VARIABLES.BLIND, ...Object.keys(c)])) {
        m.areaSqm = Math.round(vars.billableArea! * 100) / 100;
        m.railMeters = Math.round(vars.railLength!) / 1000;
        lines.push({ key: 'fabric', group: 'FABRIC', nameAr: 'القماش', nameEn: 'Fabric', quantity: m.areaSqm, unit: 'm2', unitPrice: ctx.basePrice, amount: roundHalfUp(ctx.basePrice * m.areaSqm) });
        Object.assign(specs, { widthMm: inputs.widthMm!, heightMm: inputs.heightMm!, billableArea: m.areaSqm });
      }
    }
  } else if (kind === 'ABAYA') {
    for (const key of ABAYA_MEASUREMENTS) {
      const v = inputs.measurements?.[key];
      const [min, max] = [c[`${key}Min`]!, c[`${key}Max`]!];
      if (!inRange(v, min, max)) issues.push({ field: `measurements.${key}`, code: v === undefined ? 'required' : 'range', params: { min, max } });
      else specs[`${key}Mm`] = v!;
    }
    lines.push({ key: 'garment', group: 'GARMENT', nameAr: 'العباية', nameEn: 'Abaya', quantity: 1, unit: 'item', unitPrice: ctx.basePrice, amount: ctx.basePrice });
  } else {
    const pieceDefs = groups.get(PIECE_GROUP) ?? [];
    const pieces = inputs.pieces ?? [];
    if (pieces.length === 0) issues.push({ field: 'pieces', code: 'tooFew', params: { min: 1 } });
    let count = 0;
    let seatWidth = 0;
    pieces.forEach((p, i) => {
      const def = pieceDefs.find((d) => d.code === p.code);
      if (!def) return issues.push({ field: `pieces.${i}.code`, code: 'invalidOption' });
      if (!Number.isInteger(p.quantity) || p.quantity < 1) return issues.push({ field: `pieces.${i}.quantity`, code: 'range', params: { min: 1, max: c.maxPieces! } });
      for (const dim of ['widthMm', 'depthMm', 'heightMm'] as const) {
        if (!inRange(p[dim], c.minPieceSide!, c.maxPieceSide!)) issues.push({ field: `pieces.${i}.${dim}`, code: p[dim] === undefined ? 'required' : 'range', params: { min: c.minPieceSide!, max: c.maxPieceSide! } });
      }
      count += p.quantity;
      seatWidth += (p.widthMm ?? 0) * p.quantity;
      lines.push(optionLine(def, m, p.quantity));
    });
    if (count > c.maxPieces!) issues.push({ field: 'pieces', code: 'tooMany', params: { max: c.maxPieces! } });
    const photos = new Set(inputs.photoIds ?? []).size;
    if (photos < c.minPhotos!) issues.push({ field: 'photoIds', code: 'tooFew', params: { min: c.minPhotos! } });
    if (photos > c.maxPhotos!) issues.push({ field: 'photoIds', code: 'tooMany', params: { max: c.maxPhotos! } });
    m.pieces = count;
    if (issues.length === 0) {
      Object.assign(vars, { pieceCount: count, seatWidth });
      if (derive([...FORMULA_VARIABLES.SOFA_COVER, ...Object.keys(c)])) {
        m.fabricMeters = Math.round(vars.fabricLength!) / 1000;
        Object.assign(specs, { pieceCount: count, fabricMeters: m.fabricMeters, photos, pieces: pieces.map((p) => `${p.code}×${p.quantity} (${p.widthMm}×${p.depthMm}×${p.heightMm})`).join('; ') });
      }
    }
  }

  if (issues.length === 0) {
    for (const o of [...chosen, ...extras]) if (o.price > 0) lines.push(optionLine(o, m));
  }
  if (inputs.notes?.trim()) specs.notes = inputs.notes.trim().slice(0, 1000);

  const choices = [...chosen, ...extras].map((o) => ({ group: o.group, code: o.code, nameAr: o.nameAr, nameEn: o.nameEn }));
  if (kind === 'CURTAIN') {
    const h = template.headingStyles.find((x) => x.code === specs.headingStyle);
    if (h) choices.unshift({ group: 'HEADING', code: h.code, nameAr: h.nameAr, nameEn: h.nameEn });
  }
  const valid = issues.length === 0;
  let total = valid ? lines.reduce((s, l) => s + l.amount, 0) : 0;
  // Sofa covers are never sold below the advertised starting price.
  if (valid && kind === 'SOFA_COVER' && total < ctx.basePrice) {
    lines.push({ key: 'minimum', group: 'MINIMUM', nameAr: 'الحد الأدنى للتفصيل', nameEn: 'Minimum tailoring charge', quantity: 1, unit: 'item', unitPrice: ctx.basePrice - total, amount: ctx.basePrice - total });
    total = ctx.basePrice;
  }
  return { valid, issues, lines: valid ? lines.filter((l) => l.amount > 0 || l.group === 'FABRIC') : [], total, specs, choices };
}
