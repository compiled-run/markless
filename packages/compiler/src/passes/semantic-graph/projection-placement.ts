import type {
	ModuleGraphInterfaceElementCount,
	ModuleGraphInterfaceProjection,
	SemanticBranchSite,
	SemanticMarkupChunk,
	SemanticMarkupSlot,
} from '../../artifacts.ts';

/**
 * Where one component's `{children}` hole sits, and how many elements each
 * chunk renders around it, published on the module-graph interface so an
 * importer can place its projected children while compiling.
 *
 * Every sibling is classified, never guessed — the same sweep the repeat's row
 * offset uses. An element is a host record at that exact child index
 * (collect-elements mints a host id for every host element, so an element
 * without one cannot exist), and it counts as itself plus every element it
 * renders beneath it: these are counts of elements in document order, not of
 * sibling positions, so `<span><i></i></span>` is two.
 * Static text and a `{text}` slot occupy an index
 * and render no element. Anything whose element count render time decides -
 * a repeat, an async boundary, a dynamic host that may be omitted, a branch
 * whose arms disagree, a child component from a module this compile never saw -
 * answers 'unknown', and 'unknown' absorbs the whole side rather than letting a
 * consumer trust a number nothing defends.
 *
 * A child component this module DID compile composes instead of absorbing: its
 * own chunks say how many elements it renders, and what this component projects
 * into it fills its hole in turn, so a chain of one-element wrappers still
 * counts as one element.
 */

const UNKNOWN = 'unknown' as const;

type Scope = {
	readonly chunks: ReadonlyArray<SemanticMarkupChunk>;
	// Components that authored an `@switch`. Its arms can all agree on a count
	// and the site still render nothing when no case matches, so a branch inside
	// such a component stays 'unknown'. An `@if` always emits both arms - the
	// missing `else` is an empty arm chunk - so its agreement is total.
	readonly switchComponents: ReadonlySet<string>;
	// A `@switch` outside every component cannot be attributed to one, so no
	// component's branches may be resolved.
	readonly unattributedSwitch: boolean;
	readonly chunkById: Map<string, SemanticMarkupChunk>;
	readonly childIndexes: Map<SemanticMarkupChunk, ChildIndex>;
};

// What occupies each child index under one parent path: a host wins over an anchor slot at the same index.
type ChildPosition = { host: boolean; slot: SemanticMarkupSlot | undefined };
type ChildIndex = Map<string, Map<number, ChildPosition>>;

type ChunkScopeInput = {
	readonly chunks: ReadonlyArray<SemanticMarkupChunk>;
	readonly branchSites: ReadonlyArray<SemanticBranchSite>;
};

type ProjectionSite = {
	readonly chunk: SemanticMarkupChunk;
	readonly path: ReadonlyArray<number>;
};

/** How many elements one chunk renders, each host counted with its subtree. */
export function chunkElementCount(
	input: ChunkScopeInput & { readonly chunkId: string },
): ModuleGraphInterfaceElementCount {
	return countChunk(scopeOf(input), input.chunkId, UNKNOWN, new Set());
}

/** The projection-placement facts for one component's interface entry. */
export function projectionPlacementFields(
	input: ChunkScopeInput & {
		readonly componentName: string;
		readonly rootChunkId: string;
	},
): {
	readonly elementCount: ModuleGraphInterfaceElementCount;
	readonly projection?: ModuleGraphInterfaceProjection;
} {
	const scope = scopeOf(input);
	const elementCount = countChunk(scope, input.rootChunkId, UNKNOWN, new Set());
	const sites = projectionSites(input.chunks, input.componentName);
	if (sites.length === 0) return { elementCount };
	// Two `{children}` holes have no single placement, and picking one of them
	// would publish a position the other contradicts.
	if (sites.length > 1) {
		return {
			elementCount,
			projection: {
				elementsBeforeProjection: UNKNOWN,
				elementsAfterProjection: UNKNOWN,
				projectionInsideConstruct: true,
			},
		};
	}

	const site = sites[0]!;
	const parentPath = site.path.slice(0, -1);
	const index = site.path[site.path.length - 1] ?? 0;
	const insideConstruct = site.chunk.id !== input.rootChunkId;
	const parentHost = parentPath.length
		? site.chunk.hosts.find(
				(host) =>
					host.coordinate.path.length === parentPath.length &&
					parentPath.every((step, depth) => host.coordinate.path[depth] === step),
			)
		: undefined;
	return {
		elementCount,
		projection: {
			...(parentHost ? { parentHostNodeId: parentHost.hostNodeId } : {}),
			elementsBeforeProjection: countSiblings(
				scope,
				site.chunk,
				parentPath,
				(candidate) => candidate < index,
				new Set([site.chunk.id]),
				UNKNOWN,
			),
			elementsAfterProjection: countSiblings(
				scope,
				site.chunk,
				parentPath,
				(candidate) => candidate > index,
				new Set([site.chunk.id]),
				UNKNOWN,
			),
			projectionInsideConstruct: insideConstruct,
			...(insideConstruct ? { projectionChunkId: site.chunk.id } : {}),
		},
	};
}

function scopeOf(input: ChunkScopeInput): Scope {
	return {
		chunks: input.chunks,
		switchComponents: new Set(
			input.branchSites.flatMap((site) =>
				site.kind === 'switch' && site.componentName ? [site.componentName] : [],
			),
		),
		unattributedSwitch: input.branchSites.some(
			(site) => site.kind === 'switch' && !site.componentName,
		),
		chunkById: new Map(),
		childIndexes: new Map(),
	};
}

// `{children}` is the one raw text slot the markup collector mints: a read of the
// component's own `children` prop, whatever local name it is bound to.
function projectionSites(
	chunks: ReadonlyArray<SemanticMarkupChunk>,
	componentName: string,
): ReadonlyArray<ProjectionSite> {
	const sites: ProjectionSite[] = [];
	for (const chunk of chunks) {
		if (chunk.componentName !== componentName) continue;
		for (const slot of chunk.slots) {
			if (slot.kind !== 'text' || slot.raw !== true) continue;
			if (slot.coordinate.kind !== 'comment-anchor') continue;
			sites.push({ chunk, path: slot.coordinate.path });
		}
	}
	return sites;
}

function countChunk(
	scope: Scope,
	chunkId: string,
	projection: ModuleGraphInterfaceElementCount,
	seen: ReadonlySet<string>,
): ModuleGraphInterfaceElementCount {
	// A chunk that reaches itself through an edge has no countable depth.
	if (seen.has(chunkId)) return UNKNOWN;
	if (scope.chunkById.size === 0)
		for (const candidate of scope.chunks)
			if (!scope.chunkById.has(candidate.id)) scope.chunkById.set(candidate.id, candidate);
	const chunk = scope.chunkById.get(chunkId);
	if (!chunk) return UNKNOWN;
	return countSiblings(scope, chunk, [], () => true, new Set(seen).add(chunkId), projection);
}

function countSiblings(
	scope: Scope,
	chunk: SemanticMarkupChunk,
	parentPath: ReadonlyArray<number>,
	keep: (index: number) => boolean,
	seen: ReadonlySet<string>,
	projection: ModuleGraphInterfaceElementCount,
): ModuleGraphInterfaceElementCount {
	let total = 0;
	const positions = childIndexOf(scope, chunk).get(pathKey(parentPath));
	if (!positions) return total;
	for (const [index, position] of positions) {
		if (!keep(index)) continue;
		const count = positionCount(scope, chunk, parentPath, index, position, seen, projection);
		if (count === UNKNOWN) return UNKNOWN;
		total += count;
	}
	return total;
}

function pathKey(path: ReadonlyArray<number>): string {
	return path.join(',');
}

// A child index with neither a host nor an anchor slot is static text, which
// renders no element - so only the occupied indexes are recorded.
function childIndexOf(scope: Scope, chunk: SemanticMarkupChunk): ChildIndex {
	const cached = scope.childIndexes.get(chunk);
	if (cached) return cached;
	const index: ChildIndex = new Map();
	const at = (path: ReadonlyArray<number>) => {
		const parent = pathKey(path.slice(0, -1));
		let positions = index.get(parent);
		if (!positions) index.set(parent, (positions = new Map()));
		const child = path[path.length - 1]!;
		let position = positions.get(child);
		if (!position) positions.set(child, (position = { host: false, slot: undefined }));
		return position;
	};
	for (const host of chunk.hosts) {
		if (host.coordinate.path.length > 0) at(host.coordinate.path).host = true;
	}
	for (const slot of chunk.slots) {
		if (slot.coordinate.kind !== 'comment-anchor' || slot.coordinate.path.length === 0)
			continue;
		const position = at(slot.coordinate.path);
		position.slot ??= slot;
	}
	scope.childIndexes.set(chunk, index);
	return index;
}

function positionCount(
	scope: Scope,
	chunk: SemanticMarkupChunk,
	parentPath: ReadonlyArray<number>,
	index: number,
	position: ChildPosition,
	seen: ReadonlySet<string>,
	projection: ModuleGraphInterfaceElementCount,
): ModuleGraphInterfaceElementCount {
	if (position.host) {
		// A host is itself plus everything it renders beneath it, so a DOM census
		// walking the served markup meets the same number.
		const inside = countSiblings(
			scope,
			chunk,
			[...parentPath, index],
			() => true,
			seen,
			projection,
		);
		return inside === UNKNOWN ? UNKNOWN : 1 + inside;
	}
	return position.slot ? slotCount(scope, chunk, position.slot, seen, projection) : 0;
}

function slotCount(
	scope: Scope,
	chunk: SemanticMarkupChunk,
	slot: SemanticMarkupSlot,
	seen: ReadonlySet<string>,
	projection: ModuleGraphInterfaceElementCount,
): ModuleGraphInterfaceElementCount {
	switch (slot.kind) {
		case 'text':
			// The `{children}` hole renders whatever the caller passed: unknown from
			// here, known when a parent's own projection chunk is being counted into it.
			return slot.raw ? projection : 0;
		case 'branch': {
			if (scope.unattributedSwitch || scope.switchComponents.has(chunk.componentName)) {
				return UNKNOWN;
			}
			const counts = slot.armTemplateIds.map((armId) =>
				countChunk(scope, armId, projection, seen),
			);
			const first = counts[0];
			return first !== undefined && counts.every((count) => count === first)
				? first
				: UNKNOWN;
		}
		case 'child-component': {
			const projected = slot.projectionChunkId
				? countChunk(scope, slot.projectionChunkId, projection, seen)
				: 0;
			return countChunk(scope, slot.childTemplateId, projected, seen);
		}
		// Rows, arms, and an omittable host are all decided while rendering.
		case 'repeat':
		case 'async':
		case 'dynamic-host':
			return UNKNOWN;
		default:
			return UNKNOWN;
	}
}
