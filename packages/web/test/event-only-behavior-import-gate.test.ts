import type { ProtocolViewPayload } from '@markless/serializer';
import { expect, test, vi } from 'vitest';
import { createProtocolStatePayload, renderPayloadScripts } from '../../serializer/src/index.ts';

type FakeElement = {
	nodeType: 1;
	readonly tagName: string;
	readonly childNodes: FakeElement[];
	parentElement?: FakeElement | null;
};

type FakePayloadScript = {
	readonly textContent: string;
};

function element(tagName: string, childNodes: FakeElement[] = []): FakeElement {
	const node = { nodeType: 1 as const, tagName, childNodes };
	for (const child of childNodes) child.parentElement = node;
	return node;
}

function payloadDocument(stateScript: string, viewScript: string) {
	const scripts: Record<string, FakePayloadScript | undefined> = {
		'script[type="markless/state"]': { textContent: scriptContent(stateScript) },
		'script[type="markless/view"]': { textContent: scriptContent(viewScript) },
	};
	return {
		querySelector(selector: string): FakePayloadScript | null {
			return scripts[selector] ?? null;
		},
	};
}

function scriptContent(script: string): string {
	return script.replace(/^<script type="markless\/(?:state|view)">/, '').replace('</script>', '');
}

test('event-only resume does not import behavior runtime when the event host has no behavior match', async () => {
	vi.resetModules();
	const behaviorRuntime = { imports: 0 };
	vi.doMock('../src/event-only-behaviors.ts', () => {
		behaviorRuntime.imports++;
		return {
			activateBehaviorsFromEventHost: vi.fn(async () => undefined),
		};
	});

	const { resumeEventOnlyFromPayloadDocument } = await import('../src/event-only-resume.ts');
	const plainButton = element('BUTTON');
	const behaviorPanel = element('SECTION');
	const root = element('DIV', [plainButton, behaviorPanel]);
	const state = createProtocolStatePayload({ cells: [] });
	const view: ProtocolViewPayload = {
		version: 1,
		locators: [
			{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'div' },
			{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
			{ hostNodeId: 'h2', strategy: 'dom-order', index: 2, tagName: 'section' },
		],
		events: [{ hostNodeId: 'h1', eventName: 'click', symbolIds: ['symbol:event'] }],
		domUpdates: [],
		behaviors: [
			{
				hostNodeId: 'h2',
				source: 'decorate',
				functionSource: 'decorate',
				inputSources: [],
				symbolId: 'symbol:behavior',
			},
		],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const scripts = renderPayloadScripts({ state, view });

	await resumeEventOnlyFromPayloadDocument({
		document: payloadDocument(scripts.stateScript, scripts.viewScript),
		root,
		event: { type: 'click', target: plainButton },
		loadSymbol: () => () => undefined,
	});

	expect(behaviorRuntime.imports).toBe(0);
	vi.doUnmock('../src/event-only-behaviors.ts');
});
