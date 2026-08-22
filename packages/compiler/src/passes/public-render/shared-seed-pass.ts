import type { PublicRenderModuleInput } from '../../artifacts.ts';

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

/** The projected part edge ids alone, for callers that place no boundary guard. */
export function projectedEdgeIdsUnder(
	chunks: PublicRenderModuleInput['renderData']['chunks'],
	projectionChunkId: string,
): string[] {
	return projectedSeedPartsUnder(chunks, projectionChunkId).map((part) => part.edgeId);
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
 * The component that ROOTS each widget-scoped shared definition of this module:
 * the one whose payload owns the definition's cells, so every rendered instance
 * of it starts a widget instance of its own. The seeding component roots it —
 * its seed has to land in the payload it serves — and with no seed, the first
 * component that resolves the definition does.
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
