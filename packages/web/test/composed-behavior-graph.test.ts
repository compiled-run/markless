import { expect, test } from 'vitest';
import { protocolInstanceSegment } from '../../serializer/src/protocol.ts';
import type {
	ComposeChildOutput,
	ComposeLoadSymbol,
	ComposeStateDraft,
	ComposeStateNode,
} from '../src/fns/composition.ts';
import { marklessCsrRemapGraphOutput } from '../src/fns/composition.ts';
import { marklessInstanceScopedLoadSymbol } from '../src/fns/instance-scope.ts';
import type { ResumeSymbol, ResumeSymbolContext } from '../src/resume-types.ts';

// Defect 99, the composition sibling of defect 96. A CSR container activates
// its authored behaviors BEFORE it demand-loads the runtime graph
// (`activateAuthoredBehaviors` in render-csr.ts), so the activation context
// carries no graph at all. The instance-scope adapter learned to guard that,
// but a composed child's symbols are marked in the `composedSymbols` WeakSet
// exactly so the instance-scope adapter SKIPS them - the composed-symbol
// wrapper had to learn the same guard.
//
// This is a unit pin rather than a browser one because the only authoring shape
// that installs the composed-symbol wrapper is a child whose computed() derives
// from a graph-bound prop, and that shape cannot be rendered same-module at all
// today: CSR dies first in the prerender evaluator with
// `TypeError: Cannot read properties of undefined (reading 'read')`
// (packages/web/src/prerender/evaluator.ts, at `loaded({ graph: { read }, read })`).
// That failure reproduces with no behavior in the fixture and is a separate,
// unfixed defect.

const instancePath = protocolInstanceSegment(0);

// The context render-csr.ts hands an authored behavior: an element, an element
// handle resolver that answers nothing yet, the authored inputs, and no graph.
function activationSeamContext(element: object): ResumeSymbolContext {
	return {
		element: element as ResumeSymbolContext['element'],
		getElementHandle: () => undefined,
		behaviorInputs: [],
	};
}

function composedLoadSymbol(run: ResumeSymbol): ComposeLoadSymbol {
	const output: ComposeChildOutput & {
		state: ComposeStateDraft & { readonly cells: ReadonlyArray<ComposeStateNode> };
		loadSymbol: ComposeLoadSymbol;
	} = {
		state: { cells: [], computed: [] },
		loadSymbol: () => run,
	};
	marklessCsrRemapGraphOutput(output, [], instancePath);
	return output.loadSymbol;
}

test('a composed symbol runs at the graph-less CSR activation seam', async () => {
	const element = { tagName: 'BUTTON' };
	const seen: Array<ResumeSymbolContext> = [];
	const loadSymbol = composedLoadSymbol((context) => {
		seen.push(context);
		return 'ran';
	});

	const symbol = await loadSymbol(`${instancePath}symbol:0`);

	expect(symbol(activationSeamContext(element))).toBe('ran');
	// Run what can run: the behavior gets the absent graph its caller handed
	// over, and the element it was authored on.
	expect(seen).toHaveLength(1);
	expect(seen[0]?.graph).toBe(undefined);
	expect(seen[0]?.element).toBe(element);
	expect(seen[0]?.behaviorInputs).toEqual([]);
});

// The instance-scope adapter skips composed symbols, so the loader a CSR
// container actually calls must not reintroduce the graph read either.
test('the instance-scoped loader passes a composed symbol through at the same seam', async () => {
	const element = { tagName: 'BUTTON' };
	const seen: Array<ResumeSymbolContext> = [];
	const loadSymbol = composedLoadSymbol((context) => {
		seen.push(context);
		return 'ran';
	});
	const scoped = marklessInstanceScopedLoadSymbol(loadSymbol);

	const symbol = await scoped(`${instancePath}symbol:0`);

	expect(symbol(activationSeamContext(element))).toBe('ran');
	expect(seen[0]?.graph).toBe(undefined);
});
