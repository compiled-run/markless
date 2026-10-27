import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import BoundaryRowAttributes from './boundary-row-attribute-page.tsrx';

afterEach(() => cleanup());

for (const mode of ['SSR', 'CSR'] as const)
	test(`${mode}: an @try whose keyed rows bind attributes from the row re-settles with each row's attributes`, async () => {
		const { container } = await (mode === 'SSR' ? renderSSR(BoundaryRowAttributes) : render(BoundaryRowAttributes));
		const rows = () =>
			[...container.querySelectorAll('ol li')]
				.map((row) => `${row.id}|${row.getAttribute('data-kind')}|${row.getAttribute('title')}|${row.textContent}`)
				.join(',');
		await expect.poll(rows).toBe('oak|tree|Oak|Oak,elm|tree|Elm|Elm');
		container.querySelector<HTMLButtonElement>('[data-plants]')!.click();
		await expect.poll(rows).toBe('fern|plant|Fern|Fern');
		container.querySelector<HTMLButtonElement>('[data-trees]')!.click();
		await expect.poll(rows).toBe('oak|tree|Oak|Oak,elm|tree|Elm|Elm');
	});
