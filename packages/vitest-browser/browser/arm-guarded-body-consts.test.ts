import { cleanup, render, renderSSR } from '../src/index.ts';
import { afterEach, expect, test } from 'vitest';
import Page from './fixtures/arm-guarded-body-consts.tsrx';

// A body const an @if arm reads is only evaluated while the arm's guard holds.

afterEach(cleanup);

async function exercise(container: ParentNode) {
	const title = (path: string) => container.querySelector(`[data-head="${path}"] [data-title]`);
	expect(title('/')?.textContent).toBe('Home');
	expect(title('/guide')?.textContent).toBe('Guide');
	expect(
		container.querySelector('[data-head="/guide"] meta[name="description"]')?.getAttribute('content'),
	).toBe('Read the guide');

	const role = (who: string) => container.querySelector(`[data-card="${who}"] [data-role]`);
	expect(role('nobody')?.textContent).toBe('none');
	expect(role('ada')?.textContent).toBe('Ada');
	expect(role('ada')?.getAttribute('title')).toBe('Engineer');

	const picked = () => container.querySelector('[data-picker] [data-picked]');
	const pick = () => (container.querySelector('[data-pick]') as HTMLButtonElement).click();
	expect(picked()).toBeNull();
	pick();
	await expect.poll(() => picked()?.textContent).toBe('Ada');
	expect(picked()?.getAttribute('title')).toBe('Engineer');
	pick();
	await expect.poll(picked).toBeNull();
	pick();
	await expect.poll(() => picked()?.textContent).toBe('Ada');
}

test('CSR: an @if arm reading a possibly-undefined body const renders the other arm when it is absent', async () => {
	const screen = await render(Page);
	await exercise(screen.container as HTMLElement);
});

test('SSR: an @if arm reading a possibly-undefined body const renders the other arm when it is absent', async () => {
	const screen = await renderSSR(Page);
	await exercise(screen.container as HTMLElement);
});
