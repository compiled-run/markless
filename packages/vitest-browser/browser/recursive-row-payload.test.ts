import { decodePayloadScriptsFromDocument } from '@markless/web/payload';
import { afterEach, expect, test } from 'vitest';
import { PROTOCOL_PROPS_GRAPH_NODE_ID } from '../../serializer/src/protocol-constants.ts';
import { deserializeGraphValue, type SerializedGraphPayload } from '../../serializer/src/value.ts';
import { cleanup, renderSSR } from '../src/index.ts';
import Depth2 from './fixtures/recursive-rows/depth-2.tsrx';
import Depth6 from './fixtures/recursive-rows/depth-6.tsrx';
import { grow, type Branch } from './fixtures/recursive-rows/tree.ts';

// A component that renders itself as its rows hands each row its subtree as a prop, so every
// level's prop cell holds objects its parent's cell already holds: the payload must carry them once.
afterEach(() => cleanup());

function payloadScripts(container: ParentNode) {
	const text = (type: string) =>
		container.querySelector(`script[type="${type}"]`)?.textContent ?? '';
	return { state: text('markless/state'), view: text('markless/view') };
}

function occurrences(text: string, needle: string) {
	return text.split(needle).length - 1;
}

function folded(container: ParentNode) {
	return [...container.querySelectorAll('article')].flatMap((branch) =>
		branch.querySelector(':scope > section')?.hidden ? [branch.getAttribute('data-branch')] : [],
	);
}

function byTitle(trunk: Branch, found = new Map<string, Branch>()) {
	found.set(trunk.title, trunk);
	for (const branch of trunk.branches) byTitle(branch, found);
	return found;
}

test('every row title is served once, however deep the row sits', async () => {
	const screen = await renderSSR(Depth6);
	const { state } = payloadScripts(screen.container);
	expect(screen.container.querySelectorAll('article')).toHaveLength(127);
	for (const id of [1, 2, 6, 7, 64, 126])
		expect(occurrences(state, `"branch-${id}-title"`), `branch-${id}`).toBeLessThanOrEqual(1);
});

test('the payload grows with the number of rows, not rows times depth', async () => {
	const small = payloadScripts((await renderSSR(Depth2)).container);
	await cleanup();
	const large = payloadScripts((await renderSSR(Depth6)).container);
	const perRow = (scripts: { state: string; view: string }, rows: number) =>
		(scripts.state.length + scripts.view.length) / rows;
	expect(perRow(large, 127) / perRow(small, 7)).toBeLessThan(1.25);
});

test('each row decodes the subtree it rendered from the served payload', async () => {
	await renderSSR(Depth6);
	const { state } = decodePayloadScriptsFromDocument(document);
	const parents = [...byTitle(grow(6)).values()].filter((branch) => branch.branches.length > 0);
	const decoded = state.cells
		.filter((cell) => cell.graphNodeId.endsWith(PROTOCOL_PROPS_GRAPH_NODE_ID))
		.map(
			(cell) =>
				(deserializeGraphValue(cell.value as SerializedGraphPayload) as {
					readonly branches: readonly Branch[];
				}).branches,
		);
	// One cell per row: its branches are, item for item, the subtree that row rendered.
	expect(decoded).toHaveLength(127);
	const matched = parents.filter((parent) =>
		decoded.some((branches) => JSON.stringify(branches) === JSON.stringify(parent.branches)),
	);
	expect(matched).toHaveLength(parents.length);
	expect(decoded.filter((branches) => branches.length === 0)).toHaveLength(64);
});

test('a resumed row folds its own rows and no other', async () => {
	const screen = await renderSSR(Depth6);
	const container = screen.container;
	const fold = (title: string) =>
		container
			.querySelector<HTMLButtonElement>(`article[data-branch="${title}"] > button[data-fold]`)!
			.click();

	fold('branch-66-title');
	await expect.poll(() => folded(container)).toEqual(['branch-66-title']);
	fold('branch-1-title');
	fold('branch-126-title');
	await expect
		.poll(() => folded(container))
		.toEqual(['branch-1-title', 'branch-66-title', 'branch-126-title']);
	expect(
		container.querySelector('article[data-branch="branch-1-title"] > button')?.textContent,
	).toBe('unfold');
});
