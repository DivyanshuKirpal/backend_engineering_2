// useOrderFormPresenter (section 6, flow A; section 7, Order ticket): buy or
// sell, limit or market, price, amount and total, 25 to 100% of the free
// balance, what the engine will do against the live book, the most the fee
// can be, and the place button. order.rules checks the order before
// order.api.place sends it with an Idempotency-Key; the accepted order joins
// the open-orders store at once, as pending. Fields hold what was typed; every
// value sent is a decimal string.

import * as money from '../../models/domain/money.js';
import * as rules from '../../models/domain/order.rules.js';
import * as orderApi from '../../models/api/order.api.js';
import { freeByAsset, loadBalances } from '../../models/stores/balance.store.js';
import { mergeOrder } from '../../models/stores/order.store.js';
import { assetByCode } from '../../models/stores/asset.store.js';
import { session } from '../../models/stores/session.store.js';
import { amount, fixed, pair, plain, price as fmtPrice, qty } from '../formatters/number.format.js';
import { toast } from '../shared/toasts.js';

const SHARES = [25, 50, 75, 100];
const PARTIAL = /^\d*\.?\d*$/;

const clean = (text) => String(text ?? '').replace(/[\s,]/g, '');
const valid = (text) => money.isDecimal(text) && money.isPositive(text);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * market(): the market config. levels(): the live book ({ bids, asks }, best
 * first). onPlaced(order): after the API accepts an order.
 */
export function createOrderFormPresenter(p, { symbol, market, levels, onPlaced }) {
  let side = 'buy';
  let type = 'limit';
  let price = '';
  let quantity = '';
  let total = '';
  // Which of amount and total was typed last on a limit order; the other follows it.
  let driver = 'quantity';
  let seeded = false;
  let showErrors = false;
  let busy = false;
  let serverError = null;

  const tickDp = (m) => money.decimalsOf(m.tickSize);
  const stepDp = (m) => money.decimalsOf(m.stepSize);
  const decimals = (m) => ({ base: assetByCode(m.baseAsset)?.decimals ?? 8, quote: assetByCode(m.quoteAsset)?.decimals ?? 6 });

  function seed(m) {
    if (seeded || !m) return;
    seeded = true;
    price = fmtPrice(m.ticker.last, m.tickSize);
  }

  /** The amount a limit order would buy or sell, from whichever field drives it. */
  function limitQuantity(m) {
    if (driver === 'quantity') return clean(quantity);
    const t = clean(total);
    const pr = clean(price);
    if (!valid(t) || !valid(pr)) return '';
    return money.roundToStep(money.div(t, pr, 18, 'down'), m.stepSize, 'down');
  }

  function order(m) {
    if (type === 'limit') return { market: symbol, side, type, price: clean(price), quantity: limitQuantity(m) };
    if (side === 'buy') return { market: symbol, side, type, quoteQuantity: clean(total) };
    return { market: symbol, side, type, quantity: clean(quantity) };
  }

  function errorText(m, e) {
    if (!e) return null;
    switch (e.code) {
      case 'required': return null;
      case 'tick': return `Prices move in steps of ${plain(e.step)}. Try ${fmtPrice(e.suggestion, m.tickSize)}.`;
      case 'step': return `Amounts move in steps of ${plain(e.step)} ${m.baseAsset}. Try ${qty(e.suggestion, m.stepSize)}.`;
      case 'minQty': return `The smallest amount is ${qty(e.min, m.stepSize)} ${m.baseAsset}.`;
      case 'minNotional': return `An order must be worth at least ${plain(e.min)} ${m.quoteAsset}.`;
      case 'balance': return `This needs ${fixed(e.need, e.asset === m.baseAsset ? stepDp(m) : tickDp(m))} ${e.asset}; you have ${fixed(e.free, e.asset === m.baseAsset ? stepDp(m) : tickDp(m))} ${e.asset} free.`;
      default: return null;
    }
  }

  function requiredText(field, e) {
    if (e?.code !== 'required') return null;
    if (field === 'price') return 'Enter a price.';
    if (field === 'total') return 'Enter how much to spend.';
    return 'Enter an amount.';
  }

  /** "What the engine will do", in words. */
  function engineText(m, o, plan) {
    const base = m.baseAsset;
    const near = side === 'buy' ? 'bid' : 'ask';
    const other = side === 'buy' ? 'sell' : 'buy';
    if (plan.kind === 'rest') {
      const at = fmtPrice(o.price, m.tickSize);
      const fills = `It fills when a ${other} order crosses that price.`;
      if (plan.place === 'newBest') return `Rest at ${at} as the new best ${near}, first in its queue. ${fills}`;
      if (plan.place === 'join') return `Join the best ${near} at ${at}, behind ${qty(plan.ahead, m.stepSize)} ${base} already there. ${fills}`;
      const where = `${plural(plan.levelsAbove, 'level')} ${side === 'buy' ? 'below the best bid' : 'above the best ask'}`;
      const queue = money.isPositive(plan.ahead) ? `behind ${qty(plan.ahead, m.stepSize)} ${base} at that price` : 'first in its queue';
      return `Rest at ${at}, ${where}, ${queue}. ${fills}`;
    }
    if (plan.kind === 'take') {
      const filled = `${qty(plan.filled, m.stepSize)} ${base}`;
      const avg = fmtPrice(money.round(plan.avgPrice, tickDp(m)), m.tickSize);
      const across = plural(plan.levels, 'level');
      if (type === 'market' && side === 'buy') {
        const spent = fixed(plan.spent, tickDp(m));
        return `Fill now as a taker: about ${filled} for ${spent} ${m.quoteAsset}, ${avg} on average, across ${across}.`;
      }
      if (plan.rest && money.isPositive(plan.rest)) {
        const rest = `${qty(plan.rest, m.stepSize)} ${base}`;
        return type === 'market'
          ? `Fill ${filled} now as a taker, ${avg} on average. The book can't take the other ${rest}, so that part is cancelled.`
          : `Fill ${filled} now as a taker, ${avg} on average, then rest ${rest} at ${fmtPrice(o.price, m.tickSize)}.`;
      }
      return `Fill now as a taker: ${filled} across ${across}, ${avg} on average.`;
    }
    return `Nothing to match: the book has no ${side === 'buy' ? 'sell' : 'buy'} orders.`;
  }

  return {
    vm() {
      const m = market();
      if (!m) return { status: 'loading' };
      seed(m);
      const user = session.get().user;
      if (session.get().status !== 'user') return { status: 'guest', next: `/trade/${symbol}`, pair: pair(symbol) };

      const halted = m.status !== 'active';
      const frozen = user?.status === 'frozen';
      const free = freeByAsset();
      const o = order(m);
      const check = rules.validate(m, o, free);
      const errors = check.errors;
      const book = levels();

      const hasAmount = type === 'market' && side === 'buy' ? valid(o.quoteQuantity) : valid(o.quantity ?? '');
      const plan = !halted && hasAmount && (type === 'market' || valid(o.price)) ? rules.engineWillDo(m, o, book) : null;

      // The two fields that follow from the typed ones
      let quantityText = quantity;
      let totalText = total;
      if (type === 'limit') {
        if (driver === 'total') quantityText = valid(o.quantity) ? qty(o.quantity, m.stepSize) : '';
        else totalText = valid(o.price) && valid(o.quantity) ? fixed(money.mul(o.price, o.quantity), tickDp(m)) : '';
      } else if (side === 'buy') {
        quantityText = plan?.kind === 'take' ? `≈ ${qty(plan.filled, m.stepSize)}` : '';
      } else {
        totalText = plan?.kind === 'take' ? `≈ ${fixed(plan.spent, tickDp(m))}` : '';
      }

      // The share buttons light only when the amount is exactly that share
      const shares = SHARES.map((share) => {
        const target = rules.amountForShare(m, { side, type, price: o.price }, free, share);
        const current = type === 'market' && side === 'buy' ? o.quoteQuantity : o.quantity;
        const wanted = type === 'market' && side === 'buy' ? target.quoteQuantity : target.quantity;
        return {
          key: String(share),
          label: `${share}%`,
          name: `${share}% of your free ${side === 'buy' ? m.quoteAsset : m.baseAsset}`,
          current: Boolean(wanted && valid(current ?? '') && money.isPositive(wanted) && money.eq(current, wanted)),
        };
      });

      // The fee line: the most it can be, at the taker rate
      let fee = null;
      const d = decimals(m);
      if (type === 'limit') {
        const most = rules.feeAtMost(m, o, d);
        if (most && hasAmount) fee = `${amount(most.amount, most.asset === m.baseAsset ? d.base : d.quote)} ${most.asset}`;
      } else if (plan?.kind === 'take') {
        const basis = side === 'buy' ? plan.filled : plan.spent;
        const dp = side === 'buy' ? d.base : d.quote;
        fee = `≈ ${amount(money.round(money.mul(basis, m.takerFeeRate, 'up'), dp, 'ceil'), dp)} ${side === 'buy' ? m.baseAsset : m.quoteAsset}`;
      }

      const sideWord = side === 'buy' ? 'buy' : 'sell';
      let button = `Place ${sideWord}`;
      if (hasAmount) {
        button += type === 'market' && side === 'buy'
          ? ` · ${fixed(o.quoteQuantity, tickDp(m))} ${m.quoteAsset}`
          : ` · ${qty(o.quantity, m.stepSize)} ${m.baseAsset}`;
      }
      if (halted) button = 'Market halted';
      else if (frozen) button = 'Account frozen';
      else if (busy) button = 'Placing…';

      const freeAsset = side === 'buy' ? m.quoteAsset : m.baseAsset;
      const freeAmount = free[freeAsset] ?? '0';

      return {
        status: 'ready',
        side,
        type,
        sides: [
          { key: 'buy', label: 'Buy', tone: 'buy', current: side === 'buy' },
          { key: 'sell', label: 'Sell', tone: 'sell', current: side === 'sell' },
        ],
        types: [
          { key: 'limit', label: 'Limit', current: type === 'limit' },
          { key: 'market', label: 'Market', current: type === 'market' },
        ],
        free: { amount: fixed(freeAmount, side === 'buy' ? tickDp(m) : stepDp(m)), asset: freeAsset },
        price: {
          value: type === 'limit' ? price : '',
          placeholder: type === 'limit' ? '0.00' : 'Best on the book',
          unit: m.quoteAsset,
          disabled: type === 'market' || halted || frozen,
          error: showErrors ? (requiredText('price', errors.price) ?? errorText(m, errors.price)) : errorText(m, errors.price?.code === 'tick' ? errors.price : null),
        },
        quantity: {
          value: quantityText,
          placeholder: money.fixed('0', stepDp(m)),
          unit: m.baseAsset,
          disabled: (type === 'market' && side === 'buy') || halted || frozen,
          error: showErrors ? (requiredText('quantity', errors.quantity) ?? errorText(m, errors.quantity)) : errorText(m, errors.quantity?.code === 'step' ? errors.quantity : null),
        },
        total: {
          value: totalText,
          placeholder: money.fixed('0', tickDp(m)),
          unit: m.quoteAsset,
          disabled: (type === 'market' && side === 'sell') || halted || frozen,
          error: showErrors ? (requiredText('total', errors.total) ?? errorText(m, errors.total)) : null,
        },
        shares,
        sharesDisabled: halted || frozen,
        engine: halted
          ? `${pair(symbol)} is halted, so new orders are paused. You can still cancel the ones you have open.`
          : plan
            ? engineText(m, o, plan)
            : 'Enter an amount to see whether this order rests on the book or fills now.',
        fee,
        formError: serverError ?? (showErrors ? errorText(m, errors.form) : null),
        button: { label: button, tone: halted || frozen ? 'muted' : side, disabled: busy || halted || frozen },
        busy,
      };
    },
    actions: {
      setSide(next) {
        if (next === side) return;
        side = next;
        serverError = null;
        p.changed();
      },
      setType(next) {
        if (next === type) return;
        type = next;
        serverError = null;
        showErrors = false;
        if (type === 'market' && side === 'buy') {
          quantity = '';
        }
        driver = 'quantity';
        total = '';
        p.changed();
      },
      setPrice(text) {
        if (PARTIAL.test(clean(text))) price = text;
        serverError = null;
        p.changed();
      },
      setQuantity(text) {
        if (PARTIAL.test(clean(text))) {
          quantity = text;
          driver = 'quantity';
        }
        serverError = null;
        p.changed();
      },
      setTotal(text) {
        if (PARTIAL.test(clean(text))) {
          total = text;
          driver = 'total';
        }
        serverError = null;
        p.changed();
      },
      /** A ladder row's price, from the order book. */
      usePrice(value) {
        const m = market();
        if (!m) return;
        type = 'limit';
        price = fmtPrice(value, m.tickSize);
        serverError = null;
        p.changed();
      },
      useShare(share) {
        const m = market();
        if (!m) return;
        const target = rules.amountForShare(m, { side, type, price: clean(price) }, freeByAsset(), Number(share));
        if (target.quoteQuantity != null) {
          total = fixed(target.quoteQuantity, tickDp(m));
          driver = 'total';
        } else if (target.quantity != null) {
          quantity = qty(target.quantity, m.stepSize);
          driver = 'quantity';
        } else {
          showErrors = true;
        }
        serverError = null;
        p.changed();
      },
      async submit() {
        const m = market();
        if (!m || busy) return;
        showErrors = true;
        const o = order(m);
        const check = rules.validate(m, o, freeByAsset());
        if (!check.ok) {
          p.changed();
          return;
        }
        busy = true;
        serverError = null;
        p.changed();
        try {
          const { order: placed } = await orderApi.place(o);
          mergeOrder(placed);
          const what = placed.type === 'market' && placed.side === 'buy'
            ? `Buy ${m.baseAsset} for ${fixed(placed.quoteQuantity, tickDp(m))} ${m.quoteAsset} at the market`
            : `${placed.side === 'buy' ? 'Buy' : 'Sell'} ${qty(placed.quantity, m.stepSize)} ${m.baseAsset} ${placed.type === 'limit' ? `at ${fmtPrice(placed.price, m.tickSize)}` : 'at the market'}`;
          toast({ title: 'Order placed', body: `${what}. The engine takes it from here.`, tone: 'success' });
          quantity = '';
          total = '';
          driver = 'quantity';
          showErrors = false;
          onPlaced?.(placed);
        } catch (err) {
          serverError = err?.message ?? 'The order wasn\'t placed. Try again.';
          if (err?.code === 'INSUFFICIENT_BALANCE') loadBalances();
        } finally {
          busy = false;
          p.changed();
        }
      },
    },
  };
}
