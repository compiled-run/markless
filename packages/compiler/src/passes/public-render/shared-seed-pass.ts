import type { PublicRenderModuleInput } from '../../artifacts.ts';
import {
	resolveSharedInstanceGraphPath,
	sharedDefinitionId,
} from '../semantic-graph/collect-shared.ts';

type SharedSeedSymbol = {
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
	readonly componentName?: string;
	readonly source: string;
	readonly callbackSlotPropName?: string;
};

/**
 * A part the widget renders only when one of its `@if`/`@switch` arms is the
 * taken one. `armGuards` names every arm the part sits inside, outermost first;
 * the part seeds exactly when all of them are taken.
 */
export type ArmScopedSeedRef = {
	readonly edgeId: string;
	readonly armGuards: ReadonlyArray<{
		readonly branchSiteId: string;
		readonly armIndex: number;
	}>;
	readonly projectingAncestorEdgeIds: ReadonlyArray<string>;
};

/**
 * One component edge placed inside a widget root's projection, with the edges
 * whose projections it sits inside, outermost first. A projecting ancestor that
 * turns out to root a widget of the same family is an instance boundary: the
 * part belongs to THAT root, not to the outer one, so the outer root's seed
 * phase must not run it. Which ancestor roots a widget is answered where the
 * component is compiled, so the walk names the chain and the emitted seed pass
 * asks each link.
 */
export type ProjectedSeedPart = {
	readonly edgeId: string;
	readonly projectingAncestorEdgeIds: ReadonlyArray<string>;
};

/**
 * The component edges placed inside one projecting child, outermost first: its
 * projection chunk's own child components, then the ones projected into those.
 * These are the parts of the widget that child roots, and they seed the same
 * shared instance it does, so its seed pass must run theirs before any of them
 * renders. Chunks reached through a repeat, branch, or async arm are not walked:
 * which of those renders is a render-time answer, not a build-time one.
 */
export function projectedSeedPartsUnder(
	chunks: PublicRenderModuleInput['renderData']['chunks'],
	projectionChunkId: string,
): ProjectedSeedPart[] {
	const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
	const parts: ProjectedSeedPart[] = [];
	const walked = new Set<string>();
	const walk = (chunkId: string, projectingAncestorEdgeIds: ReadonlyArray<string>) => {
		if (walked.has(chunkId)) return;
		walked.add(chunkId);
		for (const slot of byId.get(chunkId)?.slots ?? []) {
			if (slot.kind !== 'child-component') continue;
			parts.push({ edgeId: slot.componentEdgeId, projectingAncestorEdgeIds });
			if (slot.projectionChunkId)
				walk(slot.projectionChunkId, [...projectingAncestorEdgeIds, slot.componentEdgeId]);
		}
	};
	walk(projectionChunkId, []);
	return parts;
}

/**
 * Every component edge a widget root's projection can reach, by ANY route: its
 * own child slots, and the ones a branch arm, repeat row, or async arm holds.
 *
 * Deliberately wider than the seed walks above, because it answers a different
 * question. Those RUN a part's seeds, so a part whose arm is not taken must not
 * run. This one only reads which element() handles a part could bind, and being
 * told about a part that turns out not to render leaves the IDREF exactly as it
 * is today — present. Being told about none is what silently drops a real
 * relationship, so this walk errs the safe way.
 */
export function projectedHandleEdgeIdsUnder(
	chunks: PublicRenderModuleInput['renderData']['chunks'],
	projectionChunkId: string,
): string[] {
	const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
	const edgeIds = new Set<string>();
	const walked = new Set<string>();
	const walk = (chunkId: string) => {
		if (walked.has(chunkId)) return;
		walked.add(chunkId);
		for (const slot of byId.get(chunkId)?.slots ?? []) {
			if (slot.kind === 'branch') {
				for (const armChunkId of slot.armTemplateIds) walk(armChunkId);
				continue;
			}
			if (slot.kind === 'repeat') {
				walk(slot.rowTemplateId);
				if (slot.emptyTemplateId) walk(slot.emptyTemplateId);
				continue;
			}
			if (slot.kind === 'async') {
				for (const armChunkId of Object.values(slot.armTemplateIds))
					if (typeof armChunkId === 'string') walk(armChunkId);
				continue;
			}
			if (slot.kind !== 'child-component') continue;
			edgeIds.add(slot.componentEdgeId);
			if (slot.projectionChunkId) walk(slot.projectionChunkId);
		}
	};
	walk(projectionChunkId);
	return [...edgeIds];
}

/** The projected part edge ids alone, for callers that place no boundary guard. */
export function projectedEdgeIdsUnder(
	chunks: PublicRenderModuleInput['renderData']['chunks'],
	projectionChunkId: string,
): string[] {
	return projectedSeedPartsUnder(chunks, projectionChunkId).map((part) => part.edgeId);
}

/**
 * Defect 56. The component edges a widget root's projection encloses THROUGH a
 * repeat row, arm, or async arm.
 *
 * These are parts of the same widget instance the projection belongs to — the
 * root is outside the loop, so every row renders inside it and must read what
 * the root's seed phase wrote. They are excluded from `projectedSeedPartsUnder`
 * for a different question: how many of them render, and under which row, is a
 * render-time answer, so a build-time seed phase cannot run their WRITES. Reading
 * the instance is not the same act, and this walk answers only that.
 */
export function rowProjectedEdgeIdsUnder(
	chunks: PublicRenderModuleInput['renderData']['chunks'],
	projectionChunkId: string,
): string[] {
	const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
	const edgeIds: string[] = [];
	const walked = new Set<string>();
	// `deferred` is "this chunk is reached only through a render-time arm or row",
	// which is exactly what keeps the seed-writing walks out and what this one is for.
	const walk = (chunkId: string, deferred: boolean) => {
		const seen = `${chunkId}\u0000${deferred ? '1' : '0'}`;
		if (walked.has(seen)) return;
		walked.add(seen);
		for (const slot of byId.get(chunkId)?.slots ?? []) {
			if (slot.kind === 'repeat') {
				walk(slot.rowTemplateId, true);
				if (slot.emptyTemplateId) walk(slot.emptyTemplateId, true);
				continue;
			}
			if (slot.kind === 'branch') {
				for (const armChunkId of slot.armTemplateIds) walk(armChunkId, deferred);
				continue;
			}
			if (slot.kind === 'async') {
				for (const armChunkId of Object.values(slot.armTemplateIds))
					if (typeof armChunkId === 'string') walk(armChunkId, deferred);
				continue;
			}
			if (slot.kind !== 'child-component') continue;
			if (deferred) edgeIds.push(slot.componentEdgeId);
			if (slot.projectionChunkId) walk(slot.projectionChunkId, deferred);
		}
	};
	walk(projectionChunkId, false);
	return edgeIds;
}

/**
 * The projecting children whose projections enclose one component edge in this
 * module, innermost first.
 *
 * A projecting child that roots no widget family is a PART, and the families in
 * scope for its boundary check are the enclosing widget's — without them a root
 * written into that part's own children is not recognised as an instance
 * boundary, and its seeds land in the enclosing instance's map on top of the
 * seed that instance's root wrote. Arm, row, and async chunks are stepped
 * THROUGH: they change whether a part renders, never which widget encloses it.
 * The CSR twin is `enclosingProjectingChildNames` in @markless/web.
 */
export function enclosingProjectingEdgeIds(
	chunks: PublicRenderModuleInput['renderData']['chunks'],
	componentEdgeId: string,
): string[] {
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
	const found: string[] = [];
	const walked = new Set<string>();
	let chunkId = chunkOfEdge.get(componentEdgeId);
	while (chunkId !== undefined && !walked.has(chunkId)) {
		walked.add(chunkId);
		const ownerEdgeId = ownerEdgeOfChunk.get(chunkId);
		if (ownerEdgeId === undefined) {
			chunkId = parentChunkOf.get(chunkId);
			continue;
		}
		found.push(ownerEdgeId);
		chunkId = chunkOfEdge.get(ownerEdgeId);
	}
	return found;
}

/**
 * The parts of one widget that a branch arm holds, each with the arms it sits
 * inside. The compiler knows the seed and which arm chunk holds the part; only
 * WHICH arm renders is a render-time answer, so the emitted seed pass carries
 * the arm test and asks it at render time. A repeat row or an async arm is
 * still not walked: those have their own render-time cardinality and lifecycle.
 */
export function armScopedSeedRefsUnder(
	chunks: PublicRenderModuleInput['renderData']['chunks'],
	projectionChunkId: string,
): ArmScopedSeedRef[] {
	const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
	const refs: ArmScopedSeedRef[] = [];
	const walked = new Set<string>();
	const walk = (
		chunkId: string,
		armGuards: ArmScopedSeedRef['armGuards'],
		projectingAncestorEdgeIds: ReadonlyArray<string>,
	) => {
		if (walked.has(chunkId)) return;
		walked.add(chunkId);
		for (const slot of byId.get(chunkId)?.slots ?? []) {
			if (slot.kind === 'branch') {
				slot.armTemplateIds.forEach((armChunkId, armIndex) =>
					walk(
						armChunkId,
						[...armGuards, { branchSiteId: slot.branchSiteId, armIndex }],
						projectingAncestorEdgeIds,
					),
				);
				continue;
			}
			if (slot.kind !== 'child-component') continue;
			if (armGuards.length > 0)
				refs.push({ edgeId: slot.componentEdgeId, armGuards, projectingAncestorEdgeIds });
			if (slot.projectionChunkId)
				walk(slot.projectionChunkId, armGuards, [
					...projectingAncestorEdgeIds,
					slot.componentEdgeId,
				]);
		}
	};
	walk(projectionChunkId, [], []);
	return refs;
}

/**
 * The component edges whose projections enclose a component's own `children`,
 * outermost first, each with the instance path it contributes. Composition —
 * not the consumer — placed those children inside that composed child, so a
 * part written into this component belongs to the innermost of these edges that
 * roots a widget. The chain is a build-time fact of THIS module; which of its
 * links roots a widget is answered where that link's component was compiled.
 */
export function childrenProjectionChain(
	chunks: PublicRenderModuleInput['renderData']['chunks'],
	componentName: string,
	instanceSegment: (componentEdgeId: string) => string,
): Array<{ readonly componentEdgeId: string; readonly instancePath: string }> {
	const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
	const found: Array<{ componentEdgeId: string; instancePath: string }> = [];
	// A self-composing component's projection chunks reach themselves; how deep it
	// unrolls is a render-time answer, so the build-time walk visits each once.
	const walked = new Set<string>();
	const walk = (
		chunkId: string,
		chain: ReadonlyArray<{ componentEdgeId: string; instancePath: string }>,
	): boolean => {
		if (walked.has(chunkId)) return false;
		walked.add(chunkId);
		for (const slot of byId.get(chunkId)?.slots ?? []) {
			if (slot.kind === 'text' && isOwnChildrenResidue(slot.residue)) {
				found.push(...chain);
				return true;
			}
			if (slot.kind !== 'child-component' || !slot.projectionChunkId) continue;
			const instancePath =
				(chain[chain.length - 1]?.instancePath ?? '') + instanceSegment(slot.componentEdgeId);
			if (walk(slot.projectionChunkId, [...chain, { componentEdgeId: slot.componentEdgeId, instancePath }]))
				return true;
		}
		return false;
	};
	for (const chunk of chunks)
		if (chunk.componentName === componentName && chunk.kind === 'template' && walk(chunk.id, []))
			break;
	return found;
}

// The one slot that renders a component's own `children` prop, raw.
function isOwnChildrenResidue(residue: { readonly kind: string }): boolean {
	const read = residue as { kind: string; graphNodeId?: string; path?: ReadonlyArray<string> };
	return (
		read.kind === 'graph-read' &&
		read.graphNodeId === 'prop:props' &&
		read.path?.length === 1 &&
		read.path[0] === 'children'
	);
}

/**
 * How a composing module learns where a placed child's own composition puts the
 * children written into it: the marker answers the instance path of the widget
 * root that encloses them, or the empty string when no composed root does. The
 * families each link roots are asked at module load, once, from the same marker
 * the boundary check reads — so nothing is sensed at render time.
 */
export function childrenWidgetRootMarkerLine(
	chain: ReadonlyArray<{
		readonly instancePath: string;
		readonly surfaceArgs: string | undefined;
	}>,
	functionName: string,
): string | null {
	const links = chain.flatMap((link) =>
		link.surfaceArgs
			? [`marklessSsrWidgetRoots(${link.surfaceArgs}).length?${JSON.stringify(link.instancePath)}:`]
			: [],
	);
	// Innermost first: the nearest composed root is the one that owns the parts.
	return links.length > 0
		? `${functionName}.marklessChildrenWidgetRoot = ${[...links].reverse().join('')}'';`
		: null;
}

/**
 * The component that ROOTS each widget-scoped shared definition THIS MODULE
 * DECLARES: the one whose payload owns the definition's cells, so every rendered
 * instance of it starts a widget instance of its own. The seeding component
 * roots it — its seed has to land in the payload it serves — and with no seed,
 * the first component that resolves the definition does.
 *
 * A definition this module merely adopted from an import is the declaring
 * module's to root: a consumer component that reads one is a part of somebody
 * else's widget, not the start of a widget of its own, and rooting it here would
 * spawn a second instance beside the one it meant to read.
 */
export function widgetRootComponents(input: PublicRenderModuleInput): Map<string, string> {
	const seedingComponent = new Map<string, string>();
	for (const symbol of input.symbolResolver.symbols) {
		if (symbol.kind !== 'shared-seed' || !symbol.componentName) continue;
		const definitionId = symbol.graphNodeId.slice(0, symbol.graphNodeId.lastIndexOf('/'));
		if (!seedingComponent.has(definitionId))
			seedingComponent.set(definitionId, symbol.componentName);
	}
	const roots = new Map<string, string>();
	for (const definition of input.semanticGraph.sharedDefinitions) {
		if (definition.scope !== 'widget') continue;
		// The id carries the declaring module's filename, so it answers ownership.
		if (
			definition.id !== sharedDefinitionId(input.semanticGraph.filename, definition.exportedName)
		)
			continue;
		const resolver = input.semanticGraph.sharedInstances.find(
			(instance) => instance.definitionId === definition.id && instance.componentName,
		);
		const owner = seedingComponent.get(definition.id) ?? resolver?.componentName;
		if (owner) roots.set(definition.id, owner);
	}
	return roots;
}

/** The widget-scoped definitions one component roots, spelled as the payload spells them. */
export function widgetRootDefinitionIds(
	input: PublicRenderModuleInput,
	componentName: string,
): string[] {
	return [...widgetRootComponents(input)].flatMap(([definitionId, owner]) =>
		owner === componentName ? [definitionId] : [],
	);
}

/**
 * How a composing module learns that a child it places is a widget ROOT: the
 * marker names the families that child starts, so a root nested inside another
 * root's projection is recognised as an instance boundary at render time, in
 * the module that placed it, without that module importing the child's graph.
 */
export function widgetRootMarkerLine(
	definitionIds: ReadonlyArray<string>,
	functionName: string,
	// The child this component composes around its own children roots its own
	// families, and a rendered instance of this component starts them too - so a
	// sibling that composes the same family is an instance boundary. Which
	// families that child roots is answered where it was compiled, so the marker
	// asks it at module load.
	composedRootSurfaceArgs: ReadonlyArray<string> = [],
): string | null {
	const composed = composedRootSurfaceArgs.map((args) => `...marklessSsrWidgetRoots(${args})`);
	if (definitionIds.length === 0 && composed.length === 0) return null;
	const entries = [...definitionIds.map((id) => JSON.stringify(id)), ...composed];
	return `${functionName}.marklessWidgetRoots = [${entries.join(',')}];`;
}

/**
 * The shared() element() handles a rendered instance of one component BINDS with
 * `el={handle}` — its own markup's bindings plus those of the components it
 * composes in this module, because rendering it renders them.
 *
 * This is the positive half of the IDREF omission. A widget's seed phase files
 * one of these for every part the render will place, before any part renders, so
 * an IDREF position can ask whether the element its handle names is among them.
 * A handle absent from the set names no rendered element in this instance; a
 * handle that was never bound ANYWHERE is still the build error it was, because
 * that answer is settled before this set is ever built.
 */
export function componentBoundElementHandles(
	input: PublicRenderModuleInput,
	componentName: string,
): string[] {
	const graph = input.semanticGraph;
	const rootName = input.renderData.root?.componentName;
	const ownedBy = (owner: string | undefined) => owner ?? rootName;
	const direct = new Map<string, string[]>();
	for (const binding of graph.elementHandleBindings) {
		// `el={toggle.triggerEl}` spells a path through the shared instance, never
		// the handle's bare declared name, so the id has to come from the same
		// resolution the arena uses rather than from a name lookup.
		const resolved = resolveSharedInstanceGraphPath(
			binding.handleName,
			graph,
			binding.componentName,
		);
		const owner = ownedBy(binding.componentName);
		if (
			!resolved ||
			resolved.path.length > 0 ||
			resolved.binding.kind !== 'element' ||
			resolved.binding.sharedDefinitionId === undefined ||
			owner === undefined
		)
			continue;
		direct.set(owner, [...(direct.get(owner) ?? []), resolved.binding.id]);
	}
	const collected = new Set<string>();
	const walked = new Set<string>();
	const walk = (name: string) => {
		if (walked.has(name)) return;
		walked.add(name);
		for (const id of direct.get(name) ?? []) collected.add(id);
		// Only a child compiled HERE: an imported one answers from its own module,
		// through the marker the composing module asks at render time.
		for (const edge of graph.componentEdges)
			if (edge.parentComponentName === name && !edge.importSource)
				walk(edge.childComponentName);
	};
	walk(componentName);
	return [...collected];
}

/**
 * How a composing module learns which shared() element() handles a placed child
 * binds. Read at seed time, before the child renders, so the widget's IDREF
 * positions can be answered in document order. An imported child's own bindings
 * are spliced from ITS marker, so the answer stays the child's to give.
 */
export function elementHandleMarkerLine(
	handleIds: ReadonlyArray<string>,
	functionName: string,
	importedChildSurfaceArgs: ReadonlyArray<string> = [],
): string | null {
	const imported = importedChildSurfaceArgs.map(
		(args) => `...(${elementHandleMarkerSource(args)})`,
	);
	if (handleIds.length === 0 && imported.length === 0) return null;
	return `${functionName}.marklessElementHandles = [${[
		...handleIds.map((id) => JSON.stringify(id)),
		...imported,
	].join(',')}];`;
}

/** Reading one placed child's element()-handle marker, from its surface args. */
export function elementHandleMarkerSource(surfaceArgs: string): string {
	return `marklessSsrComponentPart(${surfaceArgs})?.renderSsr?.marklessElementHandles??[]`;
}

/** The shared-instance seeds one component's body writes from its own props. */
export function componentSharedSeeds(
	input: PublicRenderModuleInput,
	componentName: string,
): ReadonlyArray<SharedSeedSymbol> {
	return input.symbolResolver.symbols.flatMap((symbol) =>
		symbol.kind === 'shared-seed' && symbol.componentName === componentName
			? [
					{
						graphNodeId: symbol.graphNodeId,
						path: symbol.path ?? [],
						componentName: symbol.componentName,
						source: symbol.source,
						...(symbol.callbackSlotPropName !== undefined
							? { callbackSlotPropName: symbol.callbackSlotPropName }
							: {}),
					},
				]
			: [],
	);
}

/**
 * The seed pass a projecting component answers before the components projected
 * into it render: it fills the caller's map from its own props and returns
 * without rendering, so a projected part reads the seeded value.
 */
export function sharedSeedPassLines(
	seeds: ReadonlyArray<SharedSeedSymbol>,
	staticValuesName: string,
	// Lines that seed the widget root this component composes around its own
	// children: that root is composed during this component's render, which is
	// after the consumer rendered those children, so the seed phase runs it.
	forwardLines: ReadonlyArray<string> = [],
): string[] {
	if (seeds.length === 0 && forwardLines.length === 0) return [];
	const nodeIds = [...new Set(seeds.map((seed) => seed.graphNodeId))];
	return [
		'	if (marklessSsrRenderContext?.marklessSharedSeeds) {',
		'		const marklessSsrSeeds = marklessSsrRenderContext.marklessSharedSeeds;',
		...nodeIds.map((graphNodeId) => {
			const id = JSON.stringify(graphNodeId);
			return `		if (!marklessSsrSeeds.has(${id})) marklessSsrSeeds.set(${id}, ${staticValuesName}.get(${id}));`;
		}),
		// An assignment always assigns, so an omitted prop with no destructuring
		// default seeds undefined the way plain JavaScript would.
		...seeds.map((seed) => {
			const id = JSON.stringify(seed.graphNodeId);
			return `		{ const marklessSharedSeed = (${sharedSeedSource(seed)}); marklessSsrSeeds.set(${id}, ${sharedSeedValueSource(
				`marklessSsrSeeds.get(${id})`,
				seed.path,
				'marklessSharedSeed',
			)}); }`;
		}),
		...forwardLines,
		'		return;',
		'	}',
	];
}

/**
 * How a composing module learns that an imported component seeds: the seed pass
 * is the one call a parent makes before rendering the projected children, and a
 * component without seeds must never be rendered twice to find that out.
 */
export function sharedSeedMarkerLine(
	seeds: ReadonlyArray<SharedSeedSymbol>,
	functionName: string,
	forwardLines: ReadonlyArray<string> = [],
): string | null {
	return seeds.length > 0 || forwardLines.length > 0
		? `${functionName}.marklessSeedsShared = true;`
		: null;
}

/** A component that reads a widget-scoped shared instance renders from the seeds its widget root wrote. */
export function sharedSeedConsumeLine(
	input: PublicRenderModuleInput,
	componentName: string,
	valuesName: string,
): string | null {
	const widgetScoped = new Set(
		input.semanticGraph.sharedDefinitions.flatMap((definition) =>
			definition.scope === 'widget' ? [definition.id] : [],
		),
	);
	const readsWidgetInstance = (input.semanticGraph.sharedInstances ?? []).some(
		(instance) =>
			instance.componentName === componentName && widgetScoped.has(instance.definitionId),
	);
	return readsWidgetInstance
		? `	for (const [marklessSeedId, marklessSeedValue] of marklessSsrRenderContext?.sharedSeeds ?? []) ${valuesName}.set(marklessSeedId, marklessSeedValue);`
		: null;
}

// A callback slot seeds the id of the symbol this root's own prop was compiled
// into, which the composing edge handed it among its props.
function sharedSeedSource(seed: SharedSeedSymbol): string {
	return seed.callbackSlotPropName === undefined
		? seed.source
		: `marklessSsrCallbackSymbol(props, ${JSON.stringify([seed.callbackSlotPropName])})`;
}

// The seed replaces the node's whole value, so a property assignment returns the
// current value with that property merged in.
function sharedSeedValueSource(
	readSource: string,
	path: ReadonlyArray<string>,
	valueSource: string,
): string {
	const [head, ...rest] = path;
	if (head === undefined) return valueSource;
	const nested = sharedSeedValueSource(`${readSource}?.[${JSON.stringify(head)}]`, rest, valueSource);
	return `{ ...${readSource}, [${JSON.stringify(head)}]: ${nested} }`;
}
