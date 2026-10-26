import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '../src/index.ts';
import ResettleDeadline from './fixtures/resettle-deadline.tsrx';

// Spec D8 re-settle, frame-sampled: a refresh past the 250 ms navigation deadline but under the stall threshold
// keeps the prior settled content, marked aria-busy, until the fresh content commits. Exact timing is
// property-tested under the fake clock in packages/web/test/resettle-hold-timing.test.ts.
afterEach(() => cleanup());

test('a re-settle under the stall threshold holds the prior content busy and never shows @pending', async () => {
	const screen = await render(ResettleDeadline);
	const container = screen.container as HTMLElement;
	await expect
		.poll(() => container.querySelector('em[data-badge]')?.textContent, { timeout: 5_000 })
		.toBe('Report alpha');

	const samples: { html: string; busy: boolean }[] = [];
	const observer = new MutationObserver(() =>
		samples.push({ html: container.innerHTML, busy: !!container.querySelector('[aria-busy="true"]') }),
	);
	observer.observe(container, { attributes: true, characterData: true, childList: true, subtree: true });

	const refresh = container.querySelector<HTMLButtonElement>('button[data-refresh]');
	if (!refresh) throw new Error('Expected the refresh button in the rendered DOM.');
	refresh.click();
	await expect
		.poll(() => container.querySelector('em[data-badge]')?.textContent, { timeout: 5_000 })
		.toBe('Report beta');
	observer.disconnect();

	expect(samples.some((sample) => sample.html.includes('class="pending"')), '@pending was shown').toBe(false);
	const settledIndex = samples.findIndex((sample) => sample.html.includes('Report beta'));
	expect(settledIndex).toBeGreaterThan(0);
	expect(samples[0]!.busy, 'busy marking did not start with the refresh').toBe(true);
	for (const sample of samples.slice(0, settledIndex)) {
		expect(sample.html).toContain('Report alpha');
		expect(sample.busy).toBe(true);
	}
	expect(container.querySelector('[aria-busy]')).toBeNull();
});
