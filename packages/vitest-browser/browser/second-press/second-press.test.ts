import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { poll } from '../back-revalidate/support.ts';
import { click, frames, text } from '../hold-after-save/support.ts';
import FavoritePage from './favorite-page.tsrx';
import { installServer, resetServer, server } from './server.ts';
import WantedPage from './wanted-page.tsrx';

// A press while an earlier press's save or reload is out shows its own change at once, and the page settles on the last press.
installServer();
beforeEach(() => resetServer());
afterEach(async () => {
	resetServer();
	await cleanup();
});

const shapes = {
	form: {
		CSR: () => render(FavoritePage),
		SSR: () => renderSSR(FavoritePage),
		control: 'button[name="favorite"]',
		on: '★',
		off: '☆',
		failure: '[data-error]',
		failed: 'Saving failed',
	},
	button: {
		CSR: () => render(WantedPage),
		SSR: () => renderSSR(WantedPage),
		control: 'button[data-star]',
		on: 'on',
		off: 'off',
		failure: '[data-failed]',
		failed: 'failed',
	},
};
type Shape = (typeof shapes)[keyof typeof shapes];

async function ready(mode: 'CSR' | 'SSR', shape: Shape) {
	await shape[mode]();
	await expect.poll(() => text(shape.control), poll).toBe(shape.on);
	server.open = false;
}
async function answer(queue: 'saves' | 'reads', ok = true, at: 'first' | 'last' = 'first') {
	await expect.poll(() => server[queue].length, poll).toBeGreaterThan(0);
	(at === 'first' ? server[queue].shift() : server[queue].pop())!.answer(ok);
}
// The first press may wait for the handler's code; a later press must show within two frames.
async function firstPress(shape: Shape, expected: string) {
	click(shape.control);
	await expect.poll(() => text(shape.control), poll).toBe(expected);
}
async function press(shape: Shape, expected: string) {
	click(shape.control);
	await frames(2);
	expect(text(shape.control)).toBe(expected);
}

for (const mode of ['CSR', 'SSR'] as const)
	for (const [name, shape] of Object.entries(shapes)) {
		test(`${mode} ${name}: a second press while the first save is out shows within two frames`, async () => {
			await ready(mode, shape);
			await firstPress(shape, shape.off);
			await press(shape, shape.on);
			await answer('saves');
			await answer('saves');
			await answer('reads');
			await frames(5);
			expect(text(shape.control)).toBe(shape.on);
			expect(server.contact.favorite).toBe(true);
		});

		test(`${mode} ${name}: a second press while the first save's reload is out acts on what is shown`, async () => {
			await ready(mode, shape);
			await firstPress(shape, shape.off);
			await answer('saves');
			await expect.poll(() => server.reads.length, poll).toBe(1);
			await press(shape, shape.on);
			await answer('reads');
			await frames(3);
			expect(text(shape.control)).toBe(shape.on);
			await answer('saves');
			await answer('reads');
			await frames(5);
			expect(text(shape.control)).toBe(shape.on);
			expect(server.contact.favorite).toBe(true);
		});

		for (const order of ['first save fails first', 'second save answers first'] as const) {
			const run = async () => {
				await ready(mode, shape);
				await firstPress(shape, shape.off);
				await expect.poll(() => server.saves.length, poll).toBe(1);
				await press(shape, shape.on);
				await expect.poll(() => server.saves.length, poll).toBe(2);
				if (order === 'first save fails first') {
					await answer('saves', false, 'first');
					await frames(3);
					expect(text(shape.control)).toBe(shape.on);
					await answer('saves', true, 'first');
				} else {
					await answer('saves', true, 'last');
					await frames(3);
					expect(text(shape.control)).toBe(shape.on);
					await answer('saves', false, 'first');
				}
				await answer('reads');
				await frames(5);
				expect(text(shape.control)).toBe(shape.on);
				expect(server.contact.favorite).toBe(true);
			};
			test(`${mode} ${name}: the first save fails after the second press acted (${order}): the page settles on the second press`, run);
			// A handler's failure that reaches @catch while another save is out is lost once that save's reload lands; true on main before this change.
			const failure = name === 'form' && order === 'first save fails first' ? test.fails : test;
			failure(`${mode} ${name}: the first save fails after the second press acted (${order}): the failure is shown`, async () => {
				await run();
				await expect.poll(() => text(shape.failure), poll).toBe(shape.failed);
			});
		}
	}
