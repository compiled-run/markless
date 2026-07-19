import { afterEach, expect, test } from 'vitest';
import { cleanup, renderServerHTML, renderStreamShell } from '../src/index.ts';
import KilnResume from './fixtures/chained-async-kiln-resume.tsrx';

afterEach(() => cleanup());

test('resume gates a serialized pending downstream until its upstream settles, then revalidates', async () => {
	const shell = await renderStreamShell(KilnResume);
	expect(shell).toContain('Heating kiln');
	expect(shell).toContain('Lettering plaque');
	expect(shell).toContain('"status":"pending"');

	// The stream command runs in Node, so its counters do not enter the browser
	// realm. Initialize browser witnesses after receiving the serialized shell.
	(globalThis as any).__kilnResumeRuns = { gauge: 0, plaque: 0 };
	const screen = renderServerHTML(shell);
	const container = screen.container;

	await expect.poll(() => (globalThis as any).__kilnResumeRuns.gauge).toBe(1);
	expect((globalThis as any).__kilnResumeRuns.plaque).toBe(0);
	expect(container.querySelector('[data-plaque-arm]')?.textContent).toBe('Lettering plaque');

	await expect
		.poll(() => container.querySelector('[data-plaque-arm]')?.textContent, { timeout: 5_000 })
		.toBe('Plaque cobalt-fired');
	expect((globalThis as any).__kilnResumeRuns).toEqual({ gauge: 1, plaque: 1 });

	const change = container.querySelector<HTMLButtonElement>('button[data-change-glaze]');
	if (!change) throw new Error('Expected the glaze control in the resumed shell.');
	change.click();
	await expect
		.poll(() => container.querySelector('[data-plaque-arm]')?.textContent, { timeout: 5_000 })
		.toBe('Plaque ochre-fired');
	expect((globalThis as any).__kilnResumeRuns).toEqual({ gauge: 2, plaque: 2 });
});

test('pending-shell self-wake and an immediate event share one runtime startup', async () => {
	const shell = await renderStreamShell(KilnResume);
	(globalThis as any).__kilnResumeRuns = { gauge: 0, plaque: 0 };
	const screen = renderServerHTML(shell);
	const container = screen.container;
	const change = container.querySelector<HTMLButtonElement>('button[data-change-glaze]');
	if (!change) throw new Error('Expected the glaze control in the pending shell.');

	change.click();

	await expect
		.poll(() => container.querySelector('[data-plaque-arm]')?.textContent, { timeout: 5_000 })
		.toBe('Plaque ochre-fired');
	// Startup re-enters the shell's serialized pending gauge once. The immediate
	// glaze write then aborts that cobalt run and revalidates it once for ochre.
	// The plaque stays dependency-gated until the ochre gauge settles, so it runs once.
	expect((globalThis as any).__kilnResumeRuns).toEqual({ gauge: 2, plaque: 1 });
});
