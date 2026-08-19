import { expect, test } from 'vitest';
import {
	PROTOCOL_PAGE_SPACE_ID_PREFIXES,
	protocolInstancePath,
	protocolInstanceSegment,
	protocolProjectionSegment,
} from '../../serializer/src/protocol.ts';
import {
	marklessComposedGraphNodeId,
	marklessComposedInstancePath,
	marklessComposeState,
} from '../src/fns/composition.ts';
import { marklessInstanceScopedLoadSymbol } from '../src/fns/instance-scope.ts';

// The browser copy of composition restates the page-space families and the
// instance-path grammar as literals so the resume bundle never imports the
// protocol module. These tests are the seam that fails when the protocol moves.
test('composition leaves every protocol page-space id family unqualified', () => {
	for (const prefix of PROTOCOL_PAGE_SPACE_ID_PREFIXES) {
		const graphNodeId = `${prefix}src/lib.tsrx#thing`;
		expect(marklessComposedGraphNodeId(graphNodeId, 'c0:')).toBe(graphNodeId);
	}
});

test('a nested compose leaves an already-composed page-space id alone', () => {
	for (const prefix of PROTOCOL_PAGE_SPACE_ID_PREFIXES) {
		const graphNodeId = `${protocolInstanceSegment(0)}${prefix}src/lib.tsrx#thing`;
		expect(marklessComposedGraphNodeId(graphNodeId, 'c1:')).toBe(graphNodeId);
	}
});

test('composition qualifies a component-owned id with its instance path', () => {
	expect(marklessComposedGraphNodeId('state:count', 'c0:')).toBe('c0:state:count');
});

test('a projected segment is page-space transparent and instance-qualifying alike', () => {
	for (const prefix of PROTOCOL_PAGE_SPACE_ID_PREFIXES) {
		const graphNodeId = `${protocolInstanceSegment(0)}${protocolProjectionSegment(1)}${prefix}src/lib.tsrx#thing`;
		expect(marklessComposedGraphNodeId(graphNodeId, 'c2:')).toBe(graphNodeId);
	}
	expect(marklessComposedGraphNodeId('state:open', protocolProjectionSegment(1))).toBe(
		'p1:state:open',
	);
});

test('a projected child and its host component edge never share a path', () => {
	const projected = protocolInstanceSegment(0) + protocolProjectionSegment(1);
	const own = protocolInstanceSegment(0) + protocolInstanceSegment(1);
	expect(projected).not.toBe(own);
	expect(protocolInstancePath(`${projected}symbol:0`)).toBe(projected);
	expect(protocolInstancePath(`${own}symbol:0`)).toBe(own);
});

test('the loader reads back exactly the instance path the protocol spells', () => {
	const path = protocolInstanceSegment(0) + protocolProjectionSegment(12);
	expect(protocolInstancePath(`${path}symbol:3`)).toBe(path);
	let seen = '';
	const load = marklessInstanceScopedLoadSymbol(() => (context) => {
		seen = String(context.graph.read('state:count'));
		return null;
	});
	const symbol = load(`${path}symbol:3`) as (context: {
		readonly graph: { readonly read: (graphNodeId: string) => unknown };
	}) => unknown;
	symbol({ graph: { read: (graphNodeId: string) => graphNodeId } });
	expect(seen).toBe(`${path}state:count`);
});

// The regression that took the router's MDX routes down: composition read the
// child's whole symbol prefix as its instance path and qualified the child's
// cells with `m0:`, while the symbol side — which recovers the path from the
// symbol id by the protocol grammar — kept reading and writing unqualified.
// The click reached the handler and wrote to a node no dom update watched.
test('the state a child composes into is the state its symbols read', () => {
	for (const symbolPrefix of [protocolInstanceSegment(0), 'm0:']) {
		const composed = marklessComposeState({ cells: [], computed: [] }, [
			{
				hostPrefix: symbolPrefix,
				symbolPrefix,
				output: { state: { cells: [{ graphNodeId: 'state:count' }], computed: [] } },
			},
		]);
		let read = '';
		const load = marklessInstanceScopedLoadSymbol(() => (context) => {
			read = String(context.graph.read('state:count'));
			return null;
		});
		const symbol = load(`${symbolPrefix}symbol:0`) as (context: {
			readonly graph: { readonly read: (graphNodeId: string) => unknown };
		}) => unknown;
		symbol({ graph: { read: (graphNodeId: string) => graphNodeId } });
		expect(read).toBe(composed.cells[0]!.graphNodeId);
	}
});

test('a prefix the protocol grammar does not spell is no instance path', () => {
	expect(marklessComposedInstancePath({ symbolPrefix: 'm0:' })).toBe('');
	expect(marklessComposedInstancePath({ symbolPrefix: protocolInstanceSegment(3) })).toBe(
		protocolInstanceSegment(3),
	);
});
