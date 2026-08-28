import type { ProtocolStatePayload, ProtocolViewPayload } from '@markless/serializer';
import type { RuntimeGraph } from '@markless/runtime';
import type { SerializedGraphPayload } from '../../../serializer/src/value-decode-client.ts';
import type { PrerenderDataSurface } from '../prerender/evaluator.ts';
import {
	marklessIsThenable,
	marklessThen,
	marklessWalk,
	type Awaitable,
} from '../ssr-data/awaitable.ts';
import type { ArmRegistrationDeps } from '../resume-commit-arm.ts';
import { isArmBranchAnchorComment } from '../resume-anchor-census.ts';
import { readKeyedRepeatCollection } from '../resume-keyed-repeats.ts';
import {
	mintRow as mintTemplateRow,
	mintRowNodes,
	nodeAtPath,
	renderEmptyArm,
	type RowMintGraph,
} from './row-mint.ts';
import type {
	ResumeArmBranchRecord,
	ResumeArmRecordSet,
	ResumeAsyncBoundaryRecord,
	ResumeDomComment,
	ResumeDomElement,
	ResumeDomNode,
	ResumeKeyedRepeatRecord,
	ResumeRenderDataThunk,
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
 *
 * The page it renders against arrives per CONTAINER, from the runtime input,
 * never off the global: two page modules in one document write the same loader,
 * so a page named there would be whichever module evaluated last.
 */

/** The runtime's own registrar, handed to the loader positionally by the repeat runtime. */
export type RowComponentMintHost = {
	readonly runtimeInput: { readonly loadSymbol: (symbolId: string) => unknown };
	readonly armRegistrationDeps: (records: ResumeArmRecordSet) => Promise<ArmRegistrationDeps>;
	readonly installArmEventType: (eventType: string) => void;
	/** The page's live host census, read to place the repeat inside a rendered widget. */
	readonly elementsByHostId?: ReadonlyMap<string, ResumeDomElement>;
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
		graph?: RowMintGraph,
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
	): Awaitable<() => Promise<void>>;
};

export function marklessRowComponentMint(
	renderData: ResumeRenderDataThunk | undefined,
	graph?: RuntimeGraph,
	host?: RowComponentMintHost,
): RowComponentMintApi {
	let prepared = new Map<unknown, MintedRow>();
	// Rows built but not yet registered. A repeat asked to build twice before the
	// flush behind it runs - a second write in one statement - must not drop the
	// first batch's registration on the floor.
	let awaitingCommit: MintedRow[] = [];
	let surface: PrerenderDataSurface | undefined;
	let surfacePromise: Promise<PrerenderDataSurface> | undefined;
	const primeSurface = (): void => {
		if (!renderData || surface || surfacePromise) return;
		const answered = renderData();
		if (!marklessIsThenable(answered)) {
			surface = answered;
			return;
		}
		surfacePromise = answered.then((loaded) => (surface = loaded));
		void surfacePromise.catch(() => undefined);
	};
	// The page is threaded in per container, so a record naming a component with
	// no page behind it cannot be rendered at all - and a half-built list is
	// worse than a loud refusal.
	const pageSurface = (repeat: ResumeKeyedRepeatRecord): Awaitable<PrerenderDataSurface> => {
		if (!renderData)
			throw rowComponentError(
				repeat,
				'MARKLESS_REPEAT_ROW_COMPONENT_SURFACE_MISSING',
				'names a component row, but this container was resumed with no render-data surface to render it against.',
			);
		primeSurface();
		return surface ?? surfacePromise!;
	};
	// A gesture is not the place to fetch: this module is loaded when the repeat
	// wires, so what its first render needs is fetched from here, not from the
	// write that needs it settled.
	primeSurface();
	void Promise.resolve(loadEvaluator()).catch(() => undefined);
	void Promise.resolve(loadInstanceScope()).catch(() => undefined);
	return {
		renderEmptyArm,
		mintRow(parent, repeat, item, rowMintGraph) {
			if (!repeat.rowComponent)
				return mintTemplateRow(parent, repeat, item, rowMintGraph ?? graph);
			return prepared.get(rowKeyOf(item, repeat))?.rowRoot;
		},
		rows(repeat, parent, served) {
			// A refusal answers as a rejection, the shape every caller already has;
			// only a warm build skips the wait.
			try {
				prepared = new Map();
				const rowGraph = graph,
					rowHost = host;
				const built =
					repeat.rowComponent && rowGraph && rowHost
						? marklessThen(pageSurface(repeat), (pageSurfaceValue) =>
								marklessThen(
									enclosingWidgetsFor(
										rowGraph,
										repeat,
										parent,
										rowHost.elementsByHostId,
									),
									(enclosing) => {
										const items = readKeyedRepeatCollection(rowGraph, repeat);
										return marklessWalk(items.length, (rowIndex) => {
											const item = items[rowIndex];
											const rowKey = rowKeyOf(item, repeat);
											if (served.has(rowKey) || prepared.has(rowKey))
												return undefined;
											return marklessThen(
												mintComponentRow({
													surface: pageSurfaceValue,
													parent,
													repeat,
													item,
													rowKey,
													rowIndex,
													graph: rowGraph,
													enclosing,
													loadSymbol: settledSymbol(
														rowHost.runtimeInput.loadSymbol,
													),
													registration: rowHost,
												}),
												(row) => {
													prepared.set(rowKey, row);
												},
											);
										});
									},
								),
							)
						: undefined;
				return marklessThen(built, () => {
					awaitingCommit = [...awaitingCommit, ...prepared.values()];
					return async () => {
						prepared = new Map();
						const settling = awaitingCommit;
						awaitingCommit = [];
						for (const row of settling) await row.commit();
					};
				});
			} catch (error) {
				return Promise.reject(error);
			}
		},
	};
}

/**
 * The page's symbol loader, holding what it has already answered.
 *
 * The app's emitted loader hands back a promise per call, so a symbol this
 * document fetched long ago still costs the row a statement. Holding the settled
 * value means only the FIRST row that needs a symbol waits for it; the rows and
 * the gestures behind it read it where they stand. Per loader, because two page
 * modules in one document each resolve their own symbol ids.
 */
const settledSymbols = new WeakMap<object, Map<string, unknown>>();
function settledSymbol(load: (symbolId: string) => unknown): (symbolId: string) => unknown {
	let held = settledSymbols.get(load);
	if (!held) settledSymbols.set(load, (held = new Map()));
	const settled = held;
	return (symbolId) => {
		if (settled.has(symbolId)) return settled.get(symbolId);
		const answered = load(symbolId);
		if (!marklessIsThenable(answered as never)) {
			settled.set(symbolId, answered);
			return answered;
		}
		return (answered as Promise<unknown>).then((symbol) => {
			settled.set(symbolId, symbol);
			return symbol;
		});
	};
}

type EvaluatorModule = typeof import('../prerender/evaluator.ts');
type InstanceScopeModule = typeof import('./instance-scope.ts');
// Held once loaded: a settled dynamic import still yields the statement a row
// built at the write does not have.
let evaluatorModule: EvaluatorModule | undefined;
let evaluatorLoad: Promise<EvaluatorModule> | undefined;
let instanceScopeModule: InstanceScopeModule | undefined;
let instanceScopeLoad: Promise<InstanceScopeModule> | undefined;

// Loaded here, not named at the top: this module is the demand gate, and a
// static edge would put the evaluator's closure inside every page that has one.
function loadEvaluator(): Awaitable<EvaluatorModule> {
	return (
		evaluatorModule ??
		(evaluatorLoad ??= import('../prerender/evaluator.ts').then(
			(module) => (evaluatorModule = module),
		))
	);
}

function loadInstanceScope(): Awaitable<InstanceScopeModule> {
	return (
		instanceScopeModule ??
		(instanceScopeLoad ??= import('./instance-scope.ts').then(
			(module) => (instanceScopeModule = module),
		))
	);
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

function mintComponentRow(input: {
	readonly surface: PrerenderDataSurface;
	readonly parent: ResumeDomElement;
	readonly repeat: ResumeKeyedRepeatRecord;
	readonly item: unknown;
	readonly rowKey: unknown;
	readonly rowIndex: number;
	readonly graph: RuntimeGraph;
	readonly enclosing: EnclosingWidgets;
	readonly loadSymbol: (symbolId: string) => unknown;
	readonly registration: RowRegistration;
}): Awaitable<MintedRow> {
	const rowComponent = input.repeat.rowComponent!;
	return marklessThen(loadEvaluator(), ({ renderRepeatRowComponent, rowSegmentOf }) => {
		const rowSegment = rowSegmentOf({
			rowKey: input.rowKey,
			enclosingInstancePath: input.enclosing.instancePath,
		});
		return marklessThen(
			renderRepeatRowComponent({
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
				enclosingWidgetRoots: input.enclosing.roots,
				enclosingInstancePath: input.enclosing.instancePath,
			}),
			(rendered) => placeMintedRow(input, rowComponent, rowSegment, rendered),
		);
	});
}

function placeMintedRow(
	input: {
		readonly parent: ResumeDomElement;
		readonly repeat: ResumeKeyedRepeatRecord;
		readonly item: unknown;
		readonly rowKey: unknown;
		readonly graph: RuntimeGraph;
		readonly registration: RowRegistration;
	},
	rowComponent: NonNullable<ResumeKeyedRepeatRecord['rowComponent']>,
	rowSegment: string,
	rendered: {
		readonly html: string;
		readonly state: ProtocolStatePayload;
		readonly view: ProtocolViewPayload;
	},
): MintedRow {
	assertRowWidgetsResolved(input.repeat, rendered.state);
	const childNodes = parseRowNodes(input.parent, input.repeat, rendered.html);
	assertMintableRowRecords(input.repeat, rendered.view);
	// The child's locators and branch anchors index its OWN fragment, so they
	// resolve against the child's nodes whether or not a wrapper holds them.
	const elementsByHostId = resolveRowHosts(input.repeat, childNodes, rendered.view);
	const branches = resolveRowBranches(input.repeat, childNodes, rendered.view);
	const placed = rowComponent.slotPath
		? placeInWrapper(input, childNodes, rowComponent.slotPath)
		: { nodes: childNodes, rowRoot: childNodes.find((node) => node.nodeType === 1) };
	const rowRoot = placed.rowRoot as ResumeDomElement | undefined;
	if (!rowRoot)
		throw rowComponentError(
			input.repeat,
			'MARKLESS_REPEAT_ROW_COMPONENT_EMPTY',
			'built no row from its component, and half a row is worse than none.',
		);
	return {
		rowRoot,
		nodes: placed.nodes,
		commit: () =>
			commitMintedRow(input.registration, rendered, elementsByHostId, input.repeat, {
				branches,
				rowKey: input.rowKey,
				rowSegment,
			}),
	};
}

/**
 * The row element the author wrapped the component in, minted and filled.
 *
 * The wrapper is markup the record already carries, so it goes through the
 * template mint; the child's nodes then replace the marker `slotPath` names,
 * leaving one row whose root is the wrapper and whose events the repeat wires
 * off row-relative paths exactly as a served row's.
 */
function placeInWrapper(
	input: {
		readonly parent: ResumeDomElement;
		readonly repeat: ResumeKeyedRepeatRecord;
		readonly item: unknown;
		readonly graph: RuntimeGraph;
	},
	childNodes: ReadonlyArray<ResumeDomNode>,
	slotPath: ReadonlyArray<number>,
): { readonly nodes: ReadonlyArray<ResumeDomNode>; readonly rowRoot: ResumeDomElement } {
	const wrapper = mintRowNodes(input.parent, input.repeat, input.item, input.graph);
	const marker = nodeAtPath(wrapper.nodes, slotPath) as ReplaceableNode | undefined;
	if (!marker?.replaceWith || childNodes.length === 0)
		throw rowComponentError(
			input.repeat,
			'MARKLESS_REPEAT_ROW_COMPONENT_SLOT_MISSING',
			`built no place for its component at row path ${slotPath.join('.')}.`,
		);
	marker.replaceWith(...childNodes);
	return wrapper;
}

type ReplaceableNode = ResumeDomNode & {
	readonly replaceWith?: (...nodes: ReadonlyArray<ResumeDomNode>) => void;
};

// Registration reads the same seven record kinds a settled arm does, so it goes
// through the one registrar rather than a second spelling of it.
async function commitMintedRow(
	registration: RowRegistration,
	rendered: { readonly state: ProtocolStatePayload; readonly view: ProtocolViewPayload },
	elementsByHostId: ReadonlyMap<string, ResumeDomElement>,
	repeat: ResumeKeyedRepeatRecord,
	row: {
		readonly branches: ReadonlyArray<ResumeArmBranchRecord>;
		readonly rowKey: unknown;
		readonly rowSegment: string;
	},
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
		...(row.branches.length ? { branches: row.branches } : {}),
	};
	const deps = await registration.armRegistrationDeps(armRecords);
	await seedMintedGraphNodes(deps, rendered.state);
	await mergeMintedWidgetRoots(deps, rendered.state, repeat, row.rowSegment);
	const { registerArmRecordSet } = await import('../resume-commit-arm.ts');
	await registerArmRecordSet(
		deps,
		registration.installArmEventType,
		mintedRowBoundary(repeat, row.rowKey),
		{ armRecords, elementsByHostId, computed: rendered.state.computed },
	);
}

type EnclosingWidgets = {
	readonly instancePath: string;
	readonly roots: ReadonlyMap<string, string>;
};

/**
 * The rendered widgets the repeat host stands inside, off the LIVE graph.
 *
 * Two questions, because a repeat reaches a widget two ways. The collection node
 * answers when the widget OWNS the collection: its instance path is a live
 * position at or above the repeat host, and walking the registry from there
 * reaches the instances an ancestor widget really rendered. A consumer's `@for`
 * projected into a family root owns its collection itself, so that path is page
 * space and answers nothing - while the rows still stand inside the rendered
 * family. Where they stand is the second question, and the live host census
 * answers it: a host id names its instance, and a host holding the repeat's
 * parent names an instance the repeat is inside.
 *
 * The anchor the rows are keyed by is still the collection's: two family roots
 * over one collection mint the same row key twice, and nothing here tells those
 * two rows apart - the second is refused by the root collision below.
 */
function enclosingWidgetsFor(
	graph: RuntimeGraph,
	repeat: ResumeKeyedRepeatRecord,
	parent: ResumeDomElement,
	hosts: ReadonlyMap<string, ResumeDomElement> | undefined,
): Awaitable<EnclosingWidgets> {
	return marklessThen(loadInstanceScope(), (instanceScope) => {
		const instancePath = instanceScope.marklessInstancePath(repeat.collectionGraphNodeId);
		const registry = instanceScope.marklessGraphWidgetRegistry(graph);
		if (registry.rootPaths.size === 0) return { instancePath, roots: new Map() };
		const roots = new Map(instanceScope.marklessEnclosingWidgetRoots(instancePath, registry));
		for (const [definitionId, rootPath] of instanceScope.marklessWidgetRootsAroundPaths(
			registry,
			hostInstancePathsAround(parent, hosts, instanceScope.marklessInstancePath),
		))
			if (!roots.has(definitionId)) roots.set(definitionId, rootPath);
		return { instancePath, roots };
	});
}

// The instance paths of the live hosts the repeat's rows sit inside, walked up
// through the census rather than looked up: a host id names its instance.
function hostInstancePathsAround(
	parent: ResumeDomElement,
	hosts: ReadonlyMap<string, ResumeDomElement> | undefined,
	instancePathOf: (id: string) => string,
): ReadonlySet<string> {
	const paths = new Set<string>();
	if (!hosts?.size) return paths;
	const ancestors = new Set<ResumeDomElement>();
	for (let node: ResumeDomElement | null | undefined = parent; node; node = node.parentElement)
		ancestors.add(node);
	for (const [hostNodeId, element] of hosts)
		if (ancestors.has(element)) paths.add(instancePathOf(hostNodeId));
	return paths;
}

// A widget-scoped definition whose composed id still names no instance belongs
// to neither a root the row is nor a live ancestor, so its nodes would be a
// second instance nothing else reads.
function assertRowWidgetsResolved(
	repeat: ResumeKeyedRepeatRecord,
	state: ProtocolStatePayload,
): void {
	for (const definition of state.sharedDefinitions ?? []) {
		if (definition.scope !== 'widget') continue;
		if (definition.id.startsWith('shared:'))
			throw rowComponentError(
				repeat,
				'MARKLESS_REPEAT_ROW_COMPONENT_WIDGET_UNRESOLVED',
				`built a row reading ${definition.id}, which neither the row nor any live widget the repeat stands inside owns.`,
			);
	}
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
	// A widget-scoped definition owns nodes the row's cells never list - the ones
	// its parts reach only through the definition - and the census counts those too.
	for (const definition of state.sharedDefinitions ?? [])
		for (const graphNodeId of definition.graphNodeIds) deps.graphNodeIds?.add?.(graphNodeId);
}

/**
 * The row's own rendered widgets, filed against the live page graph.
 *
 * A graph's widget registry is minted once, from the definitions the payload
 * served, and a row born after that carries roots no served definition names.
 * Its parts would otherwise resolve their widget-scoped ids against another
 * row's root, or against none at all, so the row's registry is merged in before
 * any record that reads it is registered.
 */
async function mergeMintedWidgetRoots(
	deps: ArmRegistrationDeps,
	state: ProtocolStatePayload,
	repeat: ResumeKeyedRepeatRecord,
	rowSegment: string,
): Promise<void> {
	const definitions = (state.sharedDefinitions ?? []).filter(
		(definition) => definition.scope === 'widget',
	);
	const [{ marklessComposedWidgetRegistry }, instanceScope] = await Promise.all([
		import('./composition.ts'),
		import('./instance-scope.ts'),
	]);
	const composed = marklessComposedWidgetRegistry(state);
	if (!composed && definitions.length === 0) return;
	const registry = instanceScope.marklessGraphWidgetRegistry(deps.graph);
	const note = (id: string, rootPath: string): void => {
		const held = registry.rootPaths.get(id);
		if (held !== undefined && held !== rootPath)
			throw rowComponentError(
				repeat,
				'MARKLESS_REPEAT_ROW_COMPONENT_WIDGET_COLLISION',
				`built a widget root for ${id} at "${rootPath}" that a live root already claims at "${held}".`,
			);
		instanceScope.marklessNoteWidgetRoot(registry, id, rootPath);
	};
	for (const [id, rootPath] of composed?.rootPaths ?? []) note(id, rootPath);
	// Composition answers for the roots it merged; a definition the row serves
	// outright - a root the row IS - is filed the way the graph files its own.
	for (const definition of definitions) {
		const rootPath = instanceScope.marklessInstancePath(definition.id);
		note(definition.id, rootPath);
		for (const projectionId of definition.projectionIds ?? []) note(projectionId, rootPath);
		// A root OUTSIDE the row is filed again under the row's own path: the row's
		// symbols run there, and the registry walk only ever chops segments off the
		// right, so from inside the row it could never reach an ancestor otherwise.
		if (!rootPath.startsWith(rowSegment))
			note(rowSegment + definition.id.slice(rootPath.length), rootPath);
	}
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
 * `parentHostNodeId` is the same host spelled in page space. A projected repeat
 * is the exception: its parent host belongs to the CHILD it renders into, and
 * `ownerHostNodeId` is the owner-space host that question has to be asked of.
 */
function ownerIdPrefix(
	surface: PrerenderDataSurface,
	componentName: string,
	repeat: ResumeKeyedRepeatRecord,
): string {
	const ownerHost = repeat.ownerHostNodeId ?? repeat.parentHostNodeId;
	let longest = '';
	for (const hostNodeId of surface.components[componentName]?.hostNodeIds ?? []) {
		if (hostNodeId.length <= longest.length) continue;
		if (ownerHost.endsWith(hostNodeId)) longest = hostNodeId;
	}
	return longest ? ownerHost.slice(0, -longest.length) : '';
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

/**
 * The minted row's branch anchors, by the comment order each was rendered at.
 *
 * Same reading as the row's element locators, one node kind over: the record's
 * indexes count the row's OWN comments, because the row was rendered alone and
 * the page census never counted a comment it had not served. Resolving them here
 * hands the registrar live nodes, which is the one form it accepts from a caller
 * that owns its own census.
 */
function resolveRowBranches(
	repeat: ResumeKeyedRepeatRecord,
	nodes: ReadonlyArray<ResumeDomNode>,
	view: ProtocolViewPayload,
): ReadonlyArray<ResumeArmBranchRecord> {
	const records = view.branches ?? [];
	if (!records.length) return [];
	const comments: ResumeDomComment[] = [];
	(function visit(list: ReadonlyArray<ResumeDomNode>): void {
		for (const node of list) {
			if (node.nodeType === 8 && !isArmBranchAnchorComment(node as ResumeDomComment))
				comments.push(node as ResumeDomComment);
			visit(node.childNodes ?? []);
		}
	})(nodes);
	const anchorAt = (index: number, name: string, id: string): ResumeDomComment => {
		const comment = comments[index];
		if (!comment)
			throw rowComponentError(
				repeat,
				'MARKLESS_REPEAT_ROW_COMPONENT_ANCHOR_MISSING',
				`built a row with no comment at row-relative index ${index} for the ${name} of branch ${id}.`,
			);
		return comment;
	};
	return records.map(
		(record) =>
			({
				...record,
				startAnchor: anchorAt(record.startAnchor.index, 'start anchor', record.id),
				endAnchor: anchorAt(record.endAnchor.index, 'end anchor', record.id),
			}) as ResumeArmBranchRecord,
	);
}

// A boundary inside a minted row settles against bookkeeping the page took once,
// at boot, for the rows it served, so registering it would register half a row.
function assertMintableRowRecords(
	repeat: ResumeKeyedRepeatRecord,
	view: ProtocolViewPayload,
): void {
	if (!view.asyncBoundaries.length) return;
	throw rowComponentError(
		repeat,
		'MARKLESS_REPEAT_ROW_COMPONENT_UNSUPPORTED',
		'builds a row containing @try, which a minted row cannot register yet.',
	);
}

// A minted row is not an arm; it borrows the registrar's boundary slot to name
// the flip subscriptions it owns. Per ROW, because that slot is what the branch
// runtime releases before it rewires - one shared name and a second row would
// tear down the first row's flips.
function mintedRowBoundary(
	repeat: ResumeKeyedRepeatRecord,
	rowKey: unknown,
): ResumeAsyncBoundaryRecord {
	return {
		id: `markless-row-component-mint:${repeat.id}:${String(rowKey)}`,
	} as unknown as ResumeAsyncBoundaryRecord;
}

function rowComponentError(repeat: ResumeKeyedRepeatRecord, code: string, detail: string): Error {
	const error = new Error(`${code}: ${repeat.id} ${detail}`) as Error & Record<string, unknown>;
	error.name = 'KeyedRepeatRuntimeError';
	error.code = code;
	error.severity = 'error';
	error.phase = 'runtime';
	error.repeatId = repeat.id;
	error.docsUrl = `https://markless.dev/errors/${code}`;
	return error;
}
