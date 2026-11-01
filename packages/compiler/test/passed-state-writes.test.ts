import { expect, test } from 'vitest';
import { analyzeModuleFunctionWrites, compileTsrxModule } from '../src/index.ts';
import type { ModuleFunctionWrites } from '../src/artifacts.ts';

// A handler that hands state to a function which changes it in place marks the
// paths that function writes changed once it returns. A function in a project
// module is read for exactly those paths; one the compiler cannot see is
// assumed to change all of what it was handed.

const helpers = `
export function setLabel(target: { label: string }, next: string): void {
	target.label = next;
}
export function append(entries: string[], entry: string): void {
	entries.push(entry);
}
export function describe(target: { label: string; size: number }): string {
	return \`\${target.label.trim()}:\${target.size}\`;
}
export function tidy(record: { mail: string }): void {
	record.mail = record.mail.trim().toLowerCase();
}
export function bump(rows: { id: number; hits: number }[], id: number): void {
	const row = rows.find((candidate) => candidate.id === id);
	if (row) row.hits++;
}
export const relabel = (outer: { inner: { label: string } }) => setDeep(outer.inner);
function setDeep(inner: { label: string }) {
	inner.label = 'deep';
}
import { mystery } from 'some-package';
export function handOff(holder: { part: object; other: number }) {
	mystery(holder.part);
}
`;

test('a module function is read for the paths it writes below each argument', () => {
	expect(analyzeModuleFunctionWrites({ filename: 'src/helpers.ts', source: helpers })).toEqual({
		setLabel: { parameters: [[{ path: ['label'] }], []] },
		append: { parameters: [[{ path: [] }], []] },
		describe: { parameters: [[]] },
		tidy: { parameters: [[{ path: ['mail'] }]] },
		bump: { parameters: [[{ path: [] }], []] },
		relabel: { parameters: [[{ path: ['inner', 'label'] }]] },
		handOff: { parameters: [[{ path: ['part'], assumed: true }]] },
	});
});

test('a copy into a new object or array, or a value handed back, is followed rather than counted as a write', () => {
	const facts = analyzeModuleFunctionWrites({
		filename: 'src/lists.ts',
		source: `export function asList(input: string | readonly string[]) {
	if (typeof input !== 'string') return input;
	return [input];
}
export function flipIn(held: readonly string[], one: string) {
	const current = asList(held);
	return current.includes(one) ? current.filter((entry) => entry !== one) : [...current, one];
}
export const moveTo = (spot: { at: number; name: string }, at: number) => ({ ...spot, at });
export function grow(held: string[]) {
	const same = asList(held) as string[];
	same.push('x');
}
export function wrapAndBump(counter: { hits: number }) {
	const box = { inner: counter };
	box.inner.hits++;
}
export const nextOf = (walk: { at: number }, at = walk.at) => at + 1;
export function window(view: { size: number }, lines: string[]) {
	return lines.slice(0, view.size);
}
export function tally(seed: Record<string, number>, keys: string[]) {
	return keys.reduce((counts, key) => {
		counts[key] = 1;
		return counts;
	}, seed);
}
`,
	});
	expect(facts).toEqual({
		asList: { parameters: [[]] },
		flipIn: { parameters: [[], []] },
		moveTo: { parameters: [[], []] },
		grow: { parameters: [[{ path: [] }]] },
		wrapAndBump: { parameters: [[{ path: [] }]] },
		nextOf: { parameters: [[], []] },
		window: { parameters: [[], []] },
		tally: { parameters: [[{ path: [], assumed: true }], []] },
	});
});

test('a value stored somewhere the analysis cannot follow is assumed written whole', () => {
	const facts = analyzeModuleFunctionWrites({
		filename: 'src/keep.ts',
		source: `const kept: object[] = [];
export function keep(value: object) { kept.push(value); }
export function spread(...values: object[]) { for (const value of values) Object.freeze(value); }
`,
	});
	expect(facts).toEqual({
		keep: { parameters: [[{ path: [], assumed: true }]] },
		spread: { parameters: [], rest: [{ path: [], assumed: true }] },
	});
});

const page = (handler: string, imports = `import { append, setLabel } from './helpers.ts';`) => `
import { state } from '@markless/core';
${imports}

export function Board() @{
	let card = state({ label: 'a', size: 1 });
	let tags = state(['x']);
	let count = state(0);
	<div>
		<output>{card.label}</output>
		<output>{tags.length}</output>
		<output>{count}</output>
		<button onClick={${handler}}>go</button>
	</div>
}
`;

async function compile(
	source: string,
	importedFunctionWrites?: Record<string, ModuleFunctionWrites>,
) {
	return compileTsrxModule({
		filename: 'src/Board.tsrx',
		source,
		symbols: [],
		...(importedFunctionWrites ? { importedFunctionWrites } : {}),
	});
}

type Compiled = Awaited<ReturnType<typeof compile>>;

function handler(result: Compiled): string {
	return result.symbolModules.modules.find((module) => module.kind === 'event-handler')!.source;
}

function diagnostics(result: Compiled, code: string) {
	return [...result.semanticGraph.diagnostics, ...result.stateLowering.diagnostics].filter(
		(diagnostic) => diagnostic.code === code,
	);
}

const facts = {
	'./helpers.ts': analyzeModuleFunctionWrites({ filename: 'src/helpers.ts', source: helpers }),
};

test('a call to an imported helper marks exactly the paths the helper writes', async () => {
	const result = await compile(page(`() => { setLabel(card, 'b'); append(tags, 'y'); }`), facts);

	expect(result.stateLowering.writes).toEqual([
		expect.objectContaining({
			graphNodeId: 'state:card',
			path: ['label'],
			passedTo: { argument: 'card', argumentIndex: 0, callee: 'setLabel' },
		}),
		expect.objectContaining({
			graphNodeId: 'state:tags',
			path: [],
			passedTo: { argument: 'tags', argumentIndex: 0, callee: 'append' },
		}),
	]);
	const source = handler(result);
	expect(source).toContain('marklessChanged');
	expect(source).toMatch(/\[\s*"state:card",\s*\[\s*"label"\s*\]\s*\]/);
	expect(source).toMatch(/\[\s*"state:tags",\s*\[\s*\]\s*\]/);
	expect(diagnostics(result, 'MARKLESS_CALL_WRITES_ASSUMED')).toEqual([]);
	expect(result.semanticGraph.importedFunctionWriteRequests).toBeUndefined();
});

test('a helper that only reads what it is passed marks nothing', async () => {
	const result = await compile(
		page(
			`() => { count = describe(card).length; }`,
			`import { describe } from './helpers.ts';`,
		),
		facts,
	);

	expect(result.stateLowering.writes.filter((write) => write.passedTo)).toEqual([]);
	expect(handler(result)).not.toContain('marklessChanged');
});

test('without the helper module facts the compile asks for them and assumes the whole value', async () => {
	const result = await compile(page(`() => setLabel(card, 'b')`));

	expect(result.semanticGraph.importedFunctionWriteRequests).toEqual(['./helpers.ts']);
	expect(result.stateLowering.writes).toEqual([
		expect.objectContaining({
			graphNodeId: 'state:card',
			path: [],
			passedTo: { argument: 'card', argumentIndex: 0, callee: 'setLabel', assumed: true },
		}),
	]);
	// The host supplies the facts and compiles again, so nothing is reported yet.
	expect(diagnostics(result, 'MARKLESS_CALL_WRITES_ASSUMED')).toEqual([]);
});

test('a package function is assumed to change all of what it is handed, and says so', async () => {
	const result = await compile(page(`() => setLabel(card, 'b')`), { './helpers.ts': {} });

	expect(result.stateLowering.writes).toEqual([
		expect.objectContaining({
			graphNodeId: 'state:card',
			path: [],
			passedTo: expect.objectContaining({ assumed: true }),
		}),
	]);
	expect(diagnostics(result, 'MARKLESS_CALL_WRITES_ASSUMED')).toEqual([
		expect.objectContaining({ severity: 'info' }),
	]);
});

test('a function looked up at run time is assumed to change all of what it is handed', async () => {
	const result = await compile(
		page(`() => registry.get('inc')?.(card)`, `import { registry } from './plugins.ts';`),
		{ './plugins.ts': {} },
	);

	expect(result.stateLowering.writes).toEqual([
		expect.objectContaining({
			graphNodeId: 'state:card',
			path: [],
			passedTo: expect.objectContaining({ assumed: true }),
		}),
	]);
	expect(handler(result)).toMatch(
		/marklessChanged\(\s*context\.graph,\s*\[\s*\[\s*"state:card",\s*\[\s*\]\s*\]\s*\],\s*registry\.get\(["']inc["']\)\?\.\(/,
	);
	expect(diagnostics(result, 'MARKLESS_CALL_WRITES_ASSUMED')).toHaveLength(1);
});

test('a function declared in the same file is read for the paths it writes', async () => {
	const result = await compile(
		page(
			`() => rename(card)`,
			`function rename(subject: { label: string }) { subject.label = 'z'; }`,
		),
	);

	expect(result.stateLowering.writes).toEqual([
		expect.objectContaining({
			graphNodeId: 'state:card',
			path: ['label'],
			passedTo: { argument: 'card', argumentIndex: 0, callee: 'rename' },
		}),
	]);
	expect(result.semanticGraph.importedFunctionWriteRequests).toBeUndefined();
});

test('a handler local, a scalar and a reading platform call are left alone', async () => {
	const result = await compile(
		page(`(card) => { setLabel(card, 'b'); console.log(tags); setLabel(count, 'c'); }`),
		facts,
	);

	expect(result.stateLowering.writes.filter((write) => write.passedTo)).toEqual([]);
	expect(diagnostics(result, 'MARKLESS_CALL_WRITES_ASSUMED')).toEqual([]);
});

test('a callback handed by name, the array a callback is handed, and an alias of two paths are all followed', () => {
	const facts = analyzeModuleFunctionWrites({
		filename: 'src/walk.ts',
		source: `function stamp(entry: { seen: boolean }) {
	entry.seen = true;
}
export function stampAll(entries: { seen: boolean }[]) {
	entries.forEach(stamp);
}
export function stampByIndex(entries: { seen: boolean }[]) {
	entries.map((_entry, at, all) => (all[at]!.seen = true));
}
export function pickSide(pair: { left: { tag: string }; right: { tag: string } }, left: boolean) {
	const side = left ? pair.left : pair.right;
	side.tag = 'x';
}
function inner(holder: { core: { tag: string } }) {
	return holder.core;
}
export function viaResult(holder: { core: { tag: string } }) {
	inner(holder).tag = 'y';
}
`,
	});
	expect(facts).toEqual({
		stampAll: { parameters: [[{ path: [] }]] },
		stampByIndex: { parameters: [[{ path: [] }]] },
		pickSide: { parameters: [[{ path: ['left', 'tag'] }, { path: ['right', 'tag'] }], []] },
		viaResult: { parameters: [[{ path: [] }]] },
	});
});

test('an argument after a spread is assumed written whole, since no fact names its position', async () => {
	const result = await compile(page(`() => setLabel(...[], card)`), facts);

	expect(result.stateLowering.writes).toEqual([
		expect.objectContaining({
			graphNodeId: 'state:card',
			path: [],
			passedTo: expect.objectContaining({ argumentIndex: 1, assumed: true }),
		}),
	]);
});

test('two calls handing the same state to different helpers each mark their own paths', async () => {
	const helpersWith = {
		'./helpers.ts': {
			...facts['./helpers.ts'],
			setSize: { parameters: [[{ path: ['size'] }]] },
		},
	};
	const result = await compile(
		page(
			`(event) => { if (event.shiftKey) setLabel(card, 'b'); else setSize(card); }`,
			`import { setLabel, setSize } from './helpers.ts';`,
		),
		helpersWith,
	);

	const source = handler(result);
	expect(source).toMatch(/\[\s*"state:card",\s*\[\s*"label"\s*\]\s*\]\s*\],\s*setLabel\(/);
	expect(source).toMatch(/\[\s*"state:card",\s*\[\s*"size"\s*\]\s*\]\s*\],\s*setSize\(/);
});

test('a known write into a computed value is refused like the same write in the handler', async () => {
	const result = await compile(
		`
import { computed, state } from '@markless/core';
import { setLabel } from './helpers.ts';

export function Board() @{
	let card = state({ label: 'a' });
	const view = computed(() => ({ label: card.label }));
	<div>
		<output>{view.label}</output>
		<button onClick={() => setLabel(view, 'b')}>go</button>
	</div>
}
`,
		facts,
	);

	expect(result.stateLowering.diagnostics.map((diagnostic) => diagnostic.severity)).toContain(
		'error',
	);
	expect(result.stateLowering.writes.filter((write) => write.passedTo)).toEqual([]);
});

test('a mapped array, a seedless reduce, and an argument after a spread inside a helper are followed', () => {
	const facts = analyzeModuleFunctionWrites({
		filename: 'src/more.ts',
		source: `export function bumpFirst(rows: { hits: number }[]) {
	const kept = rows.map((row) => row);
	kept[0]!.hits++;
}
export function foldInto(rows: { hits: number }[]) {
	rows.reduce((first, row) => {
		first.hits += row.hits;
		return first;
	});
}
function mark(_skip: number, target: { seen: boolean }) {
	target.seen = true;
}
export function markAfterSpread(target: { seen: boolean }) {
	mark(...[0], target);
}
`,
	});
	expect(facts).toEqual({
		bumpFirst: { parameters: [[{ path: [] }]] },
		foldInto: { parameters: [[{ path: [] }]] },
		markAfterSpread: { parameters: [[{ path: [], assumed: true }]] },
	});
});

test('state handed through a type assertion is still marked', async () => {
	const result = await compile(page(`() => setLabel(card!, 'b')`), facts);

	expect(result.stateLowering.writes).toEqual([
		expect.objectContaining({
			graphNodeId: 'state:card',
			path: ['label'],
			passedTo: expect.objectContaining({ argument: 'card!' }),
		}),
	]);
	expect(handler(result)).toContain('marklessChanged');
});

test('a loop target, a value changed through the object it was stored in, and an unknown reader method are caught', () => {
	const facts = analyzeModuleFunctionWrites({
		filename: 'src/edges.ts',
		source: `export function cycle(slot: { current: string }, items: string[]) {
	for (slot.current of items);
}
export function stash(value: { label: string }) {
	const holder = { inner: null as null | { label: string } };
	holder.inner = value;
	holder.inner.label = 'z';
}
export function lookUp(key: { id: string }, api: { get(key: object): unknown }) {
	return api.get(key);
}
export function firstLines(view: { size: number }, lines: string[]) {
	return lines.slice(0, view.size);
}
`,
	});
	expect(facts).toEqual({
		cycle: { parameters: [[{ path: ['current'] }], []] },
		stash: { parameters: [[{ path: [], assumed: true }]] },
		lookUp: { parameters: [[{ path: [], assumed: true }], []] },
		firstLines: { parameters: [[], []] },
	});
});
