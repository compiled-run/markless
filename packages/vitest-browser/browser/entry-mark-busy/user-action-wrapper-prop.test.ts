import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { ChildCallsProp } from './child-calls-prop.tsrx';
import { NestedWrappers } from './nested-wrappers.tsrx';
import { WrapperImported } from './wrapper-imported.tsrx';
import { WrapperSameFile } from './wrapper-same-file.tsrx';
import { WrapperSpread } from './wrapper-spread.tsrx';

// W37 wraps only a native element's own event-handler module as a user action; W38 made entry
// marks (the early busy mark) reach a handler forwarded through a component prop, but did not
// make those same handlers count as a user action. A save made through a wrapper Button must be
// loud the same way a save made directly on a native button is: marked busy AND announced
// ("Updating…"/"Updated"), not just marked.
afterEach(() => cleanup());

const poll = { timeout: 5_000, interval: 5 };
const REGION = '[data-markless-announcer]';

type Screen = { readonly container: unknown; readonly runtime?: { readonly runtime?: unknown } };

async function mounted(screen: Screen): Promise<HTMLElement> {
	await (
		screen.runtime?.runtime as { whenAsyncBoundariesSettled?: () => Promise<void> } | undefined
	)?.whenAsyncBoundariesSettled?.();
	return screen.container as HTMLElement;
}

const text = (container: ParentNode, selector: string) =>
	container.querySelector(selector)?.textContent ?? null;

const busy = (container: ParentNode, selector: string): boolean =>
	container.querySelector(selector)?.getAttribute('aria-busy') === 'true';

function click(container: ParentNode, selector: string): void {
	const button = container.querySelector<HTMLButtonElement>(selector);
	if (!button) throw new Error(`Expected ${selector} in the rendered DOM.`);
	button.click();
}

function listen() {
	const said: string[] = [];
	let last = document.querySelector(REGION)?.textContent ?? '';
	const observer = new MutationObserver(() => {
		const current = document.querySelector(REGION)?.textContent ?? '';
		if (current !== last && current !== '') said.push(current);
		last = current;
	});
	observer.observe(document.body, { childList: true, subtree: true, characterData: true });
	return () => {
		observer.disconnect();
		return said;
	};
}

async function loudWrapperSaveScenario(screen: Screen): Promise<void> {
	const container = await mounted(screen);
	await expect.poll(() => text(container, '[data-balance]'), poll).toBe('100');

	const said = listen();
	click(container, '[data-save]');
	await expect.poll(() => busy(container, '[data-balance]'), poll).toBe(true);
	expect(text(container, '[data-balance]'), 'the kept value stays while busy').toBe('100');
	await expect.poll(() => text(container, '[data-balance]'), poll).toBe('101');
	await expect.poll(() => busy(container, '[data-balance]'), poll).toBe(false);
	await expect.poll(() => document.querySelector(REGION)?.textContent, poll).toBe('Updated');
	// The recipe's own delay (10ms) lands well inside the pending-settle deadline, so "Updating…"
	// never gets a chance to show (same shape as quiet-refresh.test.ts's fast cases); a quiet
	// refresh would announce nothing at all, so landing on "Updated" is still the loud signal.
	expect(said(), 'a save forwarded through a wrapper component still announces its settle').toEqual([
		'Updated',
	]);
}

test('CSR: a save forwarded through a same-file wrapper component is loud', async () => {
	await loudWrapperSaveScenario(await render(WrapperSameFile));
});

test('SSR: a save forwarded through a same-file wrapper component is loud', async () => {
	await loudWrapperSaveScenario(await renderSSR(WrapperSameFile));
});

test('CSR: a save forwarded through an imported wrapper component is loud', async () => {
	await loudWrapperSaveScenario(await render(WrapperImported));
});

test('SSR: a save forwarded through an imported wrapper component is loud', async () => {
	await loudWrapperSaveScenario(await renderSSR(WrapperImported));
});

test('CSR: a save reaching the native element only through a props spread is loud', async () => {
	await loudWrapperSaveScenario(await render(WrapperSpread));
});

test('SSR: a save reaching the native element only through a props spread is loud', async () => {
	await loudWrapperSaveScenario(await renderSSR(WrapperSpread));
});

test('CSR: a save a child calls from its own click handler (props.onSave()) is loud', async () => {
	await loudWrapperSaveScenario(await render(ChildCallsProp));
});

test('SSR: a save a child calls from its own click handler (props.onSave()) is loud', async () => {
	await loudWrapperSaveScenario(await renderSSR(ChildCallsProp));
});

test('CSR: a save forwarded through two nested wrapper components is loud', async () => {
	await loudWrapperSaveScenario(await render(NestedWrappers));
});

test('SSR: a save forwarded through two nested wrapper components is loud', async () => {
	await loudWrapperSaveScenario(await renderSSR(NestedWrappers));
});
