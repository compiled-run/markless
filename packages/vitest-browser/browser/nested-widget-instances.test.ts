import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Page from './fixtures/nst-page.tsrx';

// A widget root is ALWAYS an instance boundary. Three roots of one family are
// nested root-in-projection; each level's parts must resolve to the INNERMOST
// root that encloses them, so seeds, state, and gestures stay per level.
afterEach(() => cleanup());

const labels = ['one', 'two', 'three'];

function levels(container: ParentNode) {
	return {
		roots: [...container.querySelectorAll('[data-nst-root]')],
		triggers: [...container.querySelectorAll<HTMLButtonElement>('[data-nst-trigger]')],
		displays: [...container.querySelectorAll('[data-nst-display]')],
	};
}

// The seed a root writes reaches its own parts and no other level's.
function expectSeedsPerLevel(container: ParentNode) {
	const { roots, triggers, displays } = levels(container);
	expect(roots.length).toBe(3);
	expect(roots.map((root) => root.getAttribute('data-label'))).toEqual(labels);
	expect(triggers.map((trigger) => trigger.getAttribute('data-label'))).toEqual(labels);
	expect(displays.map((display) => display.getAttribute('data-label'))).toEqual(labels);
}

// Each level owns its own state: a click on one level flips that level alone.
async function expectStatePerLevel(container: ParentNode) {
	expect(levels(container).displays.map((display) => display.textContent)).toEqual([
		'false',
		'false',
		'false',
	]);

	levels(container).triggers[1]?.click();
	await expect
		.poll(() => levels(container).displays.map((display) => display.textContent))
		.toEqual(['false', 'true', 'false']);

	levels(container).triggers[2]?.click();
	await expect
		.poll(() => levels(container).displays.map((display) => display.textContent))
		.toEqual(['false', 'true', 'true']);

	levels(container).triggers[0]?.click();
	await expect
		.poll(() => levels(container).displays.map((display) => display.textContent))
		.toEqual(['true', 'true', 'true']);
}

test('CSR: a nested root seeds its own instance only', async () => {
	const screen = await render(Page);
	expectSeedsPerLevel(screen.container as HTMLElement);
});

test('CSR: three nested roots of one family keep independent state', async () => {
	const screen = await render(Page);
	await expectStatePerLevel(screen.container as HTMLElement);
});

test('SSR resume: nested roots seed and resume per level', async () => {
	const screen = await renderSSR(Page);
	expectSeedsPerLevel(screen.container);
	await expectStatePerLevel(screen.container);
});
