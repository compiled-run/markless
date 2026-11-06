import { expect, test } from 'vitest';
import type { ProtocolViewPayload } from '@markless/serializer';
import { createProtocolStatePayload, renderPayloadScripts } from '../../serializer/src/index.ts';
import { resumeFromPayloadDocument } from '../src/index.ts';

// Only a real DOM event's dispatch opens a user action (submit-quiet-design.md Q2). A call that
// dispatch makes carries it for its whole body, awaits included, decided when the call is made
// rather than when the callee's code arrives; a call made after the dispatch ended carries none.

type Token = { readonly open: boolean } | undefined;
type Context = {
	readonly userActionToken?: Token;
	readonly invokeSymbol?: (symbolId: string, context: object) => Promise<unknown>;
};

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
			{ hostNodeId: 'save', strategy: 'dom-order', index: 1, tagName: 'button' },
		],
		events: [{ hostNodeId: 'save', eventName: 'click', symbolIds: ['symbol:click'] }],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const scripts = renderPayloadScripts({
		state: createProtocolStatePayload({
			cells: [{ graphNodeId: 'state:count', name: 'count', valueKind: 'scalar', value: 0 }],
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

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

test('a callback the handler fires and forgets keeps the user action through its own slow load and awaits; one called after the dispatch ended has none', async () => {
	const save = element('BUTTON');
	const root = element('SECTION', [save]);
	root.__marklessDelegatedDispatch = true;
	const seen: Array<{ readonly at: string; readonly open: boolean }> = [];
	let handlerContext: Context | undefined;
	let callbackRuns = 0;
	const callback = async (context: Context) => {
		const run = ++callbackRuns;
		seen.push({ at: `callback ${run} start`, open: context.userActionToken?.open === true });
		await wait(5);
		seen.push({ at: `callback ${run} after await`, open: context.userActionToken?.open === true });
	};
	const loadSymbol = (symbolId: string) => {
		if (symbolId === 'symbol:click')
			return (context: Context) => {
				handlerContext = context;
				seen.push({ at: 'handler', open: context.userActionToken?.open === true });
				void context.invokeSymbol!('symbol:callback', { ...context });
			};
		// The callback's module arrives well after the click's dispatch has finished.
		return wait(20).then(() => callback);
	};
	const { runtime } = await resumeFromPayloadDocument({
		document: payloadDocument(),
		root: root as never,
		loadSymbol: loadSymbol as never,
	});

	await runtime.dispatch({ type: 'click', target: save } as never, { ignoreUnmatched: true });
	expect(handlerContext?.userActionToken?.open, 'the dispatch closes its own token').toBe(false);
	await wait(40);

	// A timer reaching the same callback through the handler's context, after the dispatch ended.
	await handlerContext!.invokeSymbol!('symbol:callback', { ...handlerContext });

	expect(seen).toEqual([
		{ at: 'handler', open: true },
		{ at: 'callback 1 start', open: true },
		{ at: 'callback 1 after await', open: true },
		{ at: 'callback 2 start', open: false },
		{ at: 'callback 2 after await', open: false },
	]);
});
