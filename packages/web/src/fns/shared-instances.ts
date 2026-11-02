// The browser half of shared(): one instance per document (spec 03, "Where an instance lives").
import type { ProtocolStatePayload } from '@markless/serializer/protocol';
import type { RuntimeGraph } from '@markless/runtime';
import {
	PROTOCOL_SHARED_INSTANCES_PROPERTY,
	PROTOCOL_SHARED_INSTANCES_VERSION,
	type ProtocolSharedInstance,
	type ProtocolSharedInstances,
} from '../../../serializer/src/protocol-shared-instances.ts';


type Definition = NonNullable<ProtocolStatePayload['sharedDefinitions']>[number];
export type Cell = { readonly graphNodeId: string; readonly value: unknown; readonly readInitializer?: () => unknown };
type Host = Record<string, unknown> & {
	readonly ownerDocument?: object | null;
	readonly isConnected?: boolean;
	__mL?: object;
	__marklessDelegatedDispatch?: boolean | string;
};
// Method syntax: each version's resume module types its own input.
type ResumeModule = { resumeContainerEvent(input: { readonly root: object; readonly event: 0 }): unknown };
export type Places = { readonly document: object | null | undefined; readonly container: object | null | undefined };
type Bound = {
	readonly instance: ProtocolSharedInstance;
	readonly cellIds: ReadonlyArray<string>;
};

const reconcileReads = new WeakMap<RuntimeGraph, ReadonlyArray<string>>();
const reported = new WeakMap<object, Set<string>>();

/**
 * A cell whose served value differs from the live one starts at the served value and
 * takes the live one on first read, so that read reconciles every binding as a write does.
 */
export function bindSharedCells(
	root: object,
	state: ProtocolStatePayload,
	cells: ReadonlyArray<Cell>,
): { readonly cells: Cell[]; readonly connect: (graph: RuntimeGraph) => void } {
	const host = root as Host;
	const places = placesOf(root);
	const { bound, differing } = bindDefinitions(places, state, cells, root, true);
	const live = new Map<string, ProtocolSharedInstance>();
	for (const binding of bound) for (const id of binding.cellIds) live.set(id, binding.instance);
	const next = cells.map((cell) => {
		const instance = differing.has(cell.graphNodeId) ? live.get(cell.graphNodeId) : undefined;
		return instance
			? { ...cell, readInitializer: () => cloneValue(instance.cells[cell.graphNodeId]) }
			: cell;
	});
	return {
		cells: next,
		connect: (graph) => {
			if (bound.length === 0) return;
			reconcileReads.set(graph, [...differing]);
			connectGraph(host, graph, bound);
		},
	};
}

// Called once the runtime's bindings exist: the reads land the live values through them.
export function reconcileSharedCells(graph: RuntimeGraph): boolean {
	const reads = reconcileReads.get(graph);
	reconcileReads.delete(graph);
	for (const id of reads ?? []) graph.read(id, []);
	return !!reads?.length;
}

// A CSR mount has no resume module to wake it, so it listens until its runtime binds.
export function registerDormantContainer(
	root: object,
	state: ProtocolStatePayload,
	wake: () => void,
): void {
	const places = placesOf(root);
	let woke = false;
	const start = () => {
		if (!woke) wake();
		woke = true;
		return false;
	};
	for (const definition of liveDefinitions(state)) {
		if (instancesAt(places, definition)?.instances[definition.id]?.shape) return void start();
	}
	for (const definition of liveDefinitions(state)) {
		const store = instancesAt(places, definition, true)!;
		const instance = (store.instances[definition.id] ??= {
			shape: '',
			cells: {},
			listeners: [],
		});
		instance.listeners.push({ root, apply: start });
	}
}

// Wakes a container the way its own self-wake does, through its route's resume module.
export function wakeSharedContainer(root: object, module: ResumeModule): void {
	(root as Host).__marklessDelegatedDispatch = true;
	void Promise.resolve(module.resumeContainerEvent({ root, event: 0 })).catch((error) =>
		globalThis.reportError?.(error),
	);
}

export function bindDefinitions(
	places: Places,
	state: ProtocolStatePayload,
	cells: ReadonlyArray<Cell>,
	reportOn: object,
	create: boolean,
): { readonly bound: Bound[]; readonly differing: Set<string> } {
	const served = new Map(cells.map((cell) => [cell.graphNodeId, cell.value]));
	const seeded = new Set((state.sharedSeeds ?? []).map((seed) => seed.graphNodeId));
	const bound: Bound[] = [];
	const differing = new Set<string>();
	for (const definition of liveDefinitions(state)) {
		const cellIds = definition.graphNodeIds.filter((id) => served.has(id));
		if (cellIds.length === 0) continue;
		const shape = cellIds
			.slice()
			.sort()
			.map((id) => `${id}=${shapeOf(served.get(id))}`)
			.join(';');
		const store = instancesAt(places, definition, create);
		if (!store) continue;
		let instance = store.instances[definition.id];
		if (instance && !instance.shape) {
			if (!create) continue;
			// Created by a container that only listens until its runtime binds.
			instance = store.instances[definition.id] = { ...instance, shape, cells: liveCells(cellIds, served) };
		} else if (!instance) {
			if (!create) continue;
			instance = store.instances[definition.id] = { shape, cells: liveCells(cellIds, served), listeners: [] };
		} else if (instance.shape !== shape) {
			reportShapeMismatch(reportOn, definition, instance.shape, shape);
			continue;
		}
		bound.push({ instance, cellIds });
		for (const id of cellIds)
			if (!seeded.has(id) && Object.hasOwn(instance.cells, id) && !sameValue(instance.cells[id], served.get(id)))
				differing.add(id);
	}
	return { bound, differing };
}

function connectGraph(root: Host, graph: RuntimeGraph, bound: ReadonlyArray<Bound>): void {
	const life = root.__mL;
	const alive = () => root.__mL === life && root.isConnected !== false;
	// The value another container delivered, so its write here is not published back.
	const received = new Map<string, unknown>();
	for (const { instance, cellIds } of bound) {
		const listener = {
			root,
			apply: (graphNodeId: string, value: unknown) => {
				if (!alive()) return false;
				if (!cellIds.includes(graphNodeId)) return true;
				received.set(graphNodeId, value);
				graph.write({ graphNodeId, value });
				return true;
			},
		};
		const others = instance.listeners.filter((other) => other.root !== root);
		instance.listeners.splice(0, instance.listeners.length, ...others, listener);
		for (const graphNodeId of cellIds)
			graph.subscribe({
				id: `shared-instance:${graphNodeId}`,
				graphNodeId,
				path: [],
				run: (value) => {
					const delivered = received.has(graphNodeId) && received.get(graphNodeId) === value;
					received.delete(graphNodeId);
					if (delivered || !alive() || sameValue(instance.cells[graphNodeId], value)) return;
					instance.cells[graphNodeId] = cloneValue(value);
					publish(root, instance, graphNodeId);
				},
			});
	}
}

function publish(root: Host, instance: ProtocolSharedInstance, graphNodeId: string): void {
	for (const listener of instance.listeners.slice()) {
		if (listener.root === root) continue;
		if (listener.apply(graphNodeId, cloneValue(instance.cells[graphNodeId])) === false)
			instance.listeners.splice(instance.listeners.indexOf(listener), 1);
	}
}

function liveDefinitions(state: ProtocolStatePayload): Definition[] {
	return (state.sharedDefinitions ?? []).filter((definition) => definition.scope !== 'widget');
}

function instancesAt(
	places: Places,
	definition: Definition,
	create = false,
): ProtocolSharedInstances | undefined {
	const place = (definition.scope === 'container' ? places.container : places.document) as
		| Record<string, ProtocolSharedInstances | undefined>
		| null
		| undefined;
	if (!place) return undefined;
	const store = place[PROTOCOL_SHARED_INSTANCES_PROPERTY];
	if (store?.version === PROTOCOL_SHARED_INSTANCES_VERSION) return store;
	if (store || !create) return undefined;
	return (place[PROTOCOL_SHARED_INSTANCES_PROPERTY] = {
		version: PROTOCOL_SHARED_INSTANCES_VERSION,
		instances: Object.create(null) as Record<string, ProtocolSharedInstance>,
	});
}

function liveCells(ids: ReadonlyArray<string>, served: ReadonlyMap<string, unknown>) {
	const cells: Record<string, unknown> = Object.create(null);
	for (const id of ids) cells[id] = cloneValue(served.get(id));
	return cells;
}

function reportShapeMismatch(root: object, definition: Definition, live: string, own: string): void {
	const seen = reported.get(root) ?? new Set<string>();
	reported.set(root, seen);
	if (seen.has(definition.id)) return;
	seen.add(definition.id);
	console.error(
		Object.assign(
			new Error(
				`MARKLESS_SHARED_SHAPE_MISMATCH: shared() definition "${definition.id}" is already live in this document with a different shape, so this container keeps its own instance. Live: ${live}. This container: ${own}.`,
			),
			{ code: 'MARKLESS_SHARED_SHAPE_MISMATCH', definitionId: definition.id },
		),
	);
}

// Field names and value types, recursively; array items are not compared.
function shapeOf(value: unknown): string {
	if (value === null) return 'null';
	if (Array.isArray(value)) return 'array';
	if (typeof value !== 'object') return typeof value;
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null)
		return Object.prototype.toString.call(value);
	const record = value as Record<string, unknown>;
	return `{${Object.keys(record)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${shapeOf(record[key])}`)
		.join(',')}}`;
}

// Plain data compares by structure; any other object only by identity.
function sameValue(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) return true;
	if (!isPlain(left) || !isPlain(right) || Array.isArray(left) !== Array.isArray(right))
		return false;
	const leftKeys = Object.keys(left);
	const rightRecord = right as Record<string, unknown>;
	return (
		leftKeys.length === Object.keys(right).length &&
		leftKeys.every(
			(key) =>
				Object.hasOwn(rightRecord, key) &&
				sameValue((left as Record<string, unknown>)[key], rightRecord[key]),
		)
	);
}

function isPlain(value: unknown): value is object {
	if (typeof value !== 'object' || !value) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === Array.prototype || prototype === null;
}

export function cloneValue<T>(value: T): T {
	try {
		return structuredClone(value);
	} catch {
		return value;
	}
}

// A CSR root may still sit in a template's inert document; the instance belongs to the page's.
function placesOf(root: object): Places {
	return {
		document: (globalThis as { readonly document?: object }).document ?? (root as Host).ownerDocument,
		container: root,
	};
}

