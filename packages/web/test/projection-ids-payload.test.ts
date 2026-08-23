import { expect, test } from 'vitest';
import {
	protocolInstanceSegment,
	protocolProjectionSegment,
} from '../../serializer/src/protocol.ts';
import { marklessComposeState, type ComposeChild } from '../src/fns/composition.ts';

// The same family a composing component roots around its own children
// (`checklist.root` composing `CheckboxRoot`).
const DEFINITION = 'shared:src/pwr.tsrx#pwr';
const CELL = `${DEFINITION}/state:s`;
const ROOT_SLOT = protocolInstanceSegment(0);

// The composing component's own render output: it carries the family root it
// composed at `c0:`, and it is the ONLY child that knows where its children land.
function rootChild(symbolPrefix: string): ComposeChild {
	return {
		hostPrefix: symbolPrefix,
		symbolPrefix,
		childrenWidgetRoot: ROOT_SLOT,
		output: {
			state: {
				cells: [{ graphNodeId: `${ROOT_SLOT}${CELL}` }],
				computed: [],
				sharedDefinitions: [
					{
						id: `${ROOT_SLOT}${DEFINITION}`,
						name: 'pwr',
						exportedName: 'pwr',
						scope: 'widget',
						version: 0,
						graphNodeIds: [`${ROOT_SLOT}${CELL}`],
					},
				],
			},
		},
	};
}

// A part the consumer wrote inside that root: a SIBLING of the composed family
// root, owning none of its cells, re-deriving the same composed definition id
// through the projection registry and carrying no projection site of its own.
function partChild(sitePath: string): ComposeChild {
	const symbolPrefix = `${sitePath}${protocolProjectionSegment(1)}`;
	return {
		hostPrefix: symbolPrefix,
		symbolPrefix,
		output: {
			state: {
				cells: [],
				computed: [],
				sharedDefinitions: [
					{
						id: DEFINITION,
						name: 'pwr',
						exportedName: 'pwr',
						scope: 'widget',
						version: 0,
						graphNodeIds: [CELL],
					},
				],
			},
		},
	};
}

function composedDefinitions(site: string, children: ReadonlyArray<ComposeChild>) {
	return marklessComposeState({ cells: [], computed: [] }, children).sharedDefinitions ?? [];
}

// Both children collapse onto one composed id. The projection bridge exists in
// exactly one of them, so a dedupe that keeps whichever came first loses it
// half the time — and a payload with no projection site strands every projected
// part on resume.
test('a part and the root it projects into collapse to one definition that keeps the projection site', () => {
	const site = protocolInstanceSegment(4);
	const rootPath = `${site}${ROOT_SLOT}`;

	const partFirst = composedDefinitions(site, [partChild(site), rootChild(site)]);
	const rootFirst = composedDefinitions(site, [rootChild(site), partChild(site)]);

	for (const definitions of [partFirst, rootFirst]) {
		expect(definitions).toEqual([
			expect.objectContaining({
				id: `${rootPath}${DEFINITION}`,
				projectionIds: [`${site}${DEFINITION}`],
				graphNodeIds: [`${rootPath}${CELL}`],
			}),
		]);
	}
});

test('the collapsed definition is identical whichever order the children arrive in', () => {
	const site = protocolInstanceSegment(5);

	expect(composedDefinitions(site, [partChild(site), rootChild(site)])).toEqual(
		composedDefinitions(site, [rootChild(site), partChild(site)]),
	);
});

// A widget with several projected parts: every site the parts sit at has to
// reach the payload, not just the one whose record won the collapse.
test('projection sites union across every record that collapses to the definition', () => {
	const site = protocolInstanceSegment(6);
	const nested = protocolInstanceSegment(2);
	// A second record for the same widget, carrying a projection site of its own
	// (the shape a deeper compose records before this one runs).
	const deeperPart: ComposeChild = {
		hostPrefix: site,
		symbolPrefix: site,
		childrenWidgetRoot: ROOT_SLOT,
		output: {
			state: {
				cells: [{ graphNodeId: `${ROOT_SLOT}${CELL}` }],
				computed: [],
				sharedDefinitions: [
					{
						id: `${ROOT_SLOT}${DEFINITION}`,
						name: 'pwr',
						exportedName: 'pwr',
						scope: 'widget',
						version: 0,
						graphNodeIds: [`${ROOT_SLOT}${CELL}`],
						projectionIds: [`${nested}${DEFINITION}`],
					},
				],
			},
		},
	};

	const forwards = composedDefinitions(site, [rootChild(site), deeperPart]);
	const backwards = composedDefinitions(site, [deeperPart, rootChild(site)]);

	expect(forwards).toHaveLength(1);
	// Membership is the contract; the sort only keeps the assertion off an
	// ordering the registration these ids feed does not read.
	expect([...(forwards[0]?.projectionIds ?? [])].sort()).toEqual(
		[`${site}${DEFINITION}`, `${site}${nested}${DEFINITION}`].sort(),
	);
	// And the record itself, ordering included, does not depend on child order.
	expect(backwards).toEqual(forwards);
});
