// Tiny DOM helpers. Data only ever goes in through textContent / setAttribute — never innerHTML.

const SVG_NS = 'http://www.w3.org/2000/svg';

export const $ = (id) => document.getElementById(id);

function applyAttrs(el, attrs) {
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') el.setAttribute('class', value);
    else if (key === 'style') Object.entries(value).forEach(([prop, v]) => el.style.setProperty(prop, v));
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  return el;
}

const appendAll = (el, children) => {
  el.append(...children.flat().filter((child) => child != null && child !== false));
  return el;
};

/** HTML element: h('a', { href, class }, 'text', childEl) */
export const h = (tag, attrs = {}, ...children) => appendAll(applyAttrs(document.createElement(tag), attrs), children);

/** SVG element: s('path', { d }) */
export const s = (tag, attrs = {}, ...children) => appendAll(applyAttrs(document.createElementNS(SVG_NS, tag), attrs), children);

/** An icon from the sprite in index.html. */
export const icon = (id, className = 'icon') => s('svg', { class: className, 'aria-hidden': 'true' }, s('use', { href: `#${id}` }));

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
