import { page } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import { render, renderSSR } from '../../src/index.ts';
import ReexportPage from './reexport-page.tsrx';

const el = (testid: string) => page.getByTestId(testid).element() as HTMLElement;

for (const mode of ['CSR', 'SSR'] as const) {
	test(`${mode}: components imported through a .tsrx re-export render and stay live`, async () => {
		if (mode === 'CSR') await render(ReexportPage);
		else await renderSSR(ReexportPage);
		expect(el('card').textContent).toContain('default card');
		expect(el('badge').textContent).toBe('named badge');
		expect(el('own').textContent).toBe('own part');
		el('card-press').click();
		await expect.poll(() => el('card-press').textContent).toBe('1');
	});
}
