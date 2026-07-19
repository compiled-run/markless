import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSRPhased } from '../src/index.ts';
import DeepBindery from './fixtures/chained-async-deep-bindery.tsrx';

afterEach(() => cleanup());

test('three async levels settle on SSR when only the final level reaches the template', async () => {
	const server = await renderSSRPhased(DeepBindery);
	const document = serverDocument(server.html);

	expect(document.querySelector('[data-volume-arm]')?.textContent).toBe('Volume flax-fold-sewn');
});

test('cold CSR gates a three-level chain and revalidates every runner from the root write', async () => {
	(globalThis as any).__deepBinderyRuns = { a: 0, b: 0, c: 0 };
	const screen = await render(DeepBindery);
	const container = screen.container as HTMLElement;
	const samples: string[] = [];
	const observer = observeRecords(container, samples);

	expect(container.querySelector('[data-volume-arm]')?.textContent).toBe('Stitching volume');
	await expect
		.poll(() => container.querySelector('[data-volume-arm]')?.textContent)
		.toBe('Volume flax-fold-sewn');
	expect((globalThis as any).__deepBinderyRuns).toEqual({ a: 1, b: 1, c: 1 });

	const change = container.querySelector<HTMLButtonElement>('button[data-switch-fiber]');
	if (!change) throw new Error('Expected the fiber control.');
	change.click();
	await expect
		.poll(() => container.querySelector('[data-volume-arm]')?.textContent)
		.toBe('Volume cotton-fold-sewn');
	observer.disconnect();

	expect((globalThis as any).__deepBinderyRuns).toEqual({ a: 2, b: 2, c: 2 });
	expect(samples).not.toContain('Binding spoiled');
});

function serverDocument(html: string): DocumentFragment {
	const template = window.document.createElement('template');
	template.innerHTML = html;
	return template.content;
}

function observeRecords(container: HTMLElement, samples: string[]): MutationObserver {
	const observer = new MutationObserver((records) => {
		for (const record of records) {
			if (record.type === 'characterData' && record.target.textContent !== null) {
				samples.push(record.target.textContent);
			}
			for (const node of record.addedNodes) {
				if (node.textContent) samples.push(node.textContent);
			}
		}
	});
	observer.observe(container, { characterData: true, childList: true, subtree: true });
	return observer;
}
