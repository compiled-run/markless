import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import ConsistentReads from './consistent-reads-page.tsrx';

afterEach(cleanup);

const text = (selector: string) => document.querySelector(selector)?.textContent ?? null;
const press = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

async function everyPositionFollowsTheWrite() {
	expect([text('[data-named]'), text('[data-namespace]'), text('[data-local]')]).toEqual([
		'Ada Lovelace',
		'Ada Lovelace',
		'AL',
	]);
	press('[data-rename]');
	await expect
		.poll(() => [
			text('[data-named]'),
			document.querySelector('[data-named]')?.getAttribute('title'),
			text('[data-namespace]'),
			text('[data-local]'),
		])
		.toEqual(['Bo Lovelace', 'Bo Lovelace', 'Bo Lovelace', 'BL']);

	expect(text('[data-deep]')).toBe('ADA');
	press('[data-deepen]');
	await expect.poll(() => text('[data-deep]')).toBe('CY');

	expect([text('[data-picked]'), text('[data-template-pick]')]).toEqual(['Ada!', 'Ada']);
	press('[data-select]');
	await expect.poll(() => [text('[data-picked]'), text('[data-template-pick]')]).toEqual(['Bo!', 'Bo']);
	press('[data-retitle]');
	await expect.poll(() => [text('[data-picked]'), text('[data-template-pick]')]).toEqual(['Cy!', 'Cy']);

	press('[data-run]');
	await expect.poll(() => text('[data-count]')).toBe('1');
	press('[data-flip]');
	press('[data-run]');
	await expect.poll(() => text('[data-count]')).toBe('0');
}

test('CSR: a read means the same thing in text, attributes, computed() and handlers', async () => {
	await render(ConsistentReads);
	await everyPositionFollowsTheWrite();
});

test('SSR: a read means the same thing in text, attributes, computed() and handlers', async () => {
	await renderSSR(ConsistentReads);
	await everyPositionFollowsTheWrite();
});
