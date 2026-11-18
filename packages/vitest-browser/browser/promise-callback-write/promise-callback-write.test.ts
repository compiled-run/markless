import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './pcw-page.tsrx';
import SplitPage from './pcw-split.tsrx';
import InterleavedPage from './pcw-interleaved.tsrx';

afterEach(cleanup);

const text = (selector: string) => document.querySelector(selector)?.textContent;
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();
// Each pending promise waits for the test to resolve it, so the callback always runs after its handler returned.
const held = () => ((globalThis as { __heldResults?: Array<() => void> }).__heldResults ??= []);
const settle = async () => {
	await expect.poll(() => held().length).toBe(1);
	for (const resolve of held().splice(0)) resolve();
};

for (const mode of ['CSR', 'SSR'] as const) {
	test(`${mode}: a state write inside a promise callback a handler started lands`, async () => {
		if (mode === 'CSR') await render(Page);
		else await renderSSR(Page);
		held().length = 0;
		click('[data-let]');
		await settle();
		await expect.poll(() => text('[data-label]')).toBe('loaded');
	});

	test(`${mode}: object state writes inside a promise callback land after the handler returned`, async () => {
		if (mode === 'CSR') await render(Page);
		else await renderSSR(Page);
		held().length = 0;
		click('[data-object]');
		await expect.poll(() => text('[data-status]')).toBe('waiting');
		await settle();
		await expect.poll(() => text('[data-rows]')).toBe('a,b');
		await expect.poll(() => text('[data-status]')).toBe('ready');
	});

	test(`${mode}: a callback prop a child calls from a promise callback writes the parent's state`, async () => {
		if (mode === 'CSR') await render(SplitPage);
		else await renderSSR(SplitPage);
		held().length = 0;
		click('[data-open]');
		await expect.poll(() => text('[data-opened]')).toBe('open');
		await settle();
		await expect.poll(() => text('[data-ready]')).toBe('yes');
		await expect.poll(() => document.querySelectorAll('[data-results] li').length).toBe(2);
	});

	test(`${mode}: a promise callback's writes land after another handler ran in between`, async () => {
		if (mode === 'CSR') await render(InterleavedPage);
		else await renderSSR(InterleavedPage);
		held().length = 0;
		click('[data-load]');
		await expect.poll(() => held().length).toBe(1);
		const field = document.querySelector<HTMLInputElement>('[data-query]')!;
		field.value = 'sh';
		field.dispatchEvent(new Event('input', { bubbles: true }));
		await expect.poll(() => text('[data-waiting]')).toBe('waiting');
		await settle();
		await expect.poll(() => text('[data-list]')).toBe('one:shtwo:sh');
		await expect.poll(() => text('[data-waiting]')).toBe('still');
	});
}
