import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { poll } from '../back-revalidate/support.ts';
import CounterPage from './page.tsrx';

// A same-module child opened in a @try's @if keeps counting: `x = x + 1` and `x += 1` both read its own state.
afterEach(() => cleanup());
const mount = { CSR: () => render(CounterPage), SSR: () => renderSSR(CounterPage) };
const text = (selector: string) => document.querySelector(selector)?.textContent?.trim();

for (const mode of ['CSR', 'SSR'] as const)
	test(`${mode}: a counter in a same-module child an arm opens counts from its own value`, async () => {
		await mount[mode]();
		await expect.poll(() => text('h4'), poll).toBe('Heading');
		document.querySelector<HTMLElement>('[data-open]')!.click();
		await expect.poll(() => text('[data-chip]'), poll).toBe('chip 0');
		document.querySelector<HTMLElement>('[data-chip]')!.click();
		document.querySelector<HTMLElement>('[data-step]')!.click();
		await expect.poll(() => [text('[data-chip]'), text('[data-step]')], poll).toEqual(['chip 1', 'step 1']);
		document.querySelector<HTMLElement>('[data-chip]')!.click();
		await expect.poll(() => text('[data-chip]'), poll).toBe('chip 2');
	});
