import type { ProtocolViewPayload } from '@markless/serializer';
import { expect, test, vi } from 'vitest';
import { createProtocolStatePayload, renderPayloadScripts } from '../../serializer/src/index.ts';
import { resumeEventOnlyFromPayloadDocument } from '../src/event-only-resume.ts';
import { isScalarLeanResumeShape, resumeScalarEventFromPayloadDocument } from '../src/event-only-lean/scalar-resume.ts';

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

function replaceScriptJson(script: string, value: unknown): string {
	return script.replace(/>[\s\S]*<\/script>$/, `>${JSON.stringify(value)}</script>`);
}

function scalarRuntimeDemandMap(input: {
	readonly eventRecord: ProtocolViewPayload['events'][number];
	readonly domUpdate: ProtocolViewPayload['domUpdates'][number];
	readonly replaced?: boolean;
}): unknown {
	const replaced = input.replaced ?? true;
	return {
		recordKinds: ['async-boundary', 'behavior', 'branch', 'dom-update', 'element-handle', 'event', 'keyed-repeat']
			.map((kind) => ({
				kind,
				replaced: replaced && (kind === 'event' || kind === 'dom-update'),
			})),
		actions: [{
			hostNodeId: input.eventRecord.hostNodeId,
			eventName: input.eventRecord.eventName,
			recordKind: 'event',
			recordKinds: ['event', 'dom-update'],
			payloadRecordIds: [
				`event:${input.eventRecord.hostNodeId}:${input.eventRecord.eventName}`,
				`dom-update:${input.domUpdate.hostNodeId}:${input.domUpdate.symbolId ?? ''}`,
			],
		}],
	};
}

test('event-only resume rejects structure-tampered payloads with structured payload errors', async () => {
	const button = element('BUTTON');
	const root = element('DIV', [button]);
	const state = createProtocolStatePayload({
		cells: [{ graphNodeId: 'state:count', name: 'count', valueKind: 'scalar', value: 0 }],
	});
	const view: ProtocolViewPayload = {
		version: 1,
		locators: [
			{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'div' },
			{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
		],
		events: [{ hostNodeId: 'h1', eventName: 'click', symbolIds: ['symbol:event'] }],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const scripts = renderPayloadScripts({ state, view });
	const tamperedState = replaceScriptJson(scripts.stateScript, { version: 1, cells: 'tampered' });

	await expect(
		resumeEventOnlyFromPayloadDocument({
			document: payloadDocument(tamperedState, scripts.viewScript),
			root,
			event: { type: 'click', target: button },
			loadSymbol: () => ({ graph }) => {
				graph.update({
					graphNodeId: 'state:count',
					update(value) {
						return Number(value) + 1;
					},
				});
			},
		}),
	).rejects.toMatchObject({
		code: 'MARKLESS_PAYLOAD_INVALID',
		severity: 'error',
		phase: 'payload',
		docsUrl: 'https://markless.dev/errors/MARKLESS_PAYLOAD_INVALID',
	});
});

test('event-only resume reports locator mismatch with slim runtime diagnostics', async () => {
	const button = element('BUTTON');
	const root = element('DIV', [button]);
	const state = createProtocolStatePayload({ cells: [] });
	const view: ProtocolViewPayload = {
		version: 1,
		locators: [
			{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
		],
		events: [{ hostNodeId: 'h0', eventName: 'click', symbolIds: ['symbol:event'] }],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const scripts = renderPayloadScripts({ state, view });

	await expect(
		resumeEventOnlyFromPayloadDocument({
			document: payloadDocument(scripts.stateScript, scripts.viewScript),
			root,
			event: { type: 'click', target: button },
			loadSymbol: () => () => undefined,
		}),
	).rejects.toMatchObject({
		code: 'MARKLESS_RESUME_LOCATOR_MISMATCH',
		message: 'Resume locator h0 expected <section> at DOM order index 0 but found <div>.',
		docsUrl: 'https://markless.dev/errors/MARKLESS_RESUME_LOCATOR_MISMATCH',
	});
});

test('event-only graph dispatches built-in method calls like the full graph', async () => {
	const button = element('BUTTON');
	const root = element('DIV', [button]);
	const state = createProtocolStatePayload({
		cells: [
			{
				graphNodeId: 'state:stamp',
				name: 'stamp',
				valueKind: 'object',
				value: new Date('2026-01-15T00:00:00.000Z'),
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
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const scripts = renderPayloadScripts({ state, view });

	const result = await resumeEventOnlyFromPayloadDocument({
		document: payloadDocument(scripts.stateScript, scripts.viewScript),
		root,
		event: { type: 'click', target: button },
		loadSymbol: () => ({ graph }) => {
			graph.call({ graphNodeId: 'state:stamp', method: 'setMonth', args: [2] });
		},
	});

	expect(result.graph.read('state:stamp')).toBeInstanceOf(Date);
	expect((result.graph.read('state:stamp') as Date).getMonth()).toBe(2);
});

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
			{
				graphNodeId: 'state:locked',
				name: 'locked',
				valueKind: 'scalar',
				value: true,
			},
		],
	});
	const view: ProtocolViewPayload = {
		version: 1,
		locators: [
			{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'div' },
			{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
		],
		events: [
			{
				hostNodeId: 'h1',
				eventName: 'click',
				syncPolicy: {
					when: { type: 'graph-truthy', graphNodeId: 'state:locked', path: [] },
					actions: ['preventDefault'],
				},
				symbolIds: ['symbol:event'],
			},
		],
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
	let firstDefaultPrevented = false;
	const result = await resumeEventOnlyFromPayloadDocument({
		document: payloadDocument(scripts.stateScript, scripts.viewScript),
		root,
		event: {
			type: 'click',
			target: button,
			preventDefault() {
				firstDefaultPrevented = true;
			},
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			if (symbolId === 'symbol:event') {
				return (context) => {
					context.graph.write({ graphNodeId: 'state:locked', value: false });
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
	expect(firstDefaultPrevented).toBe(true);
	expect(result.graph.read('state:count')).toBe(1);
	expect(button.textContent).toBe('1');

	let secondDefaultPrevented = false;
	const secondResult = await resumeEventOnlyFromPayloadDocument({
		document: payloadDocument(scripts.stateScript, scripts.viewScript),
		root,
		event: {
			type: 'click',
			target: button,
			preventDefault() {
				secondDefaultPrevented = true;
			},
		},
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
	expect(secondDefaultPrevented).toBe(false);
	expect(secondResult.graph.read('state:count')).toBe(1);
	expect(button.textContent).toBe('1');
});

test('event-only resume leaves unrelated locators dormant during dispatch', async () => {
	const button = element('BUTTON');
	const unused = element('SPAN');
	const root = element('DIV', [button, unused]);
	const state = createProtocolStatePayload({
		cells: [{ graphNodeId: 'state:count', name: 'count', valueKind: 'scalar', value: 0 }],
	});
	const view: ProtocolViewPayload = {
		version: 1,
		locators: [
			{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'div' },
			{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
			{ hostNodeId: 'h2', strategy: 'dom-order', index: 2, tagName: 'section' },
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

	await expect(
		resumeEventOnlyFromPayloadDocument({
			document: payloadDocument(scripts.stateScript, scripts.viewScript),
			root,
			event: { type: 'click', target: button },
			loadSymbol(symbolId) {
				if (symbolId === 'symbol:event') {
					return ({ graph }) => graph.write({ graphNodeId: 'state:count', value: 1 });
				}
				return ({ value }) => ({ type: 'setText', locator: 'h1', value });
			},
		}),
	).resolves.toMatchObject({
		view,
	});
	expect(button.textContent).toBe('1');
});

test('event-only scalar lean route keeps only the dispatched record and text subscribers', async () => {
	const button = element('BUTTON');
	const output = element('OUTPUT');
	const other = element('SPAN');
	const root = element('DIV', [button, output, other]);
	const state = createProtocolStatePayload({
		cells: [
			{ graphNodeId: 'state:count', name: 'count', valueKind: 'scalar', value: 0 },
			{ graphNodeId: 'state:other', name: 'other', valueKind: 'scalar', value: 10 },
		],
	});
	const view: ProtocolViewPayload = {
		version: 1,
		locators: [
			{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'div' },
			{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
			{ hostNodeId: 'h2', strategy: 'dom-order', index: 2, tagName: 'output' },
			{ hostNodeId: 'h3', strategy: 'dom-order', index: 3, tagName: 'span' },
		],
		events: [
			{ hostNodeId: 'h1', eventName: 'click', symbolIds: ['symbol:event'] },
			{ hostNodeId: 'h3', eventName: 'mouseover', symbolIds: ['symbol:other'] },
		],
		domUpdates: [
			{
				hostNodeId: 'h2',
				source: 'count',
				graphNodeId: 'state:count',
				path: [],
				target: { kind: 'text' },
				symbolId: 'symbol:text',
			},
			{
				hostNodeId: 'h3',
				source: 'other',
				graphNodeId: 'state:other',
				path: [],
				target: { kind: 'text' },
				symbolId: 'symbol:otherText',
			},
		],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const scripts = renderPayloadScripts({ state, view });
	const runtimeDemandMap = scalarRuntimeDemandMap({
		eventRecord: view.events[0],
		domUpdate: view.domUpdates[0],
	});

	expect(isScalarLeanResumeShape({ state, view, eventRecord: view.events[0], runtimeDemandMap })).toBe(true);

	const result = await resumeScalarEventFromPayloadDocument({
		document: payloadDocument(scripts.stateScript, scripts.viewScript),
		root,
		event: { type: 'click', target: button },
		eventRecord: view.events[0],
		runtimeDemandMap,
		loadSymbol(symbolId) {
			if (symbolId === 'symbol:event') {
				return ({ graph }) => graph.update({
					graphNodeId: 'state:count',
					update(value) {
						return Number(value) + 1;
					},
				});
			}
			return ({ value }) => ({ type: 'setText', locator: 'h2', value });
		},
	});

	expect(result.view.events).toEqual([view.events[0]]);
	expect(result.view.domUpdates).toEqual([view.domUpdates[0]]);
	expect(result.view.locators.map((locator) => locator.hostNodeId)).toEqual(['h1', 'h2']);
	expect(result.graph.read('state:count')).toBe(1);
	expect(output.textContent).toBe('1');
});

test('event-only scalar lean predicate rejects unreplaced and non-text shapes', () => {
	const state = createProtocolStatePayload({
		cells: [{ graphNodeId: 'state:count', name: 'count', valueKind: 'scalar', value: 0 }],
	});
	const eventRecord = { hostNodeId: 'h1', eventName: 'click', symbolIds: ['symbol:event'] };
	const textUpdate = {
		hostNodeId: 'h1',
		source: 'count',
		graphNodeId: 'state:count',
		path: [],
		target: { kind: 'text' as const },
		symbolId: 'symbol:text',
	};
	const view: ProtocolViewPayload = {
		version: 1,
		locators: [{ hostNodeId: 'h1', strategy: 'dom-order', index: 0, tagName: 'button' }],
		events: [eventRecord],
		domUpdates: [textUpdate],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};

	expect(isScalarLeanResumeShape({
		state,
		view,
		eventRecord,
		runtimeDemandMap: scalarRuntimeDemandMap({ eventRecord, domUpdate: textUpdate, replaced: false }),
	})).toBe(false);
	expect(isScalarLeanResumeShape({
		state,
		view: {
			...view,
			domUpdates: [{ ...textUpdate, target: { kind: 'property' as const, name: 'value' } }],
		},
		eventRecord,
		runtimeDemandMap: scalarRuntimeDemandMap({ eventRecord, domUpdate: textUpdate }),
	})).toBe(false);
});

test('event-only scalar lean route falls back to the full event container for behavior records', async () => {
	const button = element('BUTTON');
	const output = element('OUTPUT');
	const root = element('DIV', [button, output]);
	const state = createProtocolStatePayload({
		cells: [{ graphNodeId: 'state:count', name: 'count', valueKind: 'scalar', value: 0 }],
	});
	const eventRecord = { hostNodeId: 'h1', eventName: 'click', symbolIds: ['symbol:event'] };
	const domUpdate = {
		hostNodeId: 'h2',
		source: 'count',
		graphNodeId: 'state:count',
		path: [],
		target: { kind: 'text' as const },
		symbolId: 'symbol:text',
	};
	const view: ProtocolViewPayload = {
		version: 1,
		locators: [
			{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'div' },
			{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
			{ hostNodeId: 'h2', strategy: 'dom-order', index: 2, tagName: 'output' },
		],
		events: [eventRecord],
		domUpdates: [domUpdate],
		behaviors: [{
			hostNodeId: 'h0',
			source: 'installController',
			functionSource: 'installController',
			inputSources: [],
			symbolId: 'symbol:behavior',
		}],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const runtimeDemandMap = scalarRuntimeDemandMap({ eventRecord, domUpdate });
	const scripts = renderPayloadScripts({ state, view });

	expect(isScalarLeanResumeShape({ state, view, eventRecord, runtimeDemandMap })).toBe(false);

	await resumeScalarEventFromPayloadDocument({
		document: payloadDocument(scripts.stateScript, scripts.viewScript),
		root,
		event: { type: 'click', target: button },
		eventRecord,
		runtimeDemandMap,
		loadSymbol(symbolId) {
			if (symbolId === 'symbol:event') {
				return ({ graph }) => graph.write({ graphNodeId: 'state:count', value: 1 });
			}
			if (symbolId === 'symbol:behavior') {
				return ({ element }) => element.setAttribute?.('data-controller', 'installed');
			}
			return ({ value }) => ({ type: 'setText', locator: 'h2', value });
		},
	});

	expect(output.textContent).toBe('1');
	expect(root.attributes['data-controller']).toBe('installed');
});

test('event-only resume does not invoke heavy value decode for untouched object cells', async () => {
	vi.resetModules();
	const heavyDecode = vi.fn(() => {
		throw new Error('heavy decode should stay dormant');
	});
	vi.doMock('../../serializer/src/value-decode-client.ts', () => ({
		deserializeGraphValueForClient: heavyDecode,
	}));
	const { resumeEventOnlyFromPayloadDocument } = await import('../src/event-only-resume.ts');
	const button = element('BUTTON');
	const root = element('DIV', [button]);
	const state = createProtocolStatePayload({
		cells: [
			{ graphNodeId: 'state:count', name: 'count', valueKind: 'scalar', value: 0 },
			{
				graphNodeId: 'state:stamp',
				name: 'stamp',
				valueKind: 'object',
				value: new Date('2026-01-15T00:00:00.000Z'),
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

	await resumeEventOnlyFromPayloadDocument({
		document: payloadDocument(scripts.stateScript, scripts.viewScript),
		root,
		event: { type: 'click', target: button },
		loadSymbol(symbolId) {
			if (symbolId === 'symbol:event') {
				return ({ graph }) => graph.update({
					graphNodeId: 'state:count',
					update(value) {
						return Number(value) + 1;
					},
				});
			}
			return ({ value }) => ({ type: 'setText', locator: 'h1', value });
		},
	});

	expect(heavyDecode).not.toHaveBeenCalled();
	expect(button.textContent).toBe('1');
	vi.doUnmock('../../serializer/src/value-decode-client.ts');
});

test('event-only resume skips sync policy when the inline resumer already applied it', async () => {
	const button = element('BUTTON');
	const root = element('DIV', [button]);
	const state = createProtocolStatePayload({
		cells: [{ graphNodeId: 'state:locked', name: 'locked', valueKind: 'scalar', value: true }],
	});
	const view: ProtocolViewPayload = {
		version: 1,
		locators: [
			{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'div' },
			{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
		],
		events: [
			{
				hostNodeId: 'h1',
				eventName: 'click',
				syncPolicy: {
					when: { type: 'graph-truthy', graphNodeId: 'state:locked', path: [] },
					actions: ['preventDefault'],
				},
				symbolIds: ['symbol:event'],
			},
		],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const scripts = renderPayloadScripts({ state, view });
	let firstPolicyCalls = 0;

	const container = await resumeEventOnlyFromPayloadDocument({
		document: payloadDocument(scripts.stateScript, scripts.viewScript),
		root,
		event: {
			type: 'click',
			target: button,
			preventDefault() {
				firstPolicyCalls++;
			},
		},
		syncPolicyAlreadyApplied: true,
		loadSymbol: () => () => undefined,
	});

	expect(firstPolicyCalls).toBe(0);

	let delegatedPolicyCalls = 0;
	await container.dispatch({
		type: 'click',
		target: button,
		preventDefault() {
			delegatedPolicyCalls++;
		},
	});

	expect(delegatedPolicyCalls).toBe(1);
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

test('event-only resume accepts wildcard dynamic-tag locators', async () => {
	const widget = element('H1');
	const button = element('BUTTON');
	const root = element('DIV', [widget, button]);
	const state = createProtocolStatePayload({
		cells: [{ graphNodeId: 'state:count', name: 'count', valueKind: 'scalar', value: 0 }],
	});
	const view: ProtocolViewPayload = {
		version: 1,
		locators: [
			{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'div' },
			// Dynamic tags <{expr}> compile to wildcard locators: the rendered
			// tag is unknowable at compile time, so validation must skip it —
			// the full resume runtime already does.
			{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: '*' },
			{ hostNodeId: 'h2', strategy: 'dom-order', index: 2, tagName: 'button' },
		],
		events: [{ hostNodeId: 'h2', eventName: 'click', symbolIds: ['symbol:event'] }],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const scripts = renderPayloadScripts({ state, view });

	const result = await resumeEventOnlyFromPayloadDocument({
		document: payloadDocument(scripts.stateScript, scripts.viewScript),
		root,
		event: { type: 'click', target: button },
		loadSymbol: () => () => undefined,
	});

	expect(result.graph.read('state:count')).toBe(0);
});

test('event-only resume hands unsupported served view records to the full runtime', async () => {
	for (const extra of [
		{
			branches: [{
				id: 'branch-site:0',
				startAnchor: { strategy: 'dom-order-comment', index: 0 },
				endAnchor: { strategy: 'dom-order-comment', index: 1 },
				symbolId: 'symbol:branch',
				testReads: [],
			}],
		},
		{ futureRecords: [{ id: 'future:0' }] },
	]) {
		const button = element('BUTTON');
		const root = element('DIV', [button]);
		const state = createProtocolStatePayload({ cells: [] });
		const view = {
			version: 1,
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'div' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
			],
			events: [{ hostNodeId: 'h1', eventName: 'click', symbolIds: ['symbol:event'] }],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
			...extra,
		} as ProtocolViewPayload & { readonly futureRecords?: ReadonlyArray<{ readonly id: string }> };
		const scripts = renderPayloadScripts({ state, view });
		const document = payloadDocument(scripts.stateScript, scripts.viewScript);
		const fullResume = vi.fn(async () => undefined);
		const loadSymbol = vi.fn(() => () => undefined);

		await resumeEventOnlyFromPayloadDocument({
			document,
			root,
			event: { type: 'click', target: button },
			loadSymbol,
			loadFullResume: fullResume,
		} as Parameters<typeof resumeEventOnlyFromPayloadDocument>[0] & {
			readonly loadFullResume: typeof fullResume;
		});

		expect(fullResume).toHaveBeenCalledWith(expect.objectContaining({ document, root, loadSymbol }));
		expect(loadSymbol).not.toHaveBeenCalled();
	}
});
