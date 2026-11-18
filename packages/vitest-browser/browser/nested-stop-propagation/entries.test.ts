import { afterEach, expect, test } from 'vitest';
import { resumeEventOnlyFromPayloadDocument } from '@markless/web/event-only-resume';
import { resumeScalarRowEventFromPayloadDocument } from '@markless/web/event-only-lean/row';
import { resumePrerenderTriggerGroup } from '@markless/web/fns/prerender-trigger-resume';
import { decodePayloadScriptsFromDocument, resumeFromPayloadDocument } from '@markless/web/payload';
import { renderSSRPhased } from '../../src/index.ts';
import { settledCount } from '../demand-load-replay/counting.ts';
import StopHtmlPage from './stop-html-page.tsrx';

// Resume entries a production build reaches, driven the way the served boot drives them: its
// capture listener applies the stop policy while the browser dispatches, then forwards the event
// once dispatch has ended and the browser has reset the event's own stop flag.

type Handoff = {
	readonly root: Root;
	readonly event: Event;
	readonly element: EventTarget | null;
	readonly eventRecord: null;
	readonly syncPolicyAlreadyApplied: true;
	readonly propagationStopped: boolean;
};
type Forward = (handoff: Handoff) => unknown;
type Root = HTMLElement & {
	__marklessRegisterDispatch?: (
		next: (handoff: Handoff, fallback: Forward) => unknown,
	) => void;
	__marklessDispatch?: Forward;
	__marklessDelegatedDispatch?: boolean;
};

const symbols = new URL('./stop-html-page.tsrx?markless-symbols', import.meta.url).href;
const loadSymbol = (symbolId: string) =>
	import(/* @vite-ignore */ symbols).then((module) => module.loadSymbol(symbolId));

afterEach(() => {
	document.body.replaceChildren();
});

async function servedPage(): Promise<Root> {
	const { html } = await renderSSRPhased(StopHtmlPage);
	const holder = document.createElement('div');
	// innerHTML leaves the served scripts inert: this test plays the boot.
	holder.innerHTML = html;
	document.body.append(holder);
	const root = holder.querySelector<Root>('[data-async-container]')!;
	// The boot owns the page's listener; a runtime it starts adds none of its own.
	root.__marklessDelegatedDispatch = true;
	return root;
}

function playBoot(root: Root, forward: () => Forward): () => Promise<unknown> {
	let pending: Promise<unknown> = Promise.resolve();
	root.addEventListener(
		'pointerdown',
		(event) => {
			event.stopPropagation();
			const handoff: Handoff = {
				root,
				event,
				element: event.target,
				eventRecord: null,
				syncPolicyAlreadyApplied: true,
				propagationStopped: event.cancelBubble,
			};
			pending = Promise.resolve().then(() => forward()(handoff));
		},
		true,
	);
	return () => pending;
}

// The registered handler is how every later event reaches the live runtime.
function liveDispatch(root: Root): () => Forward | undefined {
	let live: Forward | undefined;
	root.__marklessRegisterDispatch = (next) => {
		live = (handoff) => next(handoff, () => undefined);
	};
	return () => live;
}

const order = (root: Root) => root.querySelector('[data-testid="order"]')?.textContent ?? '';

async function pressMark(root: Root, settled: () => Promise<unknown>, expected: string) {
	root.querySelector('[data-testid="plain-mark"]')!.dispatchEvent(
		new PointerEvent('pointerdown', { bubbles: true, composed: true, isPrimary: true, buttons: 1 }),
	);
	await settled();
	await settledCount(() => order(root).length);
	expect(order(root)).toBe(expected);
}

const leanEntries = {
	'event-only resume': resumeEventOnlyFromPayloadDocument,
	'lean resume falling back to full resume': resumeScalarRowEventFromPayloadDocument,
} as const;

for (const [name, entry] of Object.entries(leanEntries)) {
	test(`${name}: a nested stop keeps the parent's handler from running, first press and later`, async () => {
		const root = await servedPage();
		const live = liveDispatch(root);
		const firstPress = (handoff: Handoff) =>
			entry({
				...handoff,
				document: root,
				loadSymbol,
			} as never);
		const settled = playBoot(root, () => live() ?? firstPress);
		await pressMark(root, settled, 'inner;');
		expect(live()).toBeDefined();
		await pressMark(root, settled, 'inner;inner;');
	});
}

test("prerender trigger group: a nested stop keeps the parent's handler from running", async () => {
	const root = await servedPage();
	const live = liveDispatch(root);
	const { state, view } = decodePayloadScriptsFromDocument(root);
	await resumePrerenderTriggerGroup({
		state,
		view,
		root,
		groupId: 'press',
		graphNodeIds: state.cells.map((cell) => cell.graphNodeId),
		loadSymbol,
	} as never);
	const settled = playBoot(root, () => live()!);
	await pressMark(root, settled, 'inner;');
});

test("payload resume with no dispatch queue: a nested stop keeps the parent's handler from running", async () => {
	const root = await servedPage();
	await resumeFromPayloadDocument({ document: root, root, loadSymbol } as never);
	const settled = playBoot(root, () => root.__marklessDispatch!);
	await pressMark(root, settled, 'inner;');
});
