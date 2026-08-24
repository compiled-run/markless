import { expect, test } from 'vitest';
import type { RuntimeGraph } from '@markless/runtime';
import { protocolInstanceSegment } from '../../serializer/src/protocol.ts';
import { marklessInstanceScopedLoadSymbol } from '../src/fns/instance-scope.ts';
import type { ResumeSymbol, ResumeSymbolContext } from '../src/resume-types.ts';

// Defect 96. A CSR container activates its authored behaviors BEFORE it
// demand-loads the runtime graph, so `render-csr.ts` calls a behavior symbol
// with no graph at all (the context type says otherwise; that call site casts).
// A behavior on an element inside a component is loaded through the instance
// scope adapter, which read straight through the absent graph and reported
// `TypeError: Cannot read properties of undefined (reading
// 'listSharedDefinitions')` from a stack naming no authored file.
const path = protocolInstanceSegment(0);

function graphlessBehaviorContext(element: object): ResumeSymbolContext {
	// Exactly the shape `activateAuthoredBehaviors` builds: no graph, no reader.
	return {
		graph: undefined as unknown as RuntimeGraph,
		element,
		getElementHandle: () => undefined,
		behaviorInputs: [],
	} as unknown as ResumeSymbolContext;
}

test('a behavior symbol inside a component runs when its context carries no graph', () => {
	const element = { stamped: false };
	const load = marklessInstanceScopedLoadSymbol(
		() =>
			((context: ResumeSymbolContext) => {
				(context.element as unknown as { stamped: boolean }).stamped = true;
				// Nothing to scope means nothing is invented: the symbol sees the
				// absent graph its caller handed over, as a behavior on the root
				// component's own element already does.
				expect(context.graph).toBe(undefined);
			}) as unknown as ResumeSymbol,
	);
	const symbol = load(`${path}symbol:3`) as ResumeSymbol;

	symbol(graphlessBehaviorContext(element));

	expect(element.stamped).toBe(true);
});

test('the element handles a graph-less behavior reads are still instance scoped', () => {
	const asked: Array<string> = [];
	const load = marklessInstanceScopedLoadSymbol(
		() =>
			((context: ResumeSymbolContext) => {
				context.getElementHandle('shared:src/lib.tsrx#trigger');
			}) as unknown as ResumeSymbol,
	);
	const symbol = load(`${path}symbol:3`) as ResumeSymbol;

	symbol({
		...graphlessBehaviorContext({}),
		getElementHandle: (handleIdOrName: string) => {
			asked.push(handleIdOrName);
			return undefined;
		},
	} as unknown as ResumeSymbolContext);

	expect(asked).toContain('shared:src/lib.tsrx#trigger');
});

// A context that DOES carry a graph is still scoped: the graph-less reading
// above must not have turned instance scoping off for everyone else.
test('a context carrying a graph is still qualified by its instance path', () => {
	let seen = '';
	const load = marklessInstanceScopedLoadSymbol(
		() =>
			((context: ResumeSymbolContext) => {
				seen = String(context.graph.read('state:count'));
			}) as unknown as ResumeSymbol,
	);
	const symbol = load(`${path}symbol:3`) as ResumeSymbol;

	symbol({
		graph: { read: (graphNodeId: string) => graphNodeId } as unknown as RuntimeGraph,
		element: {},
		getElementHandle: () => undefined,
	} as unknown as ResumeSymbolContext);

	expect(seen).toBe(`${path}state:count`);
});
