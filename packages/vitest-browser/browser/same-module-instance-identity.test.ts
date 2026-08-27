import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import CollisionPage from './fixtures/instance-collision-page.tsrx';
import SameNamePage from './fixtures/same-module-same-name-page.tsrx';
import SiblingsPage from './fixtures/same-module-siblings-page.tsrx';

afterEach(() => cleanup());

type StatePayload = {
	readonly cells: ReadonlyArray<{ readonly graphNodeId: string }>;
	readonly computed: ReadonlyArray<{ readonly graphNodeId: string }>;
};

function statePayloadIds(container: ParentNode): string[] {
	const script = container.querySelector<HTMLScriptElement>('script[type="markless/state"]');
	if (!script) throw new Error('Expected markless/state payload script.');
	const payload = JSON.parse(script.textContent ?? 'null') as StatePayload;
	return [...payload.cells, ...payload.computed].map((node) => node.graphNodeId);
}

// A served id is a per-instance prefix over a wire key. The key is `state:name`
// for a name only one component in the module declares, and `state:Component.name`
// once a sibling declares it too, so a match on the bare form alone silently
// filters a qualified page down to nothing.
function servedStateIds(container: ParentNode, name: string): string[] {
	const wanted = new RegExp(`(?:^|:)state:(?:[^.:]+\\.)?${name}$`);
	return statePayloadIds(container).filter((id) => wanted.test(id));
}

function wireKeyOf(graphNodeId: string): string {
	const at = graphNodeId.indexOf('state:');
	if (at < 0) throw new Error(`Expected a state wire key in "${graphNodeId}".`);
	return graphNodeId.slice(at);
}

function button(container: ParentNode, selector: string): HTMLButtonElement {
	const found = container.querySelector<HTMLButtonElement>(selector);
	if (!found) throw new Error(`Expected ${selector}.`);
	return found;
}

test('same-module siblings: two instances of one component keep separate state', async () => {
	const screen = await render(SiblingsPage);
	const container = screen.container as HTMLElement;
	const a = button(container, '[data-row="a"] button');
	const b = button(container, '[data-row="b"] button');

	a.click();
	await expect.poll(() => a.textContent).toBe('1');
	expect(b.textContent).toBe('0');
});

test('same-module siblings: SSR resume qualifies each instance in the payload', async () => {
	const screen = await renderSSR(SiblingsPage);
	const container = screen.container;
	const stepIds = servedStateIds(container, 'steps');
	expect(stepIds).toHaveLength(2);
	expect(new Set(stepIds).size).toBe(2);

	const a = button(container, '[data-row="a"] button');
	const b = button(container, '[data-row="b"] button');
	a.click();
	await expect.poll(() => a.textContent).toBe('1');
	expect(b.textContent).toBe('0');
});

test('same-module components with one state name keep separate CSR state', async () => {
	const screen = await render(SameNamePage);
	const container = screen.container as HTMLElement;
	const left = button(container, '[data-left]');
	const right = button(container, '[data-right]');
	expect(left.textContent).toBe('0');
	expect(right.textContent).toBe('10');

	left.click();
	await expect.poll(() => left.textContent).toBe('1');
	expect(right.textContent).toBe('10');

	right.click();
	await expect.poll(() => right.textContent).toBe('12');
	expect(left.textContent).toBe('1');
});

test('same-module components with one state name keep distinct SSR payload ids', async () => {
	const screen = await renderSSR(SameNamePage);
	const reportIds = servedStateIds(screen.container, 'report');
	expect(reportIds).toHaveLength(2);
	expect(new Set(reportIds).size).toBe(2);
	// Both components declare `report`, so each is served under its own key.
	expect(reportIds.map(wireKeyOf).sort()).toEqual([
		'state:SameNameLeft.report',
		'state:SameNameRight.report',
	]);

	const left = button(screen.container, '[data-left]');
	const right = button(screen.container, '[data-right]');
	expect(left.textContent).toBe('0');
	expect(right.textContent).toBe('10');

	left.click();
	await expect.poll(() => left.textContent).toBe('1');
	expect(right.textContent).toBe('10');
});

// An imported Root that renders two of its own children AND receives a
// projected part: four instances of one state name, none of them shared.
test('projected and own children of one imported root stay four distinct instances', async () => {
	const screen = await render(CollisionPage);
	const container = screen.container as HTMLElement;
	const parts = [...container.querySelectorAll<HTMLButtonElement>('button.part')];
	expect(parts).toHaveLength(3);

	parts[0]!.click();
	await expect.poll(() => parts[0]!.textContent).toBe('1');
	expect(parts[1]!.textContent).toBe('0');
	expect(parts[2]!.textContent).toBe('0');

	parts[2]!.click();
	await expect.poll(() => parts[2]!.textContent).toBe('1');
	expect(parts[1]!.textContent).toBe('0');
	expect(button(container, '[data-root-count]').textContent).toBe('100');
});

test('projected and own children keep four distinct SSR payload ids', async () => {
	const screen = await renderSSR(CollisionPage);
	const countIds = servedStateIds(screen.container, 'count');
	expect(countIds).toHaveLength(4);
	expect(new Set(countIds).size).toBe(4);

	const parts = [...screen.container.querySelectorAll<HTMLButtonElement>('button.part')];
	parts[2]!.click();
	await expect.poll(() => parts[2]!.textContent).toBe('1');
	expect(parts[0]!.textContent).toBe('0');
	expect(parts[1]!.textContent).toBe('0');
});
