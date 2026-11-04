import {
	PROTOCOL_PROP_GRAPH_NODE_PREFIX,
	PROTOCOL_PROPS_GRAPH_NODE_ID,
} from '@markless/serializer';
import type { PublicRenderModuleInput } from '../../artifacts.ts';
import type { AnyNode } from '../../ast/nodes.ts';
import { componentDeriveGraphNodeIds, computedDependencyEdges } from './derive-set.ts';
import { PROJECTION_PROP_NAME } from './shared-seed-pass.ts';
import { componentPropCellId } from './shared.ts';

/**
 * A prop cell the served payload has to carry, and which of its properties.
 * `keys` names the properties the bag must hold; `null` marks a cell that IS one
 * destructured prop. `deriveKeys` names properties only a resume-time derive
 * reads, carried when their value is data the serializer encodes, narrowed to
 * `derivePaths` when the derives read only some of it; `scalarKeys`
 * is projected children a derive reads, carried only as a scalar, since markup
 * is already in the served HTML. `rowKeys` names properties a minted row's slots
 * or a behavior's inputs read, carried whatever their value. A derive or row key
 * is dropped when the composer routes it to its own node.
 */
export type SsrPropCellSeed = {
	readonly graphNodeId: string;
	readonly keys: ReadonlyArray<string> | null;
	readonly scalarKeys?: ReadonlyArray<string>;
	readonly deriveKeys?: ReadonlyArray<string>;
	readonly derivePaths?: Readonly<Record<string, ReadonlyArray<ReadonlyArray<string>>>>;
	readonly rowKeys?: ReadonlyArray<string>;
};

type PropRead = {
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
};

// The prop reads a browser flip or arm render makes to rebuild this component's
// arms, in text or attributes — an arm showing projected `children` is the common one.
function armRebuildPropReads(
	input: PublicRenderModuleInput,
	componentName: string,
): ReadonlyArray<PropRead> {
	return input.renderData.chunks.flatMap((chunk) =>
		chunk.componentName !== componentName ||
		(chunk.kind !== 'branch-arm' && chunk.kind !== 'async-arm')
			? []
			: chunk.slots.flatMap((slot) =>
					(slot.kind === 'text' || slot.kind === 'attribute') &&
					slot.residue.kind === 'graph-read'
						? [{ graphNodeId: slot.residue.graphNodeId, path: slot.residue.path }]
						: [],
				),
	);
}

/**
 * The prop reads this component's resume-time derives make. A sync `computed()`
 * re-derives in the browser off the graph, so a part whose only motion is
 * `computed(() => shared.value === value)` has no arm to rebuild yet still needs
 * `value` in the payload, or the derive reads `undefined` forever after resume.
 */
function derivePropReads(
	input: PublicRenderModuleInput,
	componentName: string,
): ReadonlyArray<PropRead> {
	const reachable = new Set(componentDeriveGraphNodeIds(input, componentName));
	// A text or attribute that joins a prop with state re-derives from the prop cell on the first write.
	const hosts = new Set(
		input.renderData.chunks.flatMap((chunk) =>
			chunk.componentName === componentName ? chunk.hosts.map((host) => host.hostNodeId) : [],
		),
	);
	const edges = computedDependencyEdges(input);
	const queue = input.protocolView.domUpdates.flatMap((update) =>
		hosts.has(update.hostNodeId) ? [update.graphNodeId] : [],
	);
	while (queue.length > 0) {
		const id = queue.pop()!;
		if (!edges.has(id) || reachable.has(id)) continue;
		reachable.add(id);
		queue.push(...(edges.get(id) ?? []));
	}
	return input.protocolState.computed.flatMap((computed) =>
		computed.async ||
		computed.deriveSymbolId === undefined ||
		!reachable.has(computed.graphNodeId)
			? []
			: (computed.dependencies ?? []).map((dependency) => ({
					graphNodeId: dependency.graphNodeId,
					path: dependency.path,
				})),
	);
}

// Forwarding a prop to a child whose tree re-derives from it: the child drops its copy once
// this component routes the prop live, so this component's own bag has to carry it.
function forwardedDerivePropReads(
	input: PublicRenderModuleInput,
	componentName: string,
): ReadonlyArray<PropRead> {
	const derived = moduleDerivedProps(input);
	return input.semanticGraph.componentEdges.flatMap((edge) =>
		edge.parentComponentName === componentName ? edgeForwardedReads(input, edge, derived) : [],
	);
}

// Each prop's read paths below the prop, as the child's derives read it; an empty path reads it whole.
type DerivedProps = ReadonlyMap<string, ReadonlyArray<ReadonlyArray<string>>>;

function edgeForwardedReads(
	input: PublicRenderModuleInput,
	edge: PublicRenderModuleInput['semanticGraph']['componentEdges'][number],
	derived: ReadonlyMap<string, DerivedProps>,
): ReadonlyArray<PropRead> {
	const child =
		edge.importSource === undefined
			? derived.get(edge.childComponentName)
			: importedDerivedProps(
					input.source.importedModuleInterfaces?.[
						edge.importSource
					]?.render.components.find(
						(component) => component.componentName === edge.childComponentName,
					),
				);
	if (!child) return [];
	// A component that places itself again reads its prop at every depth, so it forwards the prop whole.
	const recursive =
		edge.importSource === undefined &&
		reachesComponent(input, edge.childComponentName, edge.parentComponentName);
	return edge.props.flatMap((prop) => {
		const paths =
			prop.kind === 'graph-reference' &&
			prop.graphBindingKind === 'prop' &&
			child.get(prop.name);
		if (!paths) return [];
		return (recursive ? [[]] : paths).map((rest) => ({
			graphNodeId: prop.graphNodeId,
			path: [...prop.path, ...rest],
		}));
	});
}

function importedDerivedProps(
	component:
		| {
				readonly derivedProps?: ReadonlyArray<string>;
				readonly derivedPropPaths?: Readonly<
					Record<string, ReadonlyArray<ReadonlyArray<string>>>
				>;
		  }
		| undefined,
): DerivedProps | undefined {
	return component?.derivedProps
		? new Map(
				component.derivedProps.map((key) => [
					key,
					component.derivedPropPaths && Object.hasOwn(component.derivedPropPaths, key)
						? component.derivedPropPaths[key]!
						: [[]],
				]),
			)
		: undefined;
}

function reachesComponent(input: PublicRenderModuleInput, from: string, to: string): boolean {
	const seen = new Set<string>();
	const queue = [from];
	while (queue.length > 0) {
		const name = queue.pop()!;
		if (name === to) return true;
		if (seen.has(name)) continue;
		seen.add(name);
		for (const edge of input.semanticGraph.componentEdges)
			if (edge.importSource === undefined && edge.parentComponentName === name)
				queue.push(edge.childComponentName);
	}
	return false;
}

/**
 * The props a component's served bag carries only for a resume-time derive, in
 * its own tree or one it forwards them into, each with the paths below it those
 * derives read. Published on the module interface so a module forwarding its own
 * prop into this component carries it in turn, narrowed the same way.
 */
export function derivedProps(input: PublicRenderModuleInput, componentName: string): DerivedProps {
	return moduleDerivedProps(input).get(componentName) ?? new Map();
}

const derivedPropsByModule = new WeakMap<
	PublicRenderModuleInput,
	ReadonlyMap<string, DerivedProps>
>();

// Grown to a fixpoint over the module's edges, so each component is analyzed once whatever the shape of its tree.
function moduleDerivedProps(input: PublicRenderModuleInput): ReadonlyMap<string, DerivedProps> {
	const cached = derivedPropsByModule.get(input);
	if (cached) return cached;
	const names = new Set([
		...input.semanticGraph.components.map((component) => component.name),
		...input.semanticGraph.componentEdges.map((edge) => edge.parentComponentName),
	]);
	const derived = new Map<string, Map<string, Array<ReadonlyArray<string>>>>();
	const armKeys = new Map<string, ReadonlySet<string>>();
	const add = (componentName: string, reads: ReadonlyArray<PropRead>): boolean => {
		const props = derived.get(componentName)!;
		let grew = false;
		for (const { graphNodeId, path } of reads) {
			const [key, ...rest] = path;
			if (graphNodeId !== PROTOCOL_PROPS_GRAPH_NODE_ID || !key) continue;
			if (armKeys.get(componentName)?.has(key)) continue;
			const paths = props.get(key) ?? [];
			if (!props.has(key)) props.set(key, paths);
			if (readsWhole(paths) || paths.some((known) => samePath(known, rest))) continue;
			paths.push(rest);
			grew = true;
		}
		return grew;
	};
	for (const componentName of names) {
		derived.set(componentName, new Map());
		armKeys.set(
			componentName,
			new Set(
				armRebuildPropReads(input, componentName).flatMap(({ graphNodeId, path }) =>
					graphNodeId === PROTOCOL_PROPS_GRAPH_NODE_ID && path[0] ? [path[0]] : [],
				),
			),
		);
		add(componentName, derivePropReads(input, componentName));
	}
	for (let grew = true; grew;) {
		grew = false;
		for (const edge of input.semanticGraph.componentEdges)
			if (
				derived.has(edge.parentComponentName) &&
				add(edge.parentComponentName, edgeForwardedReads(input, edge, derived))
			)
				grew = true;
	}
	derivedPropsByModule.set(input, derived);
	return derived;
}

function readsWhole(paths: ReadonlyArray<ReadonlyArray<string>>): boolean {
	return paths.some((path) => path.length === 0);
}

function samePath(left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean {
	return left.length === right.length && left.every((key, index) => key === right[index]);
}

// The props read back after resume whatever their value: a row template's expression
// slots, read by a row minted later, and an attach factory's arguments, read when it runs.
function rowTemplatePropKeys(input: PublicRenderModuleInput, componentName: string): Set<string> {
	const keys = new Set<string>();
	const addKey = (read: PropRead): void => {
		if (!read.graphNodeId.startsWith(PROTOCOL_PROP_GRAPH_NODE_PREFIX)) return;
		const key =
			read.graphNodeId === PROTOCOL_PROPS_GRAPH_NODE_ID
				? read.path[0]
				: read.graphNodeId.slice(PROTOCOL_PROP_GRAPH_NODE_PREFIX.length);
		if (key) keys.add(key);
	};
	for (const repeat of input.protocolView.keyedRepeats ?? []) {
		const template = repeat.rowTemplate;
		if (template?.componentName !== componentName) continue;
		for (const slot of [...(template.textSlots ?? []), ...(template.attributeSlots ?? [])])
			if ('reads' in slot) for (const read of slot.reads ?? []) addKey(read);
	}
	const componentHostIds = new Set(
		input.renderData.chunks.flatMap((chunk) =>
			chunk.componentName === componentName ? chunk.hosts.map((host) => host.hostNodeId) : [],
		),
	);
	for (const behavior of input.protocolView.behaviors)
		if (componentHostIds.has(behavior.hostNodeId))
			for (const read of behavior.inputGraphReads ?? []) addKey(read);
	return keys;
}

// The props this component's own `@for` iterates: resume matches each served row
// to its item, and a row handler reads its binding, from the collection.
function repeatCollectionPropKeys(
	input: PublicRenderModuleInput,
	componentName: string,
	bagCellId: string,
): Set<string> {
	const keys = new Set<string>();
	for (const chunk of input.renderData.chunks) {
		if (chunk.componentName !== componentName) continue;
		for (const slot of chunk.slots) {
			if (slot.kind !== 'repeat') continue;
			const repeat = input.renderData.repeats.find(
				(candidate) => candidate.repeatId === slot.repeatId,
			);
			const key = repeat?.collectionPath[0];
			if (
				key &&
				key !== '*' &&
				(repeat.collectionGraphNodeId === PROTOCOL_PROPS_GRAPH_NODE_ID ||
					repeat.collectionGraphNodeId === bagCellId)
			)
				keys.add(key);
		}
	}
	return keys;
}

/**
 * The prop cells this component's server render has to leave in the payload. A
 * bag cell keeps only the properties something reads back: a props bag can hold
 * projected `children` markup, already in the served HTML, so a read naming no
 * property widens nothing.
 */
export function ssrPropCellSeeds(
	input: PublicRenderModuleInput,
	component: AnyNode | undefined,
	componentName: string,
): ReadonlyArray<SsrPropCellSeed> {
	return ssrPropCellSeedsForCell(
		input,
		component ? componentPropCellId(component) : null,
		componentName,
	);
}

export function ssrPropCellSeedsForCell(
	input: PublicRenderModuleInput,
	bagCellId: string | null,
	componentName: string,
): ReadonlyArray<SsrPropCellSeed> {
	const { armKeysByCell, deriveKeysByCell, rowKeysByCell } = propCellKeys(
		input,
		bagCellId,
		componentName,
	);
	return [
		...new Set([...armKeysByCell.keys(), ...deriveKeysByCell.keys(), ...rowKeysByCell.keys()]),
	].flatMap((graphNodeId): SsrPropCellSeed[] => {
		const armKeys = armKeysByCell.has(graphNodeId)
			? (armKeysByCell.get(graphNodeId) ?? null)
			: new Set<string>();
		const rowKeys = [...(rowKeysByCell.get(graphNodeId) ?? [])];
		// A row key is carried whatever its value, which already covers a derive read of it.
		const derivePaths = [...(deriveKeysByCell.get(graphNodeId) ?? [])].filter(
			([key]) => !rowKeys.includes(key),
		);
		const deriveKeys = derivePaths.map(([key]) => key);
		if (armKeys === null) return [{ graphNodeId, keys: null }];
		if (armKeys.size === 0 && deriveKeys.length === 0 && rowKeys.length === 0) return [];
		const projected = deriveKeys.filter((key) => key === PROJECTION_PROP_NAME);
		const data = derivePaths.filter(([key]) => key !== PROJECTION_PROP_NAME);
		const narrowed = data.filter(([, paths]) => !readsWhole(paths));
		return [
			{
				graphNodeId,
				keys: [...armKeys],
				...(projected.length > 0 ? { scalarKeys: projected } : {}),
				...(data.length > 0 ? { deriveKeys: data.map(([key]) => key) } : {}),
				...(narrowed.length > 0 ? { derivePaths: Object.fromEntries(narrowed) } : {}),
				...(rowKeys.length > 0 ? { rowKeys } : {}),
			},
		];
	});
}

function propCellKeys(
	input: PublicRenderModuleInput,
	bagCellId: string | null,
	componentName: string,
) {
	const armKeysByCell = new Map<string, Set<string> | null>();
	for (const { graphNodeId, path } of armRebuildPropReads(input, componentName)) {
		if (!graphNodeId.startsWith('prop:')) continue;
		if (graphNodeId === 'prop:props' || graphNodeId === bagCellId) {
			const keys = armKeysByCell.get(graphNodeId) ?? new Set<string>();
			if (path[0]) keys.add(path[0]);
			armKeysByCell.set(graphNodeId, keys);
		} else armKeysByCell.set(graphNodeId, null);
	}

	// A derive read only widens a bag: the whole-prop cells stay whatever the arm
	// rebuilds asked for.
	const deriveKeysByCell = new Map<string, Map<string, Array<ReadonlyArray<string>>>>();
	for (const { graphNodeId, path } of [
		...derivePropReads(input, componentName),
		...forwardedDerivePropReads(input, componentName),
	]) {
		const [key, ...rest] = path;
		if (graphNodeId !== 'prop:props' && graphNodeId !== bagCellId) continue;
		if (!key || armKeysByCell.get(graphNodeId)?.has(key)) continue;
		const keys =
			deriveKeysByCell.get(graphNodeId) ?? new Map<string, Array<ReadonlyArray<string>>>();
		const paths = keys.get(key) ?? [];
		if (!paths.some((known) => samePath(known, rest))) paths.push(rest);
		keys.set(key, paths);
		deriveKeysByCell.set(graphNodeId, keys);
	}

	const rowKeysByCell = new Map<string, Set<string>>();
	const rowKeys = bagCellId
		? new Set([
				...rowTemplatePropKeys(input, componentName),
				...repeatCollectionPropKeys(input, componentName, bagCellId),
			])
		: new Set<string>();
	for (const key of rowKeys)
		if (!armKeysByCell.get(bagCellId!)?.has(key))
			rowKeysByCell.set(bagCellId!, (rowKeysByCell.get(bagCellId!) ?? new Set()).add(key));

	return { armKeysByCell, deriveKeysByCell, rowKeysByCell };
}

// The composed state a server-rendered component returns, plus the prop cells
// its arm flips and its resume-time derives read back.
export function ssrComposeStateExpression(
	input: PublicRenderModuleInput,
	component: AnyNode | undefined,
	componentName: string,
): string {
	const composed = 'marklessSsrComposeState(marklessSsrPayloadState, marklessSsrChildren)';
	const cells = ssrPropCellSeeds(input, component, componentName);
	if (cells.length === 0) return composed;
	const context = cells.some((cell) => cell.deriveKeys) ? ', marklessSsrRenderContext' : '';
	return `marklessSsrSeedPropCells(${composed}, marklessSsrProps, ${JSON.stringify(cells)}${context})`;
}
