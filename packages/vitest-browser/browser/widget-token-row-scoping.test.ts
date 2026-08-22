import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import RowsPage from './fixtures/pwr-item-rows-page.tsrx';

// T075: the widget token a part mints its element() id from has to come from the
// INSTANCE path, not the host id prefix. A keyed loop written inside an enclosing
// root's projected children places one compile-time edge per row; only the
// instance path carries the row, so a host-prefix token collapses every row's
// parts onto one minted id.
afterEach(() => cleanup());

function widgets(container: ParentNode) {
	return {
		triggers: [...container.querySelectorAll<HTMLButtonElement>('[data-pwr-trigger]')],
		labels: [...container.querySelectorAll('[data-pwr-label]')],
	};
}

function expectEveryRowMintsItsOwnId(container: ParentNode) {
	const { triggers, labels } = widgets(container);
	// The group's own trigger plus one per row.
	expect(triggers.length).toBe(4);
	expect(labels.length).toBe(4);

	const ids = triggers.map((trigger) => trigger.getAttribute('id'));
	for (const id of ids) expect(id).toBeTruthy();
	expect(new Set(ids).size).toBe(ids.length);
	// The relationship is the proof: each label names its own row's trigger.
	for (const [index, label] of labels.entries())
		expect(label.getAttribute('for')).toBe(ids[index]);
}

async function expectRowGesturesStayInTheirRow(container: ParentNode) {
	expect(widgets(container).triggers.map((trigger) => trigger.textContent)).toEqual([
		'false',
		'false',
		'false',
		'false',
	]);

	widgets(container).triggers[2]?.click();
	await expect
		.poll(() => widgets(container).triggers.map((trigger) => trigger.textContent))
		.toEqual(['false', 'false', 'true', 'false']);
}

test('CSR: every row of a projected keyed loop mints its own widget id', async () => {
	const screen = await render(RowsPage);
	expectEveryRowMintsItsOwnId(screen.container as HTMLElement);
});

test('CSR: a gesture on one row leaves the other rows alone', async () => {
	const screen = await render(RowsPage);
	await expectRowGesturesStayInTheirRow(screen.container as HTMLElement);
});

test('SSR resume: minted ids and gestures agree with CSR', async () => {
	const screen = await renderSSR(RowsPage);
	expectEveryRowMintsItsOwnId(screen.container);
	await expectRowGesturesStayInTheirRow(screen.container);
});
