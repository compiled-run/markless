import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR, renderServerHTML, renderStream } from '../../src/index.ts';
import { answer, asked, forgetRequests } from './gate.ts';
import ComposedPage from './composed-page.tsrx';

// An imported child's @try that reads two async values, or one through a computed, serves those reads filled.
afterEach(() => {
	cleanup();
	forgetRequests();
});

const text = (selector: string) => document.querySelector(selector)?.textContent ?? null;

async function reply(key: string) {
	await expect.poll(() => asked(key)).toBe(true);
	answer(key);
}

async function addFollows() {
	document.querySelector<HTMLElement>('[data-add]')!.click();
	await expect.poll(() => text('[data-total]')).toBe('2 x 30');
}

const served = () => [text('[data-name]'), text('[data-total]'), text('[data-order]'), text('[data-route]')];

test('streamed: an imported child @try reading two async values or a computed is served with them', async () => {
	const { shell, appends } = await renderStream(ComposedPage);
	expect(appends).toEqual([]);
	renderServerHTML(shell);
	expect(served()).toEqual(['Lamp', '1 x 30', 'Lamp', '4']);
	await addFollows();
});

test('SSR: served reads of an imported child @try are filled, and the total follows plain state', async () => {
	await renderSSR(ComposedPage);
	expect([text('[data-name]'), text('[data-total]'), text('[data-order]'), text('[data-route]')]).toEqual([
		'Lamp',
		'1 x 30',
		'Lamp',
		'4',
	]);
	await addFollows();
});

test('CSR: an imported child @try reading two async values or a computed shows them', async () => {
	await render(ComposedPage);
	await reply('quote:0');
	await reply('quote:0');
	await reply('chapter:7');
	await expect
		.poll(() => [text('[data-name]'), text('[data-total]'), text('[data-order]'), text('[data-route]')])
		.toEqual(['Lamp', '1 x 30', 'Lamp', '4']);
	await addFollows();
});
