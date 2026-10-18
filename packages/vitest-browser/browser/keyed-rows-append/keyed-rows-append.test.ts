import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import AppendRows from './append-rows.tsrx';
import ReorderRows from './reorder-rows.tsrx';

afterEach(() => cleanup());

function watchChildList(list: Element) {
	const removed: Node[] = [];
	const added: Node[] = [];
	const observer = new MutationObserver((records) => {
		for (const record of records) {
			removed.push(...record.removedNodes);
			added.push(...record.addedNodes);
		}
	});
	observer.observe(list, { childList: true });
	return { removed, added, stop: () => observer.disconnect() };
}

const elements = (nodes: Node[]) => nodes.filter((node) => node.nodeType === 1) as Element[];

for (const mode of ['csr', 'ssr'] as const) {
	const csr = async (component: Parameters<typeof render>[0]) =>
		(await render(component)).container as unknown as HTMLElement;
	const mount = {
		append: async () =>
			mode === 'csr' ? csr(AppendRows) : (await renderSSR(AppendRows)).container,
		reorder: async () =>
			mode === 'csr' ? csr(ReorderRows) : (await renderSSR(ReorderRows)).container,
	};

	test(`${mode}: appending keyed rows inserts only the new rows and keeps focus`, async () => {
		const container = await mount.append();
		const list = container.querySelector('ul')!;
		const third = list.querySelector<HTMLElement>('[data-row="2"]')!;
		third.focus();
		const watch = watchChildList(list);
		container.querySelector<HTMLButtonElement>('[data-more]')!.click();
		await expect.poll(() => list.querySelectorAll('li').length).toBe(7);
		watch.stop();
		expect(elements(watch.removed)).toEqual([]);
		expect(
			elements(watch.added)
				.map((row) => row.getAttribute('data-row'))
				.sort(),
		).toEqual(['5', '6']);
		expect(document.activeElement).toBe(third);
		expect([...list.querySelectorAll('li')].map((row) => row.textContent)).toEqual(
			Array.from({ length: 7 }, (_, i) => `row ${i}`),
		);
	});

	test(`${mode}: rotating keyed rows moves one row and keeps the rest in place`, async () => {
		const container = await mount.reorder();
		const list = container.querySelector('ol')!;
		const c = list.querySelector<HTMLElement>('[data-name="c"]')!;
		c.focus();
		const watch = watchChildList(list);
		container.querySelector<HTMLButtonElement>('[data-rotate]')!.click();
		await expect
			.poll(() => [...list.querySelectorAll('li')].map((row) => row.textContent).join(''))
			.toBe('bcdea');
		watch.stop();
		expect(elements(watch.removed).map((row) => row.getAttribute('data-name'))).toEqual(['a']);
		expect(document.activeElement).toBe(c);
	});
}
