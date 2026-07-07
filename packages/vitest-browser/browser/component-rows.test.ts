import { expect, test } from 'vitest';
import { cleanup, renderSSR } from '../src/index.ts';
import App from './fixtures/component-rows.tsrx';

// T106 component-in-row: keyed repeat rows may invoke presentational
// components (markup only, item-scope props). The rows must SSR with the
// component's markup AND keep dispatching row events, including after a keyed
// reorder moves the row DOM.
test('SSR: component-in-row rows render child markup and dispatch row events across reorder', async () => {
	const screen = await renderSSR(App);
	const container = screen.container;

	const rows = Array.from(container.querySelectorAll('[data-card]'));
	expect(rows.map((row) => row.getAttribute('data-card'))).toEqual(['north', 'south']);
	// Each row executed the component with its own item in scope.
	expect(rows.map((row) => row.querySelector('em.tag')?.textContent)).toEqual([
		'North',
		'South',
	]);

	(rows[1] as HTMLElement).click();
	await expect
		.poll(() => container.querySelector('[data-chosen]')?.textContent)
		.toBe('south');

	(container.querySelector('[data-flip]') as HTMLElement).click();
	await expect
		.poll(() =>
			Array.from(container.querySelectorAll('[data-card]')).map((row) =>
				row.getAttribute('data-card'),
			),
		)
		.toEqual(['south', 'north']);

	// The moved row still resolves its own item locals on dispatch.
	const movedNorth = container.querySelector('[data-card="north"]') as HTMLElement;
	movedNorth.click();
	await expect
		.poll(() => container.querySelector('[data-chosen]')?.textContent)
		.toBe('north');
	await cleanup();
});
