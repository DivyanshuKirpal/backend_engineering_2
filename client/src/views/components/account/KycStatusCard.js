// KycStatusCard (section 5): the account's identity check. On Withdraw (board
// "Identity verified") it is a card with its marker, a title and what it
// means there. On Verification the board draws it as a panel: the status,
// then the three steps with the one you are at marked "now".

import { h, cx } from '../../dom.js';
import { Icon } from '../ui/Icon.js';
import { StatusMarker } from '../ui/StatusMarker.js';

/** vm: { status: { label, marker, tone }, title, body } */
export function KycStatusCard(vm) {
  return h('section', { class: cx('panel kyc-card', `kyc-card-${vm.status.tone}`), 'aria-labelledby': 'kyc-card-title' },
    h('span', { class: 'kyc-card-mark', 'aria-hidden': 'true' }, vm.status.marker === 'tick' ? Icon('check', { size: 16 }) : null),
    h('div', {},
      h('h2', { class: 'kyc-card-title', id: 'kyc-card-title' }, vm.title, h('span', { class: 'sr-only' }, `: ${vm.status.label}`)),
      h('p', { class: 'kyc-card-body' }, vm.body)));
}

/** vm: { badge, steps: [{ key, number, title, body, state, when }], rejected?, approved? } */
export function KycStatusPanel(vm) {
  return h('section', { class: 'panel kyc-panel', 'aria-labelledby': 'kyc-status-label' },
    h('div', { class: 'panel-head kyc-panel-head' },
      h('h2', { class: 'panel-label', id: 'kyc-status-label' }, 'Status'),
      StatusMarker(vm.badge)),
    h('ol', { class: 'kyc-steps' }, vm.steps.map((s) => h('li', {
      key: s.key,
      class: cx('kyc-step', `kyc-step-${s.state}`),
      'aria-current': s.state === 'now' ? 'step' : null,
    },
    h('p', { class: 'kyc-step-number t-mono' }, s.when ? `${s.number} · ${s.when}` : s.number),
    h('h3', { class: 'kyc-step-title' }, s.title),
    h('p', { class: 'kyc-step-body' }, s.body)))),
    vm.rejected ? h('p', { class: 'kyc-panel-note tone-sell' }, vm.rejected) : null,
    vm.approved
      ? h('p', { class: 'kyc-panel-note' }, `${vm.approved.text} `, h('a', { class: 'link', href: vm.approved.href }, vm.approved.label))
      : null);
}
