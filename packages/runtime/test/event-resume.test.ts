import { expect, test } from 'vitest';
import { createProtocolStatePayload, renderPayloadScripts } from '../../serializer/src/index.ts';
import {
	createEventResumeContainerFromPayloadDocument,
	resumeEventFromPayloadDocument,
} from '../src/event-resume.ts';
import type { ProtocolViewPayload } from '@arcade/protocol';

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

test('event resume dispatches a lazy event and applies subscribed DOM updates', async () => {
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
	const result = await resumeEventFromPayloadDocument({
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

	const secondResult = await resumeEventFromPayloadDocument({
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

test('event resume shares graph patches between payload containers', async () => {
	const sharedDefinitionId = 'shared:src/session.tsrx#session';
	const sharedGraphNodeId = 'shared:src/session.tsrx#session/state:data';
	const button = element('BUTTON');
	const panel = element('ASIDE');
	const sourceRoot = element('SECTION', [button, panel]);
	const receiverPanel = element('ASIDE');
	const receiverRoot = element('SECTION', [element('BUTTON'), receiverPanel]);
	const state = createProtocolStatePayload({
		cells: [
			{
				graphNodeId: sharedGraphNodeId,
				name: 'data',
				valueKind: 'object',
				value: {
					status: 'server-ready',
				},
			},
		],
		sharedDefinitions: [
			{
				id: sharedDefinitionId,
				name: 'session',
				exportedName: 'session',
				scope: 'page',
				version: 0,
				graphNodeIds: [sharedGraphNodeId],
				returnProperties: [
					{
						kind: 'graph',
						name: 'status',
						graphNodeId: sharedGraphNodeId,
						path: ['status'],
					},
				],
			},
		],
	});
	const view: ProtocolViewPayload = {
		version: 1,
		locators: [
			{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
			{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
			{ hostNodeId: 'h2', strategy: 'dom-order', index: 2, tagName: 'aside' },
		],
		events: [{ hostNodeId: 'h1', eventName: 'click', symbolIds: ['symbol:event'] }],
		domUpdates: [
			{
				hostNodeId: 'h2',
				source: 'status',
				graphNodeId: sharedGraphNodeId,
				path: ['status'],
				target: { kind: 'text' },
				symbolId: 'symbol:text',
			},
		],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const scripts = renderPayloadScripts({ state, view });
	const loadSymbol = (symbolId: string) => {
		if (symbolId === 'symbol:event') {
			return (context) => {
				context.graph.write({
					graphNodeId: sharedGraphNodeId,
					path: ['status'],
					value: 'client-ready',
				});
			};
		}

		return (context) => ({
			type: 'setText' as const,
			locator: context.domUpdate?.hostNodeId ?? 'h2',
			value: context.value,
		});
	};

	const receiver = await createEventResumeContainerFromPayloadDocument({
		document: payloadDocument(scripts.stateScript, scripts.viewScript),
		root: receiverRoot,
		loadSymbol,
	});
	const source = await resumeEventFromPayloadDocument({
		document: payloadDocument(scripts.stateScript, scripts.viewScript),
		root: sourceRoot,
		event: { type: 'click', target: button },
		loadSymbol,
	});

	expect(source.graph.readShared(sharedDefinitionId, 'status')).toBe('client-ready');
	expect(panel.textContent).toBe('client-ready');
	const [patch] = source.graph.takeSharedPatches();
	expect(patch).toEqual({
		id: sharedDefinitionId,
		scope: 'page',
		version: 1,
		patch: [['set', ['status'], 'client-ready']],
	});

	expect(receiver.graph.applySharedPatch(patch!)).toBe(true);
	await receiver.graph.flush();

	expect(receiver.graph.readShared(sharedDefinitionId, 'status')).toBe('client-ready');
	expect(receiverPanel.textContent).toBe('client-ready');
	expect(receiver.graph.takeSharedPatches()).toEqual([]);
});
