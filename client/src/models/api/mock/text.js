// Plain text the mock server writes into notifications and messages, as the
// real notification.service would. The client's formatting lives in the
// presenters; this is the server's own copy of the one rule it needs.

/** "62140.50" -> "62,140.50" */
export function grouped(value) {
  const [whole, fraction] = String(value).split('.');
  const sign = whole.startsWith('-') ? '−' : '';
  const digits = whole.replace('-', '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${digits}${fraction != null ? `.${fraction}` : ''}`;
}
