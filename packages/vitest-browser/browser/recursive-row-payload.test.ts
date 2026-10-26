import { decodePayloadScriptsFromDocument } from '@markless/web/payload';
import { afterEach, expect, test } from 'vitest';
import { PROTOCOL_PROPS_GRAPH_NODE_ID } from '../../serializer/src/protocol-constants.ts';
import { deserializeGraphValue, type SerializedGraphPayload } from '../../serializer/src/value.ts';
import { cleanup, renderSSR } from '../src/index.ts';
import Depth2 from './fixtures/recursive-rows/depth-2.tsrx';
import Depth6 from './fixtures/recursive-rows/depth-6.tsrx';
import Chain8 from './fixtures/recursive-rows/chain-8.tsrx';
import Chain40 from './fixtures/recursive-rows/chain-40.tsrx';
import { grow, title, type Branch } from './fixtures/recursive-rows/tree.ts';
import RecursivePayload from './fixtures/recursive-payload/recursive-payload.tsrx';
import { tree } from './fixtures/recursive-payload/tree.ts';

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
		expect(occurrences(state, title(id)), title(id)).toBe(1);
});

test('the payload grows with the number of rows, not rows times depth', async () => {
	const small = payloadScripts((await renderSSR(Depth2)).container);
	await cleanup();
	const large = payloadScripts((await renderSSR(Depth6)).container);
	const perRow = (scripts: { state: string; view: string }, rows: number) =>
		(scripts.state.length + scripts.view.length) / rows;
	expect(perRow(large, 127) / perRow(small, 7)).toBeLessThan(1.25);
});

test('the payload stays within a few times the tree it renders', async () => {
	const { state, view } = payloadScripts((await renderSSR(RecursivePayload)).container);
	expect((state.length + view.length) / JSON.stringify(tree(7)).length).toBeLessThan(5);
});

test('a row forty levels deep is served in the bytes of a row a few levels deep', async () => {
	const perRow = (scripts: { state: string; view: string }, rows: number) =>
		(scripts.state.length + scripts.view.length) / rows;
	const shallow = perRow(payloadScripts((await renderSSR(Chain8)).container), 8);
	await cleanup();
	const screen = await renderSSR(Chain40);
	expect(screen.container.querySelectorAll('article')).toHaveLength(40);
	expect(perRow(payloadScripts(screen.container), 40) / shallow).toBeLessThan(1.25);
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
	const fold = (name: string) =>
		container
			.querySelector<HTMLButtonElement>(`article[data-branch="${name}"] > button[data-fold]`)!
			.click();

	fold(title(66));
	await expect.poll(() => folded(container)).toEqual([title(66)]);
	fold(title(1));
	fold(title(126));
	await expect.poll(() => folded(container)).toEqual([title(1), title(66), title(126)]);
	expect(
		container.querySelector(`article[data-branch="${title(1)}"] > button`)?.textContent,
	).toBe('unfold');
});
