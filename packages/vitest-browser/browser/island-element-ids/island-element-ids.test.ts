import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { renderPrerenderDataSurface } from '../../../web/src/prerender/evaluator.ts';
import { composeIslandRenderData } from '../../src/island-resume.ts';
import { cleanup, render, renderCsrIslands, renderSSRIslands } from '../../src/index.ts';
import { Card } from './island-checkbox-card.tsrx';

// Two independently rendered roots on one page mint element() ids from the same
// component positions, so the ids must also name which root they belong to: a
// label's `for` in one card must never reach the box in the other.

afterEach(() => cleanup());

const cards = (container: ParentNode): HTMLElement[] =>
	Array.from(container.querySelectorAll<HTMLElement>('[data-card]'));

function wiring(card: HTMLElement) {
	return {
		trigger: card.querySelector<HTMLButtonElement>('[data-trigger]')!,
		label: card.querySelector<HTMLLabelElement>('[data-label]')!,
		description: card.querySelector<HTMLElement>('[data-description]')!,
		value: () => card.querySelector('[data-value]')?.textContent,
	};
}

function expectOwnWiring(card: HTMLElement) {
	const { trigger, label, description } = wiring(card);
	expect(trigger.id).not.toBe('');
	expect(label.htmlFor).toBe(trigger.id);
	expect(document.getElementById(trigger.id)).toBe(trigger);
	expect(description.id).not.toBe('');
	expect(document.getElementById(description.id)).toBe(description);
	expect(trigger.getAttribute('aria-describedby')?.split(' ')).toContain(description.id);
}

const idsIn = (container: ParentNode): string[] =>
	Array.from(container.querySelectorAll('[id]')).map((element) => element.id);

function expectPageUniqueIds(container: ParentNode) {
	const ids = idsIn(container);
	expect(new Set(ids).size).toBe(ids.length);
}

async function expectLabelTogglesOwnBox(first: HTMLElement, second: HTMLElement) {
	await userEvent.click(page.elementLocator(wiring(second).label));
	await expect.poll(() => wiring(second).value()).toBe('true');
	expect(wiring(second).trigger.getAttribute('aria-checked')).toBe('true');
	expect(wiring(first).value()).toBe('false');
	expect(wiring(first).trigger.getAttribute('aria-checked')).toBe('false');
}

for (const [mode, mount] of [
	['ssr', () => renderSSRIslands([Card, Card])],
	['csr', () => renderCsrIslands([Card, Card])],
] as const) {
	test(`${mode} islands: each card's element ids are its own`, async () => {
		const { container } = await mount();
		const [first, second] = cards(container);
		expectPageUniqueIds(container);
		expectOwnWiring(first!);
		expectOwnWiring(second!);
		await expectLabelTogglesOwnBox(first!, second!);
	});
}

// A client render of the composed page (navigation, or a row minted after
// resume) spells ids from the page's surface, so the served islands must spell
// them the same way or the two halves of an IDREF stop matching.
test('ssr islands: served ids are the ids the page surface mints in the browser', async () => {
	const { container } = await renderSSRIslands([Card, Card]);
	const artifact = Card as unknown as {
		readonly renderData: unknown;
		readonly loadSymbol: (symbolId: string) => unknown;
	};
	const surface = () =>
		(typeof artifact.renderData === 'function'
			? (artifact.renderData as () => unknown)()
			: artifact.renderData) as never;
	const composed = composeIslandRenderData([
		{ prefix: 'm0:', loadRenderData: surface },
		{ prefix: 'm1:', loadRenderData: surface },
	]) as () => Promise<Parameters<typeof renderPrerenderDataSurface>[0]>;
	const client = await renderPrerenderDataSurface(await composed(), (symbolId) =>
		artifact.loadSymbol(symbolId.replace(/^m\d+:/, '')),
	);
	const template = document.createElement('template');
	template.innerHTML = client.html;
	expect(idsIn(template.content)).toEqual(idsIn(container));
});

test('csr: two render() roots on one page mint distinct ids', async () => {
	const one = await render(Card);
	const two = await render(Card);
	const [first] = cards(one.container);
	const [second] = cards(two.container);
	expectPageUniqueIds(document.body);
	expectOwnWiring(first!);
	expectOwnWiring(second!);
	await expectLabelTogglesOwnBox(first!, second!);
});

test('csr: a root rendered after another was removed keeps the bare ids', async () => {
	const one = await render(Card);
	const bare = wiring(cards(one.container)[0]!).trigger.id;
	await cleanup();
	const two = await render(Card);
	expect(wiring(cards(two.container)[0]!).trigger.id).toBe(bare);
});
