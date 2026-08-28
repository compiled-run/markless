import { page } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import MethodReadPage from './method-read-page.tsrx';

/**
 * A template read spelled as a method call - `{box.items.join('|')}` in text,
 * `ui-joined={box.items.join('|')}` on an attribute - used to render once and
 * never move: no synthetic computed was minted for it, so no DOM update record
 * reached the browser and nothing subscribed the write. Measurement and the byte
 * cost are in goals/headless-components/notes/U721-method-call-template-reads.md.
 */
afterEach(() => cleanup());

const el = (testid: string) => page.getByTestId(testid).element() as HTMLElement;
const text = (testid: string) => el(testid).textContent;
const attribute = (name: string) => el('host').getAttribute(name);
const grow = () => (el('grow') as HTMLButtonElement).click();

for (const mode of ['CSR', 'SSR'] as const) {
	const mount = async () =>
		mode === 'CSR' ? await render(MethodReadPage) : await renderSSR(MethodReadPage);

	test(`${mode}: a method call in a text child refreshes after a write`, async () => {
		await mount();

		expect(text('joined')).toBe('alpha|beta');
		expect(text('tail')).toBe('beta');
		expect(text('shout')).toBe('READY');

		grow();

		await expect.poll(() => text('len')).toBe('3');
		await expect.poll(() => text('joined')).toBe('alpha|beta|gamma');
		await expect.poll(() => text('tail')).toBe('beta,gamma');
		await expect.poll(() => text('shout')).toBe('GROWN');
	});

	test(`${mode}: a method call in an attribute refreshes after a write`, async () => {
		await mount();

		expect(attribute('ui-joined')).toBe('alpha|beta');
		expect(attribute('ui-tail')).toBe('beta');
		expect(attribute('ui-shout')).toBe('READY');

		grow();

		await expect.poll(() => text('len')).toBe('3');
		await expect.poll(() => attribute('ui-joined')).toBe('alpha|beta|gamma');
		await expect.poll(() => attribute('ui-tail')).toBe('beta,gamma');
		await expect.poll(() => attribute('ui-shout')).toBe('GROWN');
	});
}
