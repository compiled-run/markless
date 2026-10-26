import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import Thread from './thread.tsrx';

// A row of a component that renders itself takes new props when the state above it changes, at every depth.
afterEach(() => cleanup());

for (const mode of ['SSR', 'CSR'] as const) {
	test(`${mode}: a change deep in a recursive tree reaches the nested row that shows it`, async () => {
		const { container } = await (mode === 'SSR' ? renderSSR(Thread) : render(Thread));
		const texts = () => [...container.querySelectorAll('[data-text]')].map((node) => node.textContent).join(',');
		expect(texts()).toBe('root,child,grandchild,leaf,sibling');
		container.querySelector<HTMLButtonElement>('[data-edit-deep]')!.click();
		await expect.poll(texts).toBe('root,child,grandchild,leaf edited,sibling');
		container.querySelector<HTMLButtonElement>('[data-edit-mid]')!.click();
		await expect.poll(texts).toBe('root,child,grandchild edited,leaf edited,sibling');
		container.querySelector<HTMLButtonElement>('[data-edit-child]')!.click();
		await expect.poll(texts).toBe('root,child edited,grandchild edited,leaf edited,sibling');
		container.querySelector<HTMLButtonElement>('[data-edit-root]')!.click();
		await expect.poll(texts).toBe('root edited,child edited,grandchild edited,leaf edited,sibling');
	});
}
