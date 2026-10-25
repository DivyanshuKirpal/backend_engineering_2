// KycRequiredNotice (section 5; UI kit): shown on Withdraw until KYC is
// approved, with the way to start or finish it.

import { h } from '../../dom.js';
import { Icon } from '../ui/Icon.js';

/** vm: { title, body, actionLabel, href } */
export function KycRequiredNotice(vm) {
  return h('section', { class: 'kyc-notice', 'aria-label': 'Identity verification' },
    Icon('id-card', { size: 20, className: 'kyc-notice-icon' }),
    h('div', {},
      h('p', {}, h('strong', {}, `${vm.title} `), vm.body),
      vm.href ? h('a', { class: 'btn btn-primary btn-md', href: vm.href }, vm.actionLabel) : null));
}
