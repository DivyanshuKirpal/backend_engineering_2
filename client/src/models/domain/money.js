// Money and quantities are decimal strings everywhere ("0.02500000"), as the
// API sends them. This file is the only place they are calculated: each string
// becomes a BigInt scaled by 10^18, so sums, products and fees are exact and no
// float ever touches a balance. Results come back as plain decimal strings.
//
// Rounding modes: 'down' (toward zero), 'up' (away from zero), 'floor',
// 'ceil' and 'halfUp' (half away from zero, for display).

const SCALE = 18;
const ONE = 10n ** BigInt(SCALE);
const DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

export function isDecimal(value) {
  return typeof value === 'string' && DECIMAL.test(value.trim());
}

function units(value) {
  if (typeof value === 'bigint') return value;
  const text = String(value).trim();
  if (!DECIMAL.test(text)) throw new TypeError(`Not a decimal string: ${value}`);
  const negative = text.startsWith('-');
  const bare = text.replace(/^[+-]/, '');
  const [whole, fraction = ''] = bare.split('.');
  if (fraction.length > SCALE) throw new RangeError(`More than ${SCALE} decimals: ${value}`);
  const big = BigInt(whole || '0') * ONE + BigInt((fraction + '0'.repeat(SCALE)).slice(0, SCALE) || '0');
  return negative ? -big : big;
}

function text(big) {
  const negative = big < 0n;
  const abs = negative ? -big : big;
  const whole = abs / ONE;
  const fraction = (abs % ONE).toString().padStart(SCALE, '0').replace(/0+$/, '');
  const out = fraction ? `${whole}.${fraction}` : `${whole}`;
  return negative && out !== '0' ? `-${out}` : out;
}

// Divides two scaled integers and rounds the quotient to an integer.
function divRound(n, d, mode) {
  if (d === 0n) throw new RangeError('Division by zero');
  const q = n / d;
  const r = n % d;
  if (r === 0n) return q;
  const positive = (n < 0n) === (d < 0n);
  const away = positive ? q + 1n : q - 1n;
  switch (mode) {
    case 'down': return q;
    case 'up': return away;
    case 'floor': return positive ? q : away;
    case 'ceil': return positive ? away : q;
    case 'halfUp': {
      const twice = (r < 0n ? -r : r) * 2n;
      return twice >= (d < 0n ? -d : d) ? away : q;
    }
    default: throw new RangeError(`Unknown rounding mode: ${mode}`);
  }
}

export const add = (a, b) => text(units(a) + units(b));
export const sub = (a, b) => text(units(a) - units(b));
export const neg = (a) => text(-units(a));
export const abs = (a) => text(units(a) < 0n ? -units(a) : units(a));
export const sum = (values) => text(values.reduce((acc, v) => acc + units(v), 0n));

/** Exact for the inputs this app has (each at most 18 decimals, product at most 18). */
export function mul(a, b, mode = 'down') {
  return text(divRound(units(a) * units(b), ONE, mode));
}

/** a / b, rounded once to `decimals` places. */
export function div(a, b, decimals = SCALE, mode = 'down') {
  const places = Math.min(decimals, SCALE);
  const quotient = divRound(units(a) * 10n ** BigInt(places), units(b), mode);
  return text(quotient * 10n ** BigInt(SCALE - places));
}

export function cmp(a, b) {
  const x = units(a);
  const y = units(b);
  return x < y ? -1 : x > y ? 1 : 0;
}
export const eq = (a, b) => cmp(a, b) === 0;
export const gt = (a, b) => cmp(a, b) > 0;
export const gte = (a, b) => cmp(a, b) >= 0;
export const lt = (a, b) => cmp(a, b) < 0;
export const lte = (a, b) => cmp(a, b) <= 0;
export const isZero = (a) => units(a) === 0n;
export const isNegative = (a) => units(a) < 0n;
export const isPositive = (a) => units(a) > 0n;
export const min = (a, b) => (cmp(a, b) <= 0 ? text(units(a)) : text(units(b)));
export const max = (a, b) => (cmp(a, b) >= 0 ? text(units(a)) : text(units(b)));

/** Places after the point in a step such as "0.00001" (5) or "1" (0). */
export function decimalsOf(step) {
  const [, fraction = ''] = text(units(step)).split('.');
  return fraction.length;
}

/** Rounds to `decimals` places. */
export function round(a, decimals, mode = 'halfUp') {
  const factor = 10n ** BigInt(SCALE - decimals);
  return text(divRound(units(a), factor, mode) * factor);
}

/** Rounds to a multiple of `step` (tickSize, stepSize). */
export function roundToStep(a, step, mode = 'down') {
  const s = units(step);
  return text(divRound(units(a), s, mode) * s);
}

export const fitsStep = (a, step) => units(a) % units(step) === 0n;
export const fitsDecimals = (a, decimals) => units(a) % 10n ** BigInt(SCALE - decimals) === 0n;

/** A string with exactly `decimals` places, e.g. fixed("1616.0008", 2) === "1616.00". */
export function fixed(a, decimals, mode = 'halfUp') {
  const rounded = round(a, decimals, mode);
  const negative = rounded.startsWith('-');
  const [whole, fraction = ''] = rounded.replace('-', '').split('.');
  const body = decimals > 0 ? `${whole}.${fraction.padEnd(decimals, '0')}` : whole;
  return negative ? `-${body}` : body;
}

/** Share of `part` in `whole` as a percentage string, e.g. pct("1", "4", 1) === "25". */
export function pct(part, whole, decimals = 2, mode = 'halfUp') {
  if (units(whole) === 0n) return '0';
  return div(mul(part, '100'), whole, decimals, mode);
}

/** For drawing only: charts need numbers, money never does. */
export const toNumber = (a) => Number(text(units(a)));

export const normalize = (a) => text(units(a));
