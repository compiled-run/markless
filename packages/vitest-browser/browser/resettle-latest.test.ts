import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '../src/index.ts';
import ArmCommitRefresh from './fixtures/arm-commit-refresh.tsrx';

// T110 / spec D8 part B: pending is for FIRST APPEARANCES only. When a
// settled boundary re-settles (a mutation re-runs its async computed), the
// arm keeps rendering the prior settled snapshot until the new one commits —
// the @pending arm must never reappear and the range must never go blank.
afterEach(() => cleanup());

test('re-settle keeps the prior settled content visible: no pending frame, no blank frame', async () => {
	const screen = await render(ArmCommitRefresh);
	const container = screen.container as HTMLElement;

	// First appearance: @pending is legitimate here (no prior settled content).
	await expect.poll(() => container.querySelector('em[data-badge]')?.textContent).toBe(
		'Report alpha',
	);

	// Record every DOM state transition during the refresh.
	const samples: string[] = [];
	const observer = new MutationObserver(() => samples.push(container.innerHTML));
	observer.observe(container, {
		attributes: true,
		characterData: true,
		childList: true,
		subtree: true,
	});

	const refresh = container.querySelector<HTMLButtonElement>('button[data-refresh]');
	if (!refresh) throw new Error('Expected the refresh button in the rendered DOM.');
	refresh.click();

	await expect.poll(() => container.querySelector('em[data-badge]')?.textContent).toBe(
		'Report beta',
	);
	observer.disconnect();

	for (const sample of samples) {
		// Never the @pending arm again…
		expect(sample).not.toContain('class="pending"');
		// …and never a blank range: some settled report content is always there.
		expect(sample).toContain('Report ');
	}
});
