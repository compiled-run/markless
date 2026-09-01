import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { cleanup, renderCsrIslands, renderSSR, renderSSRIslands } from '../src/index.ts';
import Controls from './fixtures/pointer-crossing-controls.tsrx';

// A real pointer crossing the controls row raises pointerover/pointerout at
// every element it passes. Only the tooltip root asked for those; the toggle
// trigger, the wrappers and the bare span did not. Nobody asking is not a
// routing defect, so the runtime lets those crossings through silently instead
// of surfacing MARKLESS_EVENT_DISPATCH_UNMATCHED as an unhandled rejection.
afterEach(() => cleanup());

function watchRejections() {
	const raised: string[] = [];
	const onRejection = (event: PromiseRejectionEvent) => {
		event.preventDefault();
		raised.push(String(event.reason));
	};
	const onError = (event: ErrorEvent) => {
		event.preventDefault();
		raised.push(String(event.error ?? event.message));
	};
	window.addEventListener('unhandledrejection', onRejection);
	window.addEventListener('error', onError);
	return {
		raised,
		release: () => {
			window.removeEventListener('unhandledrejection', onRejection);
			window.removeEventListener('error', onError);
		},
	};
}

function part(scope: ParentNode, testId: string) {
	const element = scope.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
	if (!element) throw new Error(`Expected [data-testid="${testId}"] on the page.`);
	return element;
}

async function walkTheControlsRow(scope: ParentNode) {
	const over = (testId: string) => userEvent.hover(page.elementLocator(part(scope, testId)));
	await over('toggle-wrap');
	await over('toggle-trigger');
	await over('gap');
	await over('tooltip-wrap');
	await over('tooltip-trigger');
	await expect.poll(() => part(scope, 'tooltip-content').getAttribute('ui-open')).not.toBeNull();
	await over('gap');
	await over('toggle-trigger');
	await userEvent.unhover(page.elementLocator(part(scope, 'toggle-trigger')));
	await new Promise((resolve) => setTimeout(resolve, 150));
}

async function expectTheToggleStillFlips(scope: ParentNode) {
	const trigger = part(scope, 'toggle-trigger');
	expect(trigger.getAttribute('aria-checked')).toBe('false');
	await userEvent.click(page.elementLocator(trigger));
	await expect.poll(() => trigger.getAttribute('aria-checked')).toBe('true');
	await new Promise((resolve) => setTimeout(resolve, 150));
}

async function expectAQuietWalk(islands: ArrayLike<ParentNode>) {
	const watch = watchRejections();
	try {
		for (let index = islands.length - 1; index >= 0; index -= 1)
			await walkTheControlsRow(islands[index]!);
		expect(watch.raised).toEqual([]);
		await expectTheToggleStillFlips(islands[islands.length - 1]!);
		expect(watch.raised).toEqual([]);
	} finally {
		watch.release();
	}
}

test('SSR islands: a pointer crossing the controls row raises no unhandled rejection', async () => {
	const screen = await renderSSRIslands([Controls, Controls]);
	const islands = screen.container.querySelectorAll('[data-testid="controls"]');
	expect(islands).toHaveLength(2);
	await expectAQuietWalk(islands);
});

test('SSR plain root: a pointer crossing the controls row raises no unhandled rejection', async () => {
	const screen = await renderSSR(Controls);
	await expectAQuietWalk([screen.container]);
});

test('CSR islands: a pointer crossing the controls row raises no unhandled rejection', async () => {
	const screen = await renderCsrIslands([Controls, Controls]);
	const islands = (screen.container as HTMLElement).querySelectorAll('[data-testid="controls"]');
	expect(islands).toHaveLength(2);
	await expectAQuietWalk(islands);
});
