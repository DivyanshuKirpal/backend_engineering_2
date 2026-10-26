// Market rules (sections 3 and 4): what a market's fees and limits may be,
// and which new markets can be made. Every market is quoted in USDT (section
// 2, Convert). The admin form checks these for instant feedback and the mock
// server checks them again; only the server's answer counts.

import * as money from './money.js';

export const QUOTE_ASSET = 'USDT';
export const CONFIG_FIELDS = ['makerFeeRate', 'takerFeeRate', 'minNotional', 'minQty', 'tickSize', 'stepSize'];
// Rates travel with up to 6 decimals: 0.000125 is 0.0125%
const RATE_DECIMALS = 6;
const POWER_OF_TEN = /^(10*|0\.0*1)$/;

const isNumber = (v) => money.isDecimal(String(v ?? ''));
export const isPowerOfTen = (v) => isNumber(v) && POWER_OF_TEN.test(money.normalize(String(v).trim()));

/**
 * Checks a market's six settings, as decimal strings (fee rates as rates:
 * 0.001 is 0.10%). `decimals` gives the base and quote assets' decimals.
 * Returns errors keyed by field, each { code, ...values }.
 */
export function validateConfig(config, { base = 8, quote = 6 } = {}) {
  const errors = {};
  for (const [field, assetDecimals] of [['tickSize', quote], ['stepSize', base]]) {
    const v = config[field];
    if (!isNumber(v) || !money.isPositive(v)) errors[field] = { code: 'required' };
    else if (!isPowerOfTen(v)) errors[field] = { code: 'powerOfTen' };
    else if (money.decimalsOf(v) > assetDecimals) errors[field] = { code: 'tooFine', decimals: assetDecimals };
  }
  if (!isNumber(config.minQty) || !money.isPositive(config.minQty)) errors.minQty = { code: 'required' };
  else if (!errors.stepSize && !money.fitsStep(config.minQty, config.stepSize)) errors.minQty = { code: 'step', step: config.stepSize };
  if (!isNumber(config.minNotional) || !money.isPositive(config.minNotional)) errors.minNotional = { code: 'required' };
  else if (!money.fitsDecimals(config.minNotional, quote)) errors.minNotional = { code: 'tooFine', decimals: quote };
  for (const field of ['makerFeeRate', 'takerFeeRate']) {
    const v = config[field];
    if (!isNumber(v)) errors[field] = { code: 'required' };
    else if (money.isNegative(v) || money.gte(v, '1')) errors[field] = { code: 'feeRange' };
    else if (!money.fitsDecimals(v, RATE_DECIMALS)) errors[field] = { code: 'tooFine', decimals: RATE_DECIMALS - 2 };
  }
  return errors;
}

/** Assets that could get a new market: active, not the quote asset, and without one yet. */
export function assetsWithoutMarket(assets, markets) {
  return assets.filter((a) => a.code !== QUOTE_ASSET && a.status === 'active' && !markets.some((m) => m.baseAsset === a.code && m.status !== 'delisted'));
}

/**
 * Checks a new market (section 4, POST /admin/markets): both assets exist,
 * it is quoted in USDT, the pair is new, and its settings pass validateConfig.
 */
export function validateNewMarket(body, assets, markets) {
  const base = assets.find((a) => a.code === body.baseAsset);
  const quote = assets.find((a) => a.code === body.quoteAsset);
  const errors = validateConfig(body, { base: base?.decimals ?? 8, quote: quote?.decimals ?? 6 });
  if (!body.baseAsset) errors.baseAsset = { code: 'required' };
  else if (!base) errors.baseAsset = { code: 'unknown' };
  else if (body.baseAsset === QUOTE_ASSET) errors.baseAsset = { code: 'isQuote' };
  else if (markets.some((m) => m.baseAsset === body.baseAsset && m.status !== 'delisted')) errors.baseAsset = { code: 'taken', symbol: `${body.baseAsset}-${QUOTE_ASSET}` };
  if (body.quoteAsset !== QUOTE_ASSET) errors.quoteAsset = { code: 'quote' };
  if (body.symbol != null && body.symbol !== `${body.baseAsset}-${body.quoteAsset}`) errors.symbol = { code: 'symbol' };
  return errors;
}
