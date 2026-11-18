import { expect, test } from 'vitest';
import { emitCreatePublicGraph } from '../src/passes/public-render/graph-runtime.ts';
import {
	readMarklessPublicPath,
	writeMarklessPublicDirtyArrayIndexes,
	writeMarklessPublicPath,
} from '../../web/src/fns/direct.ts';

type Graph = {
	read(graphNodeId: string, path?: string[]): unknown;
	write(write: { graphNodeId: string; path?: string[]; value: unknown }): unknown;
	update(update: { graphNodeId: string; update: (value: unknown) => unknown }): unknown;
	call(call: { graphNodeId: string; method: string; args?: unknown[] }): unknown;
	delete(deletion: { graphNodeId: string; path: string[] }): boolean;
	changed(change: { graphNodeId: string }): void;
	onWrite(listener: () => void): void;
};

function createGraph(trackArrayIndexes: boolean): Graph {
	const source = emitCreatePublicGraph(
		new Set(['call', 'delete', 'changed']),
		'[["state:list", ["A", "B"]], ["state:entry", { "title": "draft" }], ["state:count", 0]]',
		{ trackArrayIndexes },
	);
	return new Function(
		'readMarklessPublicPath',
		'writeMarklessPublicPath',
		'writeMarklessPublicDirtyArrayIndexes',
		`${source}\nreturn createMarklessPublicGraph();`,
	)(readMarklessPublicPath, writeMarklessPublicPath, writeMarklessPublicDirtyArrayIndexes) as Graph;
}

// The direct renderer syncs a write made after its handler returned only because the graph tells it, once the value is in place.
test.each([true, false])('every graph write tells its listener after the value changed (row indexes tracked: %s)', (trackArrayIndexes) => {
	const graph = createGraph(trackArrayIndexes);
	const seen: unknown[] = [];
	graph.onWrite(() =>
		seen.push(structuredClone([graph.read('state:count'), graph.read('state:list'), graph.read('state:entry')])),
	);

	graph.write({ graphNodeId: 'state:count', value: 1 });
	graph.update({ graphNodeId: 'state:count', update: (count) => (count as number) + 1 });
	graph.call({ graphNodeId: 'state:list', method: 'push', args: ['C'] });
	graph.delete({ graphNodeId: 'state:entry', path: ['title'] });
	graph.changed({ graphNodeId: 'state:list' });

	expect(seen).toEqual([
		[1, ['A', 'B'], { title: 'draft' }],
		[2, ['A', 'B'], { title: 'draft' }],
		[2, ['A', 'B', 'C'], { title: 'draft' }],
		[2, ['A', 'B', 'C'], {}],
		[2, ['A', 'B', 'C'], {}],
	]);
});
