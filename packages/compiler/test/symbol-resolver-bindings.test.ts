import { expect, test } from 'vitest';
import { buildSemanticGraph, lowerStateAccess, planPayloadArena } from '../src/index.ts';
import { planSymbolResolver } from '../src/passes/symbol-resolver.ts';

// State lowering records a read for every mention of a state name, including
// mentions inside a handler that binds that name itself. The symbol resolver is
// what drops those: a read whose root name the handler binds is the handler's
// own binding, not a read of component state. These tests pin which handler
// sources keep their `count` read and which drop it.

async function handlerReadCounts(source: string): Promise<ReadonlyArray<string>> {
	const semanticGraph = await buildSemanticGraph({ filename: 'src/App.tsrx', source });
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const plan = planSymbolResolver({ semanticGraph, payloadArena, stateLowering });

	return plan.symbols
		.filter((symbol) => symbol.kind === 'event-handler')
		.map((symbol) => `${symbol.source} => reads=${symbol.reads?.length ?? 0}`);
}

const parameterShadowing = `
import { state } from '@markless/core';

export function App() @{
	let count = state(0);
	let label = state('');

	<section>
		<button onClick={(count) => { label = String(count); }}>plain</button>
		<button onClick={({ count }) => { label = String(count); }}>object</button>
		<button onClick={({ x: count }) => { label = String(count); }}>renamed</button>
		<button onClick={([count]) => { label = String(count); }}>array</button>
		<button onClick={(...count) => { label = String(count); }}>rest</button>
		<button onClick={(count = 1) => { label = String(count); }}>default</button>
		<button onClick={() => { label = String(count); }}>capture</button>
	</section>
}
`;

test('a parameter shadowing a state name drops the read, in every binding pattern', async () => {
	// Every destructuring form the resolver used to walk by hand is covered here:
	// plain, object, renamed object property, array, rest, and defaulted.
	expect(await handlerReadCounts(parameterShadowing)).toEqual([
		'(count) => { label = String(count); } => reads=0',
		'({ count }) => { label = String(count); } => reads=0',
		'({ x: count }) => { label = String(count); } => reads=0',
		'([count]) => { label = String(count); } => reads=0',
		'(...count) => { label = String(count); } => reads=0',
		'(count = 1) => { label = String(count); } => reads=0',
		// The handler binds nothing, so the name is genuinely captured state.
		'() => { label = String(count); } => reads=1',
	]);
});

const localShadowing = `
import { state } from '@markless/core';

export function App() @{
	let count = state(0);
	let label = state('');

	<section>
		<button onClick={() => { const count = 1; label = String(count); }}>local</button>
	</section>
}
`;

test('a body-local declaration shadowing a state name drops the read', async () => {
	// DIVERGENCE from the hand-rolled predecessor, which recovered parameter
	// names only and so kept this read (reads=1), wiring a state dependency the
	// handler never reads - it reads its own local. Asking the analyzer which
	// names the source leaves free answers for parameters and body declarations
	// alike, so the spurious read is now dropped.
	expect(await handlerReadCounts(localShadowing)).toEqual([
		'() => { const count = 1; label = String(count); } => reads=0',
	]);
});
