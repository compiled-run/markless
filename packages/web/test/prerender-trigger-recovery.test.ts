import { expect, test } from 'vitest';
import {
	ASYNC_PROTOCOL_VERSION,
	createProtocolStatePayload,
	renderPayloadScripts,
	type ProtocolViewPayload,
} from '@markless/serializer';
import { decodePayloadScripts } from '../../serializer/src/protocol-client-storage.ts';
import { resumePrerenderTriggerGroup } from '../src/fns/prerender-trigger-resume.ts';
import type { ResumeDomElement, ResumeDomEvent, ResumeSymbol } from '../src/resume-types.ts';

function fixture(tagName = 'BUTTON') {
	const target: ResumeDomElement = { nodeType: 1, tagName, childNodes: [] };
	const listeners = new Set<unknown>();
	const root: ResumeDomElement = {
		nodeType: 1,
		tagName: 'SECTION',
		childNodes: [target],
		addEventListener: (_type, listener) => {
			listeners.add(listener);
		},
		removeEventListener: (_type, listener) => {
			listeners.delete(listener);
		},
	};
	const event: ResumeDomEvent = { type: 'click', target };
	return { root, target, event, listeners };
}

function inputFor(
	root: ResumeDomElement,
	groupId: string,
	graphNodeId: string,
	value: number,
	options: { tagName?: string; symbol?: ResumeSymbol } = {},
) {
	const state = createProtocolStatePayload({
		cells: [{ graphNodeId, name: graphNodeId, valueKind: 'scalar', value }],
	});
	const view: ProtocolViewPayload = {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [
			{
				hostNodeId: 'control',
				strategy: 'dom-order',
				index: 1,
				tagName: options.tagName ?? 'button',
			},
		],
		events: [{ hostNodeId: 'control', eventName: 'click', symbolIds: ['symbol:change'] }],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
	return {
		root,
		groupId,
		graphNodeIds: [graphNodeId],
		...decodePayloadScripts(renderPayloadScripts({ state, view })),
		loadSymbol: async () =>
			options.symbol ??
			(({ graph }) =>
				graph.update({
					graphNodeId,
					update: (current) => Number(current) + 1,
				})),
	};
}

test('a refused trigger group can retry after its locator is corrected', async () => {
	const { root, event } = fixture();
	await expect(
		resumePrerenderTriggerGroup(
			inputFor(root, 'counter', 'state:count', 0, {
				tagName: 'input',
			}),
		),
	).rejects.toThrow();
	const resumed = await resumePrerenderTriggerGroup(inputFor(root, 'counter', 'state:count', 0));
	await resumed.runtime.dispatch(event);
	expect(resumed.graph.read('state:count')).toBe(1);
});

test('an unsuccessful segment cannot seed a different trigger group', async () => {
	const { root } = fixture('INPUT');
	await expect(
		resumePrerenderTriggerGroup(inputFor(root, 'refused', 'state:value', 1)),
	).rejects.toThrow();
	const resumed = await resumePrerenderTriggerGroup(
		inputFor(root, 'recovered', 'state:value', 9, {
			tagName: 'input',
		}),
	);
	expect(resumed.graph.read('state:value')).toBe(9);
});

test('overlapping activations share the first completed live state', async () => {
	const { root, event } = fixture();
	const firstInput = inputFor(root, 'first', 'state:count', 1);
	const firstPending = resumePrerenderTriggerGroup(firstInput);
	expect(resumePrerenderTriggerGroup(firstInput)).toBe(firstPending);
	const secondPending = resumePrerenderTriggerGroup(inputFor(root, 'second', 'state:count', 9));
	const [first, second] = await Promise.all([firstPending, secondPending]);
	expect(first.graph.read('state:count')).toBe(1);
	expect(second.graph.read('state:count')).toBe(1);
	await second.runtime.dispatch(event);
	expect(first.graph.read('state:count')).toBe(2);
	expect(second.graph.read('state:count')).toBe(2);
});

test('one rejected activation does not poison a concurrently queued group', async () => {
	const { root } = fixture('INPUT');
	const rejected = resumePrerenderTriggerGroup(inputFor(root, 'invalid', 'state:score', 2));
	const next = resumePrerenderTriggerGroup(
		inputFor(root, 'valid', 'state:score', 8, { tagName: 'input' }),
	);
	const results = await Promise.allSettled([rejected, next]);
	expect(results[0]!.status).toBe('rejected');
	expect(results[1]!.status).toBe('fulfilled');
	expect((await next).graph.read('state:score')).toBe(8);
});

test('startup failure releases observers and allows the same group to recover', async () => {
	const { root, event, listeners } = fixture();
	const input = inputFor(root, 'visible-counter', 'state:count', 0);
	const failure = new Error('observer startup failed');
	let refused = true;
	let disconnected = 0;
	const visible = {
		...input,
		view: {
			...input.view,
			events: [
				...input.view.events,
				{
					hostNodeId: 'control',
					eventName: 'visible',
					symbolIds: ['symbol:visible'],
				},
			],
		},
		createVisibilityObserver: () => ({
			observe() {
				if (refused) throw failure;
			},
			disconnect() {
				disconnected++;
			},
		}),
	};
	await expect(resumePrerenderTriggerGroup(visible)).rejects.toBe(failure);
	expect(disconnected).toBe(1);
	expect(listeners.size).toBe(0);
	refused = false;
	const recovered = await resumePrerenderTriggerGroup(visible);
	await recovered.runtime.dispatch(event);
	expect(recovered.graph.read('state:count')).toBe(1);
});

test('scalar values changed during activation remain available to a later group', async () => {
	const { root } = fixture();
	root.__marklessEventOnlyGraph = new Map([['state:later', 3]]);
	const pending = resumePrerenderTriggerGroup(inputFor(root, 'first', 'state:first', 0));
	root.__marklessEventOnlyGraph.set('state:later', 7);
	await pending;
	const later = await resumePrerenderTriggerGroup(inputFor(root, 'later', 'state:later', 0));
	expect(later.graph.read('state:later')).toBe(7);
});

test.each([
	['state:count', 'state:untouched', 'BUTTON'],
	['m2:state:quantity', 'm5:state:balance', 'INPUT'],
])('successive groups preserve live %s after scalar handoff', async (id, untouched, tagName) => {
	const { root, event } = fixture(tagName);
	root.__marklessEventOnlyGraph = new Map([
		[id, 4],
		[untouched, 17],
	]);
	const first = await resumePrerenderTriggerGroup(inputFor(root, 'first', id, 0, { tagName }));
	expect(first.graph.read(id)).toBe(4);
	await first.runtime.dispatch(event);
	expect(first.graph.read(id)).toBe(5);
	expect(root.__marklessEventOnlyGraph?.get(id)).toBe(5);
	expect(root.__marklessEventOnlyGraph?.has(untouched)).toBe(true);
	expect(root.__marklessEventOnlyGraph?.get(untouched)).toBe(17);
	const second = await resumePrerenderTriggerGroup(inputFor(root, 'second', id, 0, { tagName }));
	expect(second.graph.read(id)).toBe(5);
	await second.runtime.dispatch(event);
	expect(first.graph.read(id)).toBe(6);
	expect(second.graph.read(id)).toBe(6);
	expect(root.__marklessEventOnlyGraph?.get(id)).toBe(6);
	const third = await resumePrerenderTriggerGroup(
		inputFor(root, 'third', untouched, 0, { tagName }),
	);
	expect(third.graph.read(untouched)).toBe(17);
	await third.runtime.dispatch(event);
	expect(root.__marklessEventOnlyGraph?.get(untouched)).toBe(18);
});
