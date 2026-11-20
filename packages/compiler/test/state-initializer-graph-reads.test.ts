import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A state() whose initial value reads another graph value of the same component
// (storage(), state() or computed()) reads it through the graph in its own module.

async function compile(filename: string, source: string) {
	return compileTsrxModule({ filename, source, symbols: [] });
}

function errors(result: Awaited<ReturnType<typeof compile>>) {
	return Object.values(result as Record<string, unknown>)
		.flatMap((artifact) =>
			artifact && typeof artifact === 'object' && Array.isArray((artifact as { diagnostics?: unknown }).diagnostics)
				? (artifact as { diagnostics: Array<{ code: string; severity: string }> }).diagnostics
				: [],
		)
		.filter((diagnostic) => diagnostic.severity === 'error')
		.map((diagnostic) => diagnostic.code);
}

function runInitializer(
	result: Awaited<ReturnType<typeof compile>>,
	graph: Readonly<Record<string, unknown>>,
): unknown {
	const modules = result.symbolModules.modules.filter((module) => module.kind === 'state-initializer');
	expect(modules).toHaveLength(1);
	const [module] = modules;
	const body = `${module!.source.replaceAll(/^export /gm, '')}\nreturn ${module!.exportName};`;
	// eslint-disable-next-line no-new-func
	const initializer = new Function(body)() as (context: unknown) => unknown;
	return initializer({
		graph: {
			read: (graphNodeId: string, path: ReadonlyArray<string>) =>
				graph[[graphNodeId, ...path].join('|')],
		},
	});
}

test('a state() starting from a storage() value reads the stored cell through the graph', async () => {
	const result = await compile(
		'src/Page.tsrx',
		`import { state, storage } from '@markless/core';

export default function Page() @{
	let saved = storage('site', 'North');
	let site = state(saved);

	<main>
		<p>{site}</p>
		<button onClick={() => (site = 'South')}>South</button>
	</main>
}
`,
	);
	expect(errors(result)).toEqual([]);
	expect(runInitializer(result, { 'storage:src/Page.tsrx#site': 'East' })).toBe('East');
});

test('a state() starting from a field of another state() reads that state through the graph', async () => {
	const result = await compile(
		'src/Editor.tsrx',
		`import { state } from '@markless/core';

export function Editor() @{
	let draft = state({ title: 'first', tags: ['a'] });
	let heading = state(draft.title.toUpperCase() + draft.tags.length);

	<section>
		<h2>{heading}</h2>
		<input value={draft.title} onInput={(event) => (draft.title = event.currentTarget.value)} />
	</section>
}
`,
	);
	expect(errors(result)).toEqual([]);
	expect(runInitializer(result, { 'state:draft': { title: 'later', tags: ['x', 'y'] } })).toBe(
		'LATER2',
	);
});

test('a state() mixing a prop, a computed() and a storage() value reads each through the graph', async () => {
	const result = await compile(
		'src/Counter.tsrx',
		`import { computed, state, storage } from '@markless/core';

export function Counter({ step }: { readonly step: number }) @{
	const remembered = storage('counter-start', '3');
	const doubled = computed(() => Number(remembered) * 2);
	let value = state(doubled + step);

	<output onClick={() => (value = value + step)}>{value}</output>
}
`,
	);
	expect(errors(result)).toEqual([]);
	const doubled = result.semanticGraph.graphBindings.find((binding) => binding.name === 'doubled');
	expect(
		runInitializer(result, { [doubled!.id]: 10, 'prop:props|step': 4 }),
	).toBe(14);
});

test('a state() starting from a module-scope storage() value reads the stored cell, not its default', async () => {
	const result = await compile(
		'src/Theme.tsrx',
		`import { state, storage } from '@markless/core';

export let mode = storage('theme-mode', 'light');

export function Picker() @{
	let preview = state(mode === 'dark' ? 'moon' : 'sun');

	<button onClick={() => (preview = 'moon')}>{preview}</button>
}
`,
	);
	expect(errors(result)).toEqual([]);
	expect(runInitializer(result, { 'storage:src/Theme.tsrx#theme-mode': 'dark' })).toBe('moon');
});
