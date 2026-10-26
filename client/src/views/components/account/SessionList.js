// SessionList (section 5; board Account · Security): each signed-in device
// with when it was last used and from where; any but this one can be
// signed out, or all the others at once.

import { h } from '../../dom.js';
import { Panel } from '../ui/Panel.js';
import { Icon } from '../ui/Icon.js';
import { Skeleton, ErrorState } from '../ui/EmptyState.js';

/** devices: the security presenter's devices vm. */
export function SessionList(devices, { signOut, signOutOthers, retryDevices }) {
  let body;
  if (devices.status === 'error') body = ErrorState({ title: 'Your devices didn\'t load', body: 'Check the connection and try again.', onRetry: retryDevices });
  else if (devices.status !== 'ready') body = Skeleton({ lines: 3, label: 'Loading your devices' });
  else {
    body = h('ul', { class: 'plain device-list' }, devices.rows.map((d) => h('li', { key: d.key, class: 'device-row' },
      Icon(d.kind, { size: 18, className: 'device-icon' }),
      h('div', { class: 'device-text' },
        h('p', { class: 'device-name' }, d.name, d.current ? h('span', { class: 'device-tag' }, 'This device') : null),
        h('p', { class: 'device-meta' }, `${d.when} · `, h('span', { class: 't-mono' }, d.ip))),
      d.current ? null : h('button', {
        type: 'button',
        class: 'btn btn-quiet btn-sm',
        disabled: d.busy,
        'aria-label': `Sign out ${d.name}`,
        onClick: () => signOut(d.key),
      }, d.busy ? 'Signing out…' : 'Sign out'))));
  }
  return Panel({
    label: devices.title,
    labelId: 'devices-label',
    className: 'devices-panel',
    flush: true,
    aside: h('button', { type: 'button', class: 'btn btn-danger-outline btn-sm', disabled: !devices.canSignOutOthers, onClick: signOutOthers },
      devices.signingOutOthers ? 'Signing out…' : 'Sign out all other devices'),
  }, body);
}
