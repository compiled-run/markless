import type { ProtocolViewPayload } from '@arcade/protocol';
import { expect, test } from 'vitest';
import { createProtocolStatePayload, renderPayloadScripts } from '../../serializer/src/index.ts';
import { resumeEventOnlyFromPayloadDocument } from '../src/event-only-resume.ts';

type SyncComputedExpression =
	| {
			readonly kind: 'read';
			readonly graphNodeId: string;
			readonly path: ReadonlyArray<string>;
	  }
	| {
			readonly kind: 'literal';
			readonly value: unknown;
	  }
	| {
			readonly kind: 'binary';
			readonly operator: '+' | '-' | '*' | '/';
			readonly left: SyncComputedExpression;
			readonly right: SyncComputedExpression;
	  };

type FakeElement = {
	nodeType: 1;
	readonly tagName: string;
	readonly childNodes: FakeElement[];
	readonly parentElement?: FakeElement | null;
	textContent?: string | null;
	setAttribute?: (name: string, value: string) => void;
	removeAttribute?: (name: string) => void;
};

type FakePayloadScript = {
	readonly textContent: string;
};

type FakePayloadDocument = {
	readonly scripts: Record<string, FakePayloadScript | undefined>;
	querySelector(selector: string): FakePayloadScript | null;
};

function element(tagName: string, childNodes: FakeElement[] = []): FakeElement {
	const node = {
		nodeType: 1 as const,
		tagName,
		childNodes,
		textContent: null,
	};
	for (const child of childNodes) {
		(child as { parentElement?: FakeElement }).parentElement = node;
	}
	return node;
}

function payloadDocument(stateScript: string, viewScript: string): FakePayloadDocument {
	return {
		scripts: {
			'script[type="arcade/state"]': { textContent: scriptContent(stateScript) },
			'script[type="arcade/view"]': { textContent: scriptContent(viewScript) },
		},
		querySelector(selector) {
			return this.scripts[selector] ?? null;
		},
	};
}

function scriptContent(script: string): string {
	return script.replace(/^<script type="arcade\/(?:state|view)">/, '').replace('</script>', '');
}

test('event-only resume dispatches lazy event symbols and flushes DOM update symbols', async () => {
	const button = element('BUTTON');
	const root = element('DIV', [button]);
	const state = createProtocolStatePayload({
		cells: [
			{
				graphNodeId: 'state:count',
				name: 'count',
				valueKind: 'scalar',
				value: 0,
			},
		],
	});
	const view: ProtocolViewPayload = {
		version: 1,
		locators: [
			{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'div' },
			{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
		],
		events: [{ hostNodeId: 'h1', eventName: 'click', symbolIds: ['symbol:event'] }],
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
	const scripts = renderPayloadScripts({ state, view });
	const loadedSymbols: string[] = [];
	const result = await resumeEventOnlyFromPayloadDocument({
		document: payloadDocument(scripts.stateScript, scripts.viewScript),
		root,
		event: { type: 'click', target: button },
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			if (symbolId === 'symbol:event') {
				return (context) => {
					context.graph.update({
						graphNodeId: 'state:count',
						path: [],
						returnValue: 'next',
						update(value) {
							return Number(value) + 1;
						},
					});
				};
			}
			return (context) => ({
				type: 'setText',
				locator: context.domUpdate?.hostNodeId ?? 'h1',
				value: context.value,
			});
		},
	});

	expect(loadedSymbols).toEqual(['symbol:event', 'symbol:text']);
	expect(result.graph.read('state:count')).toBe(1);
	expect(button.textContent).toBe('1');

	const secondResult = await resumeEventOnlyFromPayloadDocument({
		document: payloadDocument(scripts.stateScript, scripts.viewScript),
		root,
		event: { type: 'click', target: button },
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			if (symbolId === 'symbol:event') {
				return (context) => {
					context.graph.update({
						graphNodeId: 'state:count',
						path: [],
						returnValue: 'next',
						update(value) {
							return Number(value) + 1;
						},
					});
				};
			}
			return (context) => ({
				type: 'setText',
				locator: context.domUpdate?.hostNodeId ?? 'h1',
				value: context.value,
			});
		},
	});

	expect(secondResult).toBe(result);
	expect(loadedSymbols).toEqual(['symbol:event', 'symbol:text', 'symbol:event', 'symbol:text']);
	expect(secondResult.graph.read('state:count')).toBe(2);
	expect(button.textContent).toBe('2');
});

test('event-only resume recomputes sync computed DOM updates when dependencies change', async () => {
	const output = element('OUTPUT');
	const button = element('BUTTON');
	const root = element('DIV', [button, output]);
	const doubleExpression: SyncComputedExpression = {
		kind: 'binary',
		operator: '*',
		left: { kind: 'read', graphNodeId: 'state:count', path: [] },
		right: { kind: 'literal', value: 2 },
	};
	const state = createProtocolStatePayload({
		cells: [
			{
				graphNodeId: 'state:count',
				name: 'count',
				valueKind: 'scalar',
				value: 0,
			},
		],
		computed: [
			{
				graphNodeId: 'computed:double',
				name: 'double',
				async: false,
				dependencies: [{ graphNodeId: 'state:count', path: [] }],
				expression: doubleExpression,
			} as NonNullable<
				Parameters<typeof createProtocolStatePayload>[0]['computed']
			>[number] & {
				readonly expression: SyncComputedExpression;
			},
		],
	});
	const view: ProtocolViewPayload = {
		version: 1,
		locators: [
			{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'div' },
			{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
			{ hostNodeId: 'h2', strategy: 'dom-order', index: 2, tagName: 'output' },
		],
		events: [{ hostNodeId: 'h1', eventName: 'click', symbolIds: ['symbol:event'] }],
		domUpdates: [
			{
				hostNodeId: 'h2',
				source: 'double',
				graphNodeId: 'state:count',
				path: [],
				target: {
					kind: 'text',
					segments: [
						{
							kind: 'read',
							source: 'double',
							graphNodeId: 'computed:double',
							path: [],
							expression: doubleExpression,
						},
					],
				},
				symbolId: 'symbol:double-text',
			},
		],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const scripts = renderPayloadScripts({ state, view });

	const result = await resumeEventOnlyFromPayloadDocument({
		document: payloadDocument(scripts.stateScript, scripts.viewScript),
		root,
		event: { type: 'click', target: button },
		loadSymbol(symbolId) {
			if (symbolId === 'symbol:event') {
				return (context) => {
					context.graph.update({
						graphNodeId: 'state:count',
						path: [],
						returnValue: 'next',
						update(value) {
							return Number(value) + 1;
						},
					});
				};
			}

			return (context) => ({
				type: 'setText',
				locator: context.domUpdate?.hostNodeId ?? 'h2',
				value: Number(context.graph.read('state:count')) * 2,
			});
		},
	});

	expect(result.graph.read('state:count')).toBe(1);
	expect(output.textContent).toBe('2');
});
