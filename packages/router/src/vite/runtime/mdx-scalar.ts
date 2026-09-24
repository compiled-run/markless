import type {
	RuntimeDemandMapAction,
	RuntimeDemandMapActionPlan,
} from '../../../../compiler/src/artifacts.ts';
import type { ResumeEventRecord, ResumeSymbol } from '../../../../web/src/resume-types.ts';
import type { RuntimeGraph } from '../../../../runtime/src/graph.ts';
import type {
	ProtocolStatePayload,
	ProtocolViewPayload,
} from '../../../../serializer/src/protocol.ts';
import {
	ASYNC_PROTOCOL_VERSION,
	protocolInstancePath,
	protocolInstanceQualifies,
	protocolStateVersion,
} from '../../../../serializer/src/protocol-constants.ts';
import { marklessDecodeScalarCell } from '../../../../web/src/fns/scalar-specialized.ts';
import { marklessFindElementAtDomOrderIndex } from '../../../../web/src/fns/dom-order.ts';

export type MdxScalarAction = Pick<RuntimeDemandMapAction, 'hostNodeId' | 'eventName'> & {
	readonly scope: string;
	readonly plan: RuntimeDemandMapActionPlan;
};

export type MdxScalarRoot = Element & {
	__marklessEventOnlyGraph?: Map<string, unknown>;
	__asyncResumeRuntimeStarted?: boolean;
};

export type MdxScalarInput = {
	readonly root: MdxScalarRoot;
	readonly event: Event | 0;
	readonly element?: Element | null;
	readonly eventRecord?: ResumeEventRecord | null;
	readonly syncPolicyAlreadyApplied?: boolean;
	readonly propagationStopped?: boolean;
};

export async function tryResumeMdxScalar(
	input: MdxScalarInput,
	loadPlan: (
		symbolId: string,
	) => MdxScalarAction | undefined | Promise<MdxScalarAction | undefined>,
	loadSymbol: (symbolId: string) => ResumeSymbol | Promise<ResumeSymbol>,
): Promise<boolean> {
	const { root, event, element } = input;
	if (root.__asyncResumeRuntimeStarted || root.isConnected === false || !element) return false;
	if (
		root.querySelector('[overlay]:not([hidden])') ||
		root.ownerDocument?.querySelector(
			'script[type="markless/arm"],script[type="markless/state-patch"]',
		)
	)
		return false;
	let payload = payloads.get(root);
	if (!payload) {
		const state = readScript<ProtocolStatePayload>(root, 'markless/state');
		const view = readScript<ProtocolViewPayload>(root, 'markless/view');
		if (
			!state ||
			!view ||
			state.version !== protocolStateVersion(state.storage) ||
			view.version !== ASYNC_PROTOCOL_VERSION
		)
			return false;
		payload = { state, view, plans: new Map() };
		payloads.set(root, payload);
	}
	if (
		event !== 0 &&
		!input.eventRecord &&
		payload.view.events.some((record) => {
			if (record.eventName !== event.type) return false;
			const host = locate(root, payload.view, record.hostNodeId);
			return host === element || host?.contains(element);
		})
	)
		return false;
	const priming =
		event === 0 ||
		(!input.eventRecord &&
			(event.type === 'focusin' ||
				(element.tagName === 'BUTTON' &&
					(event.type === 'keydown' || event.type === 'keyup') &&
					((event as KeyboardEvent).key === 'Enter' ||
						(event as KeyboardEvent).key === ' '))));
	const record = priming
		? payload.view.events.find(
				(record) =>
					record.eventName !== 'visible' &&
					locate(root, payload.view, record.hostNodeId) === element,
			)
		: input.eventRecord;
	if (!record) return false;
	if (!priming && event.type !== record.eventName) return false;
	if (!priming && event.bubbles === false && event.target !== element) return false;
	if (
		payload.view.behaviors.some((behavior) => {
			const host = locate(root, payload.view, behavior.hostNodeId);
			return !host || host === element || host.contains(element);
		})
	)
		return false;
	const path = [{ record, element }];
	if (
		!priming &&
		event.bubbles !== false &&
		!input.propagationStopped &&
		!event.cancelBubble &&
		element !== root
	) {
		const candidates = payload.view.events
			.filter((record) => record.eventName === event.type)
			.map((record) => ({ record, element: locate(root, payload.view, record.hostNodeId) }));
		if (candidates.some((candidate) => !candidate.element)) return false;
		for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
			const record = candidates.find((candidate) => candidate.element === ancestor)?.record;
			if (record) path.push({ record, element: ancestor });
			if (ancestor === root) break;
		}
	}
	const actions: Array<{ symbolId: string; prepared: Prepared }> = [];
	for (const matched of path) {
		const record = matched.record;
		if (
			record.action ||
			record.symbolIds.length !== 1 ||
			(record.syncPolicy &&
				!priming &&
				(matched !== path[0] || !input.syncPolicyAlreadyApplied))
		)
			return false;
		const symbolId = record.symbolIds[0]!;
		const key = record.hostNodeId + '\n' + record.eventName + '\n' + symbolId;
		let prepared = payload.plans.get(key);
		if (prepared === undefined) {
			const action = await loadPlan(symbolId);
			prepared = action ? prepare(root, payload, action, record) : null;
			payload.plans.set(key, prepared);
		}
		if (
			!prepared ||
			prepared.element !== matched.element ||
			prepared.element.isConnected === false ||
			prepared.targets.some((target) => target.element.isConnected === false)
		)
			return false;
		actions.push({ symbolId, prepared });
	}
	if (priming) return true;
	for (const action of actions) {
		const symbol = await loadSymbol(action.symbolId);
		if (isDetached(root)) return true;
		if (await runScalar(root, event, action.prepared, symbol)) break;
	}
	return true;
}

async function runScalar(
	root: MdxScalarRoot,
	event: Event,
	prepared: Prepared,
	symbol: ResumeSymbol,
): Promise<boolean> {
	const values = root.__marklessEventOnlyGraph ?? new Map<string, unknown>();
	let value = values.has(prepared.cell) ? values.get(prepared.cell) : prepared.initial;
	const previous = value;
	const check = (id: string, path?: ReadonlyArray<string>) => {
		if (id !== prepared.cell || path?.length) throw new Error('MARKLESS_SCALAR_PLAN_MISMATCH');
	};
	const graph: Pick<RuntimeGraph, 'read' | 'write' | 'update'> = {
		read(id, path) {
			check(id, path);
			return value;
		},
		write(write) {
			check(write.graphNodeId, write.path);
			value = write.value;
		},
		update(update) {
			check(update.graphNodeId, update.path);
			const old = value;
			value = update.update(value);
			return update.returnValue === 'previous'
				? old
				: update.returnValue === 'next'
					? value
					: undefined;
		},
	};
	const result = symbol({
		graph: graph as RuntimeGraph,
		event: event as never,
		element: prepared.element as never,
		getElementHandle: () => undefined,
	});
	const stopped = event.cancelBubble;
	await result;
	values.set(prepared.cell, value);
	root.__marklessEventOnlyGraph = values;
	if (!Object.is(previous, value))
		for (const target of prepared.targets)
			target.element.textContent =
				target.prefix + (value == null ? '' : String(value)) + target.suffix;
	return stopped || event.cancelBubble;
}

type Prepared = {
	readonly cell: string;
	readonly initial: unknown;
	readonly element: Element;
	readonly targets: ReadonlyArray<{ element: Element; prefix: string; suffix: string }>;
};
type Payload = {
	state: ProtocolStatePayload;
	view: ProtocolViewPayload;
	plans: Map<string, Prepared | null>;
};
const payloads = new WeakMap<MdxScalarRoot, Payload>();

function prepare(
	root: MdxScalarRoot,
	{ state, view }: Payload,
	action: MdxScalarAction,
	record: ResumeEventRecord,
): Prepared | null {
	const { plan, scope } = action;
	if (
		plan.kind !== 'scalar' ||
		!scope ||
		protocolInstancePath(scope) !== scope ||
		protocolInstanceQualifies(plan.cell) !== true
	)
		return null;
	const cell = scope + plan.cell;
	if (
		scope + action.hostNodeId !== record.hostNodeId ||
		action.eventName !== record.eventName ||
		scope + plan.symbolId !== record.symbolIds[0]
	)
		return null;
	const servedEvent = view.events.find(
		(event) => event.hostNodeId === record.hostNodeId && event.eventName === record.eventName,
	);
	if (
		!servedEvent ||
		servedEvent.symbolIds.length !== 1 ||
		servedEvent.symbolIds[0] !== record.symbolIds[0]
	)
		return null;
	const cells = state.cells.filter((candidate) => candidate.graphNodeId === cell);
	if (cells.length !== 1 || cells[0]!.valueKind !== 'scalar') return null;
	const updates = view.domUpdates.filter((update) => update.graphNodeId === cell);
	if (!updates.length || updates.length !== plan.textUpdates.length) return null;
	const { cells: _cells, ...stateDependencies } = state;
	const { domUpdates: _updates, ...viewDependencies } = view;
	if (references(stateDependencies, cell) || references(viewDependencies, cell)) return null;
	const element = locate(root, view, record.hostNodeId);
	if (!element) return null;
	const targets: Prepared['targets'][number][] = [];
	for (const expected of plan.textUpdates) {
		const update = updates.find(
			(candidate) =>
				candidate.hostNodeId === scope + expected.hostNodeId &&
				candidate.symbolId === scope + expected.symbolId,
		);
		if (
			!update ||
			scope + expected.graphNodeId !== cell ||
			update.path.length ||
			update.target?.kind !== 'text' ||
			update.target.trueValue !== undefined ||
			update.target.falseValue !== undefined ||
			(update.target.prefix ?? '') !== (expected.prefix ?? '') ||
			(update.target.suffix ?? '') !== (expected.suffix ?? '')
		)
			return null;
		const target = locate(root, view, update.hostNodeId);
		if (!target) return null;
		targets.push({
			element: target,
			prefix: expected.prefix ?? '',
			suffix: expected.suffix ?? '',
		});
	}
	return {
		cell,
		initial: marklessDecodeScalarCell(cells[0] as never, cell, 'mdx-scalar'),
		element,
		targets,
	};
}

function locate(root: MdxScalarRoot, view: ProtocolViewPayload, host: string): Element | null {
	const locator = view.locators.find((locator) => locator.hostNodeId === host);
	if (!locator || locator.strategy !== 'dom-order') return null;
	const element = marklessFindElementAtDomOrderIndex(root, locator.index) as Element | undefined;
	return element?.tagName.toLowerCase() === locator.tagName.toLowerCase() ? element : null;
}

function readScript<T>(root: Element, type: string): T | undefined {
	const text = root.querySelector(`script[type="${type}"]`)?.textContent;
	return text ? (JSON.parse(text) as T) : undefined;
}

function references(value: unknown, id: string): boolean {
	return (
		value === id ||
		(!!value &&
			typeof value === 'object' &&
			Object.values(value).some((child) => references(child, id)))
	);
}

function isDetached(root: Element): boolean {
	return root.isConnected === false;
}
