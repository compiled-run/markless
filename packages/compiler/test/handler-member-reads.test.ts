import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// Two handler reads that used to reach the emitted module as the authored name:
// a member of an element() handle written with `[...]` or `?.`, and a state read
// used as a computed key inside a member chain rooted at a non-graph value.

async function compile(source: string) {
	return compileTsrxModule({ filename: 'src/Reads.tsrx', source, symbols: [] });
}

function errors(result: Awaited<ReturnType<typeof compile>>) {
	return Object.values(result as Record<string, unknown>)
		.flatMap((artifact) =>
			artifact && typeof artifact === 'object' && Array.isArray((artifact as { diagnostics?: unknown }).diagnostics)
				? ((artifact as { diagnostics: Array<{ code: string; severity: string }> }).diagnostics)
				: [],
		)
		.filter((diagnostic) => diagnostic.severity === 'error')
		.map((diagnostic) => diagnostic.code);
}

function handlerSource(result: Awaited<ReturnType<typeof compile>>) {
	const handlers = result.symbolModules.modules.filter((module) => module.kind === 'event-handler');
	expect(handlers).toHaveLength(1);
	return handlers[0]!.source;
}

const rowHandle = (statement: string, inline = false) => `
import { element, state } from '@markless/core';
import { fly } from './gems.ts';

export default function Glove() @{
	const worn = state(new Set<string>());
	const gems = element<HTMLElement[]>();
	${statement.includes('await') ? 'async ' : ''}function place(colour: string) {
		worn.add(colour);
		${statement}
	}

	<div>
		@for (const colour of worn; key colour) {
			<i el={gems} class={colour} />
		}
		<button onClick={${inline ? `async () => { worn.add('red'); ${statement} }` : `() => place('red')`}}>add</button>
	</div>
}
`;

test.each([
	['an optional method call', 'fly(gems?.at(-1));', 'context.getElementHandle("element:gems")?.at(-1)'],
	['a literal index', 'fly(gems[0]);', 'context.getElementHandle("element:gems")?.[0]'],
	['a state-keyed index', 'fly(gems[worn.size - 1]);', 'context.getElementHandle("element:gems")[context.graph.read("state:worn", ["size"]) - 1]'],
	['a literal index after an await', 'await Promise.resolve(); fly(gems[0]);', 'context.getElementHandle("element:gems")?.[0]'],
	['a literal index in a nested arrow', '[1].forEach(() => fly(gems[0]));', 'context.getElementHandle("element:gems")?.[0]'],
	['a literal index then a property', 'fly(gems[0].className);', 'context.getElementHandle("element:gems")?.[0].className'],
])('a row handle read through %s lowers to the handle', async (_name, statement, expected) => {
	for (const inline of [false, true]) {
		const result = await compile(rowHandle(statement, inline));
		expect(errors(result)).toEqual([]);
		expect(handlerSource(result)).toContain(expected);
	}
});

test('a single handle read through an optional method call or a non-null mark still lowers', async () => {
	for (const statement of ['one?.focus();', 'one!.focus();', 'fly(one?.parentElement);']) {
		const result = await compile(`
import { element } from '@markless/core';
import { fly } from './gems.ts';

export default function One() @{
	const one = element<HTMLElement | undefined>();
	<div>
		<b el={one}>one</b>
		<button onClick={() => { ${statement} }}>go</button>
	</div>
}
`);
		expect(errors(result)).toEqual([]);
		expect(handlerSource(result)).toContain('context.getElementHandle(');
		expect(handlerSource(result)).not.toMatch(/\bone[?!]?\./);
	}
});

const keyedRead = (statement: string, viaFunction = false) => `
import { state } from '@markless/core';
import { layout } from './layout.ts';

export default function Dial() @{
	const view = state({ place: 0, maybe: undefined as undefined | { place: number } });
	const drag = state({ from: 0 });
	${viaFunction ? `function start() { ${statement} }` : ''}

	<div onPointerDown={() => { ${viaFunction ? 'start();' : statement} }}>{drag.from}</div>
}
`;

test.each([
	['a nested member chain', 'drag.from = layout.places[view.place].y;', 'layout.places[context.graph.read("state:view", ["place"])].y'],
	['an optional read in the key', 'drag.from = layout.places[view.maybe?.place ?? 0].y;', 'layout.places[context.graph.read("state:view", ["maybe"])?.place ?? 0].y'],
	['a call result', 'drag.from = layout.at(view.place)[view.place];', 'layout.at(context.graph.read("state:view", ["place"]))[context.graph.read("state:view", ["place"])]'],
])('a state read used as a key in %s lowers to a graph read', async (_name, statement, expected) => {
	for (const viaFunction of [false, true]) {
		const result = await compile(keyedRead(statement, viaFunction));
		expect(errors(result)).toEqual([]);
		expect(handlerSource(result)).toContain(expected);
	}
});

test('a handle name the lowering leaves standing is reported as a handle, with the rewrite', async () => {
	const handle = (statement: string) => `
import { element } from '@markless/core';

export default function One() @{
	const one = element<HTMLElement | undefined>();
	<div>
		<b el={one}>one</b>
		<button onClick={() => { ${statement} }}>go</button>
	</div>
}
`;
	const refused = await compile(handle('one!.scrollTop = 5;'));
	const [diagnostic] = refused.symbolModules.diagnostics;
	expect(diagnostic?.code).toBe('MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE');
	expect(diagnostic?.message).toContain('"one" is an element() handle');
	expect(diagnostic?.suggestions[0]?.message).toContain('const el = one;');

	const rewritten = await compile(handle('const el = one; el.scrollTop = 5;'));
	expect(errors(rewritten)).toEqual([]);
	expect(handlerSource(rewritten)).toContain('const el = context.getElementHandle("element:one");');
});
