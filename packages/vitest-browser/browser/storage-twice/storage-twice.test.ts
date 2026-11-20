import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { storageCookieName } from '../../../serializer/src/storage-slot.ts';
import CountersPage from './counters-page.tsrx';

// Two copies of a component that call storage() with one key show one value, as the page and one copy do.
afterEach(async () => {
	await cleanup();
	localStorage.removeItem('taps');
	document.cookie = `${storageCookieName('taps')}=;path=/;max-age=0`;
	delete (globalThis as Record<symbol, unknown>)[Symbol.for('tsrx.storage/1')];
});

const labels = (container: ParentNode) =>
	[...container.querySelectorAll('button')].map((button) => button.textContent?.trim());

for (const mode of ['SSR', 'CSR'] as const) {
	test(`${mode}: two copies of a component share one storage() value`, async () => {
		const { container } = await (mode === 'SSR' ? renderSSR(CountersPage) : render(CountersPage));
		expect(labels(container)).toEqual(['Left 0', 'Right 0']);
		container.querySelector('button')!.click();
		await expect.poll(() => labels(container)).toEqual(['Left 1', 'Right 1']);
	});
}
