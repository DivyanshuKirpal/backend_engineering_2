// KycQueueTable and KycReviewPanel (section 5; board Admin · KYC review): the
// applications in a list, and the one open beside it with its facts, the
// document image (a placeholder in this phase) and the decision.

import { h, cx } from '../../dom.js';

/** vm: the KYC presenter's vm; open(id) shows that application. */
export function KycQueueTable(vm, { open }) {
  const pending = vm.tab === 'pending';
  const rejected = vm.tab === 'rejected';
  const span = pending ? 5 : rejected ? 5 : 4;
  return h('table', { class: 'table kyc-table' },
    h('caption', { class: 'sr-only' }, vm.heading),
    h('thead', {}, h('tr', {},
      h('th', { scope: 'col', class: 'col-applicant' }, 'Applicant'),
      h('th', { scope: 'col', class: 'col-country' }, 'Country'),
      h('th', { scope: 'col', class: 'col-document' }, 'Document'),
      pending
        ? [h('th', { scope: 'col', class: 'col-sent' }, 'Sent'), h('th', { scope: 'col', class: 'num col-waiting' }, 'Waiting')]
        : [h('th', { scope: 'col', class: 'col-decided' }, 'Decided'), rejected ? h('th', { scope: 'col' }, 'Reason') : null])),
    h('tbody', {}, vm.rows.length
      ? vm.rows.map((r) => h('tr', { key: r.key, class: cx({ current: r.current }) },
        h('th', { scope: 'row', class: 'col-applicant' },
          h('button', { type: 'button', class: 'kyc-open', 'aria-current': r.current ? 'true' : null, onClick: () => open(r.key) }, r.name)),
        h('td', {}, r.country),
        h('td', {}, r.document),
        pending
          ? [h('td', { class: 't-mono' }, r.sent), h('td', { class: cx('num t-mono', { 'queue-wait-oldest': r.oldest }) }, r.waited)]
          : [h('td', { class: 't-mono' }, r.decided), rejected ? h('td', { class: 'kyc-reason' }, r.reason) : null]))
      : h('tr', {}, h('td', { colspan: span, class: 'kyc-empty' }, vm.empty))));
}

/** The drawn stand-in for a document: a photo and four lines of text. */
function DocumentPlaceholder(status, caption) {
  return h('figure', { class: cx('doc-placeholder', `doc-${status}`) },
    h('div', { class: 'doc-shape', 'aria-hidden': 'true' },
      h('span', { class: 'doc-photo' }),
      h('span', { class: 'doc-lines' }, [0, 1, 2, 3].map((i) => h('span', { key: i, class: 'doc-line' })))),
    h('figcaption', {}, status === 'error' ? 'The image didn\'t load.' : status === 'loading' ? 'Opening the image…' : caption));
}

/** r: the KYC presenter's review vm. */
export function KycReviewPanel(r, actions) {
  return h('section', { class: 'panel kyc-review', 'aria-labelledby': 'kyc-review-name' },
    h('div', { class: 'kyc-review-head' },
      h('h2', { class: 'kyc-review-name', id: 'kyc-review-name' }, r.name),
      h('p', {}, r.meta)),
    h('dl', { class: 'kyc-review-facts' }, r.facts.map((f) => h('div', { key: f.key },
      h('dt', {}, f.label),
      h('dd', {}, f.value, f.mono ? [' ', h('span', { class: 't-mono kyc-review-mono' }, f.mono)] : null)))),
    h('div', { class: 'kyc-review-image' },
      h('h3', { class: 'panel-label' }, 'Document image'),
      DocumentPlaceholder(r.image, 'Placeholder. The real image is streamed to admins only.'),
      r.selfie == null
        ? null
        : r.selfie === 'idle'
          ? h('button', { type: 'button', class: 'btn btn-quiet btn-sm kyc-selfie-btn', onClick: actions.openSelfie }, 'Open the selfie')
          : DocumentPlaceholder(r.selfie, 'Selfie placeholder.'),
      h('p', { class: 'kyc-review-note' }, r.note)),
    r.decision
      ? h('p', { class: cx('kyc-review-decision', `tone-${r.decision.tone}`) }, r.decision.text)
      : h('div', { class: 'kyc-review-actions' },
        h('button', { type: 'button', class: 'btn btn-buy', disabled: r.deciding, onClick: actions.approve }, r.deciding ? 'Approving…' : 'Approve'),
        h('button', { type: 'button', class: 'btn btn-danger-outline', disabled: r.deciding, onClick: actions.startReject }, 'Reject with a reason')));
}
