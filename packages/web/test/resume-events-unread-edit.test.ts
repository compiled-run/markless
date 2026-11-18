import { expect, test } from 'vitest';
import { createRuntimeGraph } from '@markless/runtime';
import { applyDomJournalEntries } from '../src/dom-journal.ts';
import { createDomUpdateEntry } from '../src/dom-update.ts';
import { createResumeRuntime } from '../src/index.ts';
import type { ResumeSymbol } from '../src/index.ts';

type FakeElement = {
	readonly nodeType: 1;
	readonly tagName: string;
	readonly childNodes: FakeElement[];
	parentElement?: FakeElement | null;
	value?: string;
	defaultValue?: string;
	addEventListener(): void;
	removeEventListener(): void;
};

function element(
	tagName: string,
	childNodes: FakeElement[] = [],
	extra: Partial<FakeElement> = {},
): FakeElement {
	const node: FakeElement = {
		nodeType: 1,
		tagName,
		childNodes,
		addEventListener() {},
		removeEventListener() {},
		...extra,
	};
	for (const child of childNodes) child.parentElement = node;
	return node;
}

function event(type: string, target: FakeElement) {
	return { type, target, bubbles: true, preventDefault() {}, stopPropagation() {} };
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => (resolve = done));
	return { promise, resolve };
}

test('text typed while its input handler loads survives a flush an earlier dispatch makes', async () => {
	const button = element('BUTTON');
	const input = element('INPUT', [], { value: '', defaultValue: '' });
	const root = element('SECTION', [button, input]);
	const graph = createRuntimeGraph({ cells: [{ graphNodeId: 'state:title', value: '' }] });
	const fill = deferred<ResumeSymbol>();
	const type = deferred<ResumeSymbol>();
	const setTitle =
		(read: (target: FakeElement) => string): ResumeSymbol =>
		(context) => {
			context.graph.write({
				graphNodeId: 'state:title',
				value: read((context.event as { target: FakeElement }).target),
			});
		};
	const runtime = createResumeRuntime({
		root: root as never,
		graph,
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
				{ hostNodeId: 'h2', strategy: 'dom-order', index: 2, tagName: 'input' },
			],
			events: [
				{ hostNodeId: 'h1', eventName: 'click', symbolIds: ['symbol:fill'] },
				{ hostNodeId: 'h2', eventName: 'input', symbolIds: ['symbol:type'] },
			],
			domUpdates: [
				{
					hostNodeId: 'h2',
					source: 'title',
					graphNodeId: 'state:title',
					path: [],
					target: { kind: 'property', name: 'value' },
					symbolId: 'symbol:value',
				},
			],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol(symbolId: string) {
			if (symbolId === 'symbol:fill') return fill.promise;
			if (symbolId === 'symbol:type') return type.promise;
			return ((context) =>
				createDomUpdateEntry({
					locator: 'h2',
					target: context.domUpdate!.target!,
					value: context.value,
				})) as ResumeSymbol;
		},
		applyDomJournal: (entries) =>
			applyDomJournalEntries(entries, {
				resolveTarget: (locator) => (locator === 'h2' ? input : undefined),
			}),
	});
	await runtime.start();

	const clicked = runtime.dispatch(event('click', button) as never);
	input.value = 'typed';
	const typed = runtime.dispatch(event('input', input) as never);
	fill.resolve(setTitle(() => 'template'));
	await clicked;
	await graph.flush();
	expect(input.value).toBe('typed');

	type.resolve(setTitle((target) => target.value!));
	await typed;
	await graph.flush();
	expect(input.value).toBe('typed');
	expect(graph.read('state:title')).toBe('typed');
});
