// OrderForm, PercentButtons, OrderSummary and LoginToTradeCTA (section 5;
// section 7, Order ticket; board Trade, the ORDER TICKET panel). The form only
// forwards what is typed and clicked; the presenter checks and sends it.

import { h, cx } from '../../dom.js';
import { Tabs } from '../ui/Tabs.js';
import { NumberField } from '../ui/Field.js';

/** 25, 50, 75 or 100% of the free balance; lit only when the amount is that share. */
export function PercentButtons(shares, onShare, disabled) {
  return h('div', { class: 'share-group', role: 'group', 'aria-label': 'Share of your free balance' }, shares.map((s) => h('button', {
    key: s.key,
    type: 'button',
    class: cx('share-btn', 't-mono', { current: s.current }),
    'aria-pressed': String(s.current),
    'aria-label': s.name,
    disabled,
    onClick: () => onShare(s.key),
  }, s.label)));
}

/** What the engine will do, and the most the fee can be. */
export function OrderSummary(vm) {
  return [
    h('div', { class: 'engine-box' },
      h('h3', { class: 'engine-title' }, 'What the engine will do'),
      h('p', { class: 'engine-text' }, vm.engine)),
    h('p', { class: 'ticket-fee' },
      h('span', {}, 'Fee, at most'),
      h('span', { class: 't-mono' }, vm.fee ?? '—')),
  ];
}

/** In place of the form when logged out. Not drawn on the boards. */
export function LoginToTradeCTA(vm) {
  return h('div', { class: 'login-cta' },
    h('p', { class: 'login-cta-title' }, `Log in to trade ${vm.pair}`),
    h('p', { class: 'login-cta-body' }, 'Demo accounts start with 10,000 USDT of simulated money. Nothing here is real.'),
    h('a', { class: 'btn btn-primary btn-block', href: `/login?next=${encodeURIComponent(vm.next)}` }, 'Log in'),
    h('a', { class: 'btn btn-secondary btn-block', href: '/register' }, 'Create account'),
    h('p', { class: 'undesigned-note' }, 'Not drawn yet: the ticket for a visitor who isn\'t logged in.'));
}

/** vm: the order form presenter's vm (status 'ready'). `idPrefix` keeps ids unique. */
export function OrderForm(vm, actions, { idPrefix = 'ticket' } = {}) {
  const id = (name) => `${idPrefix}-${name}`;
  return h('form', {
    class: 'ticket',
    novalidate: true,
    'aria-describedby': vm.formError ? id('error') : null,
    onSubmit: (e) => {
      e.preventDefault();
      actions.submit();
    },
  },
  Tabs({ items: vm.sides, onSelect: actions.setSide, label: 'Buy or sell', variant: 'side', className: 'ticket-sides' }),
  h('div', { class: 'ticket-type-row' },
    Tabs({ items: vm.types, onSelect: actions.setType, label: 'Order type', variant: 'underline' }),
    h('p', { class: 'ticket-free' }, 'Free ', h('span', { class: 't-mono ticket-free-amount' }, vm.free.amount), ' ', h('span', { class: 'ticket-free-asset' }, vm.free.asset))),
  NumberField({
    id: id('price'), label: 'Price', unit: vm.price.unit, value: vm.price.value, placeholder: vm.price.placeholder,
    disabled: vm.price.disabled, error: vm.price.error, onInput: actions.setPrice,
  }),
  NumberField({
    id: id('amount'), label: 'Amount', unit: vm.quantity.unit, value: vm.quantity.value, placeholder: vm.quantity.placeholder,
    disabled: vm.quantity.disabled, error: vm.quantity.error, onInput: actions.setQuantity,
  }),
  PercentButtons(vm.shares, actions.useShare, vm.sharesDisabled),
  NumberField({
    id: id('total'), label: 'Total', unit: vm.total.unit, value: vm.total.value, placeholder: vm.total.placeholder,
    disabled: vm.total.disabled, error: vm.total.error, onInput: actions.setTotal,
  }),
  OrderSummary(vm),
  vm.formError ? h('p', { class: 'field-error ticket-error', id: id('error'), role: 'alert' }, vm.formError) : null,
  h('button', {
    type: 'submit',
    class: cx('btn btn-lg btn-block ticket-submit', vm.button.tone === 'muted' ? 'btn-muted' : `btn-${vm.button.tone}`),
    disabled: vm.button.disabled,
    'aria-busy': vm.busy ? 'true' : null,
  }, vm.button.label));
}
