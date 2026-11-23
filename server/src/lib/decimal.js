// Money between the two forms the server uses: decimal strings in the code and
// the API ("1616.000800"), Decimal128 in MongoDB. Decimal128 is an exact
// decimal type that also keeps trailing zeros; a JavaScript number is a binary
// float and can't hold 0.1 exactly. No value passes through a number here.

import mongoose from 'mongoose';

const { Decimal128 } = mongoose.Types;

/** "1616.000800" -> Decimal128; null stays null. */
export const toDecimal = (text) => (text == null ? null : Decimal128.fromString(String(text)));

/** How many decimals an amount is written with: "1616.000800" -> 6. (money.decimalsOf drops trailing zeros.) */
export const writtenDecimals = (text) => text.split('.')[1]?.length ?? 0;

/**
 * Decimal128 -> "1616.000800", with the same digits and decimals; null stays
 * null. Decimal128's own toString() writes small amounts with an exponent
 * ("0E-8" for 0.00000000, "1.0E-7" for 0.00000010), which money.js doesn't
 * read, so those are written out here by moving the decimal point.
 */
export function fromDecimal(value) {
  if (value == null) return null;
  const text = value.toString();
  const match = /^(-?)(\d+)(?:\.(\d+))?E([+-]?\d+)$/.exec(text);
  if (!match) return text;
  const [, sign, whole, fraction = '', exponent] = match;
  const digits = whole + fraction;
  const decimals = fraction.length - Number(exponent); // the exponent is a count of places, not an amount
  if (decimals <= 0) return `${sign}${digits}${'0'.repeat(-decimals)}`;
  const padded = digits.padStart(decimals + 1, '0');
  return `${sign}${padded.slice(0, -decimals)}.${padded.slice(-decimals)}`;
}
