import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A body const a handler reads is rebuilt from its definition for each click, so a change made to it would be lost.
async function compile(declarations: string, handlerBody: string, extra = '') {
	return compileTsrxModule({
		filename: 'src/story.tsrx',
		omitAuthoredSource: true,
		symbols: [],
		source: `import { state } from '@markless/core';
import { make } from './make.ts';
export function Story() @{
	let shown = state('');
	${declarations}
	${extra}
	<button onClick={() => { ${handlerBody} }}>{shown}</button>
}
`,
	});
}

function errorsOf(result: Awaited<ReturnType<typeof compile>>) {
	return [...result.semanticGraph.diagnostics, ...result.captureAnalysis.diagnostics].filter(
		(item) => item.severity === 'error',
	);
}

const DECLARATIONS = `const names = new Map([[1, 'one']]);
	const seen = new Set(['a']);
	const list = [1, 2];
	const box = { count: 1, items: [1], label: 'x' };
	const day = new Date(0);
	const link = new URL('https://example.com/a');
	const word = 'abc';
	const thing = make();`;

for (const [write, name] of [
	["names.set(2, 'two');", 'names'],
	['names.delete(1);', 'names'],
	["seen.add('b');", 'seen'],
	['list.push(3);', 'list'],
	['list.sort();', 'list'],
	['list[0] = 9;', 'list'],
	['box.count = 2;', 'box'],
	['box.count++;', 'box'],
	['box.count += 1;', 'box'],
	['delete box.label;', 'box'],
	['box.items.push(2);', 'box'],
	['day.setDate(3);', 'day'],
	["link.pathname = '/b';", 'link'],
	["link.searchParams.append('q', '1');", 'link'],
	['Object.assign(box, { count: 3 });', 'box'],
	['thing.reset();', 'thing'],
] as const) {
	test(`writing to a rebuilt body value fails the build: ${write}`, async () => {
		for (const [handlerBody, extra] of [
			[write, ''],
			['change();', `function change() { ${write} }`],
		]) {
			const errors = errorsOf(await compile(DECLARATIONS, handlerBody, extra));
			expect(errors).toEqual([
				expect.objectContaining({
					code: 'MARKLESS_HANDLER_WRITES_RENDER_LOCAL',
					message: expect.stringContaining(`\`${name}\``),
				}),
			]);
			expect(errors[0]!.suggestions?.[0]?.message ?? '').toContain('state(');
		}
	});
}

for (const read of [
	'shown = names.get(1) ?? "";',
	'shown = String(names.size + seen.size);',
	'shown = [...seen].join();',
	'shown = list.map((n) => n * 2).slice(1).join();',
	'shown = box.items.includes(1) ? box.label : "";',
	'shown = String(day.getUTCFullYear()) + day.toISOString();',
	'shown = link.toString() + link.pathname;',
	'shown = word.toUpperCase();',
	'shown = String(Object.keys(box).length);',
	'const copy = [...list]; copy.push(3); shown = copy.join();',
]) {
	test(`reading a rebuilt body value still compiles: ${read}`, async () => {
		expect(errorsOf(await compile(DECLARATIONS, read))).toEqual([]);
	});
}

// A change made through another name, or by a function the value is handed to, is lost the same way.
const FLOW_DECLARATIONS = `${DECLARATIONS}
	const rows = [{ name: 'a', done: false }, { name: 'b', done: true }];`;

const MODULE_HELPERS = `function addTo(target, value) { target.push(value); }
function same(value) { return value; }
function relay(target) { addTo(target, 4); }
function markDone(row) { row.done = true; }
function labelOf(value) { return value.label + '!'; }
function namesOf(items) { return items.map((row) => row.name.toUpperCase()).join(); }
`;

type Sources = Record<string, Record<string, { filename: string; source: string } | null>>;

async function compileFlow(handlerBody: string, extra = '', importedModuleSources?: Sources) {
	return compileTsrxModule({
		filename: 'src/story.tsrx',
		omitAuthoredSource: true,
		symbols: [],
		...(importedModuleSources ? { importedModuleSources } : {}),
		source: `import { state } from '@markless/core';
import { make } from './make.ts';
import { helperAdd, helperLabel, helperRelay } from './helpers.ts';
${MODULE_HELPERS}
export function Story() @{
	let shown = state('');
	${FLOW_DECLARATIONS}
	${extra}
	<button onClick={() => { ${handlerBody} }}>{shown}</button>
}
`,
	});
}

const HELPERS_SOURCE = `import { deeper } from './deeper.ts';
export function helperAdd(list: number[], value: number) { list.push(value); }
export const helperLabel = (box: { label: string }) => box.label.length;
export function helperRelay(list: number[]) { deeper(list); }
`;
const DEEPER_SOURCE = `export function deeper(list: number[]) { list.sort(); }
`;
const SOURCES: Sources = {
	'src/story.tsrx': {
		'./helpers.ts': { filename: 'src/helpers.ts', source: HELPERS_SOURCE },
		'./make.ts': null,
	},
	'src/helpers.ts': { './deeper.ts': { filename: 'src/deeper.ts', source: DEEPER_SOURCE } },
};

for (const [shape, handlerBody, name, extra] of [
	['an alias', 'const copy = box; copy.count = 2;', 'box', ''],
	['a reassigned alias', 'let target; target = box; target.count = 2;', 'box', ''],
	['a destructured member', 'const { items } = box; items.push(2);', 'box', ''],
	['a destructured element', 'const [first] = rows; first.done = true;', 'rows', ''],
	['an element read by index', 'const first = rows[0]; first.done = true;', 'rows', ''],
	['a for-of element', 'for (const row of rows) row.done = true;', 'rows', ''],
	['a callback element', 'rows.forEach((row) => { row.done = true; });', 'rows', ''],
	['an element found by a callback', 'const hit = rows.find((row) => !row.done); if (hit) hit.done = true;', 'rows', ''],
	['a spread copy element', 'const all = [...rows]; all[0].done = true;', 'rows', ''],
	['a shallow object copy', 'const copy = { ...box }; copy.items.push(2);', 'box', ''],
	['a value a body function returns', 'pick().count = 2;', 'box', 'function pick() { return box; }'],
	['a value a module function returns', 'same(box).count = 2;', 'box', ''],
	['a body function that changes its argument', 'grow(list, 3);', 'list', 'function grow(target, value) { target.push(value); }'],
	['a module function that changes its argument', 'addTo(list, 3);', 'list', ''],
	['a module function that passes it on', 'relay(list);', 'list', ''],
	['a local arrow that changes its argument', 'const add = (target) => target.push(3); add(list);', 'list', ''],
	['a function given as a callback', 'rows.forEach(markDone);', 'rows', ''],
	['a stored then changed element', 'const kept = []; kept.push(box); kept[0].count = 2;', 'box', ''],
	['an imported helper', 'helperAdd(list, 3);', 'list', ''],
	['an imported helper that calls another module', 'helperRelay(list);', 'list', ''],
	['a function inside another body value', 'reset();', 'box', 'const reset = make(() => { box.count = 0; });'],
] as const) {
	test(`changing a rebuilt body value through ${shape} fails the build`, async () => {
		const errors = errorsOf(await compileFlow(handlerBody, extra, SOURCES));
		expect(errors).toEqual([
			expect.objectContaining({
				code: 'MARKLESS_HANDLER_WRITES_RENDER_LOCAL',
				message: expect.stringContaining(`\`${name}\``),
			}),
		]);
	});
}

test('an imported helper whose source was not given is refused, and its source is requested', async () => {
	const result = await compileFlow('shown = String(helperLabel(box));');
	expect(errorsOf(result)).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_HANDLER_WRITES_RENDER_LOCAL',
			message: expect.stringContaining('`helperLabel`'),
		}),
	]);
	expect(result.semanticGraph.importedSourceRequests).toEqual([
		{ importer: 'src/story.tsrx', specifier: './helpers.ts' },
	]);
});

for (const [callee, handlerBody, extra = ''] of [
	['an imported function the compiler cannot see', 'make(box);'],
	['a function of the page', 'window.keep(list);'],
	['an unknown constructor', 'new Keeper(box);'],
	['an unknown method of another object', 'navigator.keep(rows);'],
	['an unseen function, by the definition of another body value', 'shown = String(made);', 'const made = make(list);'],
] as const) {
	test(`handing a rebuilt body value to ${callee} is refused`, async () => {
		const errors = errorsOf(await compileFlow(handlerBody, extra, SOURCES));
		expect(errors).toEqual([
			expect.objectContaining({
				code: 'MARKLESS_HANDLER_WRITES_RENDER_LOCAL',
				message: expect.stringContaining('cannot see'),
			}),
		]);
	});
}

for (const read of [
	'const copy = box; shown = copy.label;',
	'const { label, items } = box; shown = label.toUpperCase() + items.join();',
	'for (const row of rows) shown += row.name;',
	'shown = rows.map((row) => row.name.toUpperCase()).join();',
	'shown = rows.filter((row) => row.done).map((row) => row.name).join();',
	'shown = labelOf(box) + namesOf(rows);',
	'shown = same(box).label;',
	'shown = JSON.stringify(box) + String(list) + Object.keys(box).join() + Array.from(seen).join();',
	'const sorted = list.slice(); sorted.sort(); shown = sorted.join();',
	'const copy = structuredClone(box); copy.count = 2; shown = String(copy.count);',
	'const next = [...rows, { name: "c", done: false }]; next.push({ name: "d", done: true }); shown = String(next.length);',
	'console.log(box, rows);',
	'shown = String(helperLabel(box));',
	'shown = word.toUpperCase(); addTo([], 1); make(word);',
]) {
	test(`following a rebuilt body value that is only read still compiles: ${read}`, async () => {
		expect(errorsOf(await compileFlow(read, '', SOURCES))).toEqual([]);
	});
}
