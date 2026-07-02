import type { ProtocolViewPayload } from '@markless/serializer';
import { expect, test } from 'vitest';
import { createProtocolStatePayload, renderPayloadScripts } from '../../serializer/src/index.ts';
import { resumeEventOnlyFromPayloadDocument } from '../src/event-only-resume.ts';

type FakeElement = {
	nodeType: 1;
	readonly tagName: string;
	readonly childNodes: FakeElement[];
	readonly parentElement?: FakeElement | null;
	readonly attributes: Record<string, string>;
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
		attributes: {},
		textContent: null,
		setAttribute(name: string, value: string) {
			this.attributes[name] = value;
		},
		removeAttribute(name: string) {
			delete this.attributes[name];
		},
	};
	for (const child of childNodes) {
		(child as { parentElement?: FakeElement }).parentElement = node;
	}
	return node;
}

function payloadDocument(stateScript: string, viewScript: string): FakePayloadDocument {
	return {
		scripts: {
			'script[type="markless/state"]': { textContent: scriptContent(stateScript) },
			'script[type="markless/view"]': { textContent: scriptContent(viewScript) },
		},
		querySelector(selector) {
			return this.scripts[selector] ?? null;
		},
	};
}

function scriptContent(script: string): string {
	return script.replace(/^<script type="markless\/(?:state|view)">/, '').replace('</script>', '');
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
							return Math.min(Number(value) + 1, 1);
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
							return Math.min(Number(value) + 1, 1);
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
	expect(loadedSymbols).toEqual(['symbol:event', 'symbol:text', 'symbol:event']);
	expect(secondResult.graph.read('state:count')).toBe(1);
	expect(button.textContent).toBe('1');
});

test('event-only resume activates behavior symbols after an explicit trigger', async () => {
	const button = element('BUTTON');
	const root = element('DIV', [button]);
	const state = createProtocolStatePayload({ cells: [] });
	const view: ProtocolViewPayload = {
		version: 1,
		locators: [
			{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'div' },
			{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
		],
		events: [{ hostNodeId: 'h1', eventName: 'click', symbolIds: ['symbol:event'] }],
		domUpdates: [],
		behaviors: [
			{
				hostNodeId: 'h0',
				source: 'installController',
				functionSource: 'installController',
				inputSources: [],
				symbolId: 'symbol:behavior',
			},
		],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const scripts = renderPayloadScripts({ state, view });
	const loadedSymbols: string[] = [];

	await resumeEventOnlyFromPayloadDocument({
		document: payloadDocument(scripts.stateScript, scripts.viewScript),
		root,
		event: { type: 'click', target: button },
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			if (symbolId === 'symbol:behavior') {
				return (context) => {
					context.element.setAttribute?.('data-controller', 'installed');
				};
			}
			return () => {};
		},
	});

	expect(loadedSymbols).toEqual(['symbol:event', 'symbol:behavior']);
	expect(root.attributes['data-controller']).toBe('installed');
});
