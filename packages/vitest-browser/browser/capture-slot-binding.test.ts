import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '../src/index.ts';
import ImportedPage from './fixtures/capture-slot-imported-page.tsrx';
import NestedPage from './fixtures/capture-slot-nested.tsrx';
import SiblingPage from './fixtures/capture-slot-siblings.tsrx';

afterEach(() => cleanup());

function containerFor(screen: { readonly container: unknown }): HTMLElement {
	return screen.container as HTMLElement;
}

function required<T extends Element>(container: HTMLElement, selector: string): T {
	const element = container.querySelector<T>(selector);
	if (!element) throw new Error(`Expected "${selector}" in the rendered DOM.`);
	return element;
}

test('sibling capture slots bind graph and literal labels to distinct callbacks', async () => {
	const container = containerFor(await render(SiblingPage));
	const graphButton = required<HTMLButtonElement>(container, '[data-signal="Graph cedar"]');
	const literalButton = required<HTMLButtonElement>(container, '[data-signal="Literal coral"]');
	const graphResult = required<HTMLOutputElement>(container, '[data-graph-result]');
	const collisionResult = required<HTMLOutputElement>(container, '[data-collision-result]');

	expect(graphResult.textContent).toBe('none');
	expect(collisionResult.textContent).toBe('none:99');

	graphButton.click();
	await expect.poll(() => graphResult.textContent).toBe('Graph cedar:1');
	expect(collisionResult.textContent).toBe('none:99');

	literalButton.click();
	await expect.poll(() => collisionResult.textContent).toBe('Literal coral:1');
	expect(graphResult.textContent).toBe('Graph cedar:1');
});

test('nested direct forwarding keeps each instance local and fires exactly once', async () => {
	const container = containerFor(await render(NestedPage));
	const first = required<HTMLButtonElement>(container, '[data-nested-trigger="Nested elm"]');
	const second = required<HTMLButtonElement>(container, '[data-nested-trigger="Nested quartz"]');
	const firstOutput = required<HTMLOutputElement>(container, '[data-first-forward]');
	const secondOutput = required<HTMLOutputElement>(container, '[data-second-forward]');

	expect(firstOutput.textContent).toBe('none');
	expect(secondOutput.textContent).toBe('none');

	first.click();
	await expect.poll(() => firstOutput.textContent).toBe('1:Nested elm');
	expect(secondOutput.textContent).toBe('none');

	second.click();
	await expect.poll(() => secondOutput.textContent).toBe('1:Nested quartz');
	expect(firstOutput.textContent).toBe('1:Nested elm');
});

test('an imported child awaits its async callback before invoking the next callback', async () => {
	const container = containerFor(await render(ImportedPage));
	const button = required<HTMLButtonElement>(container, '[data-imported-sequence]');
	const output = required<HTMLOutputElement>(container, '[data-imported-order]');

	expect(output.textContent).toBe('idle');
	button.click();
	await expect
		.poll(() => output.textContent)
		.toBe('Imported aurora:settled>child-finished');
});
