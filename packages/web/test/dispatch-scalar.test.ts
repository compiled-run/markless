import type { ProtocolViewPayload } from '@markless/serializer';
import { expect, test } from 'vitest';
import { createProtocolStatePayload } from '../../serializer/src/index.ts';
import { marklessDispatchScalarEvent } from '../src/fns/dispatch-scalar.ts';
import { marklessUpdateText } from '../src/fns/update-text.ts';
import { marklessWriteScalar } from '../src/fns/write-scalar.ts';

type FakeElement = {
	nodeType: 1;
	readonly tagName: string;
	readonly childNodes: FakeElement[];
	readonly parentElement?: FakeElement | null;
	textContent?: string | null;
	__marklessEventOnlyGraph?: Map<string, unknown>;
};

function element(tagName: string, childNodes: FakeElement[] = []): FakeElement {
	const node = { nodeType: 1 as const, tagName, childNodes, textContent: null };
	for (const child of childNodes) {
		(child as { parentElement?: FakeElement }).parentElement = node;
	}
	return node;
}

test('scalar dispatch runs exact write and text leaves for a counter click', async () => {
	const button = element('BUTTON');
	const root = element('DIV', [button]);
	const state = createProtocolStatePayload({
		cells: [{ graphNodeId: 'state:count', name: 'count', valueKind: 'scalar', value: 0 }],
	});
	const view = counterView();
	const loadedSymbols: string[] = [];

	await marklessDispatchScalarEvent({
		state,
		view,
		root,
		event: { type: 'click', target: button },
		eventRecord: view.events[0],
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			if (symbolId === 'symbol:click') {
				return (context) =>
					marklessWriteScalar(context, {
						graphNodeId: 'state:count',
						update(value) {
							return Number(value) + 1;
						},
					});
			}
			return (context) => marklessUpdateText(context, { hostNodeId: 'h1' });
		},
	});

	expect(loadedSymbols).toEqual(['symbol:click', 'symbol:text']);
	expect(button.textContent).toBe('1');
	expect(root.__marklessEventOnlyGraph?.get('state:count')).toBe(1);
});

test('scalar dispatch treats null event records as explicit no-match handoffs', async () => {
	const button = element('BUTTON');
	const root = element('DIV', [button]);

	await marklessDispatchScalarEvent({
		state: createProtocolStatePayload({
			cells: [{ graphNodeId: 'state:count', name: 'count', valueKind: 'scalar', value: 0 }],
		}),
		view: counterView(),
		root,
		event: { type: 'click', target: button },
		eventRecord: null,
		loadSymbol() {
			throw new Error('No symbol should load for an explicit no-match record.');
		},
	});

	expect(button.textContent).toBe(null);
	expect(root.__marklessEventOnlyGraph?.get('state:count')).toBeUndefined();
});

function counterView(): ProtocolViewPayload {
	return {
		version: 1,
		locators: [
			{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'div' },
			{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
		],
		events: [{ hostNodeId: 'h1', eventName: 'click', symbolIds: ['symbol:click'] }],
		domUpdates: [
			{
				hostNodeId: 'h1',
				source: 'count',
				graphNodeId: 'state:count',
				path: [],
				target: { kind: 'text' },
				symbolId: 'symbol:text',
			},
		],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
}
