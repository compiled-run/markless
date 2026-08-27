import { expect, test } from 'vitest';
import { createInlineResumerSource } from '../src/inline/resumer.ts';

// A served page whose dispatch is delegated to the inline resumer registers no
// listeners of its own, so an element the boot census never named reaches the
// resume runtime only through the resumer's unknown-element hatch. A keyed
// repeat whose row IS a component mints exactly such elements, and its
// `rowEvents` is empty by construction - the row chunk owns no element of its
// own - so the hatch has to open on `rowComponent` rather than on `rowEvents`.

const LOADER_TAIL = '((url) => import(/* @vite-ignore */ url));';

type FakeElement = {
	readonly tagName: string;
	parentElement: FakeElement | null;
};

type Listener = (event: { readonly type: string; readonly target: FakeElement }) => unknown;

type ForwardedInput = {
	readonly event: { readonly type: string };
	readonly eventRecord: { readonly hostNodeId: string } | null;
};

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
	expect(source).toContain(LOADER_TAIL);

	const forwarded: ForwardedInput[] = [];
	const module = {
		resumeContainerEvent: (input: ForwardedInput) => {
			forwarded.push(input);
		},
	};
	const loadModule = () => Promise.resolve(module);

	const servedRow: FakeElement = { tagName: 'BUTTON', parentElement: null };
	const mintedRow: FakeElement = { tagName: 'BUTTON', parentElement: null };
	const listeners = new Map<string, Listener>();
	const view = {
		asyncBoundaries: [],
		events: [{ hostNodeId: 'r:north:c0:h0', eventName: 'click' }],
		locators: [{ hostNodeId: 'r:north:c0:h0', index: 1 }],
		keyedRepeats: [repeatRecord(rowComponent)],
	};
	const root = {
		addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
		querySelector: (selector: string) =>
			selector === 'script[type="markless/view"]'
				? { textContent: JSON.stringify(view) }
				: null,
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

	// eslint-disable-next-line @typescript-eslint/no-implied-eval
	new Function('document', '__load', source.replace(LOADER_TAIL, '(__load);'))(
		fakeDocument,
		loadModule,
	);

	const fire = (target: FakeElement) => listeners.get('click')?.({ type: 'click', target });
	return { forwarded, fire, servedRow, mintedRow };
}

async function settle(): Promise<void> {
	for (let hop = 0; hop < 8; hop++) await Promise.resolve();
}

test('a served row of a component-row repeat still forwards on its own record', async () => {
	const resumer = bootResumer(true);

	resumer.fire(resumer.servedRow);
	await settle();

	expect(resumer.forwarded.map((input) => input.eventRecord?.hostNodeId)).toEqual([
		'r:north:c0:h0',
	]);
});

test('a row minted after boot forwards to the runtime that registered it', async () => {
	const resumer = bootResumer(true);

	resumer.fire(resumer.mintedRow);
	await settle();

	expect(resumer.forwarded.length).toBe(1);
	expect(resumer.forwarded[0]?.eventRecord).toBe(null);
});

test('a repeat that mints no component row still drops an unknown element', async () => {
	const resumer = bootResumer(false);

	resumer.fire(resumer.mintedRow);
	await settle();

	expect(resumer.forwarded).toEqual([]);
});
