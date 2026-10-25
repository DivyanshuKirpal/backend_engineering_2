// An icon from /assets/icons/sprite.svg. Decorative unless it has a label.

import { s } from '../../dom.js';

export function Icon(name, { size = 16, className = '', label = null } = {}) {
  return s(
    'svg',
    {
      class: `icon ${className}`.trim(),
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      focusable: 'false',
      'aria-hidden': label ? null : 'true',
      role: label ? 'img' : null,
      'aria-label': label,
    },
    s('use', { href: `/assets/icons/sprite.svg#${name}` }),
  );
}
