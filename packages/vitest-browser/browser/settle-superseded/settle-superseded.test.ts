import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { Page } from './page.tsrx';

// A keystroke that starts a newer search while the previous answer is still being drawn keeps the list, marked busy.
afterEach(() => cleanup());

function typeWhenRowsBecome(container: HTMLElement, rows: string, character: string) {
	return new Promise<void>((resolve) => {
		const observer = new MutationObserver(() => {
			const shown = [...container.querySelectorAll('li')].map((row) => row.textContent).join();
			if (shown !== rows) return;
			observer.disconnect();
			type(container.querySelector('input')!, character);
			resolve();
		});
		observer.observe(container, { childList: true, subtree: true, characterData: true });
	});
}

function type(input: HTMLInputElement, character: string) {
	input.value += character;
	input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function exercise(container: HTMLElement) {
	const list = () => container.querySelector('ul');
	const rows = () => [...container.querySelectorAll('li')].map((row) => row.textContent).join();
	const input = () => container.querySelector('input')!;
	const seen: string[] = [];
	const watch = new MutationObserver(() => {
		const pending = container.querySelector('p')?.textContent;
		if (pending) seen.push(pending);
	});
	await expect.poll(() => container.querySelectorAll('li').length, { timeout: 5_000 }).toBe(7);
	watch.observe(container, { childList: true, subtree: true, characterData: true });
	// Each keystroke lands the moment the previous answer's rows appear, before that answer finishes drawing.
	for (const [character, answer] of [
		['p', 'apple,apricot,banana,grape,mango'],
		['r', 'apple,apricot,grape'],
	] as const) {
		const typed = typeWhenRowsBecome(container, answer, character);
		if (character === 'p') type(input(), 'a');
		await typed;
	}
	await expect.poll(rows, { timeout: 5_000 }).toBe('apricot');
	await expect.poll(() => list()?.getAttribute('aria-busy') ?? null).toBe(null);
	watch.disconnect();
	expect(seen).toEqual([]);
}

test('CSR: a newer search started while an answer is drawn keeps the list instead of @pending', async () => {
	const screen = await render(Page);
	await exercise(screen.container as HTMLElement);
});

test('SSR: a newer search started while an answer is drawn keeps the list instead of @pending after resume', async () => {
	const screen = await renderSSR(Page);
	await exercise(screen.container as HTMLElement);
});
