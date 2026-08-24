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
};

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
	return {
		elementCount,
		projection: {
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
	};
}

// `{children}` is the one raw text slot the markup collector mints, and it does
// so exactly when the expression names the `children` prop.
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
	const chunk = scope.chunks.find((candidate) => candidate.id === chunkId);
	if (!chunk) return UNKNOWN;
	return countSiblings(
		scope,
		chunk,
		[],
		() => true,
		new Set(seen).add(chunkId),
		projection,
	);
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
	for (const index of siblingIndexes(chunk, parentPath)) {
		if (!keep(index)) continue;
		const count = positionCount(scope, chunk, parentPath, index, seen, projection);
		if (count === UNKNOWN) return UNKNOWN;
		total += count;
	}
	return total;
}

// A child index with neither a host nor an anchor slot is static text, which
// renders no element - so only the occupied indexes need classifying.
function siblingIndexes(
	chunk: SemanticMarkupChunk,
	parentPath: ReadonlyArray<number>,
): ReadonlyArray<number> {
	const indexes = new Set<number>();
	for (const host of chunk.hosts) {
		const path = host.coordinate.path;
		if (isDirectChild(path, parentPath)) indexes.add(path[path.length - 1]!);
	}
	for (const slot of chunk.slots) {
		if (slot.coordinate.kind !== 'comment-anchor') continue;
		const path = slot.coordinate.path;
		if (isDirectChild(path, parentPath)) indexes.add(path[path.length - 1]!);
	}
	return [...indexes];
}

function positionCount(
	scope: Scope,
	chunk: SemanticMarkupChunk,
	parentPath: ReadonlyArray<number>,
	index: number,
	seen: ReadonlySet<string>,
	projection: ModuleGraphInterfaceElementCount,
): ModuleGraphInterfaceElementCount {
	const isAt = (path: ReadonlyArray<number>) =>
		isDirectChild(path, parentPath) && path[path.length - 1] === index;
	if (chunk.hosts.some((host) => isAt(host.coordinate.path))) {
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
	const slot = chunk.slots.find(
		(candidate) =>
			candidate.coordinate.kind === 'comment-anchor' && isAt(candidate.coordinate.path),
	);
	return slot ? slotCount(scope, chunk, slot, seen, projection) : 0;
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

function isDirectChild(
	path: ReadonlyArray<number>,
	parentPath: ReadonlyArray<number>,
): boolean {
	return (
		path.length === parentPath.length + 1 &&
		parentPath.every((step, depth) => path[depth] === step)
	);
}
