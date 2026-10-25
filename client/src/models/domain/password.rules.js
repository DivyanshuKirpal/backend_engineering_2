// Password strength (section 5, PasswordStrengthMeter): a 0-4 score from
// length and the kinds of characters used, and what would raise it.

export function strength(password) {
  const value = String(password ?? '');
  if (!value) return { score: 0, level: 'empty', missing: [] };
  const kinds = {
    lower: /[a-z]/.test(value),
    upper: /[A-Z]/.test(value),
    number: /\d/.test(value),
    symbol: /[^A-Za-z0-9]/.test(value),
  };
  const variety = Object.values(kinds).filter(Boolean).length;
  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (variety >= 2) score += 1;
  if (variety >= 3 && value.length >= 10) score += 1;
  if (value.length < 8) score = Math.min(score, 1);
  const levels = ['weak', 'weak', 'fair', 'good', 'strong'];
  const missing = [];
  if (!kinds.number && !kinds.symbol) missing.push('numberOrSymbol');
  if (value.length < 12) missing.push('length');
  return { score, level: levels[score], missing, longEnough: value.length >= 8 };
}

export const MIN_LENGTH = 8;
