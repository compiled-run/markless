import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import App from './fixtures/handler-body-local.tsrx';

// A handler and a callback prop read body-local consts; the browser symbol
// recomputes each const from its definition, since the component body never
// runs there.

afterEach(cleanup);

for (const mode of ['CSR', 'SSR'] as const) {
	test(`${mode}: handlers reading body-local consts see the values the render saw`, async () => {
		const screen = mode === 'CSR' ? await render(App) : await renderSSR(App);
		const container = screen.container as HTMLElement;

		(container.querySelector('[data-locate]') as HTMLButtonElement).click();
		await expect
			.poll(() => container.querySelector('[data-note]')?.textContent)
			.toBe('Rope in aisle 9');

		(container.querySelector('[data-pick]') as HTMLButtonElement).click();
		await expect.poll(() => container.querySelector('[data-picked]')?.textContent).toBe('rp!');
	});
}
