import { expect, test } from 'vitest';
import { buildSemanticGraph, lowerStateAccess, planPayloadArena } from '../src/index.ts';
import { planSymbolResolver } from '../src/passes/symbol-resolver.ts';

// submit-quiet-design.md Q1 option 1: the compiler, not the runtime, decides which async values a
// handler marks busy from its own entry, from handler write analysis plus each async value's key
// inputs (handler write analysis + asyncKeyInputs; see paired-async-values.ts).
async function entryMarksOf(source: string) {
	const semanticGraph = await buildSemanticGraph({ filename: 'src/App.tsrx', source });
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const plan = planSymbolResolver({ semanticGraph, payloadArena, stateLowering });
	return plan.symbols
		.filter((symbol) => symbol.kind === 'event-handler')
		.map((symbol) => ({ eventName: symbol.eventName, entryMarks: symbol.entryMarks }));
}

test('a handler that writes a visible async value\'s direct key input gets an entry mark', async () => {
	const symbols = await entryMarksOf(`
import { state, computed } from '@markless/core';
export function App() @{
	let reload = state(0);
	const balance = computed(async () => { reload; return 1; });
	<>
		<button onClick={async () => { await Promise.resolve(); reload++; }}>Save</button>
		<p>{balance}</p>
	</>
}
`);
	expect(symbols).toEqual([{ eventName: 'click', entryMarks: ['computed:balance'] }]);
});

test('a handler that writes an input reached through a sync computed gets an entry mark', async () => {
	const symbols = await entryMarksOf(`
import { state, computed } from '@markless/core';
export function App() @{
	let page = state(1);
	const pageKey = computed(() => 'p' + page);
	const rows = computed(async () => { const key = pageKey; return key; });
	<>
		<button onClick={async () => { await Promise.resolve(); page = page + 1; }}>Next</button>
		<p>{rows}</p>
	</>
}
`);
	expect(symbols).toEqual([{ eventName: 'click', entryMarks: ['computed:rows'] }]);
});

test('a handler that writes a state no async value\'s key reads gets no entry mark', async () => {
	const symbols = await entryMarksOf(`
import { state, computed } from '@markless/core';
export function App() @{
	let reload = state(0);
	let note = state('idle');
	const balance = computed(async () => { reload; return 1; });
	<>
		<button onClick={async () => { await Promise.resolve(); note = 'noted'; }}>Note</button>
		<p>{balance}</p>
	</>
}
`);
	expect(symbols).toEqual([{ eventName: 'click', entryMarks: undefined }]);
});

test('a handler with no write gets no entry mark', async () => {
	const symbols = await entryMarksOf(`
import { state, computed } from '@markless/core';
export function App() @{
	let reload = state(0);
	const balance = computed(async () => { reload; return 1; });
	<>
		<button onClick={() => console.log(reload)}>Log</button>
		<p>{balance}</p>
	</>
}
`);
	expect(symbols).toEqual([{ eventName: 'click', entryMarks: undefined }]);
});
