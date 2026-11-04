// A shared() method whose name is also a collection mutator (add, delete, set,
// push, clear, sort, setDate) is a call to that method, not a write to the
// instance; the factory's own returned methods decide it, not the method name.
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const source = (method: string, call: string) => `
import { shared, state } from '@markless/core';

export const bag = shared(() => {
	const s = state({ count: 0 });
	return { ...s, ${method} };
}, { scope: 'widget' });

export function Counter() @{
	const c = bag();

	<div>
		<button type="button" onClick={() => { ${call} }}>x</button>
		<p>{c.count}</p>
	</div>
}
`;

async function compile(method: string, call: string) {
	const compiled = await compileTsrxModule({
		filename: 'src/counter.tsrx',
		source: source(method, call),
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
	const errors = [...compiled.semanticGraph.diagnostics, ...compiled.stateLowering.diagnostics]
		.filter((diagnostic) => diagnostic.severity === 'error')
		.map((diagnostic) => diagnostic.code);
	const handler = compiled.symbolResolver.symbols.find(
		(candidate) => candidate.kind === 'event-handler',
	);
	const module = compiled.symbolModules.modules.find(
		(candidate) => candidate.symbolId === handler?.id,
	);
	return { errors, module: module?.source ?? '' };
}

const COUNT_WRITE =
	'context.graph.write({ graphNodeId: "shared:src/counter.tsrx#bag/state:s", path: ["count"], value: 1 })';

test.each(['add', 'delete', 'set', 'push', 'clear', 'sort', 'setDate'])(
	'a shared() method named %s is inlined like any other method',
	async (name) => {
		const { errors, module } = await compile(`${name}() { s.count = 1; },`, `c.${name}();`);
		expect(errors).toEqual([]);
		expect(module).toContain(COUNT_WRITE);
		expect(module).not.toContain(`c.${name}`);
	},
);

test('a mutator-named method with arguments is inlined', async () => {
	const { errors, module } = await compile('add(n: number) { s.count = n; },', 'c.add(1);');
	expect(errors).toEqual([]);
	expect(module).toContain(
		'context.graph.write({ graphNodeId: "shared:src/counter.tsrx#bag/state:s", path: ["count"], value: n })',
	);
});

test('a mutator name the factory does not return still reports the stale write', async () => {
	const { errors } = await compile('bump() { s.count = 1; },', 'c.add(1);');
	expect(errors.length).toBeGreaterThan(0);
});
