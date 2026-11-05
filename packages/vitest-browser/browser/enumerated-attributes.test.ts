import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Page from './enumerated-attributes/page.tsrx';

// draggable, contenteditable and spellcheck take the words "true" and "false": an empty value means the default, not true.

afterEach(cleanup);

const read = (selector: string, names: ReadonlyArray<string>) => {
	const element = document.querySelector(selector)!;
	return names.map((name) => element.getAttribute(name));
};
const ENUMERATED = ['draggable', 'contenteditable', 'spellcheck'];
const rows = () =>
	[...document.querySelectorAll('[data-row]')].flatMap((row) => [
		row.getAttribute('draggable'),
		row.getAttribute('spellcheck'),
	]);

async function enumeratedWords() {
	expect(read('[data-fixed-on]', ENUMERATED)).toEqual(['true', 'true', 'true']);
	expect(read('[data-fixed-off]', ENUMERATED)).toEqual(['false', 'false', 'false']);
	expect(read('[data-bare]', ['draggable'])).toEqual(['true']);
	expect((document.querySelector('[data-fixed-on]') as HTMLElement).draggable).toBe(true);
	expect(read('[data-live]', [...ENUMERATED, 'aria-pressed'])).toEqual([
		'true',
		'true',
		'true',
		'true',
	]);
	expect(rows()).toEqual(['true', 'true', 'true', 'true']);
	document.querySelector<HTMLElement>('[data-flip]')!.click();
	await expect
		.poll(() => read('[data-live]', [...ENUMERATED, 'aria-pressed']))
		.toEqual(['false', 'false', 'false', null]);
	await expect.poll(rows).toEqual(['false', 'false', 'false', 'false']);
	expect((document.querySelector('[data-live]') as HTMLElement).draggable).toBe(false);
	document.querySelector<HTMLElement>('[data-flip]')!.click();
	await expect
		.poll(() => read('[data-live]', [...ENUMERATED, 'aria-pressed']))
		.toEqual(['true', 'true', 'true', 'true']);
	await expect.poll(rows).toEqual(['true', 'true', 'true', 'true']);
}

test('CSR: draggable, contenteditable and spellcheck render and update as "true" and "false"', async () => {
	await render(Page);
	await enumeratedWords();
});
test('SSR resume: draggable, contenteditable and spellcheck render and update as "true" and "false"', async () => {
	await renderSSR(Page);
	await enumeratedWords();
});
