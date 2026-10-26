// VerifyEmailBanner (section 5; as drawn on Account · Profile and the UI kit).

import { h } from '../../dom.js';
import { Icon } from '../ui/Icon.js';

export function VerifyEmailBanner(banner, { resendVerification }) {
  if (!banner) return null;
  return h('div', { class: 'notice-bar', role: 'region', 'aria-label': 'Email confirmation' },
    h('div', { class: 'container notice-bar-inner' },
      Icon('mail', { size: 16, className: 'notice-bar-icon' }),
      h('p', {}, h('strong', {}, 'Confirm your email. '), `We sent a link to ${banner.email}. It works for 24 hours.`),
      banner.sent
        ? h('p', { class: 'notice-bar-done', role: 'status' }, 'Sent. Check your inbox.')
        : h('button', { class: 'btn btn-secondary btn-sm', type: 'button', disabled: banner.sending, onClick: resendVerification }, banner.sending ? 'Sending…' : 'Resend link')));
}
