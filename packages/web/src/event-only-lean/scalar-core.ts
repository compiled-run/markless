import type {
	EventOnlyResumeContainer,
	EventOnlyResumeDomElement,
	EventOnlyResumeRecord,
	ResumeEventOnlyFromPayloadDocumentInput,
} from './types.ts';
import type { LeanActionPlan, LeanPlan, RuntimeDemandMap } from './lean-shared.ts';

// The scalar-core path only produces a plan when the event record is present,
// so its plan type carries that record.
type ScalarCorePlan = LeanPlan & { readonly eventRecord: EventOnlyResumeRecord };
import { resumeFullEventOnly } from './lean-shared.ts';
import type { ProtocolSyncPolicyCondition } from '../../../serializer/src/protocol.ts';

export async function resumeScalarCoreEventFromPayloadDocument(
	input: ResumeEventOnlyFromPayloadDocumentInput,
): Promise<EventOnlyResumeContainer> {
	if (!input.eventRecord) return resumeFullEventOnly(input);
	// The guard above narrows the property, not the input object.
	const withRecord = input as ResumeEventOnlyFromPayloadDocumentInput & {
		readonly eventRecord: EventOnlyResumeRecord;
	};
	const action = scalarAction(input.eventRecord, input.runtimeDemandMap);
	if (!action?.plan) return resumeFullEventOnly(input);
	const graphNodeIds = syncPolicyGraphIds(input.eventRecord.syncPolicy);
	const plan = readScalarCorePlanFromDocument(withRecord, action.plan, graphNodeIds);
	if (!plan) return resumeFullEventOnly(input);

	const elementsByHostId = new Map<string, EventOnlyResumeDomElement>();
	const graph = createScalarCoreGraph(plan, elementsByHostId, input.root);
	const element =
		input.element ??
		locateHost(input.root, plan.locators, elementsByHostId, plan.eventRecord.hostNodeId) ??
		input.event.target;
	if (!element) return resumeFullEventOnly(input);
	if (element.parentElement === input.root) return resumeFullEventOnly(input);
	for (const update of plan.domUpdates) {
		if (!locateHost(input.root, plan.locators, elementsByHostId, update.hostNodeId))
			return resumeFullEventOnly(input);
	}
	if (plan.eventRecord.syncPolicy && !input.syncPolicyAlreadyApplied) {
		const { runSyncPolicyActions } = await import('../inline/sync-policy-core.ts');
		runSyncPolicyActions(plan.eventRecord.syncPolicy, graph, input.event);
	}
	executePlanWrite(graph, action.plan);
	for (const symbolId of plan.eventRecord.symbolIds) {
		const symbol = await resolve(input.loadSymbol(symbolId));
		void (await resolve(
			symbol({
				graph: shadowGraph(graph),
				event: input.event,
				element,
				getElementHandle: () => undefined,
			}),
		));
	}
	await graph.flush();
	if (typeof __MARKLESS_DEBUG_ENABLED__ !== 'undefined' && __MARKLESS_DEBUG_ENABLED__)
		await import('../debug-channel.ts')
			.then((debug) =>
				debug.__marklessDebugStartContainer(input.root as unknown as Element, 'ssr-lean'),
			)
			.catch(() => {});
	return {
		graph,
		view: {
			version: 1,
			locators: plan.locators,
			events: [plan.eventRecord],
			domUpdates: plan.domUpdates,
			behaviors: [],
			elementHandles: [],
			keyedRepeats: [],
			branches: [],
			asyncBoundaries: [],
		},
		dispatch(event) {
			return resumeFullEventOnly({ ...input, event }).then(() => undefined);
		},
		dispose() {
			delete input.root.__marklessEventOnlyGraph;
			if (typeof __MARKLESS_DEBUG_ENABLED__ !== 'undefined' && __MARKLESS_DEBUG_ENABLED__)
				void import('../debug-channel.ts')
					.then((debug) =>
						debug.__marklessDebugDisposeContainer(input.root as unknown as Element),
					)
					.catch(() => {});
		},
	};
}

export function isScalarCoreLeanResumeShape(input: {
	readonly state: {
		readonly cells: ReadonlyArray<unknown>;
		readonly computed: ReadonlyArray<unknown>;
	};
	readonly view: {
		readonly domUpdates: ReadonlyArray<unknown>;
		readonly locators: ReadonlyArray<unknown>;
	};
	readonly eventRecord?: EventOnlyResumeRecord;
	readonly runtimeDemandMap?: unknown;
}): boolean {
	const action = input.eventRecord
		? scalarAction(input.eventRecord, input.runtimeDemandMap)
		: undefined;
	return (
		!!action?.plan &&
		readScalarCorePlan({
			state: input.state,
			view: input.view,
			eventRecord: input.eventRecord,
			plan: action.plan,
			graphNodeIds: syncPolicyGraphIds(input.eventRecord?.syncPolicy),
		}) !== null
	);
}

function scalarAction(eventRecord: EventOnlyResumeRecord, runtimeDemandMap: unknown) {
	const demandMap = runtimeDemandMap as RuntimeDemandMap | undefined;
	if (!demandMap?.recordKinds || !demandMap.actions) return undefined;
	const replaced = new Map(demandMap.recordKinds.map((record) => [record.kind, record.replaced]));
	if (replaced.get('event') !== true || replaced.get('dom-update') !== true) return undefined;
	return demandMap.actions.find(
		(candidate) =>
			candidate.recordKind === 'event' &&
			candidate.hostNodeId === eventRecord.hostNodeId &&
			candidate.eventName === eventRecord.eventName &&
			candidate.plan?.version === 1 &&
			candidate.plan.kind === 'scalar',
	);
}

function readScalarCorePlanFromDocument(
	input: ResumeEventOnlyFromPayloadDocumentInput & {
		readonly eventRecord: EventOnlyResumeRecord;
	},
	actionPlan: LeanActionPlan,
	graphNodeIds: ReadonlyArray<string>,
): ScalarCorePlan | null {
	return readScalarCorePlan({
		state: readPayloadScript(input.document, 'markless/state'),
		view: readPayloadScript(input.document, 'markless/view'),
		eventRecord: input.eventRecord,
		plan: actionPlan,
		graphNodeIds,
	});
}

function readScalarCorePlan(input: {
	readonly state: { readonly cells: ReadonlyArray<any>; readonly computed: ReadonlyArray<any> };
	readonly view: {
		readonly locators: ReadonlyArray<any>;
		readonly domUpdates: ReadonlyArray<any>;
		readonly behaviors?: ReadonlyArray<unknown>;
	};
	readonly eventRecord?: EventOnlyResumeRecord;
	readonly plan: LeanActionPlan;
	readonly graphNodeIds: ReadonlyArray<string>;
}): ScalarCorePlan | null {
	if (!input.eventRecord || readComputedEntries(input.state.computed).length > 0) return null;
	if ((input.view.behaviors?.length ?? 0) > 0) return null;
	const cellIds = new Set([input.plan.cell, ...input.graphNodeIds]);
	const cells = readScalarStateCells(input.state.cells, cellIds);
	if (cells.length !== cellIds.size) return null;
	const domUpdates = input.plan.textUpdates.flatMap((update) => {
		const record = input.view.domUpdates.find(
			(candidate) =>
				candidate.hostNodeId === update.hostNodeId &&
				candidate.graphNodeId === update.graphNodeId &&
				candidate.symbolId === update.symbolId &&
				candidate.target?.kind === 'text',
		);
		return record ? [record] : [];
	});
	if (domUpdates.length !== input.plan.textUpdates.length) return null;
	const locatorHostIds = new Set([
		input.eventRecord.hostNodeId,
		...domUpdates.map((record) => record.hostNodeId),
	]);
	return {
		eventRecord: input.eventRecord,
		locators: input.view.locators.filter((locator) => locatorHostIds.has(locator.hostNodeId)),
		domUpdates,
		keyedRepeats: [],
		cells,
		fullDecodeCellIds: new Set(),
	};
}

function readPayloadScript(
	document: ResumeEventOnlyFromPayloadDocumentInput['document'],
	type: 'markless/state' | 'markless/view',
) {
	const element = document.querySelector(`script[type="${type}"]`);
	const text = element?.textContent ?? element?.text ?? element?.innerHTML;
	if (text == null) {
		throw Object.assign(new Error('MARKLESS_LEAN_PAYLOAD_MISSING'), {
			code: 'MARKLESS_LEAN_PAYLOAD_MISSING',
			site: type,
		});
	}
	return JSON.parse(text);
}

function readComputedEntries(computed: unknown): ReadonlyArray<unknown> {
	if (!Array.isArray(computed))
		throw payloadInvalid(
			'Invalid markless/state payload: expected computed array.',
			'markless/state.computed',
		);
	return computed;
}

function readScalarStateCells(cells: unknown, cellIds: ReadonlySet<string>): LeanPlan['cells'] {
	if (!Array.isArray(cells))
		throw payloadInvalid(
			'Invalid markless/state payload: expected cells array.',
			'markless/state.cells',
		);
	const matches: LeanPlan['cells'][number][] = [];
	for (const [index, cell] of cells.entries()) {
		if (!cell || typeof cell !== 'object') continue;
		const record = cell as {
			readonly graphNodeId?: unknown;
			readonly valueKind?: unknown;
			readonly value?: unknown;
		};
		if (typeof record.graphNodeId !== 'string' || !cellIds.has(record.graphNodeId)) continue;
		if (record.valueKind !== 'scalar')
			throw payloadInvalid(
				`Invalid markless/state cell[${index}]: expected scalar valueKind.`,
				`markless/state cell[${index}].valueKind`,
			);
		assertScalarValuePayload(record.value, `markless/state cell[${index}].value`);
		matches.push(cell as LeanPlan['cells'][number]);
	}
	return matches;
}

function assertScalarValuePayload(value: unknown, context: string): void {
	if (!value || typeof value !== 'object')
		throw payloadInvalid(`Invalid ${context}: expected scalar value payload.`, context);
	const payload = value as {
		readonly version?: unknown;
		readonly root?: unknown;
		readonly records?: unknown;
	};
	if (payload.version !== 1)
		throw payloadInvalid(`Invalid ${context}: expected version 1.`, `${context}.version`);
	if (!Array.isArray(payload.records) || payload.records.length !== 0)
		throw payloadInvalid(
			`Invalid ${context}: expected empty records array.`,
			`${context}.records`,
		);
	validateScalarSlot(payload.root, `${context}.root`);
}

function validateScalarSlot(slot: unknown, context: string): void {
	if (
		slot === null ||
		typeof slot === 'string' ||
		typeof slot === 'number' ||
		typeof slot === 'boolean'
	)
		return;
	if (!slot || typeof slot !== 'object')
		throw payloadInvalid(`Invalid ${context}: expected serialized scalar slot.`, context);
	const tagged = slot as { readonly $type?: unknown; readonly value?: unknown };
	if (tagged.$type === 'undefined') return;
	if (tagged.$type === 'bigint' && typeof tagged.value === 'string')
		try {
			BigInt(tagged.value);
			return;
		} catch {}
	// A non-finite number's tag carries the number's own string form, so the
	// round trip back through Number() is the check.
	if (
		tagged.$type === 'number' &&
		!Number.isFinite(Number(tagged.value)) &&
		String(Number(tagged.value)) === tagged.value
	)
		return;
	if (
		tagged.$type === 'date' &&
		typeof tagged.value === 'string' &&
		!Number.isNaN(new Date(tagged.value).getTime())
	)
		return;
	throw payloadInvalid(`Invalid ${context}: expected serialized scalar slot.`, context);
}

function createScalarCoreGraph(
	plan: LeanPlan,
	elementsByHostId: Map<string, EventOnlyResumeDomElement>,
	root: EventOnlyResumeDomElement,
): EventOnlyResumeContainer['graph'] {
	const values = (root.__marklessEventOnlyGraph ||= new Map());
	for (const cell of plan.cells) {
		if (!values.has(cell.graphNodeId)) {
			values.set(
				cell.graphNodeId,
				decodeScalarSlot((cell.value as { readonly root?: unknown }).root),
			);
		}
	}
	const dirty: string[] = [];
	const graph: EventOnlyResumeContainer['graph'] = {
		read(graphNodeId) {
			return values.get(graphNodeId);
		},
		write(write) {
			setScalar(write.graphNodeId, write.value, write.path, values, dirty, 'write-path');
		},
		update(update) {
			const previous = values.get(update.graphNodeId),
				next = update.update(previous);
			setScalar(update.graphNodeId, next, update.path, values, dirty, 'update-path');
			return update.returnValue === 'previous'
				? previous
				: update.returnValue === 'next'
					? next
					: undefined;
		},
		call() {
			throw scalarError('graph-call');
		},
		async flush() {
			while (dirty.length > 0) {
				const pending = dirty.splice(0);
				for (const update of plan.domUpdates) {
					if (!pending.includes(update.graphNodeId) || !update.symbolId) continue;
					const target = elementsByHostId.get(update.hostNodeId);
					if (target)
						target.textContent =
							values.get(update.graphNodeId) == null
								? ''
								: String(values.get(update.graphNodeId));
				}
			}
		},
	};
	return graph;
}

function setScalar(
	graphNodeId: string,
	value: unknown,
	path: ReadonlyArray<string> | undefined,
	values: Map<string, unknown>,
	dirty: string[],
	site: string,
): void {
	if ((path?.length ?? 0) > 0) throw scalarError(site);
	if (Object.is(values.get(graphNodeId), value)) return;
	values.set(graphNodeId, value);
	dirty.push(graphNodeId);
}

function decodeScalarSlot(slot: unknown): unknown {
	if (
		slot === null ||
		typeof slot === 'string' ||
		typeof slot === 'number' ||
		typeof slot === 'boolean'
	)
		return slot;
	if ((slot as { readonly $type?: unknown }).$type === 'undefined') return undefined;
	if ((slot as { readonly $type?: unknown }).$type === 'bigint')
		return BigInt((slot as { readonly value: string }).value);
	if ((slot as { readonly $type?: unknown }).$type === 'number')
		return Number((slot as { readonly value: string }).value);
	return new Date((slot as { readonly value: string }).value);
}

function executePlanWrite(graph: EventOnlyResumeContainer['graph'], plan: LeanActionPlan): void {
	if (plan.write.kind === 'update') {
		graph.update({
			graphNodeId: plan.cell,
			path: [],
			returnValue: 'next',
			update: (value) => Number(value) + (plan.write.updateOperator === '--' ? -1 : 1),
		});
	} else {
		graph.write({
			graphNodeId: plan.cell,
			path: [],
			value: plan.write.valueKind === 'undefined' ? undefined : plan.write.value,
		});
	}
}

function shadowGraph(graph: EventOnlyResumeContainer['graph']): EventOnlyResumeContainer['graph'] {
	return {
		...graph,
		write() {},
		update(update) {
			const value = graph.read(update.graphNodeId, update.path ?? []);
			return update.returnValue === 'previous' || update.returnValue === 'next'
				? value
				: undefined;
		},
	};
}

function locateHost(
	root: EventOnlyResumeDomElement,
	locators: LeanPlan['locators'],
	elementsByHostId: Map<string, EventOnlyResumeDomElement>,
	hostNodeId: string,
): EventOnlyResumeDomElement | undefined {
	const cached = elementsByHostId.get(hostNodeId);
	if (cached) return cached;
	const locator = locators.find((candidate) => candidate.hostNodeId === hostNodeId);
	if (!locator) return undefined;
	let index = 0,
		found: EventOnlyResumeDomElement | undefined;
	const visit = (node: {
		readonly nodeType: number;
		readonly childNodes?: ArrayLike<unknown>;
	}) => {
		if (found) return;
		if (node.nodeType === 1) {
			if (index === locator.index) found = node as EventOnlyResumeDomElement;
			index++;
		}
		for (const child of Array.from(node.childNodes ?? [])) visit(child as never);
	};
	visit(root);
	if (
		!found ||
		(locator.tagName !== '*' && found.tagName.toLowerCase() !== locator.tagName.toLowerCase())
	)
		return undefined;
	elementsByHostId.set(hostNodeId, found);
	return found;
}

function syncPolicyGraphIds(policy: EventOnlyResumeRecord['syncPolicy']): string[] {
	if (!policy) return [];
	const branches = 'branches' in policy ? policy.branches : [policy];
	return [...new Set(branches.flatMap((branch) => conditionGraphIds(branch.when)))].sort();
}

function conditionGraphIds(condition: ProtocolSyncPolicyCondition): string[] {
	if (condition.type === 'graph-truthy') return [condition.graphNodeId];
	if (condition.type === 'and' || condition.type === 'or')
		return [...new Set(condition.conditions.flatMap(conditionGraphIds))].sort();
	if (condition.type === 'not') return conditionGraphIds(condition.condition);
	return [];
}

function resolve<T>(value: T | Promise<T>): Promise<T> {
	return value !== null &&
		(typeof value === 'object' || typeof value === 'function') &&
		typeof (value as { readonly then?: unknown }).then === 'function'
		? (value as Promise<T>)
		: Promise.resolve(value);
}

function scalarError(site: string): Error {
	return Object.assign(new Error('MARKLESS_SCALAR_LEAN_ESCALATE'), {
		code: 'MARKLESS_SCALAR_LEAN_ESCALATE',
		site,
	});
}

function payloadInvalid(message: string, site: string): Error {
	return Object.assign(new Error(message), {
		code: 'MARKLESS_PAYLOAD_INVALID',
		severity: 'error',
		phase: 'payload',
		title: 'Invalid resumability payload',
		message,
		why: 'The markless/state payload did not match the resumability protocol shape required by this runtime.',
		payloadType: 'markless/state',
		payloadScript: 'script[type="markless/state"]',
		suggestions: [
			{
				message:
					'Regenerate the markless/state payload with the matching markless compiler/runtime version.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_PAYLOAD_INVALID',
		site,
	});
}
