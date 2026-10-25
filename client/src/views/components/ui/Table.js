// Table (section 5): a real <table> with a caption for screen readers,
// column headers with scope, numbers aligned right, and an empty state.
// columns: [{ key, label, align?: 'right', className?, srLabel? }]
// rows: [{ key, cells: { [columnKey]: node }, className?, current?, onClick? }]

import { h, cx } from '../../dom.js';

export function Table({ caption, columns, rows, empty = null, className = '', dense = false }) {
  return h('div', { class: cx('table-wrap', className) },
    h('table', { class: cx('table', { 'table-dense': dense }) },
      h('caption', { class: 'sr-only' }, caption),
      h('thead', {}, h('tr', {}, columns.map((c) => h('th', {
        scope: 'col', class: cx(c.className, { 'num': c.align === 'right', 'center': c.align === 'center' }),
      }, c.srLabel ? h('span', { class: 'sr-only' }, c.srLabel) : c.label)))),
      h('tbody', {}, rows.length
        ? rows.map((r) => h('tr', { key: r.key, class: cx(r.className, { current: r.current }), 'aria-current': r.current ? 'true' : null },
          columns.map((c) => h(c.header ? 'th' : 'td', {
            scope: c.header ? 'row' : null,
            class: cx(c.className, { 'num': c.align === 'right', 'center': c.align === 'center' }),
          }, r.cells[c.key]))))
        : h('tr', {}, h('td', { colspan: columns.length, class: 'table-empty' }, empty)))));
}
