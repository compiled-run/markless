// Settle kernel: renders ONE async boundary's settled arm from the arm's own
// chunk subgraph, without evaluating the whole render-data surface. It is the
// narrow twin of the prerender evaluator's settle path and must produce the
// SAME arm records the full evaluation produces for the same settled value,
// because resume's commitArm consumes those records positionally.
//
// Constraints (T002 ruling section 3, S2 re-cut):
//   - no imports of the runtime, the reactive graph, or the protocol package;
//   - data reaches the DOM through textContent/setAttribute only, never a
//     markup-parsing sink, because feed values are server-controlled strings;
//   - anything it cannot express exactly throws SettleKernelUnsupportedError so
//     the caller falls back to the full evaluation. Never half-render.
import { marklessAttributeValue } from './dom-attribute.ts';
import type { SsrDataChunk, SsrDataResidue, SsrDataSlot } from './ssr-data/renderer.ts';

export const SETTLE_KERNEL_UNSUPPORTED = 'MARKLESS_SETTLE_KERNEL_UNSUPPORTED';

export class SettleKernelUnsupportedError extends Error {
	readonly code = SETTLE_KERNEL_UNSUPPORTED;
	constructor(reason: string) {
		super(`${SETTLE_KERNEL_UNSUPPORTED}: ${reason}`);
		this.name = 'SettleKernelUnsupportedError';
	}
}

export function isSettleKernelUnsupported(error: unknown): boolean {
	return (
		!!error &&
		typeof error === 'object' &&
		(error as { readonly code?: unknown }).code === SETTLE_KERNEL_UNSUPPORTED
	);
}

type RecordLike = Record<string, unknown>;
type LocatorRecord = RecordLike & { readonly hostNodeId: string };
type HostedRecord = RecordLike & { readonly hostNodeId: string };

type ViewLike = {
	readonly locators?: ReadonlyArray<LocatorRecord>;
	readonly events?: ReadonlyArray<HostedRecord>;
	readonly domUpdates?: ReadonlyArray<HostedRecord>;
	readonly behaviors?: ReadonlyArray<HostedRecord>;
	readonly elementHandles?: ReadonlyArray<HostedRecord>;
	readonly keyedRepeats?: ReadonlyArray<RecordLike & { readonly parentHostNodeId: string }>;
	readonly asyncBoundaries?: ReadonlyArray<{
		readonly id: string;
		readonly armRecords?: unknown;
	}>;
};

type ComponentLike = {
	readonly state: { readonly cells?: ReadonlyArray<RecordLike>; readonly computed?: ReadonlyArray<RecordLike> };
	readonly view: ViewLike;
	readonly rootChunkId: string;
	readonly stateGraphNodeIds?: ReadonlyArray<string>;
	readonly stateComputedIndexes?: ReadonlyArray<number>;
	readonly initialValues?: ReadonlyArray<{
		readonly graphNodeId: string;
		readonly value: { readonly kind: string; readonly value?: unknown };
	}>;
	readonly boundaries?: ReadonlyArray<{
		readonly boundaryId: string;
		readonly runnerGraphNodeId: string | null;
		readonly armChunkIds: Readonly<{ readonly try: string; readonly pending?: string; readonly catch?: string }>;
	}>;
	readonly edges?: ReadonlyArray<{
		readonly id: string;
		readonly hostPrefix: string;
		readonly materialized?: {
			readonly html: string;
			readonly elementCount?: number;
			readonly structureTokens?: ReadonlyArray<RecordLike>;
			readonly view?: ViewLike;
			readonly state?: RecordLike;
			/** Hole-bearing child template: html carries an anchor per hole. */
			readonly holes?: ReadonlyArray<MaterializedHole>;
		};
	}>;
	readonly propCellId?: string | null;
};

type SurfaceLike = {
	readonly rootComponentName: string | null;
	readonly renderData: {
		readonly chunks: ReadonlyArray<SsrDataChunk>;
		readonly repeats?: ReadonlyArray<{
			readonly repeatId: string;
			readonly collectionGraphNodeId?: string;
			readonly collectionPath?: ReadonlyArray<string>;
		}>;
	};
	readonly components: Readonly<Record<string, ComponentLike>>;
	readonly imports?: Readonly<Record<string, unknown>>;
};

export type SettleKernelRead = (graphNodeId: string, path?: ReadonlyArray<string>) => unknown;

/**
 * One data-derived position in a materialized child template. A child whose
 * markup depends on settled data must ship holes, never the value it happened
 * to have at build time — a verbatim template entombs a stale value the graph
 * would later disagree with. `from` is either a value path or a reference to a
 * compiled derive symbol; the kernel never evaluates an expression itself.
 */
export type MaterializedHole = {
	readonly coordinate: number;
	readonly kind: 'text' | 'attribute';
	readonly name?: string;
	readonly from:
		| ReadonlyArray<string>
		| {
				readonly symbolId: string;
				readonly args?: ReadonlyArray<{
					readonly node: string;
					readonly path: ReadonlyArray<string>;
				}>;
		  };
};

export type SettleKernelInput = {
	readonly surface: SurfaceLike;
	readonly boundaryId: string;
	readonly status: 'fulfilled' | 'rejected';
	/** Settled-value reader. The caller owns the graph; the kernel never imports one. */
	readonly read: SettleKernelRead;
	/** Protocol snapshot encoder, injected so the kernel stays protocol-free. */
	readonly serializeComputed?: (computed: ReadonlyArray<RecordLike>) => ReadonlyArray<RecordLike>;
	/**
	 * Resolves one materialized-child hole. Injected because a derived hole is a
	 * reference to a COMPILED symbol: the caller owns symbol loading, the kernel
	 * only places the result.
	 */
	readonly fillHole?: (hole: MaterializedHole, read: SettleKernelRead) => unknown;
};

export type SettleKernelOutput = {
	readonly html: string;
	readonly armRecords: RecordLike;
	readonly computed: ReadonlyArray<RecordLike>;
	/** Ordered host occurrences of the rendered arm, first occurrence per id first. */
	readonly nodes: ReadonlyArray<{ readonly hostNodeId: string; readonly tagName: string; readonly index: number }>;
};

const SUPPORTED_SLOT_KINDS = new Set(['text', 'attribute', 'repeat', 'child-component']);

export function renderSettledArm(input: SettleKernelInput): SettleKernelOutput {
	const surface = input.surface;
	const componentName = surface.rootComponentName;
	if (!componentName) throw new SettleKernelUnsupportedError('surface has no root component');
	const definition = surface.components?.[componentName];
	if (!definition) throw new SettleKernelUnsupportedError(`component missing: ${componentName}`);
	if (definition.propCellId) throw new SettleKernelUnsupportedError('root component takes props');
	for (const initial of definition.initialValues ?? [])
		if (initial.value?.kind !== 'constant')
			throw new SettleKernelUnsupportedError(`initial value needs a symbol loader: ${initial.graphNodeId}`);

	const boundary = (definition.boundaries ?? []).find(
		(candidate) => candidate.boundaryId === input.boundaryId,
	);
	if (!boundary) throw new SettleKernelUnsupportedError(`boundary missing: ${input.boundaryId}`);
	const armChunkId =
		input.status === 'rejected' ? boundary.armChunkIds.catch : boundary.armChunkIds.try;
	if (!armChunkId) throw new SettleKernelUnsupportedError(`arm missing: ${input.boundaryId}`);

	const chunks = new Map(surface.renderData.chunks.map((chunk) => [chunk.id, chunk]));
	const constants = new Map<string, unknown>();
	for (const initial of definition.initialValues ?? [])
		constants.set(initial.graphNodeId, initial.value.value);
	const read: SettleKernelRead = (graphNodeId, path = []) =>
		constants.has(graphNodeId)
			? readPath(constants.get(graphNodeId), path)
			: input.read(graphNodeId, path);

	const hosts: Array<{ readonly hostNodeId: string; readonly tagName: string }> = [];
	const edges = new Map((definition.edges ?? []).map((edge) => [edge.id, edge]));
	const html = renderChunk(armChunkId, undefined);

	const renderedHosts = hosts.map((host, index) => ({ ...host, index }));
	const firstByHostId = new Map<string, { readonly tagName: string; readonly index: number }>();
	const lastByHostId = new Map<string, { readonly tagName: string; readonly index: number }>();
	for (const host of renderedHosts) {
		if (!firstByHostId.has(host.hostNodeId)) firstByHostId.set(host.hostNodeId, host);
		lastByHostId.set(host.hostNodeId, host);
	}

	const view = definition.view ?? {};
	const planned = plannedArmRecords(view, input.boundaryId, input.status);

	// Composed-stream locators keep the LAST rendered occurrence's index (the
	// full path builds a Map over structure.locators, so later rows win);
	// planned-only locators keep the FIRST. Both must be reproduced or a repeat
	// arm's records drift by row count.
	const movedLocators: Array<RecordLike> = [];
	for (const locator of view.locators ?? []) {
		const rendered = lastByHostId.get(locator.hostNodeId);
		if (!rendered) continue;
		movedLocators.push({
			...locator,
			strategy: 'arm-relative',
			index: rendered.index,
			tagName: rendered.tagName,
		});
	}
	movedLocators.sort(
		(left, right) => (left.index as number) - (right.index as number),
	);
	const movedHostIds = new Set(movedLocators.map((locator) => locator.hostNodeId as string));
	const armLocators: Array<RecordLike> = [...movedLocators];
	for (const locator of (planned.locators ?? []) as ReadonlyArray<LocatorRecord>) {
		const rendered = firstByHostId.get(locator.hostNodeId);
		if (!rendered) continue;
		if (movedHostIds.has(locator.hostNodeId)) continue;
		armLocators.push({
			...locator,
			strategy: 'arm-relative',
			index: rendered.index,
			tagName: rendered.tagName,
		});
	}
	armLocators.sort((left, right) => (left.index as number) - (right.index as number));

	const localHostIds = new Set<string>();
	for (const locator of view.locators ?? [])
		if (lastByHostId.has(locator.hostNodeId)) localHostIds.add(locator.hostNodeId);
	for (const locator of (planned.locators ?? []) as ReadonlyArray<LocatorRecord>)
		if (lastByHostId.has(locator.hostNodeId)) localHostIds.add(locator.hostNodeId);

	const moveHosted = (records: ReadonlyArray<HostedRecord> | undefined) =>
		(records ?? []).filter(
			(record) => localHostIds.has(record.hostNodeId) && movedHostIds.has(record.hostNodeId),
		);
	for (const record of [
		...(view.events ?? []),
		...(view.domUpdates ?? []),
	])
		assertUnbound(record);

	const completeArmHostIds = new Set(armLocators.map((locator) => locator.hostNodeId as string));
	const movedKeyedRepeats = (view.keyedRepeats ?? []).filter(
		(repeat) =>
			localHostIds.has(repeat.parentHostNodeId) &&
			completeArmHostIds.has(repeat.parentHostNodeId),
	);
	const keyedRepeats = [
		...((planned.keyedRepeats ?? []) as ReadonlyArray<RecordLike>),
		...movedKeyedRepeats,
	];

	const armRecords: RecordLike = {
		locators: armLocators,
		events: [...((planned.events ?? []) as ReadonlyArray<RecordLike>), ...moveHosted(view.events)],
		domUpdates: [
			...((planned.domUpdates ?? []) as ReadonlyArray<RecordLike>),
			...moveHosted(view.domUpdates),
		],
		behaviors: [
			...((planned.behaviors ?? []) as ReadonlyArray<RecordLike>),
			...moveHosted(view.behaviors),
		],
		elementHandles: [
			...((planned.elementHandles ?? []) as ReadonlyArray<RecordLike>),
			...moveHosted(view.elementHandles),
		],
		...(keyedRepeats.length > 0 ? { keyedRepeats } : {}),
		branches: (planned.branches ?? []) as ReadonlyArray<RecordLike>,
	};

	return {
		html,
		armRecords,
		computed: settledComputed(definition, read, input.serializeComputed),
		nodes: renderedHosts,
	};

	function renderChunk(chunkId: string, item: { readonly value: unknown } | undefined): string {
		const chunk = chunks.get(chunkId);
		if (!chunk) throw new SettleKernelUnsupportedError(`chunk missing: ${chunkId}`);
		const slotsByStatic = new Map<number, SsrDataSlot[]>();
		for (const slot of chunk.slots) {
			if (!SUPPORTED_SLOT_KINDS.has(slot.kind))
				throw new SettleKernelUnsupportedError(`slot kind ${slot.kind} in ${chunkId}`);
			const group = slotsByStatic.get(slot.staticIndex) ?? [];
			group.push(slot);
			slotsByStatic.set(slot.staticIndex, group);
		}

		// The full renderer emits host tokens in coordinate order across hosts and
		// slot-produced elements; reproduce that ordering before recursing.
		const entries = [
			...chunk.hosts.map((host) => ({ path: host.coordinate.path, order: 0, host, slot: undefined })),
			...chunk.slots.map((slot, order) => ({
				path: slot.coordinate.path,
				order: order + 1,
				host: undefined,
				slot,
			})),
		].sort((left, right) => comparePath(left.path, right.path) || left.order - right.order);

		let markup = '';
		const bodies = new Map<SsrDataSlot, string>();
		for (const entry of entries) {
			if (entry.host) {
				hosts.push({ hostNodeId: entry.host.hostNodeId, tagName: entry.host.tagName });
				continue;
			}
			bodies.set(entry.slot!, renderSlot(entry.slot!, item));
		}
		for (let index = 0; index < chunk.statics.length; index++) {
			const slots = slotsByStatic.get(index) ?? [];
			markup += withoutSlotMarker(chunk.statics[index] ?? '', index, slots);
			for (const slot of slots) markup += bodies.get(slot) ?? '';
		}
		return markup;
	}

	function renderSlot(slot: SsrDataSlot, item: { readonly value: unknown } | undefined): string {
		if (slot.kind === 'text') {
			if (slot.raw) throw new SettleKernelUnsupportedError('raw text slot');
			return escapeHtml(readResidue(slot.residue, item));
		}
		if (slot.kind === 'attribute') {
			const value = readResidue(slot.residue, item);
			if (slot.alwaysPresent)
				return escapeHtml(marklessAttributeValue(slot.name, value) ?? '');
			const text = marklessAttributeValue(slot.name, value);
			return text === null ? '' : ` ${slot.name}="${escapeHtml(text)}"`;
		}
		if (slot.kind === 'repeat') {
			const record = (surface.renderData.repeats ?? []).find(
				(candidate) => candidate.repeatId === slot.repeatId,
			);
			if (!record?.collectionGraphNodeId)
				throw new SettleKernelUnsupportedError(`repeat collection missing: ${slot.repeatId}`);
			const items = read(record.collectionGraphNodeId, record.collectionPath ?? []);
			if (!Array.isArray(items) || items.length === 0)
				return slot.emptyTemplateId ? renderChunk(slot.emptyTemplateId, undefined) : '';
			return items.map((value) => renderChunk(slot.rowTemplateId, { value })).join('');
		}
		// child-component: SUPPORTED_SLOT_KINDS already rejected every other kind
		// that reaches renderSlot, so this is the only remaining one.
		const childSlot = slot as Extract<SsrDataSlot, { readonly kind: 'child-component' }>;
		const edge = edges.get(childSlot.componentEdgeId);
		if (!edge?.materialized)
			throw new SettleKernelUnsupportedError(`live child edge: ${childSlot.componentEdgeId}`);
		if (childSlot.projectionChunkId)
			throw new SettleKernelUnsupportedError(`projected child edge: ${childSlot.componentEdgeId}`);
		const childView = edge.materialized.view;
		if (
			(childView?.locators?.length ?? 0) > 0 ||
			(childView?.events?.length ?? 0) > 0 ||
			(childView?.domUpdates?.length ?? 0) > 0 ||
			(childView?.behaviors?.length ?? 0) > 0 ||
			(childView?.elementHandles?.length ?? 0) > 0 ||
			(childView?.asyncBoundaries?.length ?? 0) > 0
		)
			throw new SettleKernelUnsupportedError(`interactive child edge: ${childSlot.componentEdgeId}`);
		const tokens = edge.materialized.structureTokens ?? [];
		for (const token of tokens)
			if (token.kind === 'element')
				hosts.push({
					hostNodeId: edge.hostPrefix + String(token.hostNodeId),
					tagName: String(token.tagName),
				});
		if (tokens.length === 0)
			for (let index = 0; index < (edge.materialized.elementCount ?? 0); index++)
				hosts.push({ hostNodeId: `__child:${childSlot.componentEdgeId}:${index}`, tagName: '*' });
		const holes = edge.materialized.holes ?? [];
		if (holes.length === 0) return edge.materialized.html;
		return fillMaterializedHoles(edge.materialized.html, holes, input.fillHole, read);
	}

	function readResidue(residue: SsrDataResidue, item: { readonly value: unknown } | undefined): unknown {
		if (residue.kind === 'repeat-item') {
			if (!item) throw new SettleKernelUnsupportedError('repeat residue outside a row');
			return readPath(item.value, residue.path);
		}
		if (residue.kind === 'graph-read') return read(residue.graphNodeId, residue.path);
		throw new SettleKernelUnsupportedError(`${residue.kind} residue`);
	}
}

// Data reaches the markup through escaped text and attribute values only —
// never a markup-parsing sink — because settled values are server strings.
function fillMaterializedHoles(
	html: string,
	holes: ReadonlyArray<MaterializedHole>,
	fillHole: SettleKernelInput['fillHole'],
	read: SettleKernelRead,
): string {
	if (!fillHole)
		throw new SettleKernelUnsupportedError('materialized child hole needs a hole filler');
	let filled = html;
	for (const hole of holes) {
		const anchor = `<!--mh:${hole.coordinate}-->`;
		const index = filled.indexOf(anchor);
		if (index < 0)
			throw new SettleKernelUnsupportedError(`materialized hole anchor missing: ${hole.coordinate}`);
		const value = escapeHtml(fillHole(hole, read));
		if (hole.kind === 'text') {
			filled = `${filled.slice(0, index)}${value}${filled.slice(index + anchor.length)}`;
			continue;
		}
		const rest = filled.slice(index + anchor.length);
		const empty = `${hole.name}=""`;
		const at = rest.indexOf(empty);
		const tagEnd = rest.indexOf('>');
		if (!hole.name || at < 0 || (tagEnd >= 0 && at > tagEnd))
			throw new SettleKernelUnsupportedError(
				`materialized attribute hole has no target: ${hole.coordinate}`,
			);
		filled = `${filled.slice(0, index)}${rest.slice(0, at)}${hole.name}="${value}"${rest.slice(at + empty.length)}`;
	}
	return filled;
}

function plannedArmRecords(
	view: ViewLike,
	boundaryId: string,
	status: 'fulfilled' | 'rejected',
): RecordLike {
	const boundary = (view.asyncBoundaries ?? []).find((candidate) => candidate.id === boundaryId);
	const records = boundary?.armRecords;
	if (!Array.isArray(records)) {
		// A composed boundary already carries one armized set; the kernel cannot
		// re-derive it from the arm chunk alone.
		if (records) throw new SettleKernelUnsupportedError(`composed boundary records: ${boundaryId}`);
		return {};
	}
	// Arm order is the protocol's (try, pending, catch); select by name, not by a
	// restated numeric constant.
	const planned = status === 'rejected' ? records[2] : records[0];
	return (planned ?? {}) as RecordLike;
}

function settledComputed(
	definition: ComponentLike,
	read: SettleKernelRead,
	serializeComputed: SettleKernelInput['serializeComputed'],
): ReadonlyArray<RecordLike> {
	const owned = new Set(definition.stateGraphNodeIds ?? []);
	const entries = definition.state.computed ?? [];
	const indexes = definition.stateComputedIndexes;
	// Computed ids collide across a module's components, so the id set cannot
	// partition them; the compiler's indexes are the authoritative answer.
	const partitioned = indexes
		? indexes.flatMap((index) => (entries[index] ? [entries[index]!] : []))
		: entries.filter((entry) => owned.size === 0 || owned.has(String(entry.graphNodeId)));
	const computed = partitioned.map((entry) =>
		entry.async
			? { ...structuredClone(entry), snapshot: read(String(entry.graphNodeId), []) }
			: structuredClone(entry),
	);
	return serializeComputed ? serializeComputed(computed) : computed;
}

function assertUnbound(record: RecordLike): void {
	const symbolIds = Array.isArray(record.symbolIds) ? record.symbolIds : [];
	for (const symbolId of [...symbolIds, record.symbolId])
		if (typeof symbolId === 'string' && symbolId.startsWith('bound:'))
			throw new SettleKernelUnsupportedError(`bound symbol id: ${symbolId}`);
}

function withoutSlotMarker(
	staticText: string,
	staticIndex: number,
	slots: ReadonlyArray<SsrDataSlot>,
): string {
	if (slots.every((slot) => slot.kind === 'attribute')) return staticText;
	const marker = `<!--markless-slot:${staticIndex}-->`;
	return staticText.endsWith(marker) ? staticText.slice(0, -marker.length) : staticText;
}

function comparePath(left: ReadonlyArray<number>, right: ReadonlyArray<number>): number {
	for (let index = 0; index < Math.min(left.length, right.length); index++) {
		const difference = left[index]! - right[index]!;
		if (difference !== 0) return difference;
	}
	return left.length - right.length;
}

function readPath(value: unknown, path: ReadonlyArray<string>): unknown {
	let current = value;
	for (const segment of path) {
		if (current === null || current === undefined) return undefined;
		current = (current as Record<string, unknown>)[segment];
	}
	return current;
}

function escapeHtml(value: unknown): string {
	return (value == null ? '' : String(value))
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}
