import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '../src/index.ts';
import ArmCommitChild from './fixtures/arm-commit-child.tsrx';
import ArmCommitRefresh from './fixtures/arm-commit-refresh.tsrx';

// T103 commitArm: CSR-mounted composed @try arms settle through the tier-4
// arm-render module and must come back INTERACTIVE — the settled range's
// arm-relative records re-register against the fresh DOM on every commit.
afterEach(() => cleanup());

function queryContainer(container: unknown): HTMLElement {
	return container as HTMLElement;
}

function requireElement<T extends Element>(container: HTMLElement, selector: string): T {
	const element = container.querySelector<T>(selector);
	if (!element) throw new Error(`Expected "${selector}" in the rendered DOM.`);
	return element;
}

test('CSR: a composed @try arm settles and its button fires after the commit', async () => {
	const screen = await render(ArmCommitChild);
	const container = queryContainer(screen.container);

	// CSR mounts paint @pending first; the runner is demanded at start.
	expect(container.querySelector('p.pending')?.textContent).toBe('Loading');

	await expect
		.poll(() => container.querySelector('em[data-badge]')?.textContent)
		.toBe('Q3 report');
	expect(container.querySelector('p.pending')).toBeNull();

	// The dead-events class this task fixes: the settled arm's button must
	// dispatch through records registered against the committed DOM.
	requireElement<HTMLButtonElement>(container, 'button[data-save]').click();
	await expect
		.poll(() => container.querySelector('output[data-saved]')?.textContent)
		.toBe('saved:Q3 report');
});

test('CSR: a settled arm re-commits on computed re-run and stays interactive; outside focus survives', async () => {
	const screen = await render(ArmCommitRefresh);
	const container = queryContainer(screen.container);

	await expect
		.poll(() => container.querySelector('em[data-badge]')?.textContent)
		.toBe('Report alpha');

	// Focus + type into an input OUTSIDE the boundary before the re-commit.
	const note = requireElement<HTMLInputElement>(container, 'input[data-note]');
	note.focus();
	note.value = 'draft';
	expect(document.activeElement).toBe(note);

	// Write to the state the async computed reads: the runner re-runs and the
	// settle re-commits the composed arm through the arm-render module.
	requireElement<HTMLButtonElement>(container, 'button[data-refresh]').click();
	await expect
		.poll(() => container.querySelector('em[data-badge]')?.textContent)
		.toBe('Report beta');

	// The re-committed arm's button still fires (fresh registration)…
	requireElement<HTMLButtonElement>(container, 'button[data-pick]').click();
	await expect
		.poll(() => container.querySelector('output[data-picked]')?.textContent)
		.toBe('picked:Report beta');

	// …and the sibling-range input kept focus and its typed value.
	expect(document.activeElement).toBe(note);
	expect(note.value).toBe('draft');
});
