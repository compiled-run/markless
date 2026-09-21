import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createJev, choice } from '../client.mjs';

export const output = '/tmp/jev-advanced';
export const url = existsSync(`${output}/server.json`) ? JSON.parse(readFileSync(`${output}/server.json`)).url : undefined;
export const save = (name, value) => { mkdirSync(output, { recursive: true }); writeFileSync(`${output}/${name}.json`, JSON.stringify(value, null, 2)); };
export const read = name => JSON.parse(readFileSync(`${output}/${name}.json`, 'utf8'));
export const launch = () => chromium.launch({ headless: true });
export const randomFor = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function session(browser, path) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  const requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push({ url: request.url(), type: request.resourceType() }));
  await page.goto(new URL(path, url).href);
  await page.locator('main[data-page]').waitFor();
  const initialIndex = await page.evaluate(() => { window.experimentDocument = 'original'; return navigation.currentEntry.index; });
  return { context, page, errors, requests, initialIndex };
}
export async function observe(page) {
  return page.evaluate(() => {
    const get = id => document.querySelector(`[data-testid="${id}"]`);
    const text = id => get(id)?.textContent ?? null;
    const shown = id => Boolean(get(id) && !get(id).hidden);
    const input = get('combo-input');
    const activeId = input?.getAttribute('aria-activedescendant');
    const focus = document.activeElement;
    const outer = shown('outer-backdrop'), inner = shown('inner-backdrop');
    return {
      page: document.querySelector('main[data-page]')?.getAttribute('data-page'), path: location.pathname,
      sameDocument: window.experimentDocument === 'original', mainCount: document.querySelectorAll('main[data-page]').length,
      documentFocused: document.hasFocus(), focus: focus?.getAttribute('data-testid') ?? focus?.className ?? focus?.tagName,
      nodeCount: document.querySelectorAll('*').length,
      editor: get('editor-instance') ? {
        outer, inner, combo: input?.getAttribute('aria-expanded') === 'true', comboHidden: get('combo-content')?.hidden,
        input: input?.value, selected: text('selected'), selections: Number(text('selections')), confirmed: Number(text('confirmed')),
        options: [...document.querySelectorAll('[data-option]')].map(el => ({ value: el.getAttribute('data-option'), selected: el.getAttribute('aria-selected') === 'true', highlighted: el.hasAttribute('ui-highlighted') })),
        activeIdValid: !activeId || Boolean(document.getElementById(activeId)),
        contained: !outer || Boolean(get(inner ? 'inner-content' : 'outer-content')?.contains(focus)),
        backgroundInert: Boolean(get('background')?.closest('[inert]')),
      } : null,
      todos: [...document.querySelectorAll('.todo-list li')].map(row => ({ id: Number(row.querySelector('.todo-id').textContent), title: row.querySelector('label').textContent, completed: row.querySelector('.todo-completed').textContent === 'true', editing: row.querySelector('.todo-editing').textContent === 'true' })),
      toggleAll: document.querySelector('.toggle-all')?.checked ?? false,
      count: get('count') ? Number(text('count')) : null,
      report: Boolean(get('report-ready')), reportPending: Boolean(get('report-pending')),
      historyIndex: navigation.currentEntry.index, historyLength: navigation.entries().length,
    };
  });
}
export const editorKey = s => s.editor ? `${s.editor.outer}/${s.editor.inner}/${s.editor.combo}/${s.editor.input}/${s.editor.selected}/${s.focus}` : s.page;
export const journeyKey = s => `${s.page}/${Math.min(s.todos.length,3)}/${s.todos.filter(t=>t.completed).length}/${s.todos.some(t=>t.editing)}/${s.editor?.outer}/${s.editor?.inner}/${Math.min(s.count??0,2)}`;
export function selector(policy, seed, tag) {
  const rng = randomFor(seed);
  const api = policy === 'jev' ? createJev() : null;
  const visits = {};
  return {
    visits,
    async choose(state, key, options, history, index) {
      const ids = Object.keys(options);
      if (!ids.length) throw new Error('No legal action');
      let action;
      if (policy === 'jev' && ids.length > 1) {
        const response = await api.ask({ state: { current: state, stateActionVisits: visits, recent: history.slice(-6).map(({ action, after, violations }) => ({ action, after, violations })) }, questions: { action: choice('Choose the next available semantic browser action to expose interaction, stale-state, cleanup, focus or exact-effect defects in this real Markless session. Prefer untested state/action combinations and meaningful multi-step interactions over repeating a known failure. Cover different action families; use the history to finish partially explored sequences. Only select an available action.', options) } }, `${tag}/${seed}/${index}`);
        action = response.answers.action.choice;
      } else {
        const candidates = policy === 'least_visited' ? ids.filter(id => (visits[`${key}/${id}`] ?? 0) === Math.min(...ids.map(id => visits[`${key}/${id}`] ?? 0))) : ids;
        action = candidates[Math.floor(rng() * candidates.length)];
      }
      visits[`${key}/${action}`] = (visits[`${key}/${action}`] ?? 0) + 1;
      return action;
    },
  };
}
export async function settled(page, check) {
  let after, violations;
  for (let attempt = 0; attempt < 12; attempt++) {
    await sleep(100);
    after = await observe(page); violations = check(after);
    if (!violations.length || violations.every(v => v === 'modal_focus_containment') || attempt >= 2 && violations.every(v => v === 'background_inertness' || v === 'modal_focus_containment')) break;
  }
  return { after, violations };
}
export function baseChecks(state) {
  return [...(!state.sameDocument ? ['document_reload'] : []), ...(state.mainCount !== 1 ? ['route_multiplicity'] : [])];
}
