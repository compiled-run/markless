import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '../src/index.ts';
import TelescopePanel from './fixtures/arm-flip-pending-hold.tsrx';

// Spec D8 (T116): pending is for first appearances only — and that includes
// tier-3 branch FLIPS inside a settled arm. When a mutation re-runs the
// boundary's async computed, the pending snapshot has no value; a flip
// evaluated against it replaces visible truth with lies (the dashboard's
// close->reopen race: the state pill flipped and the flipped-in button's
// reads returned undefined). The branch must hold its prior arm through the
// pending window; only the settle re-commit changes what is visible.
//
// INTEGRATION-ONLY assertions: DOM-state consistency and orderings recorded
// by a MutationObserver — no real-wait duration assertions (gate-1 rule).
afterEach(() => cleanup());

test('a branch reading through a pending async re-run holds its prior arm until settle', async () => {
	const screen = await render(TelescopePanel);
	const container = screen.container as HTMLElement;

	// First appearance settles: cycle 0 => Tracking + target-0.
	await expect.poll(() => container.querySelector('[data-target]')?.textContent).toBe('target-0');
	expect(container.querySelector('[data-tracking-pill]')).not.toBeNull();

	// Record every DOM state during the mutation re-settle.
	const samples: string[] = [];
	const observer = new MutationObserver(() => samples.push(container.innerHTML));
	observer.observe(container, {
		attributes: true,
		characterData: true,
		childList: true,
		subtree: true,
	});

	const cycle = container.querySelector<HTMLButtonElement>('button[data-cycle]');
	if (!cycle) throw new Error('Expected the cycle button in the rendered DOM.');
	cycle.click();

	// Cycle 1 settles: Idle + target-1 (the flip itself is legitimate AT settle).
	await expect.poll(() => container.querySelector('[data-target]')?.textContent).toBe('target-1');
	observer.disconnect();
	expect(container.querySelector('[data-idle-pill]')).not.toBeNull();
	expect(container.querySelector('[data-tracking-pill]')).toBeNull();

	for (const sample of samples) {
		// Consistency invariant: the pill may only change together with the
		// settle commit that carries target-1. A frame showing target-0 with
		// the Idle pill is a flip that ran on the pending snapshot.
		if (sample.includes('target-0')) {
			expect(sample, 'flip committed during the pending window').toContain('data-tracking-pill');
			expect(sample, 'flip committed during the pending window').not.toContain('data-idle-pill');
		}
		// D8 part B still holds at the arm level: no pending arm, no blank range.
		expect(sample).not.toContain('data-booting');
		expect(sample).toMatch(/target-\d/);
	}
});
