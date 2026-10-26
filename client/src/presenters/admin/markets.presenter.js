// useAdminMarketsPresenter (section 5, AdminMarketsPage): every market from
// GET /admin/markets with its fees and limits. Fees and minimums can be edited
// at any time, the tick and step sizes only while a market is halted with no
// open orders (section 3). Halt, optionally cancelling every open order, and
// resume, each after a confirmation. The create form checks section 4's rules
// plus "quoted in USDT"; in this phase every asset already has its market, so
// it can't create one, and the page says why.

import * as money from '../../models/domain/money.js';
import { QUOTE_ASSET, assetsWithoutMarket, validateConfig, validateNewMarket } from '../../models/domain/market.rules.js';
import * as adminApi from '../../models/api/admin.api.js';
import { createPresenter } from '../shared/presenter.js';
import { toast, errorToast } from '../shared/toasts.js';
import { pair, plain, rate } from '../formatters/number.format.js';
import { marketStatus } from '../formatters/status.format.js';
import { tile } from '../formatters/asset.format.js';

const LABELS = {
  makerFeeRate: 'Maker fee',
  takerFeeRate: 'Taker fee',
  minNotional: 'Smallest order',
  minQty: 'Smallest amount',
  tickSize: 'Price step',
  stepSize: 'Amount step',
};
const FEES = new Set(['makerFeeRate', 'takerFeeRate']);
const RULES = new Set(['tickSize', 'stepSize']);

/** Typed text to a decimal string: grouping commas go, a fee's percent becomes a rate. */
function toValue(field, text) {
  const bare = String(text ?? '').replace(/,/g, '').trim();
  if (!FEES.has(field) || !money.isDecimal(bare)) return bare;
  return money.div(bare, '100');
}
const percent = (r) => money.normalize(money.mul(r, '100'));

function message(field, e, ctx) {
  switch (e.code) {
    case 'required':
      if (field === 'baseAsset') return ctx.noneFree ? `Every asset already has a ${QUOTE_ASSET} market.` : 'Pick an asset.';
      return `Enter the ${LABELS[field].toLowerCase()}.`;
    case 'powerOfTen': return 'Use a power of ten, such as 0.01 or 1.';
    case 'tooFine': return FEES.has(field) ? `Use at most ${e.decimals} decimals.` : `Use at most ${e.decimals} decimals, as ${field === 'stepSize' ? ctx.base : QUOTE_ASSET} has.`;
    case 'step': return `Use a multiple of the amount step, ${plain(e.step)}.`;
    case 'feeRange': return 'Use a fee from 0% to under 100%.';
    case 'unknown': return 'There\'s no such asset.';
    case 'isQuote': return `${QUOTE_ASSET} can't be quoted in itself.`;
    case 'taken': return `${pair(e.symbol)} already exists.`;
    case 'quote': return `Every market is quoted in ${QUOTE_ASSET}.`;
    default: return 'This isn\'t valid.';
  }
}

export function createAdminMarketsPresenter() {
  const p = createPresenter();
  let list = { status: 'loading', markets: [] };
  let assets = [];
  let form = null;
  let confirm = null;

  async function load() {
    try {
      const [m, a] = await Promise.all([adminApi.markets(), adminApi.assets()]);
      if (p.disposed) return;
      list = { status: 'ready', markets: m.markets };
      assets = a.assets;
    } catch {
      if (p.disposed) return;
      list = { ...list, status: 'error' };
    }
    p.changed();
  }
  load();

  const find = (symbol) => list.markets.find((m) => m.symbol === symbol) ?? null;
  const decimalsOf = (code) => assets.find((a) => a.code === code)?.decimals;
  const free = () => assetsWithoutMarket(assets, list.markets);

  /** The form's values as the API takes them. */
  function body() {
    return Object.fromEntries(Object.keys(LABELS).map((f) => [f, toValue(f, form.values[f])]));
  }

  function formVm() {
    if (!form) return null;
    const m = form.symbol ? find(form.symbol) : null;
    const base = m?.baseAsset ?? form.values.baseAsset ?? '';
    const halted = m?.status === 'halted';
    const options = free().map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` }));
    const field = (key, unit, extra = {}) => ({ id: `market-${key}`, key, label: LABELS[key], value: form.values[key], unit, error: form.errors[key] ?? null, ...extra });
    return {
      mode: form.mode,
      title: m ? `Edit ${pair(m.symbol)}` : 'New market',
      busy: form.busy,
      error: form.error,
      submitLabel: m ? 'Save changes' : 'Create market',
      base: m ? null : {
        value: form.values.baseAsset,
        options: options.length ? options : [{ value: '', label: 'None without a market', disabled: true }],
        error: form.errors.baseAsset ?? null,
        hint: options.length ? null : `${assets.filter((a) => a.code !== QUOTE_ASSET).map((a) => a.code).join(', ')} each have one. Adding an asset comes with the Assets page.`,
      },
      quote: m ? null : { value: QUOTE_ASSET, options: [{ value: QUOTE_ASSET, label: QUOTE_ASSET }], hint: `Every market is quoted in ${QUOTE_ASSET}.` },
      fees: [field('makerFeeRate', '%'), field('takerFeeRate', '%')],
      limits: [field('minNotional', QUOTE_ASSET), field('minQty', base)],
      rules: [field('tickSize', QUOTE_ASSET), field('stepSize', base)].map((f) => ({
        ...f,
        disabled: Boolean(m) && !halted,
        hint: m ? (halted ? 'Changes only with no open orders on the market.' : 'Halt the market to change this.') : null,
      })),
      feeNote: m ? 'Fee changes apply to new trades only.' : null,
    };
  }

  return {
    get vm() {
      const markets = list.markets;
      const halted = markets.filter((m) => m.status === 'halted').length;
      const open = free();
      return {
        status: list.status,
        subtitle: list.status === 'ready' ? `${markets.length} markets · ${halted} halted · every one quoted in ${QUOTE_ASSET}` : null,
        rows: markets.map((m) => ({
          key: m.symbol,
          tile: tile(m.baseAsset),
          market: pair(m.symbol),
          status: marketStatus(m.status),
          maker: rate(m.makerFeeRate),
          taker: rate(m.takerFeeRate),
          minOrder: `${plain(m.minNotional)} ${m.quoteAsset}`,
          minQty: `${plain(m.minQty)} ${m.baseAsset}`,
          tick: plain(m.tickSize),
          step: plain(m.stepSize),
          halted: m.status === 'halted',
          canPause: m.status !== 'delisted',
        })),
        create: open.length
          ? { possible: true, title: 'New markets', body: `${open.map((a) => a.code).join(', ')} can get a ${QUOTE_ASSET} market.` }
          : {
            possible: false,
            title: 'Nothing to create yet',
            body: `A market pairs an asset with ${QUOTE_ASSET}, and every asset here (${assets.filter((a) => a.code !== QUOTE_ASSET).map((a) => a.code).join(', ')}) already has one. Adding an asset comes with the Assets page, a later step.`,
          },
        form: formVm(),
        confirm,
      };
    },
    actions: {
      retry() {
        list = { ...list, status: 'loading' };
        p.changed();
        load();
      },
      startEdit(symbol) {
        const m = find(symbol);
        if (!m) return;
        form = {
          mode: 'edit',
          symbol,
          values: {
            makerFeeRate: percent(m.makerFeeRate),
            takerFeeRate: percent(m.takerFeeRate),
            minNotional: money.normalize(m.minNotional),
            minQty: money.normalize(m.minQty),
            tickSize: money.normalize(m.tickSize),
            stepSize: money.normalize(m.stepSize),
          },
          errors: {},
          error: null,
          busy: false,
        };
        p.changed();
      },
      startCreate() {
        form = {
          mode: 'create',
          symbol: null,
          values: { baseAsset: free()[0]?.code ?? '', makerFeeRate: '0.08', takerFeeRate: '0.1', minNotional: '5', minQty: '', tickSize: '0.01', stepSize: '' },
          errors: {},
          error: null,
          busy: false,
        };
        p.changed();
      },
      setField(key, value) {
        if (!form) return;
        form = { ...form, values: { ...form.values, [key]: value }, errors: { ...form.errors, [key]: null }, error: null };
        p.changed();
      },
      closeForm() {
        form = null;
        p.changed();
      },
      async submitForm() {
        if (!form || form.busy) return;
        const m = form.symbol ? find(form.symbol) : null;
        const values = body();
        const ctx = { noneFree: !free().length, base: m?.baseAsset ?? (form.values.baseAsset || 'the asset') };
        let errors;
        let request;
        if (m) {
          const changes = Object.fromEntries(Object.entries(values).filter(([f, v]) => !money.isDecimal(v) || !money.eq(v, m[f])));
          if (!Object.keys(changes).length) {
            form = null;
            p.changed();
            return;
          }
          const found = validateConfig({ ...m, ...changes }, { base: decimalsOf(m.baseAsset) ?? 8, quote: decimalsOf(m.quoteAsset) ?? 6 });
          errors = Object.fromEntries(Object.entries(found).filter(([f]) => f in changes || (f === 'minQty' && 'stepSize' in changes)));
          request = { changes, run: () => adminApi.updateMarket(m.symbol, changes) };
        } else {
          const draft = { ...values, baseAsset: form.values.baseAsset, quoteAsset: QUOTE_ASSET, symbol: `${form.values.baseAsset}-${QUOTE_ASSET}` };
          errors = validateNewMarket(draft, assets, list.markets);
          request = { run: () => adminApi.createMarket(draft) };
        }
        if (Object.keys(errors).length) {
          form = { ...form, errors: Object.fromEntries(Object.entries(errors).map(([f, e]) => [f, message(f, e, ctx)])) };
          p.changed();
          return;
        }
        form = { ...form, busy: true };
        p.changed();
        try {
          const { market } = await request.run();
          const changed = Object.keys(request.changes ?? {}).map((f) => LABELS[f].toLowerCase());
          const said = changed.length > 1 ? `${changed.slice(0, -1).join(', ')} and ${changed.at(-1)}` : changed[0];
          toast({
            title: m ? `${pair(market.symbol)} updated` : `${pair(market.symbol)} created`,
            body: m ? `${said[0].toUpperCase()}${said.slice(1)} changed.${changed.some((c) => c.endsWith('fee')) ? ' New trades use the new fees.' : ''}` : '',
            tone: 'success',
          });
          form = null;
          await load();
        } catch (err) {
          const details = err?.details && typeof err.details === 'object' ? Object.entries(err.details).filter(([f]) => f in LABELS || f === 'baseAsset' || f === 'quoteAsset') : [];
          if (form && details.length) {
            form = { ...form, busy: false, errors: { ...form.errors, ...Object.fromEntries(details.map(([f, code]) => [f, code === 'live' ? err.message : message(f, { code }, ctx)])) } };
          } else if (form) {
            form = { ...form, busy: false, error: err?.message ?? 'That didn\'t work.' };
          }
        }
        p.changed();
      },
      askHalt(symbol) {
        const m = find(symbol);
        if (!m) return;
        confirm = {
          kind: 'halt',
          symbol,
          title: `Halt ${pair(symbol)}?`,
          body: 'No new orders can be placed. Orders already on the book stay there and can still be cancelled, and the market maker pulls its ladder.',
          confirmLabel: 'Halt market',
          cancelLabel: 'Keep it open',
          tone: 'danger',
          cancelOrders: false,
          cancelOrdersLabel: `Also cancel every open order on ${pair(symbol)}`,
          busy: false,
        };
        p.changed();
      },
      askResume(symbol) {
        const m = find(symbol);
        if (!m) return;
        confirm = {
          kind: 'resume',
          symbol,
          title: `Resume ${pair(symbol)}?`,
          body: 'Orders can be placed again, and the market maker quotes again.',
          confirmLabel: 'Resume',
          cancelLabel: 'Not yet',
          tone: 'buy',
          busy: false,
        };
        p.changed();
      },
      setCancelOrders(on) {
        if (!confirm) return;
        confirm = { ...confirm, cancelOrders: Boolean(on) };
        p.changed();
      },
      cancelConfirm() {
        confirm = null;
        p.changed();
      },
      async runConfirm() {
        if (!confirm || confirm.busy) return;
        const { kind, symbol, cancelOrders } = confirm;
        confirm = { ...confirm, busy: true };
        p.changed();
        try {
          await adminApi.updateMarket(symbol, kind === 'halt' ? { status: 'halted', cancelOpenOrders: cancelOrders } : { status: 'active' });
          toast(kind === 'halt'
            ? { title: `${pair(symbol)} halted`, body: cancelOrders ? 'Every open order on it was cancelled.' : 'Orders on the book stay there until their owners cancel them.', tone: 'info' }
            : { title: `${pair(symbol)} resumed`, body: 'Orders can be placed again.', tone: 'success' });
          confirm = null;
          await load();
        } catch (err) {
          confirm = null;
          errorToast(kind === 'halt' ? 'The market wasn\'t halted' : 'The market wasn\'t resumed', err);
        }
        p.changed();
      },
    },
    subscribe: p.subscribe,
    dispose: p.dispose,
  };
}
