import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A write whose target starts at a local declared inside a handler, an array
// callback or an attach body is decided by the binding that local resolves to:
// a local holding state writes the path its value lives at, a local holding
// state no path can name fails the build, and any other local is plain.

async function compile(handlerBody: string) {
	return compileTsrxModule({
		filename: 'src/Locals.tsrx',
		source: `import { state } from '@markless/core';

export function Locals() @{
	let account = state({ owner: { label: 'a', marks: ['x'] }, size: 1 });
	let entries = state([{ key: 'k1', count: 0 }, { key: 'k2', count: 0 }]);
	let lookup = state(new Map([['k', { count: 1 }]]));
	<div>
		<output>{account.owner.label}</output>
		<output>{entries[0].count}</output>
		<button onClick={() => { ${handlerBody} }}>go</button>
	</div>
}
`,
		symbols: [],
	});
}

type Compiled = Awaited<ReturnType<typeof compile>>;

function errors(result: Compiled) {
	return [
		...result.semanticGraph.diagnostics,
		...result.stateLowering.diagnostics,
		...result.symbolModules.diagnostics,
	].filter((diagnostic) => diagnostic.severity === 'error');
}

function handlerSource(result: Compiled): string {
	return result.symbolModules.modules.find((module) => module.kind === 'event-handler')!.source;
}

test('a const naming a nested state object writes the path below it', async () => {
	const result = await compile(
		`const owner = account.owner; owner.label = 'b'; owner.marks.push('y');`,
	);

	expect(errors(result)).toEqual([]);
	expect(result.stateLowering.writes).toEqual([
		expect.objectContaining({
			source: 'owner.label',
			graphNodeId: 'state:account',
			path: ['owner', 'label'],
			through: { local: 'owner', element: false, basePath: ['owner'], path: ['label'] },
		}),
		expect.objectContaining({
			source: 'owner.marks',
			method: 'push',
			path: ['owner', 'marks'],
			through: { local: 'owner', element: false, basePath: ['owner'], path: ['marks'] },
		}),
	]);
	expect(handlerSource(result)).toContain(
		'marklessWriteThrough(context, "state:account", ["owner"], owner, false).write({ graphNodeId: "state:account", path: ["label"]',
	);
});

test('a loop variable, a find() result and a callback parameter write the element they hold', async () => {
	const result = await compile(
		`for (const entry of entries) entry.count++; const hit = entries.find((e) => e.key === 'k2'); if (hit) hit.count = 5; entries.forEach((each) => { each.count += 1; });`,
	);

	expect(errors(result)).toEqual([]);
	expect(
		result.stateLowering.writes.map((write) => [write.source, write.path, write.through]),
	).toEqual([
		['entry.count', [], { local: 'entry', element: true, basePath: [], path: ['count'] }],
		['hit.count', [], { local: 'hit', element: true, basePath: [], path: ['count'] }],
		['each.count', [], { local: 'each', element: true, basePath: [], path: ['count'] }],
	]);
});

async function compileGrid(handlerBody: string) {
	return compileTsrxModule({
		filename: 'src/Grid.tsrx',
		source: `import { state } from '@markless/core';

type Cell = { on: boolean };
interface Shelf { cells: Cell[] }
declare function loadShelves(): Array<{ cells: Cell[] }>;

export function Grid() @{
	let halls = state([{ name: 'h', rows: [{ label: 'A', seats: [{ taken: false }] }] }]);
	let grid = state([[{ on: false }, { on: true }], [{ on: false }]]);
	let shelves = state<Shelf[]>([]);
	let loaded = state(loadShelves());
	let tagged = state([{ tags: new Set([{ on: false }]) }]);
	let indexed = state([{ byId: new Map([['a', { on: false }]]) }]);
	<div>
		<output>{halls[0].rows[0].seats[0].taken ? 'x' : 'o'}</output>
		<output>{grid[1][0].on ? 'x' : 'o'}</output>
		<button onClick={() => { ${handlerBody} }}>go</button>
	</div>
}
`,
		symbols: [],
	});
}

test('an element of an array inside a loop element writes through each enclosing element', async () => {
	const result = await compileGrid(
		`for (const hall of halls) { for (const row of hall.rows) { for (const seat of row.seats) seat.taken = true; } } for (const line of grid) line.forEach((cell) => { cell.on = !cell.on; }); for (const line of grid) { const first = line.find((cell) => cell.on); if (first) first.on = false; } for (const shelf of shelves) for (const box of shelf.cells) box.on = true;`,
	);

	expect(errors(result)).toEqual([]);
	expect(
		result.stateLowering.writes.map((write) => [
			write.source,
			write.graphNodeId,
			write.through,
		]),
	).toEqual([
		[
			'seat.taken',
			'state:halls',
			{
				local: 'seat',
				element: true,
				basePath: [],
				path: ['taken'],
				enclosing: [
					{ local: 'hall', path: ['rows'] },
					{ local: 'row', path: ['seats'] },
				],
			},
		],
		[
			'cell.on',
			'state:grid',
			{
				local: 'cell',
				element: true,
				basePath: [],
				path: ['on'],
				enclosing: [{ local: 'line', path: [] }],
			},
		],
		[
			'first.on',
			'state:grid',
			{
				local: 'first',
				element: true,
				basePath: [],
				path: ['on'],
				enclosing: [{ local: 'line', path: [] }],
			},
		],
		[
			'box.on',
			'state:shelves',
			{
				local: 'box',
				element: true,
				basePath: [],
				path: ['on'],
				enclosing: [{ local: 'shelf', path: ['cells'] }],
			},
		],
	]);
	expect(handlerSource(result)).toContain(
		'marklessWriteThrough(context, "state:halls", marklessElementPath(context, "state:halls", marklessElementPath(context, "state:halls", [], hall, ["rows"]), row, ["seats"]), seat, true)',
	);
	expect(handlerSource(result)).toContain(
		'import { marklessElementPath } from "@markless/web/fns/write-through";',
	);
});

test.each([
	[
		`for (const s of grid.flat()) s.on = false;`,
		's.on',
		'flat() copy of "grid"',
		'for (const row of grid) for (const s of row)',
	],
	[
		`for (const cell of grid.find((line) => line.length > 1)!) cell.on = true;`,
		'cell.on',
		'element of an element',
		'Name each enclosing element',
	],
	[
		`for (const line of grid) { for (const cell of line) { const line = [cell]; cell.on = line.length > 0; } }`,
		'cell.on',
		'finds that array again through "line", but "line" is assigned again or names a different variable',
		'Declare "line" with const',
	],
	[
		`for (let row of grid) { for (const c of row) { row = grid[0]; c.on = true; } }`,
		'c.on',
		'holds an element of `row`, and the write finds that array again through "row", but "row" is assigned again',
		'Declare "row" with const',
	],
	[
		`for (const row of tagged) for (const t of row.tags) t.on = true;`,
		't.on',
		'read out of the Map or Set "row.tags"',
		'Replace the entry instead',
	],
	[
		`for (const row of indexed) for (const entry of row.byId) entry[1].on = true;`,
		'entry[1].on',
		'read out of the Map or Set "row.byId"',
		'Replace the entry instead',
	],
	[
		`for (const row of indexed) row.byId.forEach((value) => { value.on = true; });`,
		'value.on',
		'read out of the Map or Set "row.byId"',
		'Replace the entry instead',
	],
	[
		`for (const shelf of loaded) for (const box of shelf.cells) box.on = true;`,
		'box.on',
		"neither the state's starting value nor its type says `shelf.cells` is an array",
		'give state() a type argument',
	],
])(
	'a nested element write through %s fails the build naming the fix',
	async (body, target, reason, fix) => {
		const result = await compileGrid(body);

		expect(errors(result)).toEqual([
			expect.objectContaining({
				code: 'MARKLESS_STATE_LOCAL_WRITE_UNTRACKED',
				statePath: target,
				message: expect.stringContaining(reason),
				suggestions: [{ message: expect.stringContaining(fix) }],
			}),
		]);
	},
);

test('a handler local that shadows a state name writes only itself', async () => {
	const result = await compile(
		`const account = { size: 0 }; account.size = 2; [1].forEach((entries) => { entries += 1; });`,
	);

	expect(errors(result)).toEqual([]);
	expect(result.stateLowering.writes).toEqual([]);
	expect(handlerSource(result)).toContain('account.size = 2;');
});

test('Object.assign onto state writes each member its sources carry', async () => {
	const result = await compile(
		`Object.assign(account, { size: 2 }); const row = entries.find((e) => e.key === 'k1'); if (row) Object.assign(row, { count: 9 }); Object.assign({}, account);`,
	);

	expect(errors(result)).toEqual([]);
	expect(result.stateLowering.writes).toEqual([
		expect.objectContaining({
			source: 'account',
			path: [],
			objectAssign: true,
			method: 'assign',
		}),
		expect.objectContaining({
			source: 'row',
			objectAssign: true,
			through: { local: 'row', element: true, basePath: [], path: [] },
		}),
	]);
	expect(handlerSource(result)).toContain(
		'import { marklessObjectAssign } from "@markless/web/fns/write-through";',
	);
});

test.each([
	[
		`const entry = lookup.get('k'); if (entry) entry.count = 5;`,
		'entry.count',
		'out of the Map or Set "lookup"',
	],
	[
		`const copy = entries.filter((e) => e.count > -1); copy[0].count = 3;`,
		'copy[0].count',
		'holds from "entries"',
	],
	[
		`const list = [...entries]; for (const item of list) item.count = 1;`,
		'item.count',
		'holds from "entries"',
	],
	[
		`const sent = { owner: account.owner, at: 1 }; sent.at = 2; sent.owner.label = 'q';`,
		'sent.owner.label',
		'holds from "account.owner"',
	],
	[
		`const held: Array<{ label: string }> = []; held.push(account.owner); held[0].label = 'r';`,
		'held[0].label',
		'holds from "account.owner"',
	],
	[
		`for (const [index, entry] of entries.entries()) entry.count = index;`,
		'entry.count',
		'destructured out of the state "entries"',
	],
	[
		`let target = account.owner; target.label = 'x'; target = { label: 'y', marks: [] };`,
		'target.label',
		'assigned again later',
	],
	[
		`const pick = account.size > 1 ? account.owner : { label: '', marks: [] }; pick.label = 'z';`,
		'pick.label',
		'chosen by a condition',
	],
])(
	'a write through %s fails the build naming what the local holds',
	async (body, target, reason) => {
		const result = await compile(body);

		expect(errors(result)).toEqual([
			expect.objectContaining({
				code: 'MARKLESS_STATE_LOCAL_WRITE_UNTRACKED',
				statePath: target,
				message: expect.stringContaining(reason),
			}),
		]);
	},
);

test('a write through a state-holding local inside computed() is refused like any write from a derive', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Derive.tsrx',
		source: `import { computed, state } from '@markless/core';

export function Derive() @{
	let entries = state([{ key: 'k1', count: 0 }]);
	const bumped = computed(() => { for (const entry of entries) entry.count++; return entries.length; });

	<output>{bumped}</output>
}
`,
		symbols: [],
	});

	expect(errors(result)).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_STATE_WRITE_IN_COMPUTED',
			statePath: 'entry.count',
		}),
	]);
});
