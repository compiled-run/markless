import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import ScalarRowsPage from './fixtures/pwr-scalar-rows-page.tsrx';

// T075: the same keyed composition as the T074 row witness, keyed by the SCALAR
// item rather than by a field of an object row — the shape a list of option
// values has. `key row` and `key i` both lower to an EMPTY key path, so a reader
// that took an empty path for "no key" gave every row the same row segment and
// the whole loop collapsed onto one minted widget id.
afterEach(() => cleanup());

function widgets(container: ParentNode) {
	return {
		triggers: [...container.querySelectorAll<HTMLButtonElement>('[data-pwr-trigger]')],
		labels: [...container.querySelectorAll('[data-pwr-label]')],
	};
}

function expectEachRowMintsItsOwnId(container: ParentNode) {
	const { triggers, labels } = widgets(container);
	expect(triggers.length).toBe(3);
	const ids = triggers.map((trigger) => trigger.getAttribute('id'));
	for (const id of ids) expect(id).toBeTruthy();
	expect(new Set(ids).size).toBe(3);
	for (const [index, label] of labels.entries())
		expect(label.getAttribute('for')).toBe(ids[index]);
}

async function expectGesturesStayInTheirRow(container: ParentNode) {
	widgets(container).triggers[1]?.click();
	await expect
		.poll(() => widgets(container).triggers.map((trigger) => trigger.textContent))
		.toEqual(['false', 'true', 'false']);
}

test('CSR: a scalar-keyed row composes a widget of its own', async () => {
	const screen = await render(ScalarRowsPage);
	expectEachRowMintsItsOwnId(screen.container as HTMLElement);
});

test('CSR: a gesture on a scalar-keyed row stays in that row', async () => {
	const screen = await render(ScalarRowsPage);
	await expectGesturesStayInTheirRow(screen.container as HTMLElement);
});

test('SSR resume: minted ids and gestures agree with CSR', async () => {
	const screen = await renderSSR(ScalarRowsPage);
	expectEachRowMintsItsOwnId(screen.container);
	await expectGesturesStayInTheirRow(screen.container);
});
