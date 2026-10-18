import { expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import App from './fixtures/component-row-press.tsrx';

const notes = (container: Element): string[] =>
	Array.from(container.querySelectorAll('[data-note]')).map(
		(row) => row.getAttribute('data-note') ?? '',
	);

// A minted row is on the page a few awaits before its events are registered: a
// press in that window has to wait for them, not fall through as a click on nothing.
async function pressTheRowAsItLands(container: Element): Promise<void> {
	const landed = new MutationObserver(() => {
		const button = container.querySelector('[data-note="second"] [data-dismiss]');
		if (!button) return;
		landed.disconnect();
		(button as HTMLElement).click();
	});
	landed.observe(container, { childList: true, subtree: true });
	(container.querySelector('[data-add]') as HTMLElement).click();
	await expect.poll(() => notes(container)).toEqual(['first', 'second']);
	await expect.poll(() => container.querySelector('[data-dismissed]')?.textContent).toBe('second');
	await cleanup();
}

test('CSR: a press on a component row the moment it lands still reaches its handler', async () => {
	await pressTheRowAsItLands((await render(App)).container);
});

test('SSR: a press on a component row the moment it lands still reaches its handler', async () => {
	await pressTheRowAsItLands((await renderSSR(App)).container);
});
