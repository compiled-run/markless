import { afterEach, expect, test } from 'vitest';
import { cleanup, renderSSR } from '../src/index.ts';
import CargoManifestPage from './fixtures/cargo-manifest-page.tsrx';

afterEach(() => cleanup());

test('SSR: composed cargo manifest form resumes the button after data-driven options', async () => {
	const screen = await renderSSR(CargoManifestPage);
	const container = screen.container;

	expect(container.querySelectorAll('select[data-lane] option')).toHaveLength(3);
	expect(container.querySelector('[data-after-form]')?.textContent).toBe('Ready for dispatch');

	const button = container.querySelector<HTMLButtonElement>('button[data-send]');
	if (!button) throw new Error('Expected the server-rendered manifest button.');
	button.click();

	await expect.poll(() => container.querySelector('output[data-status]')?.textContent).toBe(
		'submitted',
	);
});
