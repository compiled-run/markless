import { expect, test } from 'vitest';
import { render, renderSSR } from '../../src/index.ts';
import MovedPage from './moved-page.tsrx';

// A script that moves served markup (a dialog portaled to the end of the page) takes it out and puts it back in one task.
for (const mode of ['csr', 'ssr'] as const)
	test(`${mode}: a handler inside markup a script moved within the page still runs`, async () => {
		const container =
			mode === 'csr'
				? ((await render(MovedPage)).container as unknown as HTMLElement)
				: (await renderSSR(MovedPage)).container;
		await expect.poll(() => container.querySelector('p[data-visible]')?.textContent).toBe('1');
		const layer = container.querySelector('section[data-layer]')!;
		const end = container.querySelector('[data-end]')!;
		end.parentElement!.insertBefore(layer, end);
		await new Promise((done) => setTimeout(done, 50));
		const input = container.querySelector<HTMLInputElement>('input[data-query]')!;
		input.value = 'z';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		await expect
			.poll(() =>
				[...container.querySelectorAll('li')]
					.map((row) => row.getAttribute('data-value'))
					.join(','),
			)
			.toBe('zinc,zod,zero');
	});
