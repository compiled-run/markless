import {
	installSharedSeedPass,
	MARKLESS_WIDGET_INSTANCE_KEY,
	marklessRosterPositions,
	marklessRosterRenderContext,
	marklessWidgetInstanceKey,
	type SharedSeedPass,
} from '../prerender/shared-seed-slot.ts';
import type { PrerenderDataDefinition, PrerenderDataSurface } from '../prerender/evaluator.ts';
import {
	childrenProjectionChain,
	childrenWidgetRootPath,
	childSurfaceOf,
	staticProjectionChildren,
	type ChildrenProjectionLink,
	renderedWidgetRootsOf,
	widgetFallbacksOf,
	widgetRootsOf,
} from '../prerender/children-projection.ts';
import { marklessInstancePath } from './instance-scope.ts';
import { MARKLESS_SSR_CALLBACKS_PROP, marklessSsrSpreadProps } from './ssr.ts';
import { fileBoundElementHandles } from './element-handle-roster.ts';
import { marklessThen, marklessWalk, type Awaitable } from '../ssr-data/awaitable.ts';

type SeedEdge = NonNullable<PrerenderDataDefinition['edges']>[number];
type SeedInitialValue = NonNullable<PrerenderDataDefinition['initialValues']>[number];

/**
 * What one initial-value RECORD is, not what its graph node is.
 *
 * A node carrying its factory default beside the root's per-instance seeds
 * offers two symbol records under one id, so the compiler keys those by symbol
 * id; every other node is still keyed by graph node id, which is the fallback.
 */
function initialValueKind(
	definition: PrerenderDataDefinition | undefined,
	initial: SeedInitialValue,
): string | undefined {
	const kinds = definition?.initialValueKinds;
	if (!kinds) return undefined;
	const value = initial.value;
	return (
		(value.kind === 'symbol-function' ? kinds[value.symbolId] : undefined) ??
		kinds[initial.graphNodeId]
	);
}
type SeedContext = Parameters<SharedSeedPass>[0];
type PrerenderReadSeed = (graphNodeId: string, path?: ReadonlyArray<string>) => unknown;

// A seed is a per-instance initial value built from the child's own props, so
// running it needs those props and the factory initial, not the child's markup.
const seedProjectingChild: SharedSeedPass = (context, definition, slot, read, inherited) => {
	const componentEdgeId = slot.componentEdgeId;
	// Every exit files the roster: an unseeded projection still renders parts, and
	// their IDREF positions still have to be told which handles bind an element.
	const roster = (seeds: ReadonlyMap<string, unknown> | undefined) =>
		fileBoundElementHandles(seeds, inherited, context.surface, definition, slot);
	const edges = definition.edges ?? [];
	const rootEdge = edges.find((candidate) => candidate.id === componentEdgeId);
	if (!rootEdge || rootEdge.materialized) return roster(inherited);
	// Static registration before descent: the projecting child's own instance
	// names the widget its parts belong to, so a part's minted element() id can
	// carry which rendered widget it is part of.
	// Defect 65, CSR half: only a child that STARTS a widget may name one — a
	// projecting PART must leave the enclosing token inherited, or a binder in its
	// projection mints an id the reader never spells. Defect 68: starting one is
	// not the same as owning its cells. A child that composes a family root around
	// its own children roots no cell yet begins that instance, and the parts
	// projected through it resolve to it, so the question is the composition-aware
	// one the SSR marker answers — payload ownership alone withholds the token from
	// a composing child and leaves its parts resolving no instance at all.
	const base = context.idPrefix + (context.rowSegment ?? '') + rootEdge.symbolPrefix;
	const chain = childrenProjectionChain(context.surface, rootEdge.childComponentName);
	const composedRoot = chain.map((link) => link.edge.symbolPrefix).join('');
	const inheritedSeeds = new Map(inherited ?? []);
	// A carrier of an unseeded family roots it when the page gives it composition's
	// standing, so the token has to be asked with WHERE this child stands, not just
	// which component it is: otherwise the count a part of that instance asks for
	// mints a placeholder under the bare handle id while composition has qualified
	// every handle of the instance, and the ask answers nothing at first paint.
	const rootedDefinitions = renderedWidgetRootsOf(context.surface, rootEdge.childComponentName, {
		enclosing: enclosingProjectingChildNames(context.surface, componentEdgeId).map(
			(componentName) => ({ surface: context.surface, componentName }),
		),
		enclosed: projectedChildNames(context.surface, definition, componentEdgeId, read).map(
			(componentName) => ({ surface: context.surface, componentName }),
		),
		inRow: (context.rowSegment ?? '') !== '',
	});
	// Filed per definition as well as under the plain key: an element inside this
	// child can carry handles from ANOTHER family's instance, and that family's
	// token must not be overwritten by this one. See marklessWidgetInstanceKey.
	for (const definitionId of rootedDefinitions)
		inheritedSeeds.set(marklessWidgetInstanceKey(definitionId), base + composedRoot);
	const seeded =
		rootedDefinitions.length > 0
			? inheritedSeeds.set(MARKLESS_WIDGET_INSTANCE_KEY, base + composedRoot)
			: inheritedSeeds;
	return marklessThen(seedEdgeAndOwnTemplate(context, rootEdge, read, seeded), () => {
		// U-H: every part of this widget instance contributes before any part
		// renders, so a seed a part writes is what its siblings read whatever the
		// document order.
		const projected = projectedEdges(context.surface, definition, componentEdgeId, read);
		return marklessThen(
			marklessWalk(projected.length, (index) =>
				seedEdgeAndOwnTemplate(context, projected[index]!, read, seeded),
			),
			() => roster(seeded),
		);
	});
};

/**
 * One placed child's whole seed contribution to the instance now open: the seeds
 * its own body writes, and then the seeds of every component its OWN TEMPLATE
 * wraps its `children` in. The served twin is `marklessSsrSeedChild`, which runs
 * the child's seed pass and its `seedForward` lines over the caller's map — so a
 * writer the child renders itself, rather than one the consumer projects into it,
 * still lands in the enclosing instance.
 */
function seedEdgeAndOwnTemplate(
	context: SeedContext,
	edge: SeedEdge,
	read: PrerenderReadSeed,
	seeded: Map<string, unknown>,
): Awaitable<void> {
	return marklessThen(
		applySharedSeeds(context, context.surface, context.symbolPrefix, edge, read, seeded),
		() =>
			applyComposedChainSeeds(
				context,
				childrenForwardChain(context.surface, edge.childComponentName),
				edge,
				context.symbolPrefix + edge.symbolPrefix,
				edgeChildProps(context, context.surface, edge, read),
				seeded,
			),
	);
}

/**
 * The composed roots between a placed child's own template and the slot that
 * renders its `children`, innermost last. Each link's seeds belong to the widget
 * instance the parts read, so they run in the LINK OWNER's scope: its props, and
 * the derives its module already emitted. A prop like `checked={group.allChecked}`
 * is a computed read, so the scope evaluates the same staged reads the render
 * would — no seed-time derive of its own.
 */
function applyComposedChainSeeds(
	context: SeedContext,
	chain: ReadonlyArray<ChildrenProjectionLink>,
	rootEdge: SeedEdge,
	symbolPrefix: string,
	props: Record<string, unknown>,
	seeded: Map<string, unknown>,
): Awaitable<void> {
	let ownerProps = props;
	let ownerPrefix = symbolPrefix;
	let ownerEdge = rootEdge;
	return marklessWalk(chain.length, (index) => {
		const link = chain[index]!;
		return marklessThen(
			composedScopeRead(context, link.definition, ownerEdge, ownerPrefix, ownerProps, seeded),
			(read) =>
				marklessThen(
					applySharedSeeds(context, link.surface, ownerPrefix, link.edge, read, seeded),
					() => {
						ownerProps = edgeChildProps(context, link.surface, link.edge, read);
						ownerPrefix += link.edge.symbolPrefix;
						ownerEdge = link.edge;
					},
				),
		);
	});
}

/**
 * One composing component's own scope at seed time: its props answer directly,
 * and every value its module emitted an initial for is evaluated here, in the
 * order the module emitted them, exactly as the render evaluates them. A shared
 * instance the composing body already seeded answers from the seed map, so a
 * derive over it reads the seeded value rather than the factory placeholder.
 */
function composedScopeRead(
	context: SeedContext,
	definition: PrerenderDataDefinition,
	edge: SeedEdge,
	symbolPrefix: string,
	props: Record<string, unknown>,
	seeded: ReadonlyMap<string, unknown>,
): Awaitable<PrerenderReadSeed> {
	const values = new Map<string, unknown>();
	const read: PrerenderReadSeed = (graphNodeId, path = []) =>
		readPath(
			graphNodeId === definition.propCellId || graphNodeId === 'prop:props'
				? props
				: graphNodeId.startsWith('prop:')
					? props[graphNodeId.slice(5)]
					: seeded.has(graphNodeId)
						? seeded.get(graphNodeId)
						: values.get(graphNodeId),
			path,
		);
	const initials = definition.initialValues ?? [];
	return marklessThen(
		marklessWalk(initials.length, (index) => {
			const initial = initials[index]!;
			// A shared seed is this widget's own value, already written by the seed pass.
			if (initialValueKind(definition, initial) === 'shared-seed') return undefined;
			if (initial.value.kind === 'constant') {
				values.set(initial.graphNodeId, structuredClone(initial.value.value));
				return undefined;
			}
			const symbolValue = initial.value;
			if (symbolValue.kind !== 'symbol-function') return undefined;
			return marklessThen(
				context.loadSymbol(
					edge.boundSymbols?.[symbolValue.symbolId] ?? symbolPrefix + symbolValue.symbolId,
				) as Awaitable<unknown>,
				(loaded) => {
					// A derive this build did not publish leaves the node unseeded rather than
					// failing the render: the composed root still gets every prop that resolved.
					if (typeof loaded !== 'function') return undefined;
					return marklessThen(
						// A derive reaching this seam is the same derive the component render
						// reaches, so the roster answers it the same way: the seed map it runs
						// against carries both the counter and the instance to count within.
						(loaded.length > 0
							? loaded({
									graph: { read },
									read,
									...marklessRosterRenderContext(marklessRosterPositions(seeded), seeded),
								})
							: loaded()) as Awaitable<unknown>,
						(value) => {
							values.set(initial.graphNodeId, value);
						},
					);
				},
			);
		}),
		() => read,
	);
}

/**
 * Every composed link from a placed child's own template down to the slot that
 * renders its `children`, outermost first — untruncated.
 *
 * `childrenProjectionChain` answers a different question with the same walk: the
 * composition seam wants the innermost link that ROOTS a widget, so it cuts the
 * chain there and answers nothing when no link roots one. The seed forward wants
 * every link, rooting or not, because each one's body may write into the
 * instance already open. The compiler's twin is `childrenProjectionChain` in
 * public-render's shared-seed-pass, whose `seedForward` uses the whole chain.
 */
function childrenForwardChain(
	surface: PrerenderDataSurface,
	componentName: string,
): ChildrenProjectionLink[] {
	const own = childSurfaceOf(surface, componentName);
	const definition = own?.components[componentName];
	if (!own || !definition) return [];
	const chunks = own.renderData.chunks.filter((chunk) => chunk.componentName === componentName);
	const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
	const edges = definition.edges ?? [];
	const chain: ChildrenProjectionLink[] = [];
	let found: ChildrenProjectionLink[] = [];
	// A self-composing component's projection chunks reach themselves; how deep it
	// unrolls is a render-time answer, so the build-time walk visits each once.
	const walked = new Set<string>();
	const walk = (chunkId: string): boolean => {
		if (walked.has(chunkId)) return false;
		walked.add(chunkId);
		for (const slot of byId.get(chunkId)?.slots ?? []) {
			if (slot.kind === 'text' && isOwnChildrenRead(slot.residue)) return true;
			if (slot.kind !== 'child-component' || !slot.projectionChunkId) continue;
			const edge = edges.find((candidate) => candidate.id === slot.componentEdgeId);
			if (!edge || edge.materialized) continue;
			const owner = chain[chain.length - 1];
			const ownerSurface = owner
				? childSurfaceOf(owner.surface, owner.edge.childComponentName)
				: own;
			const ownerDefinition = owner
				? ownerSurface?.components[owner.edge.childComponentName]
				: definition;
			if (!ownerSurface || !ownerDefinition) continue;
			chain.push({
				edge,
				surface: ownerSurface,
				definition: ownerDefinition,
				rootsWidget: widgetRootsOf(ownerSurface, edge.childComponentName).length > 0,
			});
			if (walk(slot.projectionChunkId)) {
				found = [...chain];
				return true;
			}
			chain.pop();
		}
		return false;
	};
	for (const chunk of chunks) if (chunk.kind === 'template' && walk(chunk.id)) break;
	return found;
}

// Restates the one slot that renders a component's own `children` prop, raw —
// the same shape `isOwnChildrenResidue` reads in prerender/children-projection.
function isOwnChildrenRead(residue: { readonly kind: string; readonly [key: string]: unknown }) {
	return (
		residue.kind === 'graph-read' &&
		residue.graphNodeId === 'prop:props' &&
		Array.isArray(residue.path) &&
		residue.path.length === 1 &&
		residue.path[0] === 'children'
	);
}

// The component edges placed inside the projecting child, outermost first: its
// projection chunk's own child components, then the ones projected into those.
// A branch arm IS walked, but only into the arm this render takes - the arm
// decides whether the part renders, never which widget it belongs to. A repeat
// row or an async arm is not walked: those have their own cardinality and
// lifecycle. A child that ROOTS one of this root's families is where the walk
// stops: it starts its own instance and runs its own seed phase.
function projectedEdges(
	surface: PrerenderDataSurface,
	definition: PrerenderDataDefinition,
	componentEdgeId: string,
	read: PrerenderReadSeed,
): SeedEdge[] {
	const chunks = surface.renderData.chunks.filter(
		(chunk) => chunk.componentName === definition.name,
	);
	const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
	const edges = definition.edges ?? [];
	const rootEdge = edges.find((candidate) => candidate.id === componentEdgeId);
	const rootProjectionChunkId = chunks.flatMap((chunk) =>
		chunk.slots.flatMap((slot) =>
			slot.kind === 'child-component' &&
			slot.componentEdgeId === componentEdgeId &&
			slot.projectionChunkId
				? [slot.projectionChunkId]
				: [],
		),
	)[0];
	if (rootProjectionChunkId === undefined || !rootEdge) return [];
	// The boundary asks the same composition-aware question the token gate asks, so
	// a row that COMPOSES a root of this root's family ends the walk exactly as one
	// that declares the family itself does. The SSR twin is
	// `marklessSsrWidgetBoundary` over the same spliced marker.
	//
	// A projecting child that roots nothing is a PART, and the families in scope for
	// it are the enclosing widget's - otherwise a root written into that part's own
	// children is not recognised as an instance boundary, and its seeds land in the
	// enclosing instance's map on top of the seed that instance's root wrote.
	const families = [
		...new Set(
			[
				rootEdge.childComponentName,
				...enclosingProjectingChildNames(surface, componentEdgeId),
			].flatMap((name) => renderedWidgetRootsOf(surface, name)),
		),
	];
	const startsOwnInstance = (edgeId: string): boolean => {
		if (families.length === 0) return false;
		const edge = edges.find((candidate) => candidate.id === edgeId);
		return (
			edge !== undefined &&
			renderedWidgetRootsOf(surface, edge.childComponentName).some((definitionId) =>
				families.includes(definitionId),
			)
		);
	};
	const edgeIds: string[] = [];
	const walked = new Set<string>();
	const walk = (chunkId: string) => {
		if (walked.has(chunkId)) return;
		walked.add(chunkId);
		for (const slot of byId.get(chunkId)?.slots ?? []) {
			if (slot.kind === 'branch') {
				const armChunkId = slot.armTemplateIds[takenArm(definition, slot.branchSiteId, read)];
				if (armChunkId) walk(armChunkId);
				continue;
			}
			if (slot.kind !== 'child-component') continue;
			if (startsOwnInstance(slot.componentEdgeId)) continue;
			edgeIds.push(slot.componentEdgeId);
			if (slot.projectionChunkId) walk(slot.projectionChunkId);
		}
	};
	walk(rootProjectionChunkId);
	return edgeIds.flatMap((edgeId) => {
		const edge = edges.find((candidate) => candidate.id === edgeId);
		return edge && !edge.materialized ? [edge] : [];
	});
}

/**
 * Every component placed INSIDE one child's projection, at any depth: what that
 * child would enclose if it rooted a widget. The same walk `projectedEdges`
 * makes - the taken arm only, and no boundary pruning, because whether the child
 * is a boundary is the question this answers.
 */
function projectedChildNames(
	surface: PrerenderDataSurface,
	definition: PrerenderDataDefinition,
	componentEdgeId: string,
	read: PrerenderReadSeed,
): string[] {
	const chunks = surface.renderData.chunks.filter(
		(chunk) => chunk.componentName === definition.name,
	);
	const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
	const edges = definition.edges ?? [];
	const rootProjectionChunkId = chunks.flatMap((chunk) =>
		chunk.slots.flatMap((slot) =>
			slot.kind === 'child-component' &&
			slot.componentEdgeId === componentEdgeId &&
			slot.projectionChunkId
				? [slot.projectionChunkId]
				: [],
		),
	)[0];
	if (rootProjectionChunkId === undefined) return [];
	const names: string[] = [];
	const walked = new Set<string>();
	const walk = (chunkId: string) => {
		if (walked.has(chunkId)) return;
		walked.add(chunkId);
		for (const slot of byId.get(chunkId)?.slots ?? []) {
			if (slot.kind === 'branch') {
				const armChunkId = slot.armTemplateIds[takenArm(definition, slot.branchSiteId, read)];
				if (armChunkId) walk(armChunkId);
				continue;
			}
			if (slot.kind !== 'child-component') continue;
			const edge = edges.find((candidate) => candidate.id === slot.componentEdgeId);
			if (edge && !edge.materialized) names.push(edge.childComponentName);
			if (slot.projectionChunkId) walk(slot.projectionChunkId);
		}
	};
	walk(rootProjectionChunkId);
	return names;
}

/**
 * The projecting children of this component whose projections enclose one edge,
 * innermost first. Which edge sits inside which projection is a build-time fact
 * of this component's own chunks, so the walk reads them rather than sensing a
 * rendered tree. Arm, row, and async chunks are stepped THROUGH: they change
 * whether a part renders, never which widget encloses it.
 */
function enclosingProjectingChildNames(
	surface: PrerenderDataSurface,
	componentEdgeId: string,
): string[] {
	// The whole module's chunks and edges: ids are unique across it, and a module
	// serving several components attributes a shared chunk to just one of them.
	const chunks = surface.renderData.chunks;
	const edges = Object.values(surface.components).flatMap(
		(component) => component?.edges ?? [],
	);
	const ownerEdgeOfChunk = new Map<string, string>();
	const parentChunkOf = new Map<string, string>();
	const chunkOfEdge = new Map<string, string>();
	for (const chunk of chunks)
		for (const slot of chunk.slots) {
			if (slot.kind === 'child-component') {
				chunkOfEdge.set(slot.componentEdgeId, chunk.id);
				if (slot.projectionChunkId)
					ownerEdgeOfChunk.set(slot.projectionChunkId, slot.componentEdgeId);
			} else if (slot.kind === 'branch') {
				for (const armChunkId of slot.armTemplateIds) parentChunkOf.set(armChunkId, chunk.id);
			} else if (slot.kind === 'repeat') {
				parentChunkOf.set(slot.rowTemplateId, chunk.id);
				if (slot.emptyTemplateId) parentChunkOf.set(slot.emptyTemplateId, chunk.id);
			} else if (slot.kind === 'async') {
				for (const armChunkId of Object.values(slot.armTemplateIds))
					if (typeof armChunkId === 'string') parentChunkOf.set(armChunkId, chunk.id);
			}
		}
	const names: string[] = [];
	const walked = new Set<string>();
	let chunkId = chunkOfEdge.get(componentEdgeId);
	while (chunkId !== undefined && !walked.has(chunkId)) {
		walked.add(chunkId);
		const ownerEdgeId = ownerEdgeOfChunk.get(chunkId);
		if (ownerEdgeId === undefined) {
			chunkId = parentChunkOf.get(chunkId);
			continue;
		}
		const owner = edges.find((candidate) => candidate.id === ownerEdgeId);
		if (owner) names.push(owner.childComponentName);
		chunkId = chunkOfEdge.get(ownerEdgeId);
	}
	return names;
}

// The same arm the renderer will take, asked before the arm renders. A branch
// with no recorded test read has no arm this pass can name, so nothing under it
// seeds and the render behaves as it did before arms carried seeds.
function takenArm(
	definition: PrerenderDataDefinition,
	branchSiteId: string,
	read: PrerenderReadSeed,
): number {
	const branch = (definition.branches ?? []).find(
		(candidate) => candidate.branchSiteId === branchSiteId,
	);
	const testRead = branch?.testReads?.[0];
	if (!testRead) return -1;
	const value = read(testRead.graphNodeId, testRead.path);
	const armTests = branch?.armTests;
	if (!armTests) return value ? 0 : 1;
	const match = armTests.findIndex((candidate) => candidate !== null && Object.is(candidate, value));
	return match >= 0 ? match : armTests.indexOf(null);
}

// What one component edge hands its child, read in the scope that declared it.
// `surface` is that declaring scope: the edge's ids are its module's.
function edgeChildProps(
	context: SeedContext,
	surface: PrerenderDataSurface,
	edge: SeedEdge,
	read: PrerenderReadSeed,
): Record<string, unknown> {
	const childProps: Record<string, unknown> = {};
	const callbacks: Record<string, string> = {};
	for (const prop of edge.props) {
		if (prop.kind === 'spread' && prop.graphNodeId) {
			Object.assign(
				childProps,
				marklessSsrSpreadProps(read(prop.graphNodeId, prop.path ?? []), prop.excludeNames),
			);
		} else if (prop.kind === 'graph-reference' && prop.graphNodeId) {
			childProps[prop.name] = read(prop.graphNodeId, prop.path ?? []);
		} else if (prop.kind === 'serializable' && 'value' in prop) {
			childProps[prop.name] = prop.value;
		} else if (prop.kind === 'callback') {
			const symbolId = edge.boundSymbols?.[prop.name] ?? prop.symbolId;
			if (symbolId) callbacks[prop.name] = symbolId;
		} else if (prop.source !== undefined && context.readEdgeProp) {
			childProps[prop.name] = context.readEdgeProp(prop);
		}
	}
	// Static text is the one projection whose value the seed can be told: it is
	// already in the chunk, so a seed reading `children` gets what the consumer
	// wrote instead of undefined.
	if (childProps.children === undefined) {
		const staticChildren = staticProjectionChildren(surface, edge.id);
		if (staticChildren !== undefined) childProps.children = staticChildren;
	}
	// A widget root's callback-slot seed reads its answer from here, so the seed
	// pass hands the child the same map the render path hands it.
	if (Object.keys(callbacks).length > 0) childProps[MARKLESS_SSR_CALLBACKS_PROP] = callbacks;
	return childProps;
}

function applySharedSeeds(
	context: SeedContext,
	surface: PrerenderDataSurface,
	symbolPrefix: string,
	edge: SeedEdge,
	read: PrerenderReadSeed,
	seeded: Map<string, unknown>,
): Awaitable<void> {
	const child = childSurfaceOf(surface, edge.childComponentName)?.components[
		edge.childComponentName
	];
	const initials = child?.initialValues ?? [];
	const seeds = initials.filter((initial) => initialValueKind(child, initial) === 'shared-seed');
	if (!child || seeds.length === 0) return;

	const childProps = edgeChildProps(context, surface, edge, read);
	// A client mint loads these symbols through the resume loader, which scopes a
	// symbol's reads by prepending its instance path. The seed map is keyed by the
	// child's own compile-time ids, so an unmatched id is retried without it.
	const seedSource = (graphNodeId: string): unknown => {
		if (graphNodeId === child.propCellId || graphNodeId === 'prop:props') return childProps;
		if (graphNodeId.startsWith('prop:')) return childProps[graphNodeId.slice(5)];
		if (seeded.has(graphNodeId)) return seeded.get(graphNodeId);
		const instancePath = marklessInstancePath(graphNodeId);
		return instancePath ? seedSource(graphNodeId.slice(instancePath.length)) : undefined;
	};
	const readSeed: PrerenderReadSeed = (graphNodeId, path = []) =>
		readPath(seedSource(graphNodeId), path);
	// The merge base every per-instance seed writes onto, laid down before the
	// first of them runs: the folded constant, and then the carried expression for
	// the properties that could not fold. A factory default that ran as if it were
	// a seed instead landed on top of the real ones and ate them.
	const primed = new Set<string>();
	const primeMergeBase = (graphNodeId: string): Awaitable<void> => {
		if (primed.has(graphNodeId) || seeded.has(graphNodeId)) return undefined;
		primed.add(graphNodeId);
		const own = initials.filter((candidate) => candidate.graphNodeId === graphNodeId);
		const factory = own.find((candidate) => candidate.value.kind === 'constant')?.value;
		if (factory?.kind === 'constant') seeded.set(graphNodeId, structuredClone(factory.value));
		const carried = own.find(
			(candidate) => initialValueKind(child, candidate) === 'state-initializer',
		);
		const carriedValue = carried?.value;
		if (carriedValue?.kind !== 'symbol-function') return undefined;
		return marklessThen(
			context.loadSymbol(
				edge.boundSymbols?.[carriedValue.symbolId] ??
					symbolPrefix + edge.symbolPrefix + carriedValue.symbolId,
			) as Awaitable<unknown>,
			(loaded) => {
				// A carry this build did not publish leaves the folded base standing.
				if (typeof loaded !== 'function') return undefined;
				return marklessThen(
					(loaded.length > 0
						? loaded({ graph: { read: readSeed }, read: readSeed })
						: loaded()) as Awaitable<unknown>,
					(value) => {
						const base = seeded.get(graphNodeId);
						seeded.set(
							graphNodeId,
							isPlainSeedRecord(base) && isPlainSeedRecord(value) ? { ...base, ...value } : value,
						);
					},
				);
			},
		);
	};
	return marklessThen(
		marklessWalk(seeds.length, (index) => {
			const initial = seeds[index]!;
			if (initial.value.kind !== 'symbol-function') return undefined;
			if (!seedFamilyOpen(seeded, initial.graphNodeId)) return undefined;
			return primeMergeBase(initial.graphNodeId);
		}),
		() => runSharedSeeds(),
	);

	function runSharedSeeds(): Awaitable<void> {
		return marklessWalk(seeds.length, (index) => {
			const initial = seeds[index]!;
			const symbolValue = initial.value;
			if (symbolValue.kind !== 'symbol-function') return undefined;
			if (!seedFamilyOpen(seeded, initial.graphNodeId)) return undefined;
			// The caller hands in a row-free symbolPrefix: the row rides the seed's
			// identity, never its symbol id, which routes match as a compile-time literal.
			return marklessThen(
				context.loadSymbol(
					edge.boundSymbols?.[symbolValue.symbolId] ??
						symbolPrefix + edge.symbolPrefix + symbolValue.symbolId,
				) as Awaitable<unknown>,
				(loaded) => {
					if (typeof loaded !== 'function')
						throw new Error(`MARKLESS_PRERENDER_DATA_SYMBOL_MISSING: ${symbolValue.symbolId}`);
					return marklessThen(
						loaded({ graph: { read: readSeed }, read: readSeed }) as Awaitable<unknown>,
						(value) => {
							seeded.set(initial.graphNodeId, value);
						},
					);
				},
			);
		});
	}
}

function isPlainSeedRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Whether the pass now running is the one that roots this seed's family.
 *
 * Rooting is per FAMILY, not per component: a child that roots one widget family
 * is still an ordinary part of every other family enclosing it, and its writes
 * belong to those enclosing instances. The pass root files its own token under
 * the plain key AND under each family it roots, so a family whose filed token is
 * some other instance is one this pass does not root — re-running its seeds here
 * would mint a private copy per nested widget. A family with no filed token is
 * nobody's yet, so it stays open. The compiler's SSR twin is
 * `seedFamilyOpenSource` in public-render's shared-seed-pass.
 */
function seedFamilyOpen(seeded: ReadonlyMap<string, unknown>, graphNodeId: string): boolean {
	const own = seeded.get(marklessWidgetInstanceKey(sharedDefinitionIdOf(graphNodeId)));
	return own === undefined || own === seeded.get(MARKLESS_WIDGET_INSTANCE_KEY);
}

// Restates the compiler's shared node-id grammar: a node id is its definition id,
// then `/` and the node's own name; an exported name carries no slash.
function sharedDefinitionIdOf(graphNodeId: string): string {
	const named = graphNodeId.indexOf('#');
	if (named === -1) return graphNodeId;
	const end = graphNodeId.indexOf('/', named);
	return end === -1 ? graphNodeId : graphNodeId.slice(0, end);
}

function readPath(value: unknown, path: ReadonlyArray<string>): unknown {
	let current = value;
	for (const segment of path) {
		if (current === null || current === undefined) return undefined;
		current = (current as Record<string, unknown>)[segment];
	}
	return current;
}

/**
 * Teaches this app's CSR render path to run a projecting component's shared
 * seeds before the components projected into it render. The bundler emits a
 * call to it in the render-data module of every .tsrx whose compiler planned a
 * shared-seed symbol, so a build with no widget seeds never loads this module
 * and its render path renders projections unseeded. The call is explicit
 * because `@markless/web` declares `sideEffects: false`.
 */
export function installMarklessSharedSeedPass(): void {
	// The composition seam asks the same declared chain this pass descends, so the
	// widget a part resolves to is one answer given to both.
	seedProjectingChild.childrenWidgetRoot = childrenWidgetRootPath;
	seedProjectingChild.widgetFallbacks = widgetFallbacksOf;
	installSharedSeedPass(seedProjectingChild);
}
