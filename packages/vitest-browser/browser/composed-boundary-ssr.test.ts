import { afterEach, expect, test } from 'vitest';
import { cleanup, renderSSR } from '../src/index.ts';
import OrchardPage from './fixtures/orchard-page.tsrx';
import OrchardSibling from './fixtures/orchard-sibling.tsrx';

// Composed child-owned async boundaries, SSR direct load: a page composes a
// child that owns its own @try/@pending/@catch. The instance prefix
// (c<N>:boundary:M) is THE composed boundary identity — anchors, arm records,
// and runner/update symbols must all carry it, and in-arm events must fire
// after resume and after a client-side re-settle (commitArm re-registration).
afterEach(() => cleanup());

function requireElement<T extends Element>(container: HTMLElement, selector: string): T {
	const element = container.querySelector<T>(selector);
	if (!element) throw new Error(`Expected "${selector}" in the rendered DOM.`);
	return element;
}

test('SSR: a composed child-owned boundary renders prefixed anchors and its @try arm button fires after resume', async () => {
	const screen = await renderSSR(OrchardPage);
	const container = screen.container as HTMLElement;

	// The composed boundary identity: the child's module-local boundary:0
	// carries the c0: instance prefix in the page's anchor stream.
	expect(container.innerHTML).toContain('markless:async:c0:boundary:0');
	expect(container.innerHTML).not.toContain('markless:async:boundary:0-->');

	// Blocking SSR served the settled @try arm (composed grandchild included).
	expect(container.querySelector('[data-crop]')?.textContent).toBe('Rhubarb spring');
	expect(container.querySelector('div.sprouting')).toBeNull();

	// THE acceptance behavior: the in-arm event registered from the composed
	// (prefixed) arm record set dispatches through the child's own symbols.
	requireElement<HTMLButtonElement>(container, 'button[data-pick]').click();
	await expect
		.poll(() => container.querySelector('output[data-picked]')?.textContent)
		.toBe('picked:Rhubarb spring');

	// Page-level flat records still work beside the composed boundary.
	const visit = requireElement<HTMLButtonElement>(container, 'button[data-visit]');
	visit.click();
	await expect.poll(() => visit.textContent).toBe('1');
});

test('SSR: a composed child-owned boundary re-settles through its prefixed update symbol and stays interactive', async () => {
	const screen = await renderSSR(OrchardPage);
	const container = screen.container as HTMLElement;

	// Write to the state the child's async computed reads: the runner re-runs
	// and the settle commits through the c0:-prefixed update symbol.
	requireElement<HTMLButtonElement>(container, 'button[data-reseed]').click();
	await expect
		.poll(() => container.querySelector('[data-crop]')?.textContent)
		.toBe('Rhubarb summer');

	// The re-committed arm's records must register in the page's composed id
	// space (prefixed host + symbol ids), not the child's module-local one.
	requireElement<HTMLButtonElement>(container, 'button[data-pick]').click();
	await expect
		.poll(() => container.querySelector('output[data-picked]')?.textContent)
		.toBe('picked:Rhubarb summer');
});

test('SSR: a page-owned boundary BESIDE a composed child-owned boundary keeps distinct ids and both stay interactive', async () => {
	const screen = await renderSSR(OrchardSibling);
	const container = screen.container as HTMLElement;

	// Distinct composed identities: the page's own boundary:0 and the child's
	// c1:boundary:0 (CropBadge in the page arm consumes edge index 0).
	expect(container.innerHTML).toContain('markless:async:boundary:0');
	expect(container.innerHTML).toContain('markless:async:c1:boundary:0');

	// Both boundaries served settled arms without cross-boundary bleed.
	expect(container.querySelector('main > [data-crop]')?.textContent).toBe('Clear');
	expect(container.querySelector('[data-panel] [data-crop]')?.textContent).toBe(
		'Rhubarb spring',
	);

	// Both arms dispatch through their own record sets.
	requireElement<HTMLButtonElement>(container, 'button[data-note]').click();
	await expect
		.poll(() => container.querySelector('output[data-noted]')?.textContent)
		.toBe('noted:Clear');
	requireElement<HTMLButtonElement>(container, '[data-panel] button[data-pick]').click();
	await expect
		.poll(() => container.querySelector('[data-panel] output[data-picked]')?.textContent)
		.toBe('picked:Rhubarb spring');
});
