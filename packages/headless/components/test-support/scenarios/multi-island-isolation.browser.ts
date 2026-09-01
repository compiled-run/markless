import { renderSSRIslands } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import MultiIslandAccordion from './multi-island-accordion.tsrx';
import PageScopedCounter from './page-scoped-counter.tsrx';

const ShippingTriggers = page.getByTestId('shipping-trigger');
const ReturnsTriggers = page.getByTestId('returns-trigger');
const ShippingContents = page.getByTestId('shipping-content');
const CounterValues = page.getByTestId('counter-value');
const CounterBumps = page.getByTestId('counter-bump');

type StatePayload = {
	readonly cells?: ReadonlyArray<{ readonly graphNodeId: string }>;
	readonly sharedDefinitions?: ReadonlyArray<{ readonly id: string; readonly scope: string }>;
};

function statePayload(): StatePayload {
	const script = document.querySelector('script[type="markless/state"]');
	if (!script?.textContent) throw new Error('Expected a serialized markless/state payload.');
	return JSON.parse(script.textContent) as StatePayload;
}

function el(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found;
}

// One island's widget is not the other island's widget. Two same-shape islands
// merge into one payload, so every widget-scoped id each island spells has to
// come out of the merge naming that island alone: one accordionState per island,
// one item cell per (island, item). Collapsing them gives the five demos on the
// docs accordion page a single shared cell, which is what makes one trigger
// drive another demo's items.
test('islands spell distinct widget ids for the same widget-scoped family', async () => {
	await renderSSRIslands([MultiIslandAccordion, MultiIslandAccordion]);
	const state = statePayload();

	const accordionStateIds = (state.sharedDefinitions ?? [])
		.map((definition) => definition.id)
		.filter((id) => id.endsWith('#accordionState'));
	expect(accordionStateIds).toHaveLength(2);
	expect(new Set(accordionStateIds).size).toBe(2);

	const itemDefinitionIds = (state.sharedDefinitions ?? [])
		.map((definition) => definition.id)
		.filter((id) => id.endsWith('#accordionItemState'));
	expect(itemDefinitionIds.length).toBeGreaterThan(1);
	expect(new Set(itemDefinitionIds).size).toBe(itemDefinitionIds.length);

	const itemCellIds = (state.cells ?? [])
		.map((cell) => cell.graphNodeId)
		.filter((id) => id.includes('#accordionItemState/state:item'));
	expect(itemCellIds).toHaveLength(4);
	expect(new Set(itemCellIds).size).toBe(4);
});

test('a click on one island leaves the other island closed', async () => {
	await renderSSRIslands([MultiIslandAccordion, MultiIslandAccordion]);

	await userEvent.click(el(ShippingTriggers.nth(0)));

	await expect.poll(() => el(ShippingTriggers.nth(0)).getAttribute('aria-expanded')).toBe('true');
	expect(el(ShippingTriggers.nth(1)).getAttribute('aria-expanded')).toBe('false');
	expect(el(ShippingContents.nth(0)).hasAttribute('hidden')).toBe(false);
	expect(el(ShippingContents.nth(1)).hasAttribute('hidden')).toBe(true);
});

// The roving walk reads the plural `triggerEls` handle, which is one roster per
// rendered widget. A merged roster walks straight out of the island the key was
// pressed in: ArrowDown off the last trigger must wrap to this island's first
// trigger, never reach the next island's.
test('ArrowDown wraps inside its own island instead of crossing into the next', async () => {
	await renderSSRIslands([MultiIslandAccordion, MultiIslandAccordion]);

	const lastOfFirstIsland = el(ReturnsTriggers.nth(0)) as HTMLButtonElement;
	lastOfFirstIsland.focus();
	await userEvent.keyboard('{ArrowDown}');

	await expect.poll(() => document.activeElement).toBe(el(ShippingTriggers.nth(0)));
});

// The other half of the same rule: page scope means one cell for the whole page,
// so island discrimination must not reach it. Two islands reading one
// page-scoped `shared()` still read one cell and see each other's writes.
test('a page-scoped shared cell stays one cell across islands', async () => {
	await renderSSRIslands([PageScopedCounter, PageScopedCounter]);
	const state = statePayload();

	const counterCellIds = (state.cells ?? [])
		.map((cell) => cell.graphNodeId)
		.filter((id) => id.includes('#pageCounter/'));
	expect(counterCellIds.length).toBeGreaterThan(0);
	expect(new Set(counterCellIds).size).toBe(1);

	await userEvent.click(el(CounterBumps.nth(0)));

	await expect.poll(() => el(CounterValues.nth(0)).textContent?.trim()).toBe('1');
	expect(el(CounterValues.nth(1)).textContent?.trim()).toBe('1');
});
