import { expect, test } from 'vitest';
import {
	protocolInstanceSegment,
	protocolProjectionSegment,
	protocolRowSegment,
} from '../../serializer/src/protocol.ts';
import { marklessComposeState } from '../src/fns/composition.ts';
import type { ComposeChild, ComposeStateDraft } from '../src/fns/composition.ts';

/**
 * Two server renders in flight at once must not resolve each other's widgets.
 *
 * A page composes bottom up: an inner component composes the family root it
 * owns, the level above awaits that output, then composes again. The await
 * between the two is where a second `renderToString` gets to run — and both
 * renders spell their widget roots against the SAME relative instance path,
 * because a path is relative to the level that composed it and both pages are
 * built from the same modules. Registries shared between the renders therefore
 * answer the first render with what the second one registered.
 *
 * Neither test below asserts an absolute id. The claim is narrower and is
 * exactly the defect: running two renders at once must not change either
 * render's answer from what it is alone.
 */

const DEFINITION = 'shared:src/widget.tsrx#widget';
const CELL = `${DEFINITION}/state:s`;

const EDGE = protocolInstanceSegment(0);
const PART = protocolProjectionSegment(1);

/**
 * The inner component's own composed output: it placed the family root at
 * `rootSegment`, so its state carries that root's cells and its definition
 * records the projection site a part outside the root spells the family under.
 */
function composedRoot(rootSegment: string): ComposeStateDraft {
	const child: ComposeChild = {
		hostPrefix: EDGE,
		symbolPrefix: EDGE,
		childrenWidgetRoot: rootSegment,
		output: {
			state: {
				cells: [{ graphNodeId: `${rootSegment}${CELL}` }],
				computed: [],
				sharedDefinitions: [
					{
						id: `${rootSegment}${DEFINITION}`,
						name: 'widget',
						exportedName: 'widget',
						scope: 'widget',
						version: 0,
						graphNodeIds: [`${rootSegment}${CELL}`],
					},
				],
			},
		},
	};
	return marklessComposeState({ cells: [], computed: [] }, [child]);
}

/** A part the consumer wrote beside the root, so its own cells are bare family ids. */
function partChild(symbolPrefix: string): ComposeChild {
	return {
		hostPrefix: symbolPrefix,
		symbolPrefix,
		output: { state: { cells: [{ graphNodeId: CELL, name: 'part' }], computed: [] } },
	};
}

/** The level above: it places the inner component's output and a part beside it. */
function composePage(inner: ComposeStateDraft): ComposeStateDraft {
	return marklessComposeState({ cells: [], computed: [] }, [
		{ hostPrefix: EDGE, symbolPrefix: EDGE, output: { state: inner } },
		partChild(`${EDGE}${PART}`),
	]);
}

function partCellId(page: ComposeStateDraft): string {
	return String((page.cells ?? []).find((entry) => entry.name === 'part')?.graphNodeId);
}

/** One render, cut at the await a real tree has between an inner compose and its parent's. */
async function renderPage(rootSegment: string, gate: Promise<void>): Promise<ComposeStateDraft> {
	const inner = composedRoot(rootSegment);
	await gate;
	return composePage(inner);
}

function openGate() {
	let open!: () => void;
	const wait = new Promise<void>((resolve) => (open = resolve));
	return { wait, open };
}

// A places its family root at one edge and B at another: the same module
// rendered at two sites, which is what two pages sharing a family look like.
const ROOT_A = protocolInstanceSegment(0);
const ROOT_B = protocolInstanceSegment(7);

test('two renders in flight at once answer as they answer alone', async () => {
	const done = Promise.resolve();
	const serialA = partCellId(await renderPage(ROOT_A, done));
	const serialB = partCellId(await renderPage(ROOT_B, done));

	// Both renders reach their outer compose only after both inner composes have
	// run, so each one finishes while the other's registrations stand.
	const gate = openGate();
	const both = Promise.all([renderPage(ROOT_A, gate.wait), renderPage(ROOT_B, gate.wait)]);
	gate.open();
	const [concurrentA, concurrentB] = await both;

	expect(partCellId(concurrentA!)).toBe(serialA);
	expect(partCellId(concurrentB!)).toBe(serialB);
	// And the two pages still hold two widgets, not one.
	expect(serialA).not.toBe(serialB);
});

test('a render with rows leaves a render without them in page space', async () => {
	// Whether an id no widget answered is WAITING on a row is decided by a set of
	// bare definition ids — no instance path on them at all, so a page that has a
	// repeat and a page that has none cannot be told apart once they share it. The
	// row-free page's page-space id then takes a phantom instance path.
	const rowRoot = `${protocolRowSegment('alpha')}${protocolInstanceSegment(0)}`;
	const alone = partCellId(
		marklessComposeState({ cells: [], computed: [] }, [partChild(`${EDGE}${PART}`)]),
	);
	expect(alone).toBe(CELL);

	const gate = openGate();
	const withRows = renderPage(rowRoot, gate.wait);
	const withoutRows = (async () => {
		await gate.wait;
		return marklessComposeState({ cells: [], computed: [] }, [partChild(`${EDGE}${PART}`)]);
	})();
	gate.open();
	const [, plainPage] = await Promise.all([withRows, withoutRows]);

	expect(partCellId(plainPage)).toBe(alone);
});
