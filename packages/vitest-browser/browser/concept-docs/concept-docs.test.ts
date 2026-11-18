import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Profile from './profile.tsrx';
import Ticker from './ticker.tsrx';
import Presses from './unshown-state.tsrx';

afterEach(() => cleanup());

const press = (container: ParentNode, text: string) =>
	[...container.querySelectorAll('button')].find((button) => button.textContent?.trim() === text)!.click();
const texts = (container: ParentNode, selector: string) =>
	[...container.querySelectorAll(selector)].map((element) => element.textContent?.replace(/\s+/g, ' ').trim());

const mounts = {
	ticker: { CSR: () => render(Ticker), SSR: () => renderSSR(Ticker) },
	profile: { CSR: () => render(Profile), SSR: () => renderSSR(Profile) },
	presses: { CSR: () => render(Presses), SSR: () => renderSSR(Presses) },
};

for (const mode of ['CSR', 'SSR'] as const) {
	test(`${mode}: template-string attributes are written from state and follow it`, async () => {
		const { container } = await mounts.ticker[mode]();
		const link = () => (container as HTMLElement).querySelector('a')!;
		expect([link().getAttribute('href'), link().getAttribute('class'), link().dataset.testid]).toEqual([
			'/stocks/ACME',
			'ticker up',
			'row-ACME',
		]);
		press(container as HTMLElement, 'Next');
		await expect
			.poll(() => [link().getAttribute('href'), link().getAttribute('class'), link().dataset.testid])
			.toEqual(['/stocks/INIT', 'ticker down', 'row-INIT']);
	});

	test(`${mode}: a child gets a value prop and a callback prop, and the callback changes the parent's state`, async () => {
		const { container } = await mounts.profile[mode]();
		expect(texts(container as HTMLElement, 'p')).toEqual(['Hello, Ada', 'Saved as Ada']);
		press(container as HTMLElement, 'Rename');
		await expect.poll(() => texts(container as HTMLElement, 'p')).toEqual(['Hello, Grace', 'Saved as Grace']);
	});

	test(`${mode}: state the page never shows keeps its value across clicks for the handler that reads it`, async () => {
		const { container } = await mounts.presses[mode]();
		press(container as HTMLElement, 'Press');
		press(container as HTMLElement, 'Press');
		await new Promise((done) => requestAnimationFrame(done));
		expect(texts(container as HTMLElement, 'p')).toEqual(['']);
		press(container as HTMLElement, 'Press');
		await expect.poll(() => texts(container as HTMLElement, 'p')).toEqual(['Pressed three times']);
	});
}
