import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { RelayLists } from './lists.tsrx';
import { server } from './server.ts';

afterEach(() => {
	server.failing = false;
	cleanup();
});

const items = (list: Element | null) =>
	[...(list?.querySelectorAll('[data-item]') ?? [])].map((item) =>
		item.firstChild?.textContent?.trim(),
	);

for (const mode of ['CSR', 'SSR'] as const) {
	test(`${mode}: a failed refresh shows @catch after the kept rows of a list whose rows relay a callback prop, and Retry loads it again`, async () => {
		const { container } = await (mode === 'CSR' ? render(RelayLists) : renderSSR(RelayLists));
		const all = () => container.querySelector('[data-list="all"]');
		const grape = () => container.querySelector('[data-list="grape"]');
		await expect.poll(() => items(all()), { timeout: 5_000 }).toEqual(['apple', 'grape']);
		await expect.poll(() => items(grape())).toEqual(['grape']);

		const type = (value: string) => {
			const input = all()!.querySelector<HTMLInputElement>('[data-filter]')!;
			input.value = value;
			input.dispatchEvent(new Event('input', { bubbles: true }));
		};
		type('pl');
		await expect.poll(() => items(all())).toEqual(['apple']);
		type('');
		await expect.poll(() => items(all())).toEqual(['apple', 'grape']);

		server.failing = true;
		container.querySelector<HTMLElement>('[data-refetch]')!.click();
		await expect
			.poll(() => all()?.querySelector('[data-failed]')?.firstChild?.textContent)
			.toBe('no items for all');
		await expect
			.poll(() => grape()?.querySelector('[data-failed]')?.firstChild?.textContent)
			.toBe('no items for grape');
		expect(items(all())).toEqual(['apple', 'grape']);
		expect(all()!.querySelectorAll('ul')).toHaveLength(1);

		server.failing = false;
		all()!.querySelector<HTMLElement>('[data-retry]')!.click();
		await expect.poll(() => all()?.querySelector('[data-failed]')).toBeNull();
		expect(items(all())).toEqual(['apple', 'grape']);
		expect(grape()?.querySelector('[data-failed]')).not.toBeNull();

		all()!.querySelector<HTMLElement>('[data-item] button')!.click();
		await expect.poll(() => container.querySelector('[data-picked]')?.textContent).toBe('0');
	});
}
