import type { ProtocolStatePayload, ProtocolViewPayload } from '@markless/serializer';
import type { SerializedGraphPayload } from '../../../serializer/src/value-decode-client.ts';
import type { PrerenderDataSurface } from '../prerender/evaluator.ts';
import type { ArmRegistrationDeps } from '../resume-commit-arm.ts';
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
 * It is reached only through the loader the app's own resume module writes into
 * `__marklessRowComponentMint`, because that loader is also the only place the
 * page's render-data surface can be named - the bridge cannot import it.
 */

export type RowComponentMintDeps = {
	readonly deps: (records: ResumeArmRecordSet) => Promise<ArmRegistrationDeps>;
	readonly installEventType: (eventType: string) => void;
};

export type MintedRowCommit = () => Promise<void>;

export type MintedRow = {
	readonly rowRoot: ResumeDomElement;
	readonly nodes: ReadonlyArray<ResumeDomNode>;
	readonly commit: MintedRowCommit;
};

export type RowComponentMintApi = {
	mintRow(input: {
		readonly parent: ResumeDomElement;
		readonly repeat: ResumeKeyedRepeatRecord;
		readonly item: unknown;
		readonly rowKey: unknown;
		readonly rowIndex: number;
		readonly graph: import('@markless/runtime').RuntimeGraph;
		readonly loadSymbol: (symbolId: string) => unknown | Promise<unknown>;
		readonly registration: RowComponentMintDeps;
	}): Promise<MintedRow>;
};

export function marklessRowComponentMint(surface: PrerenderDataSurface): RowComponentMintApi {
	return {
		async mintRow(input) {
			const rowComponent = input.repeat.rowComponent;
			if (!rowComponent)
				throw rowComponentError(
					input.repeat,
					'MARKLESS_REPEAT_ROW_COMPONENT_MISSING',
					'was asked to build a component row without naming one.',
				);
			// The evaluator and the arm registrar are loaded here, not named at the
			// top: this module is itself the demand gate, and a static edge to either
			// would put both closures inside it for every page that has one.
			const { renderRepeatRowComponent } = await import('../prerender/evaluator.ts');
			const rendered = await renderRepeatRowComponent({
				surface,
				ownerComponentName: rowComponent.componentName,
				componentEdgeId: rowComponent.componentEdgeId,
				itemPropName: rowComponent.itemPropName,
				item: input.item,
				rowKey: input.rowKey,
				rowIndex: input.rowIndex,
				loadSymbol: input.loadSymbol,
				read: (graphNodeId, path = []) => input.graph.read(graphNodeId, path),
				idPrefix: ownerIdPrefix(surface, rowComponent.componentName, input.repeat),
			});
			const nodes = parseRowNodes(input.parent, input.repeat, rendered.html);
			const rowRoot = nodes.find((node) => node.nodeType === 1) as
				| ResumeDomElement
				| undefined;
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
		},
	};
}

// Registration reads the same seven record kinds a settled arm does, so it goes
// through the one registrar rather than a second spelling of it.
async function commitMintedRow(
	registration: RowComponentMintDeps,
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
	const deps = await registration.deps(armRecords);
	await seedMintedGraphNodes(deps, rendered.state);
	const { registerArmRecordSet } = await import('../resume-commit-arm.ts');
	await registerArmRecordSet(
		deps,
		registration.installEventType,
		mintedRowBoundary(),
		{ armRecords, elementsByHostId, computed: rendered.state.computed },
	);
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
