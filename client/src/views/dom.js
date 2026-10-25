// The views' only DOM helper. h() and s() build real elements; render() patches
// a container so its children match a freshly built tree. A view can then be
// rebuilt on every vm change while the existing nodes stay in place, so focus,
// the caret, scroll positions and hover survive live updates.
//
// Props: on<Event> handlers (onClick), `key` to keep a list row's identity,
// `ref` to get the live element after a render (charts, focus), `keep` to let a
// ref own the element's children, value/checked/selected as live properties,
// `class` as a string, array or { name: bool } object, `style` as an object.

const SVG_NS = 'http://www.w3.org/2000/svg';
const LIVE_PROPS = new Set(['value', 'checked', 'selected', 'indeterminate']);

let createdWithRef = [];

export function h(tag, props, ...children) {
  return build(document.createElement(tag), props, children);
}

export function s(tag, props, ...children) {
  return build(document.createElementNS(SVG_NS, tag), props, children);
}

/** Joins class names from strings, arrays and { name: condition } objects. */
export function cx(...parts) {
  const out = [];
  for (const part of parts.flat(Infinity)) {
    if (!part) continue;
    if (typeof part === 'string') out.push(part);
    else if (typeof part === 'object') {
      for (const [name, on] of Object.entries(part)) if (on) out.push(name);
    }
  }
  return out.join(' ');
}

function build(el, props, children) {
  if (props) {
    for (const [name, value] of Object.entries(props)) setProp(el, name, value);
  }
  append(el, children);
  // A select's value can only be set once its options exist.
  if (el.__props && 'value' in el.__props && el.tagName === 'SELECT') el.value = el.__props.value;
  return el;
}

function setProp(el, name, value) {
  if (name === 'key') {
    if (value != null) el.__key = String(value);
  } else if (name === 'ref') {
    if (value) {
      el.__ref = value;
      createdWithRef.push(el);
    }
  } else if (name === 'keep') {
    el.__keep = Boolean(value);
  } else if (name.startsWith('on') && name.length > 2) {
    if (typeof value === 'function') {
      const event = name.slice(2).toLowerCase();
      (el.__on ??= {})[event] = value;
      el[`on${event}`] = value;
    }
  } else if (LIVE_PROPS.has(name)) {
    const v = name === 'value' ? (value ?? '') : Boolean(value);
    (el.__props ??= {})[name] = v;
    el[name] = v;
    if (name === 'checked' && v) el.setAttribute('checked', '');
  } else if (name === 'class' || name === 'className') {
    const v = typeof value === 'string' ? value : cx(value);
    if (v) el.setAttribute('class', v);
  } else if (name === 'style') {
    if (typeof value === 'string') el.setAttribute('style', value);
    else if (value) {
      const css = Object.entries(value)
        .filter(([, v]) => v != null && v !== false)
        .map(([k, v]) => `${k.startsWith('--') ? k : k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${v}`)
        .join(';');
      if (css) el.setAttribute('style', css);
    }
  } else if (value === true) {
    el.setAttribute(name, '');
  } else if (value != null && value !== false) {
    el.setAttribute(name, String(value));
  }
}

function append(parent, children) {
  for (const child of children) {
    if (child == null || child === false || child === true || child === '') continue;
    if (Array.isArray(child)) append(parent, child);
    else if (child instanceof Node) parent.appendChild(child);
    else parent.appendChild(document.createTextNode(String(child)));
  }
}

/** Makes `container`'s children match `children`, reusing nodes where it can. */
export function render(container, ...children) {
  const fragment = document.createDocumentFragment();
  append(fragment, children);
  const adopted = [];
  morphChildren(container, Array.from(fragment.childNodes), adopted);
  const refs = new Set(adopted);
  for (const el of createdWithRef) if (el.isConnected) refs.add(el);
  createdWithRef = [];
  for (const el of refs) el.__ref(el);
}

function same(a, b) {
  if (a.nodeType !== b.nodeType) return false;
  if (a.nodeType !== Node.ELEMENT_NODE) return true;
  return a.tagName === b.tagName && a.namespaceURI === b.namespaceURI && a.__key === b.__key;
}

function morph(old, next, adopted) {
  if (old.nodeType !== Node.ELEMENT_NODE) {
    if (old.nodeValue !== next.nodeValue) old.nodeValue = next.nodeValue;
    return old;
  }
  for (const { name, value } of Array.from(next.attributes)) {
    if (old.getAttribute(name) !== value) old.setAttribute(name, value);
  }
  for (const { name } of Array.from(old.attributes)) {
    if (!next.hasAttribute(name)) old.removeAttribute(name);
  }

  const before = old.__on ?? {};
  const after = next.__on ?? {};
  for (const event of Object.keys(before)) if (!(event in after)) old[`on${event}`] = null;
  for (const [event, fn] of Object.entries(after)) if (old[`on${event}`] !== fn) old[`on${event}`] = fn;
  old.__on = after;

  old.__ref = next.__ref;
  if (next.__ref) adopted.push(old);

  if (next.__keep) old.__keep = true;
  else {
    old.__keep = false;
    morphChildren(old, Array.from(next.childNodes), adopted);
  }

  const props = next.__props;
  if (props) {
    for (const [name, value] of Object.entries(props)) if (old[name] !== value) old[name] = value;
  }
  old.__props = props;
  return old;
}

function morphChildren(parent, nextKids, adopted) {
  const keyed = new Map();
  const unkeyed = [];
  for (const node of Array.from(parent.childNodes)) {
    if (node.__key != null) keyed.set(node.__key, node);
    else unkeyed.push(node);
  }

  let u = 0;
  nextKids.forEach((next, i) => {
    let match = null;
    if (next.__key != null) {
      const candidate = keyed.get(next.__key);
      if (candidate && same(candidate, next)) {
        match = candidate;
        keyed.delete(next.__key);
      }
    } else if (u < unkeyed.length && same(unkeyed[u], next)) {
      match = unkeyed[u];
      u += 1;
    }
    const node = match ? morph(match, next, adopted) : next;
    const at = parent.childNodes[i];
    if (at !== node) parent.insertBefore(node, at ?? null);
  });

  while (parent.childNodes.length > nextKids.length) parent.removeChild(parent.lastChild);
}
