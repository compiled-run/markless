import { expect, test } from 'vitest';
import { buildSemanticGraph, lowerStateAccess, planPayloadArena } from '../src/index.ts';
import { planSymbolResolver } from '../src/passes/symbol-resolver.ts';

// The compiler decides which async values a handler marks busy from its entry, from its writes and each value's key inputs.
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

// A handler on a component prop is a `callback-prop` symbol, and needs the same mark as an `event-handler`.
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

// A write in a function the handler only hands off runs on the callee's turn, so it earns no mark.
const deferredShapes = {
	setInterval: 'setInterval(() => { reload++; }, 1000)',
	requestAnimationFrame: 'requestAnimationFrame(() => { reload++; })',
	queueMicrotask: 'queueMicrotask(() => { reload++; })',
	promiseThen: 'Promise.resolve().then(() => { reload++; })',
	socketProperty: 'socket.onmessage = function () { reload++; }',
};

for (const [name, deferred] of Object.entries(deferredShapes)) {
	test(`a write only inside a deferred callback (${name}) gets no entry mark`, async () => {
		const symbols = await entryMarksOf(`
import { state, computed } from '@markless/core';
const socket = {};
export function App() @{
	let reload = state(0);
	const balance = computed(async () => { reload; return 1; });
	<>
		<button onClick={() => { ${deferred}; }}>Later</button>
		<p>{balance}</p>
	</>
}
`);
		expect(symbols).toEqual([{ eventName: 'click', entryMarks: undefined }]);
	});
}

test('a write in the handler body still marks when the same handler also defers one', async () => {
	const symbols = await entryMarksOf(`
import { state, computed } from '@markless/core';
export function App() @{
	let reload = state(0);
	const balance = computed(async () => { reload; return 1; });
	<>
		<button onClick={async () => { requestAnimationFrame(() => { reload++; }); await Promise.resolve(); reload = reload + 1; }}>Both</button>
		<p>{balance}</p>
	</>
}
`);
	expect(symbols).toEqual([{ eventName: 'click', entryMarks: ['computed:balance'] }]);
});

test('a handler declared as a local async function still marks its own write', async () => {
	const symbols = await entryMarksOf(`
import { state, computed } from '@markless/core';
export function App() @{
	let reload = state(0);
	const balance = computed(async () => { reload; return 1; });
	async function save() { await Promise.resolve(); reload++; }
	<>
		<button onClick={save}>Save</button>
		<p>{balance}</p>
	</>
}
`);
	expect(symbols).toEqual([{ eventName: 'click', entryMarks: ['computed:balance'] }]);
});

// A `@catch` makes the block's own gate async so a handler's rejection can fail it; the gate fetches nothing, so it is never marked.
function pagedList(handler: string, withCatch: boolean) {
	return `
import { state, computed } from '@markless/core';
async function getPage(cursor) { return { items: [cursor], next: cursor + 1 }; }
export function App() @{
	let version = state(0);
	const first = computed(async () => getPage(version));
	let more = state([]);
	const items = computed(() => [first, ...more].flatMap((page) => page.items));
	const next = computed(() => (more.at(-1) ?? first).next);
	<div>
		@try {
			<section>
				@for (const item of items; key item) {
					<p>{item}</p>
				}
				<button onClick={${handler}}>More</button>
				<span>{next}</span>
			</section>
		} @pending {
			<p>Loading</p>
		}${withCatch ? ' @catch (error) {\n\t\t\t<p>{error.message}</p>\n\t\t}' : ''}
	</div>
}
`;
}

const appendPage = 'async () => { more = [...more, await getPage(next)]; }';
const reloadFirst = 'async () => { await getPage(0); version++; }';

test('with a @catch, a handler that appends to state only sync computeds read gets no entry mark', async () => {
	expect(await entryMarksOf(pagedList(appendPage, true))).toEqual([
		{ eventName: 'click', entryMarks: undefined },
	]);
});

test('without a @catch, the same append handler gets no entry mark', async () => {
	expect(await entryMarksOf(pagedList(appendPage, false))).toEqual([
		{ eventName: 'click', entryMarks: undefined },
	]);
});

test('with a @catch, a handler that writes the shown async value\'s key marks that value and not the gate', async () => {
	expect(await entryMarksOf(pagedList(reloadFirst, true))).toEqual([
		{ eventName: 'click', entryMarks: ['computed:first'] },
	]);
});

test('with a @catch, an append that keys an async value marks only that value', async () => {
	const symbols = await entryMarksOf(`
import { state, computed } from '@markless/core';
async function getPage(cursor) { return [cursor]; }
export function App() @{
	const first = computed(async () => getPage(0));
	let cursors = state([]);
	const latest = computed(async () => getPage(cursors.at(-1) ?? 0));
	<div>
		@try {
			<section>
				<p>{first}</p>
				<p>{latest}</p>
				<button onClick={async () => { await getPage(1); cursors = [...cursors, 2]; }}>More</button>
			</section>
		} @catch (error) {
			<p>{error.message}</p>
		}
	</div>
}
`);
	expect(symbols).toEqual([{ eventName: 'click', entryMarks: ['computed:latest'] }]);
});
