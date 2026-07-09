import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '../src/index.ts';
import BoundaryThrowPage from './fixtures/scoped-boundary-throw.tsrx';
import DerivedIncidentPage from './fixtures/scoped-derived-incident.tsrx';
import HandlerThrowPage from './fixtures/scoped-handler-throw.tsrx';
import OutsideBoundaryPage from './fixtures/scoped-outside.tsrx';

const originalReportError = globalThis.reportError;

afterEach(() => {
	cleanup();
	globalThis.reportError = originalReportError;
});

function reports(): unknown[] {
	const reported: unknown[] = [];
	globalThis.reportError = (error) => {
		reported.push(error);
	};
	return reported;
}

test('render throw outside async boundaries contains to the child region and siblings stay live', async () => {
	const reported = reports();
	const screen = await render(OutsideBoundaryPage);
	const button = screen.container.querySelector<HTMLButtonElement>('[data-safe-sibling]');
	if (!button) throw new Error('Expected live sibling button.');

	expect(screen.container.querySelector('[data-crashing-badge]')).toBeNull();
	expect(reported.map((error) => String((error as { message?: unknown }).message))).toContain(
		'MARKLESS_REGION_RENDER_ERROR: component "CrashingBadge" failed while rendering: crashing badge render',
	);
	button.click();
	await expect.poll(() => button.textContent).toBe('1');
});

test('handler throws report once and do not stop other handlers', async () => {
	const reported = reports();
	const screen = await render(HandlerThrowPage);
	screen.container.querySelector<HTMLButtonElement>('[data-throws]')?.click();
	await expect.poll(() => reported.length).toBe(1);

	const live = screen.container.querySelector<HTMLButtonElement>('[data-still-live]');
	if (!live) throw new Error('Expected live handler sibling.');
	live.click();
	await expect.poll(() => live.textContent).toBe('1');
	expect(reported[0]).toMatchObject({ code: 'MARKLESS_RUNTIME_ERROR' });
});

test('boundary rejection shows catch arm and leaves siblings interactive', async () => {
	const screen = await render(BoundaryThrowPage);
	await expect.poll(() => screen.container.querySelector('[data-boundary-catch]')?.textContent).toBe(
		'contained boundary error',
	);
	const sibling = screen.container.querySelector<HTMLButtonElement>('[data-boundary-sibling]');
	if (!sibling) throw new Error('Expected boundary sibling.');
	sibling.click();
	await expect.poll(() => sibling.textContent).toBe('1');
});

test('derived incident shape is contained and loud; the page stays alive', async () => {
	const reported = reports();
	const screen = await render(DerivedIncidentPage);
	// The sync derive's throw is contained by the flush-subscription region
	// and reported loudly — nothing escapes, nothing else dies.
	await expect.poll(() => reported.length).toBeGreaterThanOrEqual(1);
	expect(String((reported[0] as Error).message)).toContain('MARKLESS_REGION_RENDER_ERROR');
	expect(screen.container.querySelector('[data-derived-retry]')).not.toBeNull();
});

// PINNED FOLLOW-UP: a sync computed's derive throw inside a settled arm is
// contained at the subscription region today — the boundary should instead
// route to its @catch arm (author-facing error scope). Flip when
// sync-derive-error -> boundary-rejected routing lands.
test.fails('FOLLOW-UP: sync-derive throw routes to the boundary @catch arm', async () => {
	const screen = await render(DerivedIncidentPage);
	await expect.poll(() => screen.container.querySelector('[data-derived-catch]')?.textContent).toBe(
		'contained derived error',
	);
});
