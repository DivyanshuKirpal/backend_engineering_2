// Numbers for display (section 7, Display rules). Input is always a decimal
// string from the API; output is text a view prints as it is. Rounding goes
// through money.js, so no float decides a digit. Negative numbers use a true
// minus sign (−).

import * as money from '../../models/domain/money.js';

const MINUS = '−';

/** Groups the whole part with commas: "6823.50" -> "6,823.50". */
export function grouped(text) {
  const negative = text.startsWith('-');
  const [whole, fraction] = text.replace('-', '').split('.');
  const body = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction != null ? `.${fraction}` : '');
  return negative && !/^0(\.0*)?$/.test(text.replace('-', '')) ? `${MINUS}${body}` : body;
}

/** Fixed decimals, grouped: fixed("1616.0008", 2) -> "1,616.00". */
export function fixed(value, decimals, mode = 'halfUp') {
  if (value == null || value === '' || !money.isDecimal(String(value))) return '—';
  return grouped(money.fixed(String(value), decimals, mode));
}

/** A price at the market's tick: price("62140.5", "0.01") -> "62,140.50". */
export const price = (value, tickSize) => fixed(value, money.decimalsOf(tickSize));

/** A quantity at the market's step, for the ticket and the ladder (0.0374375 -> "0.03744"). */
export const qty = (value, stepSize, mode = 'halfUp') => fixed(value, money.decimalsOf(stepSize), mode);

/** Volumes in millions, as the markets table shows them: "870129.70" -> "0.87M". */
export const millions = (value, decimals = 2) => (money.isDecimal(String(value ?? '')) ? `${fixed(money.div(String(value), '1000000', 18), decimals)}M` : '—');

/** An amount at the asset's decimals, for wallet and ledger tables. */
export const amount = (value, decimals) => fixed(value, decimals);

/**
 * A signed change: "+624.000000", "−0.02500000". `zero` is what to show for
 * zero ("—" on History, "0" on the trade page).
 */
export function signed(value, decimals, { zero = '0' } = {}) {
  if (value == null || !money.isDecimal(String(value))) return '—';
  if (money.isZero(value)) return zero;
  const text = fixed(money.abs(value), decimals);
  return money.isNegative(value) ? `${MINUS}${text}` : `+${text}`;
}

/**
 * A 24-hour change: "1.84" -> { arrow: "▲", text: "+1.84%", tone: "up" }.
 * The arrow and the sign both carry the direction, so colour isn't the only clue.
 */
export function change(pct) {
  const value = money.isDecimal(String(pct ?? '')) ? String(pct) : '0';
  const abs = fixed(money.abs(value), 2);
  if (money.isZero(money.round(value, 2))) return { arrow: '', text: `${abs}%`, tone: 'flat', label: 'unchanged' };
  if (money.isNegative(value)) return { arrow: '▼', text: `${MINUS}${abs}%`, tone: 'down', label: `down ${abs}%` };
  return { arrow: '▲', text: `+${abs}%`, tone: 'up', label: `up ${abs}%` };
}

/** Millions and thousands: "10430315.52" -> "10.43M"; 1 decimal for chart labels. */
export function compact(value, decimals = 2) {
  if (!money.isDecimal(String(value ?? ''))) return '—';
  const v = String(value);
  if (money.gte(money.abs(v), '1000000')) return `${fixed(money.div(v, '1000000', 18), decimals)}M`;
  if (money.gte(money.abs(v), '1000')) return `${fixed(money.div(v, '1000', 18), decimals)}K`;
  return fixed(v, decimals);
}

/** Five significant figures: 168.37204 -> "168.37", 13504.118 -> "13,504". */
export function significant(value, figures = 5) {
  if (!money.isDecimal(String(value ?? ''))) return '—';
  const v = String(value);
  const whole = money.abs(money.round(v, 0, 'down')).length;
  const decimals = Math.max(0, figures - (money.lt(money.abs(v), '1') ? 0 : whole));
  return fixed(v, decimals);
}

/** A percentage share with one decimal: "56.2%". */
export const share = (pct, decimals = 1) => `${fixed(pct, decimals)}%`;

/** Ids shorten to their first and last four characters in capitals: 66F3·A91C. */
export function shortId(id) {
  const s = String(id ?? '');
  return s.length > 8 ? `${s.slice(0, 4)}·${s.slice(-4)}`.toUpperCase() : s.toUpperCase();
}

/** Addresses and hashes shorten in the middle: sim-usdt-2be4…a0c1, 0x9c1e…41ab. */
export function shortAddress(address) {
  const s = String(address ?? '');
  const sim = /^(sim-[a-z]+-)([0-9a-f]{16})$/.exec(s);
  if (sim) return `${sim[1]}${sim[2].slice(0, 4)}…${sim[2].slice(-4)}`;
  if (/^0x[0-9a-f]{12,}$/i.test(s)) return `${s.slice(0, 6)}…${s.slice(-4)}`;
  return s.length > 16 ? `${s.slice(0, 8)}…${s.slice(-4)}` : s;
}

/** A fee rate as a percentage: "0.0008" -> "0.08%". */
export const rate = (value, decimals = 2) => `${fixed(money.mul(value, '100'), decimals)}%`;

/** Pairs read BTC/USDT; symbols and routes stay BTC-USDT. */
export const pair = (symbol) => String(symbol ?? '').replace('-', '/');

/** Bytes as MB for the system page: 42991616 -> "41". */
export const megabytes = (bytes) => String(Math.round(Number(bytes) / 1048576));
