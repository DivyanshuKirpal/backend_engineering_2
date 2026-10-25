// Dates and times for display (section 7, Display rules), always in the
// browser's own time zone: lifecycle times with milliseconds (14:05:42.081),
// lists as 25 Oct 14:32, waits as 2 h 14 m.

const at = (iso) => (iso instanceof Date ? iso : new Date(iso));
const two = (n) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = 86400000;

/** 25 Oct */
export function dayMonth(iso) {
  const d = at(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** 24 Oct 2026 */
export function fullDate(iso) {
  const d = at(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** 14:32 */
export function hourMinute(iso) {
  const d = at(iso);
  return `${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** 14:32:10 */
export function clock(iso) {
  const d = at(iso);
  return `${hourMinute(d)}:${two(d.getSeconds())}`;
}

/** 14:05:42.081, for an order's lifecycle */
export function precise(iso) {
  const d = at(iso);
  return `${clock(d)}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

/** 25 Oct 14:32, for lists */
export const listTime = (iso) => `${dayMonth(iso)} ${hourMinute(iso)}`;

/** 25 Oct 14:32:10, for the ledger */
export const ledgerTime = (iso) => `${dayMonth(iso)} ${clock(iso)}`;

/** 24 Oct, 12:05 */
export const dayTime = (iso) => `${dayMonth(iso)}, ${hourMinute(iso)}`;

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

/** "today, 08:02", "yesterday, 21:40", or "24 Oct, 21:40" */
export function relativeDay(iso, now = new Date()) {
  const days = Math.round((startOfDay(now) - startOfDay(at(iso))) / DAY);
  if (days === 0) return `today, ${hourMinute(iso)}`;
  if (days === 1) return `yesterday, ${hourMinute(iso)}`;
  return dayTime(iso);
}

/** How long something has waited: "5 m", "52 m", "2 h 14 m", "3 h 02 m", "2 d 4 h". */
export function waited(iso, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - at(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes} m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ${two(minutes % 60)} m`;
  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}

/** "2 s ago", "4 min ago" */
export function ago(iso, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - at(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds} s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.round(minutes / 60)} h ago`;
}

/** Whole years since a date of birth (YYYY-MM-DD). */
export function age(dateOfBirth, now = new Date()) {
  const [y, m, d] = String(dateOfBirth).split('-').map(Number);
  let years = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) years -= 1;
  return years;
}

/** A date of birth as 17 Apr 2001 (no time zone shift: it is a calendar date). */
export function birthDate(dateOfBirth) {
  const [y, m, d] = String(dateOfBirth).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** A calendar day (YYYY-MM-DD) as 11 Oct. */
export function calendarDay(day) {
  const [, m, d] = String(day).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/**
 * A candle chart's time label: the date on a day's first candle (21:00,
 * 25 Oct, 03:00), and always for daily candles. `previous` is the candle before.
 */
export function candleLabel(unixSeconds, previousSeconds, intervalSeconds) {
  const d = new Date(unixSeconds * 1000);
  if (intervalSeconds >= 86400) return dayMonth(d);
  const before = previousSeconds == null ? null : new Date(previousSeconds * 1000);
  return before && before.toDateString() !== d.toDateString() ? dayMonth(d) : hourMinute(d);
}

/** Seconds since 1970 on the local clock, to find round local times (03:00, midnight). */
export const localSeconds = (unixSeconds) => unixSeconds - new Date(unixSeconds * 1000).getTimezoneOffset() * 60;
