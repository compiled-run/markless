import { expect, test } from 'vitest';
import { createProtocolStatePayload } from '../../serializer/src/index.ts';
import { createEventResumeContainerFromPayloads } from '../src/event-resume.ts';
import type { EventResumeSymbol } from '../src/event-resume.ts';

type Node = {
	nodeType: 1;
	tagName: string;
	childNodes: Node[];
	parentElement?: Node | null;
	textContent: string | null;
	value?: string;
	defaultValue?: string;
};

function node(tagName: string, childNodes: Node[] = [], extra: Partial<Node> = {}): Node {
	const created: Node = { nodeType: 1, tagName, childNodes, textContent: null, ...extra };
	for (const child of childNodes) child.parentElement = created;
	return created;
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => (resolve = done));
	return { promise, resolve };
}

test('text typed while its input handler loads survives a flush another dispatch makes first', async () => {
	const button = node('BUTTON');
	const input = node('INPUT', [], { value: '', defaultValue: '' });
	const root = node('DIV', [button, input]);
	const fill = deferred<EventResumeSymbol>();
	const type = deferred<EventResumeSymbol>();
	const setTitle =
		(read: (event: { target: unknown }) => string): EventResumeSymbol =>
		(context) => {
			context.graph.update({
				graphNodeId: 'state:title',
				path: [],
				returnValue: 'next',
				update: () => read(context.event as { target: unknown }),
			});
		};
	const container = await createEventResumeContainerFromPayloads({
		state: createProtocolStatePayload({
			cells: [{ graphNodeId: 'state:title', name: 'title', valueKind: 'scalar', value: '' }],
		}),
		view: {
			version: 1,
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'div' },
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
		root,
		loadSymbol(symbolId) {
			if (symbolId === 'symbol:fill') return fill.promise;
			if (symbolId === 'symbol:type') return type.promise;
			return (context) => ({
				type: 'setProp',
				locator: 'h2',
				name: 'value',
				value: context.value,
			});
		},
	});

	const clicked = container.dispatch({ type: 'click', target: button });
	input.value = 'typed';
	const typed = container.dispatch({ type: 'input', target: input });
	fill.resolve(setTitle(() => 'template'));
	await clicked;
	expect(input.value).toBe('typed');
	type.resolve(setTitle((event) => (event.target as Node).value!));
	await typed;

	expect(input.value).toBe('typed');
	expect(container.graph.read('state:title')).toBe('typed');
});
