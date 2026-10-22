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
