// KycStatusCard (section 5; board Withdraw, "Identity verified"): the
// account's identity check with its marker, a title and what it means here.
// Verification uses it too.

import { h, cx } from '../../dom.js';
import { Icon } from '../ui/Icon.js';

/** vm: { status: { label, marker, tone }, title, body } */
export function KycStatusCard(vm) {
  return h('section', { class: cx('panel kyc-card', `kyc-card-${vm.status.tone}`), 'aria-labelledby': 'kyc-card-title' },
    h('span', { class: 'kyc-card-mark', 'aria-hidden': 'true' }, vm.status.marker === 'tick' ? Icon('check', { size: 16 }) : null),
    h('div', {},
      h('h2', { class: 'kyc-card-title', id: 'kyc-card-title' }, vm.title, h('span', { class: 'sr-only' }, `: ${vm.status.label}`)),
      h('p', { class: 'kyc-card-body' }, vm.body)));
}
