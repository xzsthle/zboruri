// The "Ask" box: describe a trip in English or Romanian and get a real search back.

import { $, h } from './dom.js';
import { aiEnabled, understand } from './ai.js';
import { intentToRoute } from './intent.js';

const EXAMPLES = [
  ['🏖️', 'Beach next week under €80'],
  ['🇮🇹', 'Weekend în Italia pentru 2'],
  ['🏙️', 'City break in November, 3 nights'],
  ['🏔️', 'Munte în decembrie'],
  ['🎄', 'Christmas markets in December'],
  ['💸', 'Cel mai ieftin zbor la Londra'],
];

export function initAsk({ site, navigate }) {
  const form = $('ask-form');
  const input = $('ask-input');
  const status = $('ask-status');
  const button = form.querySelector('.ask-submit');

  const setBusy = (busy) => {
    form.classList.toggle('is-busy', busy);
    input.disabled = busy;
    button.disabled = busy;
    button.querySelector('span').textContent = busy ? (aiEnabled() ? 'Thinking…' : 'Searching…') : 'Ask';
  };

  async function ask(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setBusy(true);
    status.textContent = '';
    try {
      const { intent, source, error } = await understand(trimmed, site);
      if (!intent.understood && source === 'instant') {
        status.textContent = intent.reply;
        return;
      }
      if (error) console.warn('AI search unavailable, used instant understanding', error);
      const { query, filters } = intentToRoute(intent, site.rules);
      navigate(query, filters);
    } finally {
      setBusy(false);
    }
  }

  form.addEventListener('submit', (event) => { event.preventDefault(); ask(input.value); });
  $('ask-examples').replaceChildren(...EXAMPLES.map(([emoji, text]) =>
    h('button', { type: 'button', class: 'ask-chip', onclick: () => { input.value = text; ask(text); } },
      h('span', { 'aria-hidden': 'true' }, emoji), text)));
  $('ask-engine').textContent = aiEnabled() ? 'Powered by Gemini' : 'Understands English & Romanian';
}
