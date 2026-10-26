import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import App from './optional-chain-page.tsrx';

afterEach(cleanup);

const text = (selector: string) => document.querySelector(selector)?.textContent ?? null;
const title = () => document.querySelector('[data-attr]')?.getAttribute('title') ?? null;
const press = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

const shown = () => ({
	root: text('[data-root]'),
	nested: text('[data-nested]'),
	fallback: text('[data-fallback]'),
	bracket: text('[data-bracket]'),
	upper: text('[data-upper]'),
	literal: text('[data-literal]'),
	title: title(),
	row: text('[data-row]'),
});

async function followsEveryWrite() {
	expect(shown()).toEqual({
		root: 'n',
		nested: '',
		fallback: 'none',
		bracket: '',
		upper: '',
		literal: '[-]',
		title: 'untitled',
		row: 'plain',
	});

	press('[data-set]');
	await expect.poll(shown).toEqual({
		root: 'n',
		nested: 'z',
		fallback: 'z',
		bracket: 'z',
		upper: 'Z',
		literal: '[z]',
		title: 'z',
		row: 'plain',
	});

	press('[data-deep]');
	await expect
		.poll(() => [text('[data-nested]'), text('[data-fallback]'), text('[data-upper]'), title()])
		.toEqual(['q', 'q', 'Q', 'q']);

	press('[data-name]');
	await expect.poll(() => text('[data-root]')).toBe('m');

	press('[data-unset]');
	await expect
		.poll(() => [text('[data-fallback]'), text('[data-literal]'), title()])
		.toEqual(['none', '[-]', 'untitled']);

	press('[data-tag]');
	await expect.poll(() => text('[data-row]')).toBe('hot');
}

test('CSR: text and attributes reading through ?. follow every write', async () => {
	await render(App);
	await followsEveryWrite();
});

test('SSR: text and attributes reading through ?. follow every write', async () => {
	await renderSSR(App);
	await followsEveryWrite();
});
