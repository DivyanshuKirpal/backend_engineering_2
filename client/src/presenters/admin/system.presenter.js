// useAdminSystemPresenter (section 5, AdminSystemPage): GET
// /admin/system/health every 5 seconds: MongoDB, Redis (with its memory),
// the matching engine's leader and heartbeat, the command streams, the
// sockets and the API instances, then the engine market by market. Redis and
// the per-market rows are API needs from section 7, served by the mock.

import * as adminApi from '../../models/api/admin.api.js';
import { createPresenter, every } from '../shared/presenter.js';
import { toast } from '../shared/toasts.js';
import { megabytes, pair } from '../formatters/number.format.js';
import { clock, precise, seconds } from '../formatters/date.format.js';
import { marketStatus } from '../formatters/status.format.js';

const REFRESH = 5000;
const LOCK_LAPSES = 15;
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five'];

const ok = (label) => ({ label, marker: 'tick', tone: 'buy' });
const trouble = (label) => ({ label, marker: 'cross', tone: 'sell' });
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function createAdminSystemPresenter() {
  const p = createPresenter();
  let status = 'loading';
  let health = null;

  async function load() {
    try {
      const data = await adminApi.systemHealth();
      if (p.disposed) return;
      health = data;
      status = 'ready';
    } catch {
      if (p.disposed) return;
      if (!health) status = 'error';
    }
    p.changed();
  }
  load();
  every(p, REFRESH, load);

  function cards(h) {
    const ready = h.apiInstances.filter((a) => a.ready).length;
    const used = h.redis.usedMemory;
    const max = h.redis.maxMemory;
    const leading = h.engine.heartbeatAge < LOCK_LAPSES;
    return [
      {
        key: 'mongo',
        title: 'MongoDB',
        state: h.mongo.status === 'healthy' ? ok('Healthy') : trouble('Unhealthy'),
        body: [`Replica set ${h.mongo.replicaSet}: a primary and ${WORDS[h.mongo.secondaries] ?? h.mongo.secondaries} secondaries.`],
        mono: `ping ${h.mongo.pingMs} ms`,
      },
      {
        key: 'redis',
        title: 'Redis',
        state: h.redis.status === 'healthy' ? ok('Healthy') : trouble('Unhealthy'),
        body: [`Append-only file ${h.redis.aof ? 'on' : 'off'}. Memory in use:`],
        meter: { value: max ? (used / max) * 100 : 0, label: `${megabytes(used)} / ${megabytes(max)} MB` },
      },
      {
        key: 'engine',
        title: 'Matching engine',
        state: leading ? ok('Leading') : trouble('No leader'),
        body: ['Leader ', { mono: h.engine.leaderId }, `, last heartbeat ${h.engine.heartbeatAge} s ago. The lock renews every 5 s and lapses after ${LOCK_LAPSES} s.`],
      },
      {
        key: 'streams',
        title: 'Command streams',
        state: h.engine.streamLag < 50 ? ok('Keeping up') : trouble('Falling behind'),
        body: [`${plural(h.engine.streamLag, 'command')} waiting across ${h.engine.marketsLoaded} markets.`],
        mono: h.engine.streamLag ? `oldest ${seconds(h.engine.oldestWaitMs)}` : 'nothing waiting',
      },
      {
        key: 'sockets',
        title: 'WebSockets',
        state: ok('Healthy'),
        body: [`${plural(h.sockets, 'open connection')}.`],
        mono: h.apiInstances.map((a) => `${a.id} ${a.sockets}`).join(' · '),
      },
      {
        key: 'api',
        title: 'API instances',
        state: ready === h.apiInstances.length ? ok(`${ready} of ${h.apiInstances.length} ready`) : trouble(`${ready} of ${h.apiInstances.length} ready`),
        body: [h.apiInstances.length === 2 ? 'Both answer ' : 'All answer ', { mono: '/health/ready' }, ' behind the load balancer.'],
      },
    ];
  }

  function rows(markets) {
    return markets.map((m) => ({
      key: m.symbol,
      market: pair(m.symbol),
      status: marketStatus(m.status),
      waiting: String(m.waiting),
      last: m.lastCommand ? [m.lastCommand.type, m.lastCommand.detail, precise(m.lastCommand.at)].filter(Boolean).join(' · ') : '—',
      levels: `${m.bookLevels.bids} bids · ${m.bookLevels.asks} asks`,
      lastTrade: m.lastTradeAt ? clock(m.lastTradeAt) : '—',
      maker: m.maker === 'quoting' ? 'Quoting 5 a side' : 'Ladder cancelled',
      makerQuiet: m.maker !== 'quoting',
    }));
  }

  return {
    get vm() {
      if (status !== 'ready') return { status, checked: null };
      return {
        status,
        checked: `Checked ${clock(health.checkedAt)} · refreshes every 5 s`,
        cards: cards(health),
        markets: rows(health.engine.markets ?? []),
      };
    },
    actions: {
      retry() {
        status = 'loading';
        p.changed();
        load();
      },
      openGrafana() {
        toast({ title: 'Grafana comes with the backend', body: 'It runs beside Prometheus in docker-compose, which this static phase leaves out.' });
      },
    },
    subscribe: p.subscribe,
    dispose: p.dispose,
  };
}
