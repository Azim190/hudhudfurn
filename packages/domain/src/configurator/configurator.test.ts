import { describe, expect, it } from 'vitest';
import { priceCartLineUnit } from '../cart/cart-pricing';
import { ConfiguratorError, DEFAULT_FORMULAS, quoteConfiguration, validateTemplate, type OptionDef, type TemplateDef } from './engine';
import { compileFormula, FormulaError } from './formula';

describe('compileFormula', () => {
  const ev = (src: string, vars: Record<string, number> = {}) => compileFormula(src).evaluate(vars);

  it('follows arithmetic precedence and associativity', () => {
    expect(ev('1 + 2 * 3')).toBe(7);
    expect(ev('(1 + 2) * 3')).toBe(9);
    expect(ev('10 - 4 - 3')).toBe(3);
    expect(ev('2 * -3 + 10 % 4')).toBe(-4);
    expect(ev('.5 + 1.25')).toBe(1.75);
    expect(ev('-x * 2', { x: 3 })).toBe(-6);
  });

  it('supports comparisons, logic and functions', () => {
    expect(ev('if(a > 1, 10, 20)', { a: 2 })).toBe(10);
    expect(ev('if(a >= 3 || a == 1, 1, 0)', { a: 1 })).toBe(1);
    expect(ev('a <= 1 && a != 0', { a: 1 })).toBe(1);
    expect(ev('a < 1', { a: 1 })).toBe(0);
    expect(ev('ceil(1.2) + floor(1.8) + round(2.5) + round(-2.5) + abs(-3)')).toBe(2 + 1 + 3 - 3 + 3);
    expect(ev('min(3, 1, 2) + max(4, 9)')).toBe(10);
    expect(ev('roundUp(1830, 100)')).toBe(1900);
    expect(ev('roundUp(1900, 100)')).toBe(1900);
  });

  it('short-circuits && and || so guards prevent division by zero', () => {
    expect(ev('b > 0 && a / b > 1', { a: 1, b: 0 })).toBe(0);
    expect(ev('b == 0 || a / b > 1', { a: 1, b: 0 })).toBe(1);
  });

  it('reports the variables it uses and rejects unknown ones', () => {
    expect(compileFormula('a * b + a').variables.sort()).toEqual(['a', 'b']);
    expect(() => compileFormula('a + c', ['a'])).toThrow(/Unknown variable: c/);
    expect(() => compileFormula('a + c + d', ['a'])).toThrow(/Unknown variables: c, d/);
  });

  it.each([
    ['1 +', /end of formula/],
    ['(1 + 2', /Expected "\)"/],
    ['1 2', /Unexpected "2"/],
    ['foo(1)', /Unknown function/],
    ['min(1)', /takes 2–8 arguments/],
    ['ceil(1, 2)', /takes 1 arguments/],
    ['1 $ 2', /Unexpected character/],
    [')', /Unexpected "\)"/],
    ['x'.repeat(501), /longer than 500/],
    ['('.repeat(60) + '1' + ')'.repeat(60), /nested too deeply/],
  ])('rejects %s', (src, msg) => {
    expect(() => compileFormula(src)).toThrow(msg);
  });

  it('fails at evaluation on missing variables, division by zero and non-finite results', () => {
    expect(() => ev('a + 1')).toThrow(/has no value/);
    expect(() => ev('1 / 0')).toThrow(/Division by zero/);
    expect(() => ev('1 % 0')).toThrow(/Division by zero/);
    expect(() => ev('roundUp(1, 0)')).toThrow(/step must be positive/);
    expect(() => ev('a * 10', { a: Number.MAX_VALUE })).toThrow(FormulaError);
  });

  it('calls with no arguments are parsed (and rejected by arity)', () => {
    expect(() => compileFormula('min()')).toThrow(/takes 2–8/);
  });
});

const opt = (group: string, code: string, price: number, priceBasis: OptionDef['priceBasis'] = 'FLAT', isDefault = false): OptionDef => ({ group, code, nameAr: code, nameEn: code, price, priceBasis, isDefault });

const curtain: TemplateDef = {
  kind: 'CURTAIN',
  version: 3,
  constants: {},
  formulas: {},
  headingStyles: [
    { code: 'WAVE', nameAr: 'ويف', nameEn: 'Wave', fullnessMin: 2, fullnessMax: 2.5, fullnessDefault: 2.2, makingCostPerM: 3500 },
    { code: 'EYELET', nameAr: 'حلقات', nameEn: 'Eyelet', fullnessMin: 1.8, fullnessMax: 2, fullnessDefault: 1.9, makingCostPerM: 2500 },
  ],
  options: [
    opt('MOUNTING', 'WALL', 0, 'FLAT', true),
    opt('MOUNTING', 'CEILING', 0),
    opt('LINING', 'NONE', 0, 'FLAT', true),
    opt('LINING', 'BLACKOUT', 3000, 'PER_METER'),
    opt('TRACK', 'NONE', 0, 'FLAT', true),
    opt('TRACK', 'WAVE_TRACK', 9000, 'PER_WIDTH_M'),
    opt('MOTOR', 'MANUAL', 0, 'FLAT', true),
    opt('MOTOR', 'ELECTRIC', 85000),
    opt('INSTALLATION', 'NONE', 0, 'FLAT', true),
    opt('INSTALLATION', 'STANDARD', 7500, 'PER_PANEL'),
    opt('ACCESSORY', 'TIEBACK', 4500, 'PER_PANEL'),
    opt('ACCESSORY', 'SQM_TEST', 1000, 'PER_SQM'),
  ],
};

describe('curtain configurator', () => {
  it('computes widths, cut length and fabric from the default formulas', () => {
    // 3 m window, pair, wave 2.2: per panel (3000*2.2/2 + 100 + 50) / 1400 = 2.46 → 3 widths; 6 widths in total.
    // Cut: 2600 + 150 + 100 + 0 = 2850 → rounded up to 2900 mm. Fabric: 6 × 2.9 m = 17.4 m.
    const q = quoteConfiguration(curtain, { widthMm: 3000, heightMm: 2600, panels: 2, headingStyle: 'WAVE' }, { basePrice: 8900 });
    expect(q.valid).toBe(true);
    expect(q.specs).toMatchObject({ widths: 6, widthsPerPanel: 3, cutLengthMm: 2900, fabricMeters: 17.4, railLengthMm: 3200, fullness: 2.2, headingStyle: 'WAVE', mounting: 'WALL', templateVersion: 3 });
    expect(q.lines.map((l) => [l.key, l.amount])).toEqual([
      ['fabric', 154860],
      ['HEADING:WAVE', 11200],
    ]);
    expect(q.total).toBe(154860 + 11200);
  });

  it('prices options by their basis', () => {
    const q = quoteConfiguration(
      curtain,
      { widthMm: 3000, heightMm: 2600, panels: 2, headingStyle: 'WAVE', choices: { LINING: 'BLACKOUT', TRACK: 'WAVE_TRACK', MOTOR: 'ELECTRIC', INSTALLATION: 'STANDARD' }, extras: ['TIEBACK', 'SQM_TEST', 'TIEBACK'] },
      { basePrice: 8900 },
    );
    const byKey = Object.fromEntries(q.lines.map((l) => [l.key, l]));
    expect(byKey['LINING:BLACKOUT']).toMatchObject({ quantity: 17.4, unit: 'm', amount: 52200 });
    expect(byKey['TRACK:WAVE_TRACK']).toMatchObject({ quantity: 3.2, amount: 28800 });
    expect(byKey['MOTOR:ELECTRIC']).toMatchObject({ quantity: 1, unit: 'item', amount: 85000 });
    expect(byKey['INSTALLATION:STANDARD']).toMatchObject({ quantity: 2, unit: 'panel', amount: 15000 });
    expect(byKey['ACCESSORY:TIEBACK']).toMatchObject({ amount: 9000 });
    expect(byKey['ACCESSORY:SQM_TEST']).toMatchObject({ unit: 'm2', quantity: 7.8, amount: 7800 });
    expect(q.specs.extras).toBe('TIEBACK,SQM_TEST');
    expect(q.choices.map((c) => c.code)).toEqual(['WAVE', 'WALL', 'BLACKOUT', 'WAVE_TRACK', 'ELECTRIC', 'STANDARD', 'TIEBACK', 'SQM_TEST']);
  });

  it('uses the fabric width of the chosen fabric and a custom fullness', () => {
    const q = quoteConfiguration(curtain, { widthMm: 1200, heightMm: 2000, panels: 1, headingStyle: 'EYELET', fullness: 2 }, { basePrice: 5000, fabricWidthMm: 2800 });
    // (1200*2 + 100) / 2800 = 0.89 → 1 width.
    expect(q.specs).toMatchObject({ widths: 1, fabricWidthMm: 2800, cutLengthMm: 2300 });
  });

  it('takes admin formulas and constants', () => {
    const custom = { ...curtain, constants: { cutRounding: 50, bottomHem: 100 }, formulas: { cutLength: 'roundUp(height + bottomHem, cutRounding)' } };
    expect(quoteConfiguration(custom, { widthMm: 3000, heightMm: 2610, panels: 2, headingStyle: 'WAVE' }, { basePrice: 100 }).specs.cutLengthMm).toBe(2750);
  });

  it('reports invalid input instead of pricing it', () => {
    const q = quoteConfiguration(curtain, { widthMm: 50, panels: 0, headingStyle: 'X', choices: { LINING: 'GOLD', COLOR: 'RED' }, extras: ['NOPE'] }, { basePrice: 100 });
    expect(q.valid).toBe(false);
    expect(q.total).toBe(0);
    expect(q.lines).toEqual([]);
    expect(q.issues.map((i) => `${i.field}:${i.code}`).sort()).toEqual(
      ['choices.COLOR:invalidOption', 'choices.LINING:invalidOption', 'extras:invalidOption', 'headingStyle:invalidOption', 'heightMm:required', 'panels:range', 'widthMm:range'].sort(),
    );
  });

  it('checks fullness against the heading range and needs a heading', () => {
    expect(quoteConfiguration(curtain, { widthMm: 3000, heightMm: 2600, headingStyle: 'WAVE', fullness: 3 }, { basePrice: 1 }).issues).toEqual([{ field: 'fullness', code: 'range', params: { min: 2, max: 2.5 } }]);
    const bare = { ...curtain, headingStyles: [] };
    expect(quoteConfiguration(bare, { widthMm: 3000, heightMm: 2600 }, { basePrice: 1 }).issues[0]).toMatchObject({ field: 'headingStyle', code: 'required' });
  });

  it('surfaces formula failures as issues', () => {
    const broken = { ...curtain, formulas: { widths: 'width / 0' } };
    const q = quoteConfiguration(broken, { widthMm: 3000, heightMm: 2600, headingStyle: 'WAVE' }, { basePrice: 1 });
    expect(q.valid).toBe(false);
    expect(q.issues[0]).toMatchObject({ field: 'formula.widths', code: 'formula' });
  });

  it('flags a single-choice group with no options as invalid', () => {
    const odd = { ...curtain, options: [...curtain.options.filter((o) => o.group !== 'MOTOR')] };
    const q = quoteConfiguration(odd, { widthMm: 3000, heightMm: 2600, headingStyle: 'WAVE', choices: { MOTOR: 'ELECTRIC' } }, { basePrice: 1 });
    expect(q.issues).toContainEqual({ field: 'choices.MOTOR', code: 'invalidOption' });
  });

  it('keeps customer notes in the workshop spec', () => {
    const q = quoteConfiguration(curtain, { widthMm: 3000, heightMm: 2600, headingStyle: 'WAVE', notes: '  Hooks on the left  ' }, { basePrice: 1 });
    expect(q.specs.notes).toBe('Hooks on the left');
  });
});

describe('blind configurator', () => {
  const blind: TemplateDef = { kind: 'BLIND', version: 1, constants: {}, formulas: {}, headingStyles: [], options: [opt('MOTOR', 'MANUAL', 0, 'FLAT', true), opt('MOTOR', 'ELECTRIC', 65000), opt('CONTROL', 'LEFT', 0, 'FLAT', true)] };

  it('bills area with a minimum', () => {
    const q = quoteConfiguration(blind, { widthMm: 1200, heightMm: 1500, choices: { MOTOR: 'ELECTRIC' } }, { basePrice: 15900 });
    expect(q.specs).toMatchObject({ billableArea: 1.8, control: 'LEFT' });
    expect(q.total).toBe(roundTo(15900 * 1.8) + 65000);
    const small = quoteConfiguration(blind, { widthMm: 400, heightMm: 500 }, { basePrice: 15900 });
    expect(small.specs.billableArea).toBe(1);
  });

  it('validates dimensions', () => {
    expect(quoteConfiguration(blind, { widthMm: 5000, heightMm: 1000 }, { basePrice: 1 }).issues).toEqual([{ field: 'widthMm', code: 'range', params: { min: 300, max: 3000 } }]);
  });
});

const roundTo = (x: number) => Math.round(x);

describe('abaya configurator', () => {
  const abaya: TemplateDef = { kind: 'ABAYA', version: 1, constants: {}, formulas: {}, headingStyles: [], options: [opt('TAILORING', 'CUSTOM', 5000, 'FLAT', true), opt('EXTRA', 'TARHA', 4900)] };

  it('adds the tailoring fee and extras to the garment price', () => {
    const q = quoteConfiguration(abaya, { measurements: { length: 1450, chest: 1000, shoulder: 400, sleeve: 600 }, extras: ['TARHA'] }, { basePrice: 29900 });
    expect(q.valid).toBe(true);
    expect(q.total).toBe(29900 + 5000 + 4900);
    expect(q.specs).toMatchObject({ lengthMm: 1450, chestMm: 1000, shoulderMm: 400, sleeveMm: 600, tailoring: 'CUSTOM' });
  });

  it('requires all measurements within range', () => {
    const q = quoteConfiguration(abaya, { measurements: { length: 2000, chest: 1000 } }, { basePrice: 29900 });
    expect(q.issues.map((i) => `${i.field}:${i.code}`)).toEqual(['measurements.length:range', 'measurements.shoulder:required', 'measurements.sleeve:required']);
  });
});

describe('sofa cover configurator', () => {
  const sofa: TemplateDef = {
    kind: 'SOFA_COVER',
    version: 1,
    constants: {},
    formulas: {},
    headingStyles: [],
    options: [opt('PIECE', 'SEAT_3', 45000, 'PER_PIECE'), opt('PIECE', 'SEAT_1', 20000, 'PER_PIECE'), opt('FABRIC', 'STANDARD', 0, 'FLAT', true), opt('FABRIC', 'VELVET', 2500, 'PER_METER'), opt('TAILORING', 'FEE', 10000, 'FLAT', true)],
  };
  const piece = (code: string, quantity: number) => ({ code, quantity, widthMm: 2000, depthMm: 900, heightMm: 850 });

  it('prices pieces, fabric upgrade and tailoring', () => {
    const q = quoteConfiguration(sofa, { pieces: [piece('SEAT_3', 1), piece('SEAT_1', 2)], choices: { FABRIC: 'VELVET' }, photoIds: ['a', 'b'] }, { basePrice: 59900 });
    expect(q.valid).toBe(true);
    // Fabric: roundUp(6000 * 1.6 + 3 * 400, 100) = 10800 mm.
    expect(q.specs).toMatchObject({ pieceCount: 3, fabricMeters: 10.8, photos: 2 });
    expect(q.lines.find((l) => l.key === 'PIECE:SEAT_1')).toMatchObject({ quantity: 2, amount: 40000 });
    expect(q.total).toBe(45000 + 40000 + 27000 + 10000);
  });

  it('charges at least the starting price', () => {
    const q = quoteConfiguration(sofa, { pieces: [piece('SEAT_1', 1)], photoIds: ['a'] }, { basePrice: 59900 });
    expect(q.total).toBe(59900);
    expect(q.lines.at(-1)).toMatchObject({ key: 'minimum', amount: 59900 - 30000 });
  });

  it('validates pieces and photos', () => {
    const q = quoteConfiguration(sofa, { pieces: [{ code: 'NOPE', quantity: 1 }, { code: 'SEAT_1', quantity: 0 }, { code: 'SEAT_1', quantity: 1, widthMm: 100 }] }, { basePrice: 1 });
    expect(q.issues.map((i) => `${i.field}:${i.code}`)).toEqual(['pieces.0.code:invalidOption', 'pieces.1.quantity:range', 'pieces.2.widthMm:range', 'pieces.2.depthMm:required', 'pieces.2.heightMm:required', 'photoIds:tooFew']);
    expect(quoteConfiguration(sofa, { photoIds: ['a'] }, { basePrice: 1 }).issues).toEqual([{ field: 'pieces', code: 'tooFew', params: { min: 1 } }]);
    const many = quoteConfiguration(sofa, { pieces: [piece('SEAT_1', 21)], photoIds: Array.from({ length: 9 }, (_, i) => String(i)) }, { basePrice: 1 });
    expect(many.issues.map((i) => i.code)).toEqual(['tooMany', 'tooMany']);
  });
});

describe('validateTemplate', () => {
  it('accepts the defaults', () => {
    expect(() => validateTemplate(curtain)).not.toThrow();
    for (const kind of ['BLIND', 'ABAYA', 'SOFA_COVER'] as const) expect(() => validateTemplate({ kind, version: 1, constants: {}, formulas: {}, headingStyles: [], options: [] })).not.toThrow();
    expect(Object.keys(DEFAULT_FORMULAS.CURTAIN)).toEqual(['widths', 'cutLength', 'fabricLength', 'railLength']);
  });

  it('allows formulas to use constants and earlier results', () => {
    expect(() => validateTemplate({ ...curtain, constants: { extra: 10 }, formulas: { fabricLength: 'widths * cutLength + extra' } })).not.toThrow();
  });

  it.each([
    [{ kind: 'TENT' as never }, /Unknown kind/],
    [{ constants: { sideHem: Number.NaN } }, /Constant sideHem/],
    [{ formulas: { widths: 'width * nope' } }, /Formula widths: Unknown variable: nope/],
    [{ formulas: { cutLength: 'fabricLength' } }, /Formula cutLength/],
    [{ headingStyles: [{ ...curtain.headingStyles[0]!, fullnessDefault: 3 }] }, /fullness/],
    [{ headingStyles: [{ ...curtain.headingStyles[0]!, makingCostPerM: 1.5 }] }, /making cost/],
    [{ options: [{ ...curtain.options[0]!, priceBasis: 'PER_HOUR' as never }] }, /price basis/],
    [{ options: [{ ...curtain.options[0]!, price: -1 }] }, /whole halalas/],
  ])('rejects %j', (patch, msg) => {
    expect(() => validateTemplate({ ...curtain, ...patch })).toThrow(ConfiguratorError);
    expect(() => validateTemplate({ ...curtain, ...patch })).toThrow(msg);
  });
});

describe('configured cart lines', () => {
  it('use the configurator price whatever the pricing mode', () => {
    expect(priceCartLineUnit({ id: 'a', pricingMode: 'CALCULATED', unitPrice: 129900, quantity: 1, configuredPrice: 210000 })).toEqual({ unitPrice: 210000 });
    expect(() => priceCartLineUnit({ id: 'a', pricingMode: 'CALCULATED', unitPrice: 1, quantity: 1, configuredPrice: null })).toThrow(/configured/);
  });
});
