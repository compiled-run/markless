import { expect, test } from 'vitest';
import {
	marklessComposedGraphNodeId,
	marklessWithEnclosingWidgetRoots,
} from '../../src/fns/instance-scope.ts';

/**
 * What the ancestor-widget holder costs the render it wraps.
 *
 * A component row minted at a write reads its rows back on the handler's next
 * statement, so a holder that hands back a promise however warm the render
 * inside it is makes the row unbuildable there. These rows assert on
 * `typeof answer.then` rather than on any timing, and on the roots being gone
 * again on every exit edge - a leaked install would hand one row's ancestors to
 * whatever renders next.
 */

const isPromise = (value: unknown) =>
	typeof (value as { then?: unknown } | undefined)?.then === 'function';

const roots = new Map([['shared:widget', 'w0:']]);

// The holder installs into module state whose only view is a composed read that
// resolves a row-local `shared:` id against the ancestors standing above it.
function installedRoots(): string {
	return marklessComposedGraphNodeId('shared:widget', 'r:a:c0:') === 'w0:shared:widget'
		? 'reachable'
		: 'unreachable';
}

test('a warm render inside a live widget answers without a statement', () => {
	const answer = marklessWithEnclosingWidgetRoots('r:a:', roots, () => 'rendered');

	expect(isPromise(answer)).toBe(false);
	expect(answer).toBe('rendered');
});

test('a render that waits still answers with what it rendered', async () => {
	const answer = marklessWithEnclosingWidgetRoots('r:a:', roots, () =>
		Promise.resolve('rendered'),
	);

	expect(isPromise(answer)).toBe(true);
	await expect(answer).resolves.toBe('rendered');
});

test('the roots are installed for the render and gone after a sync answer', () => {
	let seen = '';
	marklessWithEnclosingWidgetRoots('r:a:', roots, () => {
		seen = installedRoots();
		return undefined;
	});

	expect(seen).toBe('reachable');
	expect(installedRoots()).toBe('unreachable');
});

test('the roots are gone after a promised answer, and after a rejected one', async () => {
	let release: ((value: unknown) => void) | undefined;
	const held = marklessWithEnclosingWidgetRoots(
		'r:a:',
		roots,
		() => new Promise((resolve) => (release = resolve)),
	);
	release?.('rendered');
	await held;
	expect(installedRoots()).toBe('unreachable');

	await expect(
		marklessWithEnclosingWidgetRoots('r:a:', roots, () =>
			Promise.reject(new Error('render refused')),
		),
	).rejects.toThrowError('render refused');
	expect(installedRoots()).toBe('unreachable');
});

test('a render that throws where it stands releases the roots and rethrows', () => {
	expect(() =>
		marklessWithEnclosingWidgetRoots('r:a:', roots, () => {
			throw new Error('render refused');
		}),
	).toThrowError('render refused');
	expect(installedRoots()).toBe('unreachable');
});

test('a row with no ancestor widget never takes the holder at all', () => {
	let seen = '';
	const answer = marklessWithEnclosingWidgetRoots('r:a:', new Map(), () => {
		seen = installedRoots();
		return 'rendered';
	});

	expect(isPromise(answer)).toBe(false);
	expect(seen).toBe('unreachable');
});
