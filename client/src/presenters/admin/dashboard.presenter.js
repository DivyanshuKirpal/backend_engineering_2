// useAdminDashboardPresenter (section 5, AdminDashboardPage): six numbers
// from GET /admin/stats (people only: bot accounts are left out of the user
// numbers), the traded volume of the last fourteen full days as bars or a
// table, and the first three of each queue, oldest first. It reloads every
// 30 seconds, and the waits age between loads.

import * as money from '../../models/domain/money.js';
import * as adminApi from '../../models/api/admin.api.js';
import { createPresenter, every } from '../shared/presenter.js';
import { walletAmount } from '../wallet/deposit.presenter.js';
import { amount, compact, fixed, millions } from '../formatters/number.format.js';
import { calendarDay, clock, waited } from '../formatters/date.format.js';
import { countryName, documentLabel } from '../formatters/status.format.js';

const QUEUE_PREVIEW = 3;
const MINUS = '−';

function niceStep(raw) {
  const power = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) if (m * power >= raw) return m * power;
  return 10 * power;
}

/** "+3.0%" against the day before, with a tone, or null without one. */
function dayOnDay(now, before) {
  if (!money.isDecimal(String(before ?? '')) || !money.isPositive(before)) return null;
  const pct = money.pct(money.sub(now, before), before, 1);
  if (money.isZero(pct)) return { text: '0.0%', tone: 'flat' };
  return money.isNegative(pct) ? { text: `${MINUS}${fixed(money.abs(pct), 1)}%`, tone: 'down' } : { text: `+${fixed(pct, 1)}%`, tone: 'up' };
}

const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);

export function createAdminDashboardPresenter() {
  const p = createPresenter();
  let status = 'loading';
  let stats = null;
  let kyc = null;
  let withdrawals = null;
  let updatedAt = null;
  let view = 'chart';

  async function load() {
    try {
      const [s, k, w] = await Promise.all([
        adminApi.stats(),
        adminApi.kyc({ status: 'pending', limit: QUEUE_PREVIEW }),
        adminApi.withdrawals({ status: 'pending', limit: QUEUE_PREVIEW }),
      ]);
      if (p.disposed) return;
      stats = s;
      kyc = k;
      withdrawals = w;
      status = 'ready';
      updatedAt = new Date().toISOString();
    } catch {
      if (p.disposed) return;
      if (!stats) status = 'error';
    }
    p.changed();
  }
  load();
  every(p, 30000, load);
  every(p, 15000, () => p.changed());

  function cards(s) {
    const queueCard = (key, label, count, oldestAt) => ({
      key,
      label,
      value: String(count),
      wait: count > 0 && oldestAt ? `Oldest waited ${waited(oldestAt)}` : null,
      note: count > 0 ? null : 'Nothing waiting',
      alert: count > 0,
    });
    return [
      { key: 'users', label: 'Users', value: String(s.users), delta: s.usersNew7d > 0 ? { text: `+${s.usersNew7d}`, tone: 'up' } : null, note: s.usersNew7d > 0 ? 'this week' : 'None new this week' },
      { key: 'volume', label: 'Volume, last 24 hours', value: millions(s.volume24h, 2), unit: 'USDT', delta: dayOnDay(s.volume24h, s.volumePrev24h), note: 'on the day before' },
      { key: 'fees', label: 'Fees, last 24 hours', value: amount(s.fees24h, 2), unit: 'USDT', note: 'Both sides of every fill, valued in USDT' },
      { key: 'orders', label: 'Open orders', value: String(s.openOrders), note: `${s.openOrdersBot} of them are the market maker's ladder` },
      queueCard('kyc', 'KYC waiting', s.pendingKyc, s.oldestKycAt),
      queueCard('withdrawals', 'Withdrawals waiting', s.pendingWithdrawals, s.oldestWithdrawalAt),
    ];
  }

  function chart(series) {
    const values = series.map((d) => Number(d.quoteVolume));
    const peak = Math.max(...values, 1);
    const step = niceStep(peak / 4);
    const top = Math.ceil(peak / step) * step;
    const maxAt = values.indexOf(Math.max(...values));
    const last = values.length - 1;
    return {
      bars: series.map((d, i) => ({
        key: d.day,
        day: calendarDay(d.day),
        height: (values[i] / top) * 100,
        value: compact(d.quoteVolume, 1),
        labelled: i === maxAt || i === last,
        tick: i % 2 === 0,
      })),
      ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => ({ key: i, at: (i * step / top) * 100, label: i === 0 ? '0' : compact(String(i * step), 0) })),
      rows: [...series].reverse().map((d) => ({ key: d.day, day: calendarDay(d.day), volume: amount(d.quoteVolume, 2) })),
      summary: series.length
        ? `Daily traded volume from ${calendarDay(series[0].day)} to ${calendarDay(series[last].day)}: highest ${compact(series[maxAt].quoteVolume, 1)} on ${calendarDay(series[maxAt].day)}, latest ${compact(series[last].quoteVolume, 1)}.`
        : 'No volume yet.',
    };
  }

  function queue(kind, list) {
    const items = list?.items ?? [];
    const total = list?.total ?? items.length;
    return {
      title: kind === 'kyc' ? 'KYC queue' : 'Withdrawal queue',
      count: total ? `${total} waiting, oldest first` : 'Nobody waiting',
      href: kind === 'kyc' ? '/admin/kyc' : '/admin/withdrawals',
      rows: items.map((x, i) => ({
        key: x.id,
        name: x.userDisplayName ?? x.userEmail ?? 'Someone',
        detail: kind === 'kyc' ? `${countryName(x.country)} · ${lowerFirst(documentLabel(x.documentType))}` : `${walletAmount(x.asset, x.amount)} ${x.asset}`,
        mono: kind !== 'kyc',
        waited: waited(x.createdAt),
        oldest: i === 0,
      })),
      empty: kind === 'kyc' ? 'No identity checks waiting.' : 'No withdrawals waiting.',
    };
  }

  return {
    get vm() {
      if (status === 'error') return { status };
      if (status !== 'ready') return { status, updated: null };
      return {
        status,
        updated: `Updated ${clock(updatedAt)} · bot accounts left out of user numbers`,
        cards: cards(stats),
        volume: {
          view,
          tabs: [{ key: 'chart', label: 'Chart', current: view === 'chart', controls: 'volume-view' }, { key: 'table', label: 'Table', current: view === 'table', controls: 'volume-view' }],
          ...chart(stats.volumeSeries ?? []),
        },
        queues: [queue('kyc', kyc), queue('withdrawals', withdrawals)],
      };
    },
    actions: {
      setView(key) {
        view = key;
        p.changed();
      },
      retry() {
        status = 'loading';
        p.changed();
        load();
      },
    },
    subscribe: p.subscribe,
    dispose: p.dispose,
  };
}
