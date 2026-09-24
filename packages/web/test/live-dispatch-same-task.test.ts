import { expect, test } from 'vitest';
import type { ProtocolViewPayload } from '@markless/serializer';
import { createProtocolStatePayload, renderPayloadScripts } from '../../serializer/src/index.ts';
import { emitQueuedResumeContainerEvent } from '../../bundler/src/source-module.ts';
import { resumeFromPayloadDocument } from '../src/index.ts';
import { disposeResumedPayload } from '../src/payload-full.ts';
import { refreshSyncComputed } from '../src/resume-sync-computed.ts';

// A later event must reach its handler inside the task that delivered it: any
// macrotask between them lets the browser run a render frame first.

type FakeElement = {
	readonly nodeType: 1;
	readonly tagName: string;
	readonly childNodes: FakeElement[];
	parentElement: FakeElement | null;
	readonly isConnected: boolean;
	addEventListener(): void;
	removeEventListener(): void;
	__marklessDelegatedDispatch?: boolean;
};

function element(tagName: string, childNodes: FakeElement[] = []): FakeElement {
	const node: FakeElement = {
		nodeType: 1,
		tagName,
		childNodes,
		parentElement: null,
		isConnected: true,
		addEventListener() {},
		removeEventListener() {},
	};
	for (const child of childNodes) child.parentElement = node;
	return node;
}

function payloadDocument() {
	const view: ProtocolViewPayload = {
		version: 1,
		locators: [
			{ hostNodeId: 'panel', strategy: 'dom-order', index: 0, tagName: 'section' },
			{ hostNodeId: 'field', strategy: 'dom-order', index: 1, tagName: 'input' },
		],
		events: [{ hostNodeId: 'field', eventName: 'input', symbolIds: ['symbol:filter'] }],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const scripts = renderPayloadScripts({
		state: createProtocolStatePayload({
			cells: [{ graphNodeId: 'state:query', name: 'query', valueKind: 'scalar', value: '' }],
		}),
		view,
	});
	const content = (script: string) =>
		script.replace(/^<script type="markless\/(?:state|view)">/, '').replace('</script>', '');
	const entries: Record<string, { readonly textContent: string }> = {
		'script[type="markless/state"]': { textContent: content(scripts.stateScript) },
		'script[type="markless/view"]': { textContent: content(scripts.viewScript) },
	};
	return { querySelector: (selector: string) => entries[selector] ?? null };
}

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// The route module's queued entry, built by the emitter the real routes use. Its
// handoff re-imports the resume entry per event, which is modelled as a task hop.
function routeModule(handoff: (input: { root: FakeElement; event: unknown }) => Promise<void>) {
	const source = emitQueuedResumeContainerEvent(
		'export async function resumeContainerEvent(input) { await handoff(input); }',
	).replace('export function resumeContainerEvent', 'return function resumeContainerEvent');
	return new Function('handoff', source)(handoff) as (input: {
		root: FakeElement;
		event: unknown;
	}) => Promise<void>;
}

test('a started runtime dispatches a later event in the task that delivered it', async () => {
	const field = element('INPUT');
	const root = element('SECTION', [field]);
	root.__marklessDelegatedDispatch = true;
	const document = payloadDocument();
	const runs: Array<{ readonly type: string; readonly sameTask: boolean }> = [];
	let macrotaskRan = false;
	let symbolLoads = 0;
	const loadSymbol = (symbolId: string) => {
		symbolLoads++;
		expect(symbolId).toBe('symbol:filter');
		// Every import() of a module resolves a task later, evaluated or not.
		return nextTask().then(() => (context: { readonly event: { readonly type: string } }) => {
			runs.push({ type: context.event.type, sameTask: !macrotaskRan });
		});
	};
	let handoffs = 0;
	const resumeContainerEvent = routeModule(async (input) => {
		handoffs++;
		await nextTask();
		const { runtime } = await resumeFromPayloadDocument({
			document,
			root: root as never,
			loadSymbol,
		});
		await runtime.dispatch(input.event as never, { ignoreUnmatched: true });
	});

	await resumeContainerEvent({ root, event: { type: 'input', target: field } });
	expect(handoffs).toBe(1);

	macrotaskRan = false;
	setTimeout(() => (macrotaskRan = true), 0);
	const later = resumeContainerEvent({ root, event: { type: 'input', target: field } });
	await later;
	expect(runs).toHaveLength(2);
	expect(runs[1]).toEqual({ type: 'input', sameTask: true });
	expect(handoffs).toBe(1);
	expect(symbolLoads).toBe(1);

	// A disposed container is not the live runtime any more: the route's handoff answers again.
	disposeResumedPayload(root as never);
	await resumeContainerEvent({ root, event: { type: 'input', target: field } });
	expect(handoffs).toBe(2);
	expect(runs).toHaveLength(3);
});

test('events queued behind the boot keep their arrival order on the live runtime', async () => {
	const field = element('INPUT');
	const root = element('SECTION', [field]);
	root.__marklessDelegatedDispatch = true;
	const document = payloadDocument();
	const order: string[] = [];
	const resumeContainerEvent = routeModule(async (input) => {
		await nextTask();
		const { runtime } = await resumeFromPayloadDocument({
			document,
			root: root as never,
			loadSymbol: () => (context: { readonly event: { readonly data: string } }) => {
				order.push(context.event.data);
			},
		});
		await runtime.dispatch(input.event as never, { ignoreUnmatched: true });
	});
	await Promise.all(
		['a', 'b', 'c'].map((data) =>
			resumeContainerEvent({ root, event: { type: 'input', target: field, data } }),
		),
	);
	expect(order).toEqual(['a', 'b', 'c']);
});

test('a sync computed refresh imports the roster module once and retries a failed import', async () => {
	const host = globalThis as { __marklessRosterResume?: () => Promise<unknown> };
	let rosterImports = 0;
	let fail = true;
	host.__marklessRosterResume = () => {
		rosterImports++;
		return nextTask().then(() => {
			if (fail) throw new Error('offline');
			return {
				createRosterPositionReader: () => undefined,
				createRosterCountReader: () => undefined,
			};
		});
	};
	const written: unknown[] = [];
	const refresh = () =>
		refreshSyncComputed({
			computed: { graphNodeId: 'computed:count', deriveSymbolId: 'symbol:count' },
			graph: {
				read: () => 2,
				write: (update: { value: unknown }) => written.push(update.value),
			},
			root: element('SECTION') as never,
			loadSymbol: () => () => 2,
			elementHandles: { get: () => undefined },
		} as never);
	try {
		await expect(refresh()).rejects.toThrow('offline');
		fail = false;
		await refresh();
		expect(rosterImports).toBe(2);
		let macrotaskRan = false;
		setTimeout(() => (macrotaskRan = true), 0);
		await refresh();
		expect(macrotaskRan).toBe(false);
		expect(rosterImports).toBe(2);
		expect(written).toEqual([2, 2]);
	} finally {
		delete host.__marklessRosterResume;
	}
});
