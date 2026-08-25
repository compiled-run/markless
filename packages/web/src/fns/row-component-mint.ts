import type { ProtocolStatePayload, ProtocolViewPayload } from '@markless/serializer';
import type { RuntimeGraph } from '@markless/runtime';
import type { SerializedGraphPayload } from '../../../serializer/src/value-decode-client.ts';
import type { PrerenderDataSurface } from '../prerender/evaluator.ts';
import type { ArmRegistrationDeps } from '../resume-commit-arm.ts';
import { readKeyedRepeatCollection } from '../resume-keyed-repeats.ts';
import { mintRow as mintTemplateRow, renderEmptyArm } from './row-mint.ts';
import type {
	ResumeArmRecordSet,
	ResumeAsyncBoundaryRecord,
	ResumeDomElement,
	ResumeDomNode,
	ResumeKeyedRepeatRecord,
} from '../resume-types.ts';

/**
 * The row a resumed client builds when the row IS a component.
 *
 * A component row has a graph, not a template: one instance per rendered row, so
 * no markup the payload could carry would finish it. The record names the edge
 * and the component instead, and this module runs the same one-edge render the
 * server ran, then registers what came back through the born-late arm registrar.
 *
 * It stands in for `fns/row-mint` on a page that has a component row - same
 * `__marklessRowMint` global, same two node-building entry points, plus the
 * async pair the repeat runtime calls around its apply. That keeps the repeat
 * runtime's own module free of every byte of this, which the shipped-byte budget
 * for a page with no component row measures.
 */

/** The runtime's own registrar, handed to the loader positionally by the repeat runtime. */
export type RowComponentMintHost = {
	readonly runtimeInput: { readonly loadSymbol: (symbolId: string) => unknown };
	readonly armRegistrationDeps: (records: ResumeArmRecordSet) => Promise<ArmRegistrationDeps>;
	readonly installArmEventType: (eventType: string) => void;
};

export type MintedRow = {
	readonly rowRoot: ResumeDomElement;
	readonly nodes: ReadonlyArray<ResumeDomNode>;
	readonly commit: () => Promise<void>;
};

export type RowComponentMintApi = {
	readonly renderEmptyArm: typeof renderEmptyArm;
	mintRow(
		parent: ResumeDomElement,
		repeat: ResumeKeyedRepeatRecord,
		item: unknown,
	): ResumeDomElement | undefined;
	/**
	 * Renders every unserved key's row before the apply that places rows runs, and
	 * answers with the registration that has to follow attachment - a row's hosts
	 * resolve only once it is where the page census counts it.
	 */
	rows(
		repeat: ResumeKeyedRepeatRecord,
		parent: ResumeDomElement,
		served: ReadonlyMap<unknown, ResumeDomElement>,
	): Promise<() => Promise<void>>;
};

export function marklessRowComponentMint(
	surface: PrerenderDataSurface,
	graph?: RuntimeGraph,
	host?: RowComponentMintHost,
): RowComponentMintApi {
	let prepared = new Map<unknown, MintedRow>();
	return {
		renderEmptyArm,
		mintRow(parent, repeat, item) {
			if (!repeat.rowComponent) return mintTemplateRow(parent, repeat, item);
			return prepared.get(rowKeyOf(item, repeat))?.rowRoot;
		},
		async rows(repeat, parent, served) {
			prepared = new Map();
			if (repeat.rowComponent && graph && host)
				for (const [rowIndex, item] of readKeyedRepeatCollection(graph, repeat).entries()) {
					const rowKey = rowKeyOf(item, repeat);
					if (served.has(rowKey) || prepared.has(rowKey)) continue;
					prepared.set(
						rowKey,
						await mintComponentRow({
							surface,
							parent,
							repeat,
							item,
							rowKey,
							rowIndex,
							graph,
							loadSymbol: host.runtimeInput.loadSymbol,
							registration: host,
						}),
					);
				}
			const minted = [...prepared.values()];
			return async () => {
				prepared = new Map();
				for (const row of minted) await row.commit();
			};
		},
	};
}

function rowKeyOf(item: unknown, repeat: ResumeKeyedRepeatRecord): unknown {
	let cursor = item as Record<string, unknown> | null | undefined;
	for (const key of repeat.keyPath) {
		if (cursor == null) return undefined;
		cursor = cursor[key] as Record<string, unknown> | null | undefined;
	}
	return cursor;
}

type RowRegistration = RowComponentMintHost;

async function mintComponentRow(input: {
	readonly surface: PrerenderDataSurface;
	readonly parent: ResumeDomElement;
	readonly repeat: ResumeKeyedRepeatRecord;
	readonly item: unknown;
	readonly rowKey: unknown;
	readonly rowIndex: number;
	readonly graph: RuntimeGraph;
	readonly loadSymbol: (symbolId: string) => unknown;
	readonly registration: RowRegistration;
}): Promise<MintedRow> {
	const rowComponent = input.repeat.rowComponent!;
	// Loaded here, not named at the top: this module is the demand gate, and a
	// static edge would put the evaluator's closure inside every page that has one.
	const { renderRepeatRowComponent } = await import('../prerender/evaluator.ts');
	const rendered = await renderRepeatRowComponent({
		surface: input.surface,
		ownerComponentName: rowComponent.componentName,
		componentEdgeId: rowComponent.componentEdgeId,
		itemPropName: rowComponent.itemPropName,
		item: input.item,
		rowKey: input.rowKey,
		rowIndex: input.rowIndex,
		loadSymbol: input.loadSymbol,
		read: (graphNodeId, path = []) => input.graph.read(graphNodeId, path),
		idPrefix: ownerIdPrefix(input.surface, rowComponent.componentName, input.repeat),
	});
	const nodes = parseRowNodes(input.parent, input.repeat, rendered.html);
	const rowRoot = nodes.find((node) => node.nodeType === 1) as ResumeDomElement | undefined;
	if (!rowRoot)
		throw rowComponentError(
			input.repeat,
			'MARKLESS_REPEAT_ROW_COMPONENT_EMPTY',
			'built no row from its component, and half a row is worse than none.',
		);
	assertMintableRowRecords(input.repeat, rendered.view);
	const elementsByHostId = resolveRowHosts(input.repeat, nodes, rendered.view);
	return {
		rowRoot,
		nodes,
		commit: () => commitMintedRow(input.registration, rendered, elementsByHostId),
	};
}

// Registration reads the same seven record kinds a settled arm does, so it goes
// through the one registrar rather than a second spelling of it.
async function commitMintedRow(
	registration: RowRegistration,
	rendered: { readonly state: ProtocolStatePayload; readonly view: ProtocolViewPayload },
	elementsByHostId: ReadonlyMap<string, ResumeDomElement>,
): Promise<void> {
	const armRecords: ResumeArmRecordSet = {
		locators: [],
		events: rendered.view.events as ResumeArmRecordSet['events'],
		domUpdates: rendered.view.domUpdates as ResumeArmRecordSet['domUpdates'],
		behaviors: rendered.view.behaviors as ResumeArmRecordSet['behaviors'],
		elementHandles: rendered.view.elementHandles as ResumeArmRecordSet['elementHandles'],
		...(rendered.view.keyedRepeats?.length
			? { keyedRepeats: rendered.view.keyedRepeats as ResumeArmRecordSet['keyedRepeats'] }
			: {}),
	};
	const deps = await registration.armRegistrationDeps(armRecords);
	await seedMintedGraphNodes(deps, rendered.state);
	const { registerArmRecordSet } = await import('../resume-commit-arm.ts');
	await registerArmRecordSet(deps, registration.installArmEventType, mintedRowBoundary(), {
		armRecords,
		elementsByHostId,
		computed: rendered.state.computed,
	});
}

/**
 * The row's own cells, written into the live graph before anything reads them.
 *
 * Node ids are already instance-qualified by composition, so a second row of the
 * same component writes different nodes - which is what keeps two minted rows
 * independent without any declare() on the graph.
 */
async function seedMintedGraphNodes(
	deps: ArmRegistrationDeps,
	state: ProtocolStatePayload,
): Promise<void> {
	const graph = deps.graph;
	if (!graph) throw new Error('Markless minted row registration has no graph to write into.');
	for (const cell of state.cells) {
		const direct = (cell as { readonly directValue?: unknown }).directValue;
		graph.write({
			graphNodeId: cell.graphNodeId,
			value:
				direct !== undefined
					? direct
					: cell.value === undefined
						? undefined
						: await deserializeGraphValue(cell.value as SerializedGraphPayload),
		});
		// Debug builds refuse a DOM update against a graph node the registration
		// census never heard of, and a minted row's nodes are born after it.
		deps.graphNodeIds?.add?.(cell.graphNodeId);
	}
	for (const computed of state.computed) deps.graphNodeIds?.add?.(computed.graphNodeId);
}

let valueDecoderPromise:
	| Promise<typeof import('../../../serializer/src/value-decode-client.ts')>
	| undefined;
async function deserializeGraphValue(payload: SerializedGraphPayload): Promise<unknown> {
	valueDecoderPromise ??= import('../../../serializer/src/value-decode-client.ts');
	return (await valueDecoderPromise).deserializeGraphValueForClient(payload);
}

/**
 * The owner's own id prefix, recovered from the parent host the record names.
 *
 * A repeat whose owner is the page root has none; one owned by a composed child
 * carries that child's prefix on every host it declares, and the record's
 * `parentHostNodeId` is the same host spelled in page space.
 */
function ownerIdPrefix(
	surface: PrerenderDataSurface,
	componentName: string,
	repeat: ResumeKeyedRepeatRecord,
): string {
	let longest = '';
	for (const hostNodeId of surface.components[componentName]?.hostNodeIds ?? []) {
		if (hostNodeId.length <= longest.length) continue;
		if (repeat.parentHostNodeId.endsWith(hostNodeId)) longest = hostNodeId;
	}
	return longest ? repeat.parentHostNodeId.slice(0, -longest.length) : '';
}

function parseRowNodes(
	parent: ResumeDomElement,
	repeat: ResumeKeyedRepeatRecord,
	html: string,
): ReadonlyArray<ResumeDomNode> {
	const template = parent.ownerDocument?.createElement?.('template');
	if (!template)
		throw rowComponentError(
			repeat,
			'MARKLESS_REPEAT_ROW_COMPONENT_RENDERER_MISSING',
			'has no document to build a component row with.',
		);
	template.innerHTML = html;
	return Array.from(template.content?.childNodes ?? []) as ReadonlyArray<ResumeDomNode>;
}

/**
 * The minted row's hosts, by the dom-order index each locator was rendered at.
 *
 * The row's records come out of the row's OWN render, so the indexes count the
 * row's elements from its root - not the page's, which the row has not joined
 * yet when this runs.
 */
function resolveRowHosts(
	repeat: ResumeKeyedRepeatRecord,
	nodes: ReadonlyArray<ResumeDomNode>,
	view: ProtocolViewPayload,
): ReadonlyMap<string, ResumeDomElement> {
	const elements: ResumeDomElement[] = [];
	(function visit(list: ReadonlyArray<ResumeDomNode>): void {
		for (const node of list) {
			if (node.nodeType === 1) elements.push(node as ResumeDomElement);
			visit(node.childNodes ?? []);
		}
	})(nodes);
	const byHostId = new Map<string, ResumeDomElement>();
	for (const locator of view.locators) {
		const element = elements[locator.index];
		if (!element)
			throw rowComponentError(
				repeat,
				'MARKLESS_REPEAT_ROW_COMPONENT_LOCATOR_MISSING',
				`built a row with no element at dom-order index ${locator.index} for host ${locator.hostNodeId}.`,
			);
		const expected = locator.tagName.toLowerCase();
		if (expected !== '*' && (element.tagName ?? '').toLowerCase() !== expected)
			throw rowComponentError(
				repeat,
				'MARKLESS_REPEAT_ROW_COMPONENT_LOCATOR_MISMATCH',
				`expected <${expected}> at dom-order index ${locator.index} and built <${(element.tagName ?? '').toLowerCase()}>.`,
			);
		byHostId.set(locator.hostNodeId, element);
	}
	return byHostId;
}

// A branch or async boundary inside a minted row anchors on comments the page
// census never counted, so registering it would be registering half a row.
function assertMintableRowRecords(
	repeat: ResumeKeyedRepeatRecord,
	view: ProtocolViewPayload,
): void {
	const unsupported = view.branches?.length
		? '@if'
		: view.asyncBoundaries.length
			? '@try'
			: undefined;
	if (!unsupported) return;
	throw rowComponentError(
		repeat,
		'MARKLESS_REPEAT_ROW_COMPONENT_UNSUPPORTED',
		`builds a row containing ${unsupported}, which a minted row cannot register yet.`,
	);
}

// A minted row is not an arm, and the registrar reaches these only through the
// branch census - which a phase-1 component row has no anchors for.
function mintedRowBoundary(): ResumeAsyncBoundaryRecord {
	return { id: 'markless-row-component-mint' } as unknown as ResumeAsyncBoundaryRecord;
}

function rowComponentError(
	repeat: ResumeKeyedRepeatRecord,
	code: string,
	detail: string,
): Error {
	const error = new Error(`${code}: ${repeat.id} ${detail}`) as Error & Record<string, unknown>;
	error.name = 'KeyedRepeatRuntimeError';
	error.code = code;
	error.severity = 'error';
	error.phase = 'runtime';
	error.repeatId = repeat.id;
	error.docsUrl = `https://markless.dev/errors/${code}`;
	return error;
}
