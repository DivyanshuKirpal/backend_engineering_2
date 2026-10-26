// ActivityTable (section 5; board Account · Security): recent security
// events, newest first. Failed attempts read in red, in bold.

import { h, cx } from '../../dom.js';
import { Panel } from '../ui/Panel.js';
import { Skeleton, ErrorState } from '../ui/EmptyState.js';

/** activity: { status, rows, hasMore, loadingMore }. */
export function ActivityTable(activity, { loadMoreActivity, retryActivity }) {
  let body;
  if (activity.status === 'error') body = ErrorState({ title: 'Your activity didn\'t load', body: 'Check the connection and try again.', onRetry: retryActivity });
  else if (activity.status !== 'ready') body = Skeleton({ lines: 5, label: 'Loading your activity' });
  else {
    body = [
      h('div', { class: 'table-wrap' }, h('table', { class: 'table activity-table' },
        h('caption', { class: 'sr-only' }, 'Recent security activity, newest first'),
        h('thead', {}, h('tr', {},
          h('th', { scope: 'col', class: 'col-when' }, 'When'),
          h('th', { scope: 'col', class: 'col-what' }, 'What happened'),
          h('th', { scope: 'col', class: 'col-device' }, 'Device'),
          h('th', { scope: 'col' }, 'IP address'))),
        h('tbody', {}, activity.rows.length
          ? activity.rows.map((r) => h('tr', { key: r.key },
            h('td', { class: 't-mono' }, r.when),
            h('td', { class: cx({ 'activity-warning': r.warning }) }, r.what),
            h('td', {}, r.device),
            h('td', { class: 't-mono' }, r.ip)))
          : h('tr', {}, h('td', { colspan: 4, class: 'activity-empty' }, 'Nothing yet.'))))),
      activity.hasMore
        ? h('div', { class: 'activity-foot' }, h('button', { type: 'button', class: 'btn btn-secondary btn-sm', disabled: activity.loadingMore, onClick: loadMoreActivity }, activity.loadingMore ? 'Loading…' : 'Load older'))
        : null,
    ];
  }
  return Panel({ label: 'Recent activity', labelId: 'activity-label', className: 'activity-panel', flush: true }, body);
}
