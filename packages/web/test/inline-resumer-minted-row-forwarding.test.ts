import { expect, test } from 'vitest';
import { PROTOCOL_EVENT_HOST_ATTRIBUTE } from '@markless/serializer/protocol';
import {
	createInlineResumerSource,
	INLINE_MODULE_LOADER_SOURCE,
	INLINE_RESUMER_PAGE_TOKEN,
	renderInlineResumerPageSource,
} from '../src/inline/resumer.ts';
import {
	createSyncPolicyTable,
	inlineResumerPage,
	withEventHostMarks,
} from '../src/render-to-string.ts';

// A served page whose dispatch is delegated to the inline resumer registers no
// listeners of its own, so an element the server marked as no event host reaches
// the resume runtime only through the resumer's unknown-element hatch. A keyed
// repeat whose row IS a component mints exactly such elements, and its
// `rowEvents` is empty by construction - the row chunk owns no element of its
// own - so the hatch has to open on `rowComponent` rather than on `rowEvents`.

const BOOT_TAIL = `(${INLINE_MODULE_LOADER_SOURCE},${INLINE_RESUMER_PAGE_TOKEN});`;

type FakeElement = {
	readonly tagName: string;
	parentElement: FakeElement | null;
	getAttribute?: (name: string) => string | null;
};

type Listener = (event: { readonly type: string; readonly target: FakeElement }) => unknown;

type ForwardedInput = {
	readonly event: { readonly type: string };
	readonly eventIndex?: number;
	readonly eventRecord?: { readonly hostNodeId: string } | null;
};

function servedHostMark(view: object, html: string): string | null {
	const marked = withEventHostMarks(view as never, html, createSyncPolicyTable());
	return new RegExp(`${PROTOCOL_EVENT_HOST_ATTRIBUTE}="([^"]*)"`).exec(marked)?.[1] ?? null;
}

function repeatRecord(rowComponent: boolean) {
	return {
		id: 'repeat:0',
		parentHostNodeId: 'h1',
		collectionGraphNodeId: 'state:rows',
		collectionPath: [],
		keyPath: ['key'],
		itemName: 'row',
		rowElementCount: 0,
		rowEvents: [],
		...(rowComponent
			? {
					rowComponent: {
						componentEdgeId: 'component-edge:0',
						componentName: 'App',
						itemPropName: 'item',
					},
				}
			: {}),
	};
}

function bootResumer(rowComponent: boolean) {
	const source = createInlineResumerSource({
		debug: false,
		executionLog: 'never',
		graphSyncPolicy: false,
		resumeModuleUrl: '/build/resume-A1b2.js',
		sharedGraphPolicy: false,
		syncPolicy: false,
	});
	expect(source).toContain(BOOT_TAIL);

	const forwarded: ForwardedInput[] = [];
	const module = {
		resumeContainerEvent: (input: ForwardedInput) => {
			forwarded.push(input);
		},
	};
	const loadModule = () => Promise.resolve(module);

	const listeners = new Map<string, Listener>();
	const view = {
		asyncBoundaries: [],
		events: [{ hostNodeId: 'r:north:c0:h0', eventName: 'click' }],
		locators: [{ hostNodeId: 'r:north:c0:h0', index: 1 }],
		keyedRepeats: [repeatRecord(rowComponent)],
	};
	const servedMark = servedHostMark(view, '<button></button>');
	const servedRow: FakeElement = {
		tagName: 'BUTTON',
		parentElement: null,
		getAttribute: (name) => (name === PROTOCOL_EVENT_HOST_ATTRIBUTE ? servedMark : null),
	};
	const mintedRow: FakeElement = {
		tagName: 'BUTTON',
		parentElement: null,
		getAttribute: () => null,
	};
	const root = {
		addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
		querySelector: () => null,
	};
	servedRow.parentElement = root as unknown as FakeElement;
	// The row a client mints after boot: in the document, named by no locator.
	mintedRow.parentElement = root as unknown as FakeElement;
	const fakeDocument = {
		currentScript: {
			closest: (selector: string) => (selector === '[data-async-container]' ? root : null),
			getAttribute: () => null,
		},
		createTreeWalker: () => {
			let done = false;
			return {
				nextNode: () => {
					if (done) return null;
					done = true;
					return servedRow;
				},
			};
		},
	};

	const runnable = renderInlineResumerPageSource(
		source.replace(BOOT_TAIL, `(__load,${INLINE_RESUMER_PAGE_TOKEN});`),
		inlineResumerPage(view as never),
	);
	// eslint-disable-next-line @typescript-eslint/no-implied-eval
	new Function('document', 'addEventListener', '__load', runnable)(
		fakeDocument,
		() => {},
		loadModule,
	);

	const fire = (target: FakeElement) => listeners.get('click')?.({ type: 'click', target });
	return { forwarded, fire, servedRow, mintedRow, view };
}

async function settle(): Promise<void> {
	for (let hop = 0; hop < 8; hop++) await Promise.resolve();
}

test('a served row of a component-row repeat still forwards on its own record', async () => {
	const resumer = bootResumer(true);

	resumer.fire(resumer.servedRow);
	await settle();

	expect(
		resumer.forwarded.map((input) =>
			input.eventIndex === undefined
				? undefined
				: resumer.view.events[input.eventIndex]?.hostNodeId,
		),
	).toEqual(['r:north:c0:h0']);
});

test('a row minted after boot forwards to the runtime that registered it', async () => {
	const resumer = bootResumer(true);

	resumer.fire(resumer.mintedRow);
	await settle();

	expect(resumer.forwarded.length).toBe(1);
	expect(resumer.forwarded[0]?.eventRecord).toBe(null);
	expect(resumer.forwarded[0]?.eventIndex).toBeUndefined();
});

test('a repeat that mints no component row still drops an unknown element', async () => {
	const resumer = bootResumer(false);

	resumer.fire(resumer.mintedRow);
	await settle();

	expect(resumer.forwarded).toEqual([]);
});
