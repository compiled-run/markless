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

// A handler authored on a component's prop (`<Button onClick={...}>`) is a `callback-prop`
// symbol, not an `event-handler` one; it carries the same writes and needs the same mark.
async function callbackPropEntryMarksOf(source: string) {
	const semanticGraph = await buildSemanticGraph({ filename: 'src/App.tsrx', source });
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const plan = planSymbolResolver({ semanticGraph, payloadArena, stateLowering });
	return plan.symbols
		.filter((symbol) => symbol.kind === 'callback-prop')
		.map((symbol) => ({ propName: symbol.propName, entryMarks: symbol.entryMarks }));
}

test('a handler passed as a callback prop to a component that forwards it gets an entry mark', async () => {
	const symbols = await callbackPropEntryMarksOf(`
import { state, computed } from '@markless/core';
function Button({ onClick, children }) @{
	<button type="button" onClick={onClick}>{children}</button>
}
export function App() @{
	let reload = state(0);
	const balance = computed(async () => { reload; return 1; });
	<>
		<Button onClick={async () => { await Promise.resolve(); reload++; }}>Save</Button>
		<p>{balance}</p>
	</>
}
`);
	expect(symbols).toEqual([{ propName: 'onClick', entryMarks: ['computed:balance'] }]);
});

test('a handler passed as a callback prop to a component that spreads it onto a host gets an entry mark', async () => {
	const symbols = await callbackPropEntryMarksOf(`
import { state, computed } from '@markless/core';
function Button({ children, ...rest }) @{
	<button type="button" {...rest}>{children}</button>
}
export function App() @{
	let reload = state(0);
	const balance = computed(async () => { reload; return 1; });
	<>
		<Button onClick={async () => { await Promise.resolve(); reload++; }}>Save</Button>
		<p>{balance}</p>
	</>
}
`);
	expect(symbols).toEqual([{ propName: 'onClick', entryMarks: ['computed:balance'] }]);
});

test('a callback prop that writes a state no async value\'s key reads gets no entry mark', async () => {
	const symbols = await callbackPropEntryMarksOf(`
import { state, computed } from '@markless/core';
function Button({ onClick, children }) @{
	<button type="button" onClick={onClick}>{children}</button>
}
export function App() @{
	let reload = state(0);
	let note = state('idle');
	const balance = computed(async () => { reload; return 1; });
	<>
		<Button onClick={async () => { await Promise.resolve(); note = 'noted'; }}>Note</Button>
		<p>{balance}</p>
	</>
}
`);
	expect(symbols).toEqual([{ propName: 'onClick', entryMarks: undefined }]);
});
