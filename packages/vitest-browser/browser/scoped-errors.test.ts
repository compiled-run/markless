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

test('derived incident shape contains to catch arm', async () => {
	const screen = await render(DerivedIncidentPage);
	await expect.poll(() => screen.container.querySelector('[data-derived-catch]')?.textContent).toBe(
		'contained derived error',
	);
	expect(screen.container.querySelector('[data-derived-retry]')).not.toBeNull();
});
