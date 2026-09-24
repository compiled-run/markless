import { expect, test, vi } from 'vitest';
import {
	tryResumeMdxScalar,
	type MdxScalarAction,
	type MdxScalarRoot,
} from '../../src/vite/runtime/mdx-scalar.ts';
import { createProtocolStatePayload } from '../../../serializer/src/protocol-state.ts';
import { ASYNC_PROTOCOL_VERSION } from '../../../serializer/src/protocol-constants.ts';
import type { ProtocolViewPayload } from '../../../serializer/src/protocol.ts';
import { marklessInstanceScopedLoadSymbol } from '../../../web/src/fns/instance-scope.ts';
import { createRuntimeGraphFromResumePayload } from '../../../web/src/payload-graph-construct.ts';
import type { ResumeSymbolContext } from '../../../web/src/resume-types.ts';

function fixture(scope = 'm3:c0:', cellName = 'count', initial = 2) {
	const localCell = `state:${cellName}`;
	const cell = scope + localCell;
	const state = createProtocolStatePayload({
		cells: [{ graphNodeId: cell, name: cellName, valueKind: 'scalar', value: initial }],
	});
	const eventRecord = {
		hostNodeId: scope + 'h0',
		eventName: 'click',
		symbolIds: [scope + 'handler'],
	};
	const view: ProtocolViewPayload = {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [
			{ hostNodeId: scope + 'h0', strategy: 'dom-order', index: 1, tagName: 'button' },
			{ hostNodeId: scope + 'h1', strategy: 'dom-order', index: 2, tagName: 'output' },
		],
		events: [eventRecord],
		domUpdates: [
			{
				hostNodeId: scope + 'h1',
				graphNodeId: cell,
				symbolId: scope + 'text',
				source: cellName,
				path: [],
				target: { kind: 'text', prefix: 'Value: ', suffix: ' units' },
			},
		],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const button = { nodeType: 1, tagName: 'BUTTON', isConnected: true } as unknown as Element;
	const output = {
		nodeType: 1,
		tagName: 'OUTPUT',
		isConnected: true,
		textContent: `Value: ${initial} units`,
	} as unknown as Element;
	const root = {
		nodeType: 1,
		tagName: 'MAIN',
		isConnected: true,
		__marklessCensus: [null, button, output],
		querySelector: (selector: string) =>
			selector === 'script[type="markless/state"]'
				? { textContent: JSON.stringify(state) }
				: selector === 'script[type="markless/view"]'
					? { textContent: JSON.stringify(view) }
					: null,
	} as unknown as MdxScalarRoot;
	const action: MdxScalarAction = {
		hostNodeId: 'h0',
		eventName: 'click',
		scope,
		plan: {
			version: 1,
			kind: 'scalar',
			symbolId: 'handler',
			cell: localCell,
			write: { kind: 'update', updateOperator: '++' },
			textUpdates: [
				{
					hostNodeId: 'h1',
					graphNodeId: localCell,
					symbolId: 'text',
					prefix: 'Value: ',
					suffix: ' units',
				},
			],
		},
	};
	const handler = vi.fn(({ graph }: ResumeSymbolContext) =>
		graph.update({
			graphNodeId: localCell,
			path: [],
			update: (value) => Number(value) + 1,
			returnValue: 'previous',
		}),
	);
	const loadPlan = vi.fn(async () => action);
	const loadSymbol = vi.fn(marklessInstanceScopedLoadSymbol(() => handler));
	const input = () => ({
		root,
		event: { type: 'click', target: button } as unknown as Event,
		element: button,
		eventRecord,
		syncPolicyAlreadyApplied: true,
	});
	return {
		scope,
		cell,
		state,
		view,
		root,
		button,
		output,
		action,
		handler,
		loadPlan,
		loadSymbol,
		input,
	};
}

function nestedFixture(scope = 'm3:c0:', cellName = 'count', parentTag = 'SECTION') {
	const child = fixture(scope, cellName);
	const parent = fixture('m8:c7:', 'outer', 10);
	const sibling = fixture('m9:c2:', 'unrelated', 50);
	const members = [child, parent, sibling];
	Object.assign(parent.button, { tagName: parentTag, parentElement: child.root });
	Object.assign(child.button, { parentElement: parent.button });
	Object.assign(child.output, { parentElement: parent.button });
	Object.assign(parent.output, { parentElement: child.root });
	Object.assign(sibling.button, { parentElement: child.root });
	Object.assign(sibling.output, { parentElement: child.root });
	const elements = [
		child.root,
		parent.button,
		child.button,
		child.output,
		parent.output,
		sibling.button,
		sibling.output,
	];
	for (const element of elements)
		Object.assign(element, {
			contains(target: Element) {
				for (let current: Element | null = target; current; current = current.parentElement)
					if (current === element) return true;
				return false;
			},
		});
	Object.assign(child.root, { __marklessCensus: elements });
	Object.assign(child.state, { cells: members.flatMap((member) => member.state.cells) });
	Object.assign(child.view, {
		events: [parent.view.events[0], sibling.view.events[0], child.view.events[0]],
		locators: members.flatMap((member) =>
			member.view.locators.map((locator, index) => {
				const element = index === 0 ? member.button : member.output;
				return {
					...locator,
					index: elements.indexOf(element),
					tagName: element.tagName.toLowerCase(),
				};
			}),
		),
		domUpdates: members.flatMap((member) => member.view.domUpdates),
	});
	const order: string[] = [];
	const loadPlan = vi.fn(
		async (id: string) => members.find((member) => id === member.scope + 'handler')?.action,
	);
	const loadSymbol = vi.fn(async (id: string) => {
		const member = members.find((member) => id === member.scope + 'handler');
		if (!member) throw new Error('Unknown handler');
		const symbol = await member.loadSymbol(id);
		return (context: ResumeSymbolContext) => {
			order.push(id);
			return symbol(context);
		};
	});
	return { child, parent, sibling, loadPlan, loadSymbol, order };
}

test.each([
	['m3:c0:', 'count', 'SECTION'],
	['m2:c6:p1:', 'score', 'ARTICLE'],
])('executes the matching scalar path from child outward in %s', async (scope, cell, tag) => {
	const f = nestedFixture(scope, cell, tag);
	for (let index = 1; index <= 3; index++) {
		expect(await tryResumeMdxScalar(f.child.input(), f.loadPlan, f.loadSymbol)).toBe(true);
		expect(f.child.output.textContent).toBe(`Value: ${2 + index} units`);
		expect(f.parent.output.textContent).toBe(`Value: ${10 + index} units`);
	}
	expect(f.order).toEqual(
		Array.from({ length: 3 }, () => [scope + 'handler', f.parent.scope + 'handler']).flat(),
	);
	expect(f.sibling.handler).not.toHaveBeenCalled();
	expect(f.loadPlan.mock.calls.some(([id]) => id === f.sibling.scope + 'handler')).toBe(false);
	expect(f.child.root.__marklessEventOnlyGraph?.size).toBe(2);
	expect(f.child.root.__asyncResumeRuntimeStarted).toBeUndefined();
});

test.each(['missing-plan', 'sync-policy', 'behavior'])(
	'a required ancestor %s hands off before any scalar handler executes',
	async (reason) => {
		const f = nestedFixture();
		if (reason === 'missing-plan')
			f.loadPlan.mockImplementation(async (id) =>
				id === f.child.scope + 'handler' ? f.child.action : undefined,
			);
		if (reason === 'sync-policy')
			Object.assign(f.parent.view.events[0]!, { syncPolicy: { branches: [] } });
		if (reason === 'behavior')
			(f.child.view.behaviors as unknown[]).push({
				hostNodeId: f.parent.scope + 'h0',
				symbolId: 'behavior',
			});
		expect(await tryResumeMdxScalar(f.child.input(), f.loadPlan, f.loadSymbol)).toBe(false);
		expect(f.loadSymbol).not.toHaveBeenCalled();
		expect(f.child.root.__marklessEventOnlyGraph).toBeUndefined();
	},
);

test('non-bubbling input executes only its own scalar handler', async () => {
	const f = nestedFixture();
	const input = f.child.input();
	Object.assign(input.event, { bubbles: false });
	expect(await tryResumeMdxScalar(input, f.loadPlan, f.loadSymbol)).toBe(true);
	expect(f.child.handler).toHaveBeenCalledTimes(1);
	expect(f.parent.handler).not.toHaveBeenCalled();
	expect(f.loadPlan).toHaveBeenCalledExactlyOnceWith(f.child.scope + 'handler');
});

test('an already stopped event does not prepare or execute an ancestor', async () => {
	const f = nestedFixture();
	const input = f.child.input();
	Object.assign(input.event, { cancelBubble: true });
	expect(await tryResumeMdxScalar(input, f.loadPlan, f.loadSymbol)).toBe(true);
	expect(f.child.handler).toHaveBeenCalledTimes(1);
	expect(f.parent.handler).not.toHaveBeenCalled();
	expect(f.loadPlan).toHaveBeenCalledExactlyOnceWith(f.child.scope + 'handler');
});

test('a captured propagation stop survives the browser clearing cancelBubble', async () => {
	const f = nestedFixture();
	const input = { ...f.child.input(), propagationStopped: true };
	Object.assign(input.event, { cancelBubble: false });
	expect(await tryResumeMdxScalar(input, f.loadPlan, f.loadSymbol)).toBe(true);
	expect(f.child.handler).toHaveBeenCalledTimes(1);
	expect(f.parent.handler).not.toHaveBeenCalled();
	expect(f.loadPlan).toHaveBeenCalledExactlyOnceWith(f.child.scope + 'handler');
});

test('two handlers on the bubbling path share the latest value of one scalar cell', async () => {
	const f = fixture();
	const parent = {
		tagName: 'SECTION',
		isConnected: true,
		parentElement: f.root,
	} as unknown as Element;
	Object.assign(f.button, { parentElement: parent });
	Object.assign(f.root, { __marklessCensus: [f.root, parent, f.button, f.output] });
	Object.assign(f.view.locators[0]!, { index: 2 });
	Object.assign(f.view.locators[1]!, { index: 3 });
	(f.view.locators as unknown[]).push({
		hostNodeId: f.scope + 'h2',
		strategy: 'dom-order',
		index: 1,
		tagName: 'section',
	});
	(f.view.events as unknown[]).push({
		hostNodeId: f.scope + 'h2',
		eventName: 'click',
		symbolIds: [f.scope + 'parent'],
	});
	f.loadPlan.mockImplementation(async (id?: string) =>
		id === f.scope + 'parent'
			? { ...f.action, hostNodeId: 'h2', plan: { ...f.action.plan, symbolId: 'parent' } }
			: f.action,
	);
	for (let count = 1; count <= 3; count++) {
		expect(await tryResumeMdxScalar(f.input(), f.loadPlan, f.loadSymbol)).toBe(true);
		expect(f.output.textContent).toBe(`Value: ${2 + count * 2} units`);
	}
	expect(f.root.__marklessEventOnlyGraph?.size).toBe(1);
});

test('full resume adopts both scalar values after a bubbling gesture', async () => {
	const f = nestedFixture();
	await tryResumeMdxScalar(f.child.input(), f.loadPlan, f.loadSymbol);
	const graph = await createRuntimeGraphFromResumePayload({
		state: f.child.state,
		view: f.child.view,
		root: f.child.root as never,
		loadSymbol: f.loadSymbol,
	});
	expect(graph.read(f.child.cell)).toBe(3);
	expect(graph.read(f.parent.cell)).toBe(11);
});

test('a non-bubbling descendant event does not execute the supplied ancestor record', async () => {
	const f = nestedFixture();
	const input = f.child.input();
	Object.assign(input.event, { bubbles: false, target: { parentElement: f.child.button } });
	expect(await tryResumeMdxScalar(input, f.loadPlan, f.loadSymbol)).toBe(false);
	expect(f.loadSymbol).not.toHaveBeenCalled();
});

test('stopping propagation skips the validated parent handler', async () => {
	const f = nestedFixture();
	const input = f.child.input();
	Object.assign(input.event, {
		cancelBubble: false,
		stopPropagation() {
			Object.assign(this, { cancelBubble: true });
		},
	});
	const original = f.child.handler.getMockImplementation()!;
	f.child.handler.mockImplementation((context) => {
		const result = original(context);
		input.event.stopPropagation();
		return result;
	});
	expect(await tryResumeMdxScalar(input, f.loadPlan, f.loadSymbol)).toBe(true);
	expect(f.child.output.textContent).toBe('Value: 3 units');
	expect(f.parent.output.textContent).toBe('Value: 10 units');
	expect(f.parent.loadSymbol).not.toHaveBeenCalled();
});

test.each([
	['m3:c0:', 'count', 2],
	['m8:c4:p1:', 'level', 19],
] as const)(
	'resumes one scalar and retains its value across repeated actions in %s',
	async (scope, cell, initial) => {
		const f = fixture(scope, cell, initial);
		for (let index = 1; index <= 3; index++) {
			expect(await tryResumeMdxScalar(f.input(), f.loadPlan, f.loadSymbol)).toBe(true);
			expect(f.output.textContent).toBe(`Value: ${initial + index} units`);
		}
		expect(f.handler).toHaveBeenCalledTimes(3);
		expect(f.root.__marklessEventOnlyGraph?.size).toBe(1);
		expect(f.root.__asyncResumeRuntimeStarted).toBeUndefined();
		expect(f.loadSymbol.mock.calls.map(([id]) => id)).toEqual([
			scope + 'handler',
			scope + 'handler',
			scope + 'handler',
		]);
	},
);

test('priming prepares metadata without running the handler or writing state', async () => {
	const f = fixture();
	expect(
		await tryResumeMdxScalar(
			{ root: f.root, event: 0, element: f.button },
			f.loadPlan,
			f.loadSymbol,
		),
	).toBe(true);
	expect(f.handler).not.toHaveBeenCalled();
	expect(f.loadSymbol).not.toHaveBeenCalled();
	expect(f.root.__marklessEventOnlyGraph).toBeUndefined();
});

test('an unmatched focus wake on the scalar control does not start or dispatch the full runtime', async () => {
	const f = fixture();
	expect(
		await tryResumeMdxScalar(
			{ ...f.input(), event: { type: 'focusin' } as Event, eventRecord: null },
			f.loadPlan,
			f.loadSymbol,
		),
	).toBe(true);
	expect(f.handler).not.toHaveBeenCalled();
	expect(f.loadSymbol).not.toHaveBeenCalled();
	expect(await tryResumeMdxScalar(f.input(), f.loadPlan, f.loadSymbol)).toBe(true);
	expect(f.output.textContent).toBe('Value: 3 units');
});

test('focus with an authored record is handed off when the caller supplied no record', async () => {
	const f = fixture();
	(f.view.events as unknown[]).push({
		hostNodeId: f.scope + 'h0',
		eventName: 'focusin',
		symbolIds: [f.scope + 'focus-handler'],
	});
	expect(
		await tryResumeMdxScalar(
			{ ...f.input(), event: { type: 'focusin' } as Event, eventRecord: null },
			f.loadPlan,
			f.loadSymbol,
		),
	).toBe(false);
	expect(f.handler).not.toHaveBeenCalled();
});

test.each(['Enter', ' '])(
	'native button activation with %s stays on the scalar path until its click',
	async (key) => {
		const f = fixture();
		for (const type of ['keydown', 'keyup'])
			expect(
				await tryResumeMdxScalar(
					{ ...f.input(), event: { type, key } as KeyboardEvent, eventRecord: null },
					f.loadPlan,
					f.loadSymbol,
				),
			).toBe(true);
		expect(f.handler).not.toHaveBeenCalled();
		expect(await tryResumeMdxScalar(f.input(), f.loadPlan, f.loadSymbol)).toBe(true);
		expect(f.handler).toHaveBeenCalledTimes(1);
	},
);

test('an unmatched non-activation key retains full-runtime dispatch', async () => {
	const f = fixture();
	expect(
		await tryResumeMdxScalar(
			{
				...f.input(),
				event: { type: 'keydown', key: 'Escape' } as KeyboardEvent,
				eventRecord: null,
			},
			f.loadPlan,
			f.loadSymbol,
		),
	).toBe(false);
});

test('full resume adopts the scalar value and owns subsequent dispatch', async () => {
	const f = fixture();
	await tryResumeMdxScalar(f.input(), f.loadPlan, f.loadSymbol);
	const graph = await createRuntimeGraphFromResumePayload({
		state: f.state,
		view: f.view,
		root: f.root as never,
		loadSymbol: f.loadSymbol,
	});
	expect(graph.read(f.cell)).toBe(3);
	f.root.__asyncResumeRuntimeStarted = true;
	graph.write({ graphNodeId: f.cell, path: [], value: 30 });
	expect(await tryResumeMdxScalar(f.input(), f.loadPlan, f.loadSymbol)).toBe(false);
	expect(f.handler).toHaveBeenCalledTimes(1);
	expect(graph.read(f.cell)).toBe(30);
});

test.each([
	'computed',
	'extra-update',
	'branch',
	'storage',
	'wrong-scope',
	'missing-target',
	'sync-policy',
	'detached',
] as const)('refuses %s before executing the handler', async (reason) => {
	const f = fixture();
	if (reason === 'computed')
		(f.state.computed as unknown[]).push({
			graphNodeId: 'computed:double',
			dependencies: [{ graphNodeId: f.cell, path: [] }],
		});
	if (reason === 'extra-update')
		(f.view.domUpdates as unknown[]).push({
			hostNodeId: f.scope + 'h2',
			graphNodeId: f.cell,
			symbolId: 'other',
			target: { kind: 'attribute', name: 'title' },
			path: [],
		});
	if (reason === 'branch')
		Object.assign(f.view, {
			branches: [{ id: 'branch:0', contentReads: [{ graphNodeId: f.cell, path: [] }] }],
		});
	if (reason === 'storage')
		Object.assign(f.state, { storage: [{ graphNodeId: f.cell, key: 'persist' }] });
	if (reason === 'wrong-scope') Object.assign(f.action, { scope: 'm9:' });
	if (reason === 'missing-target') (f.view.locators as unknown[]).pop();
	if (reason === 'sync-policy')
		Object.assign(f.view.events[0]!, { syncPolicy: { branches: [] } });
	if (reason === 'detached') Object.assign(f.root, { isConnected: false });
	expect(
		await tryResumeMdxScalar(
			{ ...f.input(), syncPolicyAlreadyApplied: false },
			f.loadPlan,
			f.loadSymbol,
		),
	).toBe(false);
	expect(f.handler).not.toHaveBeenCalled();
	expect(f.root.__marklessEventOnlyGraph).toBeUndefined();
});
