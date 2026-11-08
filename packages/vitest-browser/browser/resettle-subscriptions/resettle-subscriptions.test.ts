import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Aviary from './rs-list-in-arm.tsrx';
import Finder from './rs-inline-rows.tsrx';
import Toolbox from './rs-shown-rows.tsrx';

// A @try that settles over and over must not leave the wiring of rows it replaced behind.

afterEach(cleanup);

const errors: string[] = [];
const onError = (event: ErrorEvent | PromiseRejectionEvent) =>
	errors.push(String('reason' in event ? event.reason : event.message));
window.addEventListener('error', onError);
window.addEventListener('unhandledrejection', onError);
afterEach(() => void errors.splice(0));

type ArmHost = Element & { __marklessBranchArms?: Map<string, { readonly listeners: Set<unknown> }> };
type Graph = {
	subscribe: (subscription: { readonly id: string; readonly graphNodeId: string }) => () => void;
	readonly subscriptionCount: (graphNodeId: string) => number;
};

// Rows written straight into an arm listen for that arm's commits.
function armListeners(): number {
	let count = 0;
	for (let node = document.querySelector('[data-list]') as ArmHost | null; node; node = node.parentElement as ArmHost | null)
		for (const entry of node.__marklessBranchArms?.values() ?? []) count += entry.listeners.size;
	return count;
}

// Every subscription on the nodes a row list follows, old and new.
function collectionSubscriptions(graph: Graph): () => number {
	const nodes = new Set<string>();
	const subscribe = graph.subscribe;
	graph.subscribe = (subscription) => {
		if (subscription.id.startsWith('keyed-repeat:')) nodes.add(subscription.graphNodeId);
		return subscribe(subscription);
	};
	return () => [...nodes].reduce((total, node) => total + graph.subscriptionCount(node), 0);
}

const names = () => [...document.querySelectorAll('[data-result]')].map((node) => node.textContent?.trim());
const type = (value: string) => {
	const query = document.querySelector<HTMLInputElement>('[data-query]')!;
	query.value = value;
	query.dispatchEvent(new Event('input', { bubbles: true }));
};
const open = () => document.querySelector<HTMLElement>('[data-open]')?.click();

async function resettle(expected: Record<string, string[]>, rounds: number) {
	for (let round = 0; round < rounds; round++)
		for (const query of Object.keys(expected)) {
			type(query);
			if (query === 'x') await expect.poll(() => document.querySelector('[data-failed]')).not.toBeNull();
			else await expect.poll(names).toEqual(expected[query]);
		}
}

// What one pass over every query leaves wired is what each later pass must leave.
async function staysBounded(expected: Record<string, string[]>, live?: () => number) {
	await resettle(expected, 1);
	const after = { listeners: armListeners(), subscriptions: live?.() ?? 0 };
	if (live) expect(after.subscriptions + after.listeners).toBeGreaterThan(0);
	await resettle(expected, 6);
	expect({ listeners: armListeners(), subscriptions: live?.() ?? 0 }).toEqual(after);
	expect(errors).toEqual([]);
}

const BIRDS = {
	c: ['Crow', 'Crane'],
	x: [],
	cr: ['Crow', 'Crane'],
	d: ['Dove'],
	f: ['Finch'],
	'': ['Crow', 'Crane', 'Dove', 'Finch', 'Heron', 'Wren'],
	h: ['Heron'],
};
const FRUIT = {
	f: ['Fig'],
	x: [],
	g: ['Grape', 'Guava'],
	gu: ['Guava'],
	k: ['Kiwi'],
	'': ['Fig', 'Grape', 'Guava', 'Kiwi', 'Lime', 'Mango'],
	m: ['Mango'],
};
const TOOLS = {
	f: ['File'],
	x: [],
	l: ['Awl', 'Chisel', 'Clamp', 'Drill', 'File'],
	m: ['Clamp'],
	'': ['Awl', 'Axe', 'Chisel', 'Clamp', 'Drill', 'File'],
	a: ['Awl', 'Axe', 'Clamp'],
};

test('CSR: a @try that rewires its row list at every settle releases the list it replaced', async () => {
	const { runtime } = await render(Aviary);
	open();
	await expect.poll(names).toEqual(BIRDS['']);
	await staysBounded(BIRDS, collectionSubscriptions(runtime.graph as never));
});

test('SSR: a @try that rewires its row list at every settle keeps its rows and wiring steady', async () => {
	await renderSSR(Aviary);
	open();
	await expect.poll(names).toEqual(BIRDS['']);
	await staysBounded(BIRDS);
});

test('CSR: rows written straight into a @try keep one wiring across re-settles', async () => {
	const { runtime } = await render(Finder);
	type('f');
	await expect.poll(names).toEqual(FRUIT.f);
	await staysBounded(FRUIT, collectionSubscriptions(runtime.graph as never));
});

test('SSR: rows written straight into a @try keep one wiring across re-settles', async () => {
	await renderSSR(Finder);
	await staysBounded(FRUIT);
});

test('CSR: rows written straight into a @try an @if rendered keep one wiring across re-settles', async () => {
	const { runtime } = await render(Toolbox);
	open();
	type('f');
	await expect.poll(names).toEqual(TOOLS.f);
	await staysBounded(TOOLS, collectionSubscriptions(runtime.graph as never));
});

test('SSR: rows written straight into a @try an @if rendered keep one wiring across re-settles', async () => {
	await renderSSR(Toolbox);
	open();
	await staysBounded(TOOLS);
});
