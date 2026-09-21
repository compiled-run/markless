import { test, expect, afterEach } from 'vitest';
import { commands } from 'vitest/browser';
import { userEvent } from 'vite-plus/test/browser';
import { render, renderSSR, cleanup } from '@markless/vitest-browser';
import Nested from '../../../packages/headless/components/src/modal/scenarios/nested.tsrx';

const get = id => document.querySelector(`[data-testid="${id}"]`);
const key = state => `${state.outer}:${state.inner}:${state.focus}`;
const randomFor = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const observe = () => ({ outer: !get('outer-backdrop').hidden, inner: !get('inner-backdrop').hidden, focus: document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.tagName, backgroundInert: Boolean(get('background').closest('[inert],[aria-hidden="true"]')) });
const available = state => !state.outer ? { open_outer: 'Open the outer dialog' } : state.inner ? { close_inner: 'Close the inner dialog with its OK button', escape: 'Press Escape once', tab: 'Press Tab', shift_tab: 'Press Shift+Tab' } : { open_inner: 'Open the inner dialog', close_outer: 'Close the outer dialog with Cancel', escape: 'Press Escape once', tab: 'Press Tab', shift_tab: 'Press Shift+Tab' };

async function perform(action) {
  const click = { open_outer: 'outer-trigger', open_inner: 'inner-trigger', close_outer: 'outer-close', close_inner: 'inner-close' }[action];
  if (click) return userEvent.click(get(click));
  if (action === 'escape') return userEvent.keyboard('{Escape}');
  return userEvent.keyboard(action === 'tab' ? '{Tab}' : '{Shift>}{Tab}{/Shift}');
}

afterEach(async () => {
  for (const surface of document.querySelectorAll('[overlay]')) surface.hidden = true;
  await new Promise(resolve => setTimeout(resolve, 0));
  cleanup();
});

for (const mode of ['csr', 'ssr']) {
  for (const seed of [17, 29]) {
    for (const policy of ['random', 'least_visited', 'jev']) {
      test(`${mode} nested modal ${policy} ${seed}`, async () => {
        if (mode === 'csr') await render(Nested);
        else await renderSSR(Nested);
        const rng = randomFor(seed);
        const steps = [];
        const visits = {};
        const states = new Set();
        const transitions = new Set();
        let failure = null;
        const start = performance.now();
        const recorded = __JEV_REPLAY__ ? await commands.recordedPlan(mode, policy, seed) : null;
        for (let i = 0; i < (recorded?.steps.length ?? 12); i++) {
          const before = observe();
          states.add(key(before));
          const options = available(before);
          const ids = Object.keys(options);
          let action;
          let decisionMilliseconds = 0;
          if (recorded) action = recorded.steps[i].action;
          else if (policy === 'jev' && ids.length > 1) {
            const began = performance.now();
            action = (await commands.jevDecision({ current: before, visits, recent: steps.slice(-5).map(s => ({ action: s.action, after: s.after })) }, options, `modal/${mode}/${seed}/${i}`)).choice;
            decisionMilliseconds = performance.now() - began;
          } else if (policy === 'least_visited') {
            const minimum = Math.min(...ids.map(id => visits[`${key(before)}/${id}`] ?? 0));
            const candidates = ids.filter(id => (visits[`${key(before)}/${id}`] ?? 0) === minimum);
            action = candidates[Math.floor(rng() * candidates.length)];
          } else action = ids[Math.floor(rng() * ids.length)];
          const expected = { outer: action === 'open_outer' ? true : action === 'close_outer' || action === 'escape' && !before.inner ? false : before.outer, inner: action === 'open_inner' ? true : action === 'close_inner' || action === 'escape' ? false : before.inner };
          try {
            expect(ids).toContain(action);
            await perform(action);
            await expect.poll(() => ({ outer: observe().outer, inner: observe().inner })).toEqual(expected);
            const after = observe();
            if (after.outer) {
              expect(after.backgroundInert).toBe(true);
              await expect.poll(() => get(after.inner ? 'inner-content' : 'outer-content').contains(document.activeElement)).toBe(true);
            } else expect(after.backgroundInert).toBe(false);
            if (before.inner && !after.inner) expect(after.focus).toBe('inner-trigger');
            if (before.outer && !after.outer) expect(after.focus).toBe('outer-trigger');
          } catch (error) { failure = { step: i, message: error.message.slice(0, 1000) }; }
          const after = observe();
          steps.push({ before, action, after, decisionMilliseconds, failure });
          visits[`${key(before)}/${action}`] = (visits[`${key(before)}/${action}`] ?? 0) + 1;
          states.add(key(after));
          transitions.add(`${key(before)}/${action}/${key(after)}`);
          if (failure) break;
        }
        await commands.recordExperiment({ mode, seed, policy, milliseconds: performance.now() - start, uniqueStates: states.size, uniqueTransitions: transitions.size, steps, failure });
      });
    }
  }
}
