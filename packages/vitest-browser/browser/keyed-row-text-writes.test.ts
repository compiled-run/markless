import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '../src/index.ts';
import KeyedRowTextWrites from './fixtures/keyed-row-text-writes.tsrx';

afterEach(() => cleanup());

function requireElement<T extends Element>(container: HTMLElement, selector: string): T {
	const element = container.querySelector<T>(selector);
	if (!element) throw new Error(`Expected "${selector}" in the rendered DOM.`);
	return element;
}

function observeCharacterData(container: HTMLElement) {
	let mutations = 0;
	const observer = new MutationObserver((records) => {
		mutations += records.filter((record) => record.type === 'characterData').length;
	});
	observer.observe(container, { characterData: true, subtree: true });
	return { count: () => mutations, disconnect: () => observer.disconnect() };
}

function dispatchChange(container: HTMLElement) {
	requireElement<HTMLButtonElement>(container, 'button[data-change]').dispatchEvent(
		new MouseEvent('click', { bubbles: true }),
	);
}

test('keyed row object replacement writes only the changed bound text', async () => {
	const screen = await render(KeyedRowTextWrites);
	const container = screen.container as HTMLElement;
	const observation = observeCharacterData(container);

	dispatchChange(container);
	await expect.poll(() => requireElement(container, '[data-status]').textContent).toBe('changed');
	await expect.poll(observation.count).toBe(1);

	expect(requireElement(container, '[data-label]').textContent).toBe('Alpha');
	expect(requireElement(container, '[data-detail]').textContent).toBe('Stable');
	observation.disconnect();
});

test('a later graph write repairs externally modified keyed row text', async () => {
	const screen = await render(KeyedRowTextWrites);
	const container = screen.container as HTMLElement;
	const label = requireElement(container, '[data-label]');
	const labelText = label.firstChild;
	if (!labelText) throw new Error('Expected the label binding to have a text node.');
	labelText.nodeValue = 'Externally changed';

	const observation = observeCharacterData(container);
	dispatchChange(container);
	await expect.poll(() => label.textContent).toBe('Alpha');
	await expect.poll(() => requireElement(container, '[data-status]').textContent).toBe('changed');
	await expect.poll(observation.count).toBe(2);

	expect(requireElement(container, '[data-detail]').textContent).toBe('Stable');
	observation.disconnect();
});
