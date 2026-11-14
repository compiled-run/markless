import { expect, test } from 'vitest';
import { createRuntimeGraph } from '@markless/runtime';
import { compileTsrxModule } from '../../compiler/src/index.ts';
import { createPaintHold } from '../src/resume-return-reask.ts';

const macrotask = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

async function compiledHandler(body: string, handler: string) {
	const compiled = await compileTsrxModule({
		filename: 'src/Panel.tsrx',
		omitAuthoredSource: true,
		symbols: [],
		source: `import { state } from '@markless/core';
export default function Panel() @{
	${body}
	<div><button onClick={(event) => { ${handler} }}>go</button></div>
}`,
	});
	expect(compiled.symbolModules.diagnostics).toEqual([]);
	const source = compiled.symbolModules.modules.find((module) => module.kind === 'event-handler')!.source;
	const resolved = source.replace(/"@markless\/web\/fns\/([\w-]+)"/g, (_, name: string) =>
		JSON.stringify(new URL(`../src/fns/${name}.ts`, import.meta.url).href),
	);
	const loaded = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(resolved)}`);
	return Object.values(loaded).find((value) => typeof value === 'function') as (context: unknown) => unknown;
}

// A save held `name`'s earlier value on screen; the handler then runs while the page still shows it.
async function runWhileShown(name: string, shown: unknown, held: unknown, handler: (context: unknown) => unknown, event: unknown) {
	const graphNodeId = `state:${name}`;
	const graph = createRuntimeGraph({ cells: [{ graphNodeId, value: shown }], computed: [] });
	let painted: unknown = shown;
	graph.subscribe({ id: `paint:${name}`, graphNodeId, run: (value) => void (painted = value) });
	let holding = true;
	graph.holdPaint!((internals) => createPaintHold(internals, () => holding));
	graph.write({ graphNodeId, value: held });
	holding = false;
	await handler({ graph, event });
	await macrotask();
	return { value: graph.read(graphNodeId), painted };
}

test('a compound assignment whose right side calls runs the call once and replays its result on the shown value', async () => {
	let calls = 0;
	const handler = await compiledHandler("let log = state('');", 'log += event.next();');
	const result = await runWhileShown('log', '', 'a', handler, { next: () => `id${++calls}` });
	expect(calls).toBe(1);
	expect(result).toEqual({ value: 'aid1', painted: 'id1' });
});

test('a list spread of a one-shot iterable replays the same items on the shown list', async () => {
	const handler = await compiledHandler('let items = state<string[]>([]);', 'const it = event.ids(); items = [...items, ...it];');
	const result = await runWhileShown('items', [], ['a'], handler, {
		*ids() {
			yield 'x';
		},
	});
	expect(result).toEqual({ value: ['a', 'x'], painted: ['x'] });
});
