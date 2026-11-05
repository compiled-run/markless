// Binds the next page of an in-place navigation, still off screen, to the document's live shared() instances.
import type { ProtocolStatePayload, ProtocolViewPayload } from '@markless/serializer/protocol';
import type { DomJournalResult } from '@markless/runtime';
import { decodePayloadScriptsWithVersion } from '../../serializer/src/protocol-client.ts';
import { applyDirectJournalEntries } from './dom-journal-direct.ts';
import { marklessInstanceScopedLoadSymbol } from './fns/instance-scope.ts';
import { bindDefinitions, cloneValue, moduleHref, sameValue } from './fns/shared-instances.ts';
import { readPayloadScriptsFromDocument } from './payload-document-common.ts';
import {
	decodeServedComputedValues,
	decodeStateCells,
	runtimeModule,
} from './payload-graph-construct.ts';
import { materializeDomLocators } from './resume-locators.ts';
import { wireSyncComputedDemandRecordsWithoutLoadingCapability } from './resume-sync-demand.ts';
import type { ResumeDomElement, ResumeRuntimeInput } from './resume-types.ts';
import {
	hasLiveSharedDefinitions,
	PROTOCOL_SHARED_INSTANCES_PROPERTY,
	type ProtocolSharedInstances,
} from '../../serializer/src/protocol-shared-instances.ts';

import { wakeSharedContainer } from './fns/shared-instances.ts';

export { wakeSharedContainer };

type ResumeEntry = {
	readonly routeModule?: (root: object) => Promise<unknown> | undefined;
	resumeContainerEvent(input: { readonly root: object; readonly event: 0 }): unknown;
};

/**
 * The router's half of an in-place navigation: binds `incoming` (the next page's region, off screen)
 * to the document's live instances; the returned wake starts the page's runtime once it is shown.
 */
export async function bindSharedSwap(input: {
	readonly document: Document;
	readonly outgoing: Element;
	readonly incoming: Element;
	readonly containerAttribute: string;
	readonly resumeAttribute: string;
}): Promise<(() => void) | undefined> {
	const selector = `[${input.containerAttribute}]`;
	const containerOf = (region: Element) =>
		region.hasAttribute(input.containerAttribute) ? region : region.querySelector(selector);
	const container = containerOf(input.outgoing) ?? undefined;
	const root = containerOf(input.incoming) ?? input.incoming;
	const url = input.incoming
		.querySelector(`[${input.resumeAttribute}]`)
		?.getAttribute(input.resumeAttribute);
	// Only an instance a runtime has bound holds values; a page that only listens has none to give.
	const bound = (place: object | undefined) =>
		Object.values(
			(place as Record<string, ProtocolSharedInstances | undefined> | undefined)?.[
				PROTOCOL_SHARED_INSTANCES_PROPERTY
			]?.instances ?? {},
		).some((instance) => instance.shape);
	if (!url || !(bound(input.document) || bound(container))) return undefined;
	const entry = (await import(/* @vite-ignore */ moduleHref(url))) as ResumeEntry;
	const prepared = await prepareSharedSwap({
		root,
		document: input.document,
		container,
		route: await entry.routeModule?.(root),
	});
	return prepared?.wake && container
		? () => container.isConnected && wakeSharedContainer(container, entry)
		: undefined;
}

/**
 * Before an in-place navigation shows `root` (the next page, still off screen), writes every
 * text, attribute and class it derives from a live instance; `wake` says something else reads one.
 */
export async function prepareSharedSwap(input: {
	readonly root: object;
	readonly document: object;
	readonly container?: object;
	// The page's route resume module: its loader is on the namespace, or on an MDX page's default export.
	readonly route: unknown;
}): Promise<{ readonly wake: boolean } | undefined> {
	const route = input.route as
		| { readonly loadSymbol?: unknown; readonly default?: { readonly loadSymbol?: unknown } }
		| undefined;
	const load = route?.loadSymbol ?? route?.default?.loadSymbol;
	if (typeof load !== 'function') return { wake: true };
	const root = input.root as ResumeDomElement;
	let decoded: ReturnType<typeof decodePayloadScriptsWithVersion>;
	try {
		decoded = decodePayloadScriptsWithVersion(
			readPayloadScriptsFromDocument(root as unknown as Parameters<typeof readPayloadScriptsFromDocument>[0]),
			true,
		);
	} catch {
		// A page that ships its records elsewhere (prerender wake, linked render data) binds when its runtime starts.
		return { wake: true };
	}
	const { state, view } = decoded;
	if (!hasLiveSharedDefinitions(state)) return undefined;
	const cells = [...(await decodeStateCells(state)), ...(await decodeServedComputedValues(state))];
	const places = { document: input.document, container: input.container };
	const { bound, differing } = bindDefinitions(places, state, cells, input.container ?? root, false);
	if (differing.size === 0) return undefined;
	const values = new Map<string, unknown>();
	for (const binding of bound)
		for (const id of binding.cellIds)
			if (differing.has(id)) values.set(id, cloneValue(binding.instance.cells[id]));
	const wake = readOutsideValueSlots(state, view, differing);
	const painted = await paintValues({ root, load, state, view, cells, values });
	if (!painted) return { wake: true };
	// A write that landed while this ran is newer than what was painted; the runtime catches up on it.
	const moved = bound.some((binding) =>
		binding.cellIds.some(
			(id) => values.has(id) && !sameValue(binding.instance.cells[id], values.get(id)),
		),
	);
	return { wake: wake || moved || painted.unpainted };
}

/**
 * Writes `values` into a graph of the page `root` holds, off screen, and paints the texts and attributes
 * that derive from them; `read` answers what the graph holds afterwards, `restore` puts back what it painted
 * over. Undefined when it cannot run.
 */
export async function paintValues(input: {
	readonly root: ResumeDomElement;
	readonly load: unknown;
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
	readonly cells: ReadonlyArray<{ readonly graphNodeId: string; readonly value: unknown }>;
	readonly values: ReadonlyMap<string, unknown>;
}): Promise<
	| {
			readonly unpainted: boolean;
			readonly read: (graphNodeId: string) => unknown;
			readonly restore: () => void;
	  }
	| undefined
> {
	const { root, state, view, values } = input;
	const { createRuntimeGraph } = await runtimeModule();
	const loadSymbol = marklessInstanceScopedLoadSymbol(
		input.load as ResumeRuntimeInput['loadSymbol'],
	);
	let elements: Map<string, ResumeDomElement>;
	try {
		elements = materializeDomLocators(root, view.locators);
	} catch {
		return undefined;
	} finally {
		delete (root as { __marklessCensus?: unknown }).__marklessCensus;
	}
	const sync = state.computed.filter((record) => record.async === false);
	const graph = createRuntimeGraph({
		cells: [...input.cells],
		computed: sync.map((record) => ({ ...record, dependencies: record.dependencies ?? [] })),
		sharedDefinitions: state.sharedDefinitions,
	});
	const releases: Array<() => void> = [];
	wireSyncComputedDemandRecordsWithoutLoadingCapability({
		graph,
		computed: sync,
		allComputed: state.computed,
		sharedSeeds: state.sharedSeeds,
		root,
		loadSymbol,
		elementHandles: { get: () => undefined, register() {}, deleteHost() {} },
		storeContainerSubscription: (release) => releases.push(release),
	});
	for (const domUpdate of view.domUpdates) {
		const element = elements.get(domUpdate.hostNodeId);
		if (!domUpdate.symbolId || !element) continue;
		releases.push(
			graph.subscribe({
				id: `swap-paint:${domUpdate.hostNodeId}:${JSON.stringify(domUpdate.target)}:${domUpdate.graphNodeId}:${domUpdate.path.join('.')}`,
				graphNodeId: domUpdate.graphNodeId,
				path: domUpdate.path,
				run: async (value) =>
					(await loadSymbol(domUpdate.symbolId!))({
						graph,
						element,
						getElementHandle: () => undefined,
						domUpdate,
						value,
					}) as DomJournalResult | void,
			}),
		);
	}
	try {
		for (const [graphNodeId, value] of values) graph.write({ graphNodeId, value });
		for (let pass = 0; pass < 8 && (pass === 0 || graph.hasPendingFlush?.()); pass++)
			await graph.flush();
	} catch {
		return undefined;
	} finally {
		for (const release of releases) release();
	}
	const entries = graph.takeJournal();
	const slots = entries.filter((entry) => entry.type === 'setText' || entry.type === 'setAttr');
	const before = new Map<
		Element,
		readonly [Array<readonly [string, string]>, Array<readonly [ChildNode, string | null]>]
	>();
	for (const slot of slots) {
		const element = elements.get(String(slot.locator)) as unknown as Element | undefined;
		if (element && !before.has(element))
			before.set(element, [
				[...element.attributes].map((attribute) => [attribute.name, attribute.value] as const),
				[...element.childNodes].map((node) => [node, node.nodeType === 3 ? (node as Text).data : null]),
			]);
	}
	applyDirectJournalEntries(slots, (locator) => elements.get(locator));
	return {
		unpainted: slots.length !== entries.length,
		read: (graphNodeId) => graph.read(graphNodeId, []),
		restore: () => {
			for (const [element, [attributes, children]] of before) {
				for (const name of element.getAttributeNames()) element.removeAttribute(name);
				for (const [name, value] of attributes) element.setAttribute(name, value);
				for (const [node, data] of children) if (data !== null) (node as Text).data = data;
				element.replaceChildren(...children.map(([node]) => node));
			}
		},
	};
}

// Something other than a value slot reads a changed cell: an arm, a list, an async value or a behaviour.
function readOutsideValueSlots(
	state: ProtocolStatePayload,
	view: ProtocolViewPayload,
	changed: ReadonlySet<string>,
): boolean {
	const affected = new Set(changed);
	for (let grew = true; grew; ) {
		grew = false;
		// A component's seed of a widget field re-runs over props that read a changed cell, as a sync computed does.
		for (const record of [...state.computed, ...(state.sharedSeeds ?? [])])
			if (
				!affected.has(record.graphNodeId) &&
				(record.dependencies ?? []).some((dependency) => affected.has(dependency.graphNodeId))
			) {
				if ((record as { readonly async?: boolean }).async === true) return true;
				affected.add(record.graphNodeId);
				grew = true;
			}
	}
	const { domUpdates: _domUpdates, locators: _locators, events: _events, ...readers } = view;
	const text = JSON.stringify(readers);
	return [...affected].some((id) => text.includes(JSON.stringify(id)));
}
