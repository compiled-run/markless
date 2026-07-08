import { expect, test } from 'vitest';
import { createRuntimeGraph } from '../src/index.ts';

// Spec D8 (12-arm-rendering): "the prior value is always addressable". When a
// settled async computed re-runs (a mutation bumps its dependency), reads
// through the computed keep answering with the PRIOR settled value until the
// new snapshot commits — an event handler clicked mid-refresh must never read
// undefined (T116 repro: a handler POSTed /api/issues/undefined/reopen).
// Solid 2's `latest` semantics at the graph level.

function deferredRuns() {
	const resolvers: Array<(value: unknown) => void> = [];
	return {
		resolvers,
		run: () =>
			new Promise((resolve) => {
				resolvers.push(resolve);
			}),
	};
}

function graphWithAsyncComputed(run: () => unknown) {
	return createRuntimeGraph({
		cells: [{ graphNodeId: 'state:refreshTick', value: 0 }],
		asyncComputed: [
			{
				graphNodeId: 'computed:issueModel',
				dependencies: [{ graphNodeId: 'state:refreshTick', path: [] }],
				key: (read) => read('state:refreshTick'),
				run,
			},
		],
	} as never);
}

test('re-running async computed keeps the prior settled value readable while pending', async () => {
	const runs = deferredRuns();
	const graph = graphWithAsyncComputed(runs.run);

	graph.read('computed:issueModel', ['status']);
	runs.resolvers[0]!({ issue: { number: 41, title: 'First' } });
	await graph.flush();
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(graph.read('computed:issueModel', ['issue', 'number'])).toBe(41);

	// The mutation re-run: pending again, but event-time reads must see the
	// prior settled value, not undefined.
	graph.write({ graphNodeId: 'state:refreshTick', value: 1 });
	await graph.flush();
	expect(graph.read('computed:issueModel', ['status'])).toBe('pending');
	expect(graph.read('computed:issueModel', ['issue', 'number'])).toBe(41);
	expect(graph.read('computed:issueModel', ['issue', 'title'])).toBe('First');

	// The new snapshot commits and replaces the prior value.
	runs.resolvers[1]!({ issue: { number: 41, title: 'Second' } });
	await new Promise((resolve) => setTimeout(resolve, 0));
	await graph.flush();
	expect(graph.read('computed:issueModel', ['status'])).toBe('fulfilled');
	expect(graph.read('computed:issueModel', ['issue', 'title'])).toBe('Second');
});

test('prior value survives consecutive re-runs that never settle in between', async () => {
	const runs = deferredRuns();
	const graph = graphWithAsyncComputed(runs.run);

	graph.read('computed:issueModel', ['status']);
	runs.resolvers[0]!({ label: 'settled once' });
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(graph.read('computed:issueModel', ['label'])).toBe('settled once');

	// Two refreshes race: the first never settles before the second starts.
	graph.write({ graphNodeId: 'state:refreshTick', value: 1 });
	await graph.flush();
	graph.write({ graphNodeId: 'state:refreshTick', value: 2 });
	await graph.flush();
	expect(graph.read('computed:issueModel', ['status'])).toBe('pending');
	expect(graph.read('computed:issueModel', ['label'])).toBe('settled once');
});

test('first run has no prior value: pending reads stay undefined', async () => {
	const runs = deferredRuns();
	const graph = graphWithAsyncComputed(runs.run);

	graph.read('computed:issueModel', ['status']);
	expect(graph.read('computed:issueModel', ['status'])).toBe('pending');
	expect(graph.read('computed:issueModel', ['label'])).toBeUndefined();
});
