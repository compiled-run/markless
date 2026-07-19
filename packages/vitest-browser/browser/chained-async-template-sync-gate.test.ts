import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import TemplateSyncGate from './fixtures/chained-async-template-sync-gate.tsrx';

afterEach(() => cleanup());

async function expectInitialAndRevalidated(container: HTMLElement): Promise<void> {
	await expect
		.poll(() => container.querySelector('[data-card]')?.textContent)
		.toBe('first-east / first-west');
	expect(container.querySelector('[data-failure]')).toBeNull();

	const next = container.querySelector<HTMLButtonElement>('[data-next-phase]');
	if (!next) throw new Error('Expected the phase control.');
	next.click();
	await expect
		.poll(() => container.querySelector('[data-card]')?.textContent)
		.toBe('second-east / second-west');
	expect(container.querySelector('[data-failure]')).toBeNull();
}

test('SSR and resume gate a template-read sync computed on both async ancestors', async () => {
	const screen = await renderSSR(TemplateSyncGate);
	await expectInitialAndRevalidated(screen.container);
});

test('cold CSR gates a template-read sync computed and revalidates it', async () => {
	const screen = await render(TemplateSyncGate);
	await expectInitialAndRevalidated(screen.container as HTMLElement);
});
