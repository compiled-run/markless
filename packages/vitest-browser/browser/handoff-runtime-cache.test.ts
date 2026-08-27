import { expect, test } from 'vitest';
import { render, renderSSR } from '../src/index.ts';
import HandoffRuntimeCache from './fixtures/handoff-runtime-cache.tsrx';

// The resume handoff runs on every delegated event, so whatever it hands each
// dispatch has to be one runtime per container. These rows read that off the
// page: an escalating branch commits its arm, a SECOND event on the committed
// arm has to move it, and a page counter has to reach 2 rather than reset.
//
// This harness serves the plain payload-document handoff. The linked
// render-data handoff is not reachable here — it needs a build whose render
// data was reached, which this project never produces — so its own cache is
// pinned in packages/bundler/test/non-staged-handoff-runtime-cache.test.ts.

function requireElement<T extends Element>(container: HTMLElement, selector: string): T {
	const element = container.querySelector<T>(selector);
	if (!element) throw new Error(`Expected "${selector}" in the rendered DOM.`);
	return element;
}

async function secondEventOnCommittedArm(container: HTMLElement) {
	requireElement<HTMLButtonElement>(container, 'button[data-arm]').click();
	await expect.poll(() => container.querySelector('[data-panel]')?.textContent).toBe('ready-0');

	// First event inside the committed arm: its records were registered by the
	// escalated commit, not by the served payload.
	requireElement<HTMLElement>(container, '[data-panel]').click();
	await expect.poll(() => container.querySelector('[data-panel]')?.textContent).toBe('ready-1');

	// The second one lands only if the runtime holding those records is still
	// the one dispatching.
	requireElement<HTMLElement>(container, '[data-panel]').click();
	await expect.poll(() => container.querySelector('[data-panel]')?.textContent).toBe('ready-2');
}

async function counterClimbsAcrossEvents(container: HTMLElement) {
	requireElement<HTMLButtonElement>(container, 'button[data-tap]').click();
	await expect.poll(() => container.querySelector('[data-taps]')?.textContent).toBe('1');

	requireElement<HTMLButtonElement>(container, 'button[data-tap]').click();
	await expect.poll(() => container.querySelector('[data-taps]')?.textContent).toBe('2');
}

test('SSR: a second event on a committed arm dispatches against the same runtime', async () => {
	const screen = await renderSSR(HandoffRuntimeCache);
	await secondEventOnCommittedArm(screen.container as HTMLElement);
});

test('CSR: a second event on a committed arm dispatches against the same runtime', async () => {
	const screen = await render(HandoffRuntimeCache);
	await secondEventOnCommittedArm(screen.container as HTMLElement);
});

test('SSR: page state accumulates across repeated events instead of resetting', async () => {
	const screen = await renderSSR(HandoffRuntimeCache);
	await counterClimbsAcrossEvents(screen.container as HTMLElement);
});

test('CSR: page state accumulates across repeated events instead of resetting', async () => {
	const screen = await render(HandoffRuntimeCache);
	await counterClimbsAcrossEvents(screen.container as HTMLElement);
});
