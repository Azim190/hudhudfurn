/**
 * Safe arithmetic formulas for admin-configurable pricing (no eval, no property access).
 *
 * Grammar: numbers, variables, + - * / %, unary -, comparisons (< <= > >= == !=), && ||,
 * parentheses, and the functions ceil, floor, round, abs, min, max, roundUp(x, step), if(c, a, b).
 * Formulas are compiled once (parsed and checked against the allowed variables) and evaluated
 * many times. Comparisons yield 1 or 0.
 */
export class FormulaError extends Error {
  constructor(
    message: string,
    readonly position?: number,
  ) {
    super(message);
    this.name = 'FormulaError';
  }
}

type Node =
  | { t: 'num'; v: number }
  | { t: 'var'; name: string }
  | { t: 'neg'; arg: Node }
  | { t: 'bin'; op: string; a: Node; b: Node }
  | { t: 'call'; fn: string; args: Node[] };

const MAX_LENGTH = 500;
const MAX_DEPTH = 40;

const FUNCTIONS: Record<string, { arity: number | [number, number]; fn: (...args: number[]) => number }> = {
  ceil: { arity: 1, fn: Math.ceil },
  floor: { arity: 1, fn: Math.floor },
  round: { arity: 1, fn: (x) => Math.sign(x) * Math.round(Math.abs(x)) },
  abs: { arity: 1, fn: Math.abs },
  min: { arity: [2, 8], fn: Math.min },
  max: { arity: [2, 8], fn: Math.max },
  roundUp: {
    arity: 2,
    fn: (x, step) => {
      if (step <= 0) throw new FormulaError('roundUp step must be positive');
      return Math.ceil(x / step - 1e-9) * step;
    },
  },
  if: { arity: 3, fn: (c, a, b) => (c !== 0 ? a : b) },
};

// Binding powers (higher binds tighter).
const BINARY: Record<string, number> = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };

interface Token {
  kind: 'num' | 'id' | 'op' | '(' | ')' | ',' | 'end';
  value: string;
  pos: number;
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)/.exec(src.slice(i))!;
      tokens.push({ kind: 'num', value: m[0], pos: i });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      tokens.push({ kind: 'id', value: m[0], pos: i });
      i += m[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['<=', '>=', '==', '!=', '&&', '||'].includes(two)) {
      tokens.push({ kind: 'op', value: two, pos: i });
      i += 2;
      continue;
    }
    if ('+-*/%<>'.includes(c)) tokens.push({ kind: 'op', value: c, pos: i });
    else if (c === '(' || c === ')' || c === ',') tokens.push({ kind: c, value: c, pos: i });
    else throw new FormulaError(`Unexpected character "${c}"`, i);
    i++;
  }
  tokens.push({ kind: 'end', value: '', pos: src.length });
  return tokens;
}

function parse(src: string): Node {
  if (src.length > MAX_LENGTH) throw new FormulaError(`Formula is longer than ${MAX_LENGTH} characters`);
  const tokens = tokenize(src);
  let p = 0;
  const peek = () => tokens[p]!;
  const next = () => tokens[p++]!;
  const expect = (kind: Token['kind']) => {
    const tok = next();
    if (tok.kind !== kind) throw new FormulaError(`Expected "${kind}"`, tok.pos);
    return tok;
  };

  function primary(depth: number): Node {
    if (depth > MAX_DEPTH) throw new FormulaError('Formula is nested too deeply');
    const tok = next();
    if (tok.kind === 'num') return { t: 'num', v: Number(tok.value) };
    if (tok.kind === 'op' && tok.value === '-') return { t: 'neg', arg: expression(depth + 1, 7) };
    if (tok.kind === '(') {
      const inner = expression(depth + 1, 0);
      expect(')');
      return inner;
    }
    if (tok.kind === 'id') {
      if (peek().kind !== '(') return { t: 'var', name: tok.value };
      next();
      const spec = FUNCTIONS[tok.value];
      if (!spec) throw new FormulaError(`Unknown function "${tok.value}"`, tok.pos);
      const args: Node[] = [];
      if (peek().kind !== ')') {
        do args.push(expression(depth + 1, 0));
        while (peek().kind === ',' && next());
      }
      expect(')');
      const [lo, hi] = Array.isArray(spec.arity) ? spec.arity : [spec.arity, spec.arity];
      if (args.length < lo || args.length > hi) throw new FormulaError(`${tok.value}() takes ${lo === hi ? lo : `${lo}–${hi}`} arguments`, tok.pos);
      return { t: 'call', fn: tok.value, args };
    }
    throw new FormulaError(tok.kind === 'end' ? 'Unexpected end of formula' : `Unexpected "${tok.value}"`, tok.pos);
  }

  function expression(depth: number, minPower: number): Node {
    let left = primary(depth);
    for (;;) {
      const tok = peek();
      const power = tok.kind === 'op' ? BINARY[tok.value] : undefined;
      if (power === undefined || power <= minPower) return left;
      next();
      left = { t: 'bin', op: tok.value, a: left, b: expression(depth + 1, power) };
    }
  }

  const tree = expression(0, 0);
  if (peek().kind !== 'end') throw new FormulaError(`Unexpected "${peek().value}"`, peek().pos);
  return tree;
}

function variablesOf(node: Node, out = new Set<string>()): Set<string> {
  switch (node.t) {
    case 'var':
      out.add(node.name);
      break;
    case 'neg':
      variablesOf(node.arg, out);
      break;
    case 'bin':
      variablesOf(node.a, out);
      variablesOf(node.b, out);
      break;
    case 'call':
      node.args.forEach((a) => variablesOf(a, out));
      break;
  }
  return out;
}

function evaluate(node: Node, vars: Readonly<Record<string, number>>): number {
  switch (node.t) {
    case 'num':
      return node.v;
    case 'var': {
      const v = vars[node.name];
      if (v === undefined) throw new FormulaError(`Variable "${node.name}" has no value`);
      return v;
    }
    case 'neg':
      return -evaluate(node.arg, vars);
    case 'call':
      return FUNCTIONS[node.fn]!.fn(...node.args.map((a) => evaluate(a, vars)));
    case 'bin': {
      const a = evaluate(node.a, vars);
      // Short-circuit so if-like guards (b > 0 && a / b > 1) never divide by zero.
      if (node.op === '&&') return a !== 0 && evaluate(node.b, vars) !== 0 ? 1 : 0;
      if (node.op === '||') return a !== 0 || evaluate(node.b, vars) !== 0 ? 1 : 0;
      const b = evaluate(node.b, vars);
      switch (node.op) {
        case '+':
          return a + b;
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/':
          if (b === 0) throw new FormulaError('Division by zero');
          return a / b;
        case '%':
          if (b === 0) throw new FormulaError('Division by zero');
          return a % b;
        case '<':
          return a < b ? 1 : 0;
        case '<=':
          return a <= b ? 1 : 0;
        case '>':
          return a > b ? 1 : 0;
        case '>=':
          return a >= b ? 1 : 0;
        case '==':
          return a === b ? 1 : 0;
        default:
          return a !== b ? 1 : 0;
      }
    }
  }
}

export interface CompiledFormula {
  source: string;
  variables: string[];
  evaluate(vars: Readonly<Record<string, number>>): number;
}

/** Parse and check a formula. Throws FormulaError for syntax errors or unknown variables. */
export function compileFormula(source: string, allowedVariables?: readonly string[]): CompiledFormula {
  const tree = parse(source.trim());
  const variables = [...variablesOf(tree)];
  if (allowedVariables) {
    const unknown = variables.filter((v) => !allowedVariables.includes(v));
    if (unknown.length) throw new FormulaError(`Unknown variable${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`);
  }
  return {
    source,
    variables,
    evaluate(vars) {
      const result = evaluate(tree, vars);
      if (!Number.isFinite(result)) throw new FormulaError('Formula result is not a finite number');
      return result;
    },
  };
}
