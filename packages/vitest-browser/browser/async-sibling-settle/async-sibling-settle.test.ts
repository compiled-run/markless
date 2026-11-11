import { afterEach, expect, test } from 'vitest';
import { dispatchRouteUpdate, startRouteUpdateRenderer } from '@markless/core/router';
import { cleanup, render, renderSSR, renderServerHTML, renderStream } from '../../src/index.ts';
import { answer, asked, forgetLoads } from './gate.ts';
import TwoBlocks from './two-blocks.tsrx';
import TwoBlocksRoute from './two-blocks.tsrx?markless-route';
import TwoCards from './two-cards.tsrx';
import TwoCardsRoute from './two-cards.tsrx?markless-route';

// Two @try blocks that read unrelated async values load at the same time and show their content in the same DOM state.
// Browser loads wait on test-opened gates; server loads each wait until the other has started (gate.ts).

const iframes: HTMLIFrameElement[] = [];

afterEach(async () => {
	await cleanup();
	forgetLoads();
	for (const iframe of iframes.splice(0)) iframe.remove();
});

type Shape = {
	readonly name: string;
	readonly page: unknown;
	readonly route: unknown;
	readonly ssr: () => ReturnType<typeof renderSSR>;
	readonly stream: () => ReturnType<typeof renderStream>;
	readonly blocks: ReadonlyArray<{ readonly key: string; readonly settled: string; readonly pending: string; readonly failed: string; readonly text: string }>;
};

const shapes: ReadonlyArray<Shape> = [
	{
		name: 'two blocks in one component',
		page: TwoBlocks,
		route: TwoBlocksRoute,
		ssr: () => renderSSR(TwoBlocks),
		stream: () => renderStream(TwoBlocks),
		blocks: [
			{ key: 'left', settled: '[data-left]', pending: '[data-left-pending]', failed: '[data-left-failed]', text: 'Left ready' },
			{ key: 'right', settled: '[data-right]', pending: '[data-right-pending]', failed: '[data-right-failed]', text: 'Right ready' },
		],
	},
	{
		name: 'one block in each of two child components',
		page: TwoCards,
		route: TwoCardsRoute,
		ssr: () => renderSSR(TwoCards),
		stream: () => renderStream(TwoCards),
		blocks: [
			{ key: 'profile', settled: '[data-profile]', pending: '[data-profile-pending]', failed: '[data-profile-failed]', text: 'Ada' },
			{ key: 'orders', settled: '[data-orders]', pending: '[data-orders-pending]', failed: '[data-orders-failed]', text: 'Lamp' },
		],
	},
];

type BlockState = 'settled' | 'pending' | 'failed' | 'absent';

function blockStates(root: ParentNode, shape: Shape): BlockState[] {
	return shape.blocks.map((block) =>
		root.querySelector(block.settled) ? 'settled' : root.querySelector(block.pending) ? 'pending' : root.querySelector(block.failed) ? 'failed' : 'absent',
	);
}

// Every DOM state the blocks pass through, recorded on each mutation batch.
function watchStates(target: Node, read: () => BlockState[]) {
	const seen: string[] = [read().join('+')];
	const observer = new MutationObserver(() => {
		const now = read().join('+');
		if (seen.at(-1) !== now) seen.push(now);
	});
	observer.observe(target, { childList: true, subtree: true, characterData: true, attributes: true });
	return () => {
		observer.disconnect();
		return seen;
	};
}

const settledTexts = (root: ParentNode, shape: Shape) => shape.blocks.map((block) => root.querySelector(block.settled)?.textContent?.trim() ?? null);

async function answerTogether(shape: Shape) {
	await expect
		.poll(() => shape.blocks.map((block) => asked(block.key)), { timeout: 2_000 })
		.toEqual(shape.blocks.map(() => true));
	for (const block of shape.blocks) answer(block.key);
}

function createRouteDocument(): Document {
	const iframe = document.createElement('iframe');
	document.body.appendChild(iframe);
	iframes.push(iframe);
	const routeDocument = iframe.contentDocument;
	if (!routeDocument) throw new Error('Expected the iframe to expose a document.');
	startRouteUpdateRenderer(routeDocument);
	return routeDocument;
}

// A stream append is parsed after the shell, so its inline scripts run as it lands.
function appendStreamed(container: HTMLElement, html: string): void {
	const holder = document.createElement('template');
	holder.innerHTML = html;
	for (const node of Array.from(holder.content.childNodes)) {
		if (node.nodeName === 'SCRIPT') {
			const script = document.createElement('script');
			for (const attribute of Array.from((node as Element).attributes)) script.setAttribute(attribute.name, attribute.value);
			script.text = node.textContent ?? '';
			container.appendChild(script);
		} else container.appendChild(node);
	}
}

// Each block goes from @pending straight to its content once: never back, never to @catch.
function eachBlockSettlesOnce(seen: ReadonlyArray<string>, shape: Shape) {
	return shape.blocks.map((_, index) =>
		seen.map((state) => state.split('+')[index]).filter((state, at, all) => state !== all[at - 1]),
	);
}

const allPending = (shape: Shape) => shape.blocks.map(() => 'pending').join('+');
const allSettled = (shape: Shape) => shape.blocks.map(() => 'settled').join('+');

for (const shape of shapes) {
	test(`CSR, ${shape.name}: both loads start before either answers, and each block shows its content once`, async () => {
		const screen = await render(shape.page as never);
		const container = screen.container as HTMLElement;
		const stop = watchStates(container, () => blockStates(container, shape));
		await answerTogether(shape);
		await expect.poll(() => settledTexts(container, shape), { timeout: 2_000 }).toEqual(shape.blocks.map((block) => block.text));
		expect(eachBlockSettlesOnce(stop(), shape)).toEqual(shape.blocks.map(() => ['pending', 'settled']));
	});

	test(`SSR, ${shape.name}: the server starts both loads together and serves both blocks settled`, async () => {
		const { container } = await shape.ssr();
		expect(blockStates(container, shape).join('+')).toBe(allSettled(shape));
		expect(settledTexts(container, shape)).toEqual(shape.blocks.map((block) => block.text));
	});

	test(`streamed first load, ${shape.name}: both blocks stream in one append and show their content in one step`, async () => {
		const { shell, appends } = await shape.stream();
		expect(appends).toHaveLength(1);
		const { container } = renderServerHTML(shell);
		expect(blockStates(container, shape).join('+')).toBe(allPending(shape));
		const stop = watchStates(container, () => blockStates(container, shape));
		for (const chunk of appends) appendStreamed(container, chunk);
		await expect.poll(() => settledTexts(container, shape), { timeout: 2_000 }).toEqual(shape.blocks.map((block) => block.text));
		expect(stop()).toEqual([allPending(shape), allSettled(shape)]);
	});

	test(`client navigation, ${shape.name}: both loads start before either answers, and both blocks show their content in one step`, async () => {
		const routeDocument = createRouteDocument();
		const stop = watchStates(routeDocument.documentElement, () => blockStates(routeDocument, shape));
		dispatchRouteUpdate(routeDocument, {
			page: { default: shape.route },
			route: { file: `pages/${shape.blocks[0]!.key}.tsrx`, params: {}, status: 200, url: `http://localhost/${shape.blocks[0]!.key}` },
		});
		await answerTogether(shape);
		await expect.poll(() => settledTexts(routeDocument, shape), { timeout: 2_000 }).toEqual(shape.blocks.map((block) => block.text));
		const states = stop().filter((state) => state !== shape.blocks.map(() => 'absent').join('+'));
		expect(states.at(-1)).toBe(allSettled(shape));
		expect(states.every((state) => state === allPending(shape) || state === allSettled(shape))).toBe(true);
	});
}
