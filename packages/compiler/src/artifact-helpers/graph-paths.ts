import type {
	SemanticGraphAlias,
	SemanticGraphArtifact,
	SemanticGraphBinding,
} from '../artifacts.ts';
import {
	compilerGraphPathIndexSegmentMatcher,
	compilerGraphPathStringSegmentMatcher,
} from '../source-patterns.ts';

export function resolveGraphPath(
	source: string,
	bindings: ReadonlyMap<string, SemanticGraphBinding>,
	aliases: ReadonlyMap<string, SemanticGraphAlias> = new Map(),
): { readonly binding: SemanticGraphBinding; readonly path: ReadonlyArray<string> } | null {
	const segments = splitStaticGraphPath(source);
	return resolveGraphSegments(segments, bindings, aliases, new Set());
}

export function graphBindingMap(
	graph: Pick<SemanticGraphArtifact, 'graphBindings'>,
	sharedDefinitionId?: string | null,
): ReadonlyMap<string, SemanticGraphBinding> {
	const bindings = new Map<string, SemanticGraphBinding>();

	for (const binding of graph.graphBindings) {
		if (!isInGraphScope(binding.sharedDefinitionId, sharedDefinitionId)) continue;
		bindings.set(binding.name, binding);
	}

	return bindings;
}

export function semanticAliasMap(
	graph: Pick<SemanticGraphArtifact, 'aliases'>,
	sharedDefinitionId?: string | null,
): ReadonlyMap<string, SemanticGraphAlias> {
	const aliases = new Map<string, SemanticGraphAlias>();

	for (const alias of graph.aliases) {
		if (!isInGraphScope(alias.sharedDefinitionId, sharedDefinitionId)) continue;
		aliases.set(alias.name, alias);
	}

	return aliases;
}

function isInGraphScope(
	valueSharedDefinitionId: string | undefined,
	requestedSharedDefinitionId: string | null | undefined,
): boolean {
	if (requestedSharedDefinitionId === undefined) return true;
	if (requestedSharedDefinitionId === null) return valueSharedDefinitionId === undefined;

	return valueSharedDefinitionId === requestedSharedDefinitionId;
}

export function graphPathSource(
	binding: SemanticGraphBinding,
	path: ReadonlyArray<string>,
): string {
	return [binding.name, ...path].join('.');
}

export function uniqueBy<T>(values: T[], keyOf: (value: T) => string): T[] {
	const seen = new Set<string>();
	const unique: T[] = [];

	for (const value of values) {
		const key = keyOf(value);
		if (seen.has(key)) continue;

		seen.add(key);
		unique.push(value);
	}

	return unique;
}

function resolveGraphSegments(
	segments: ReadonlyArray<string>,
	bindings: ReadonlyMap<string, SemanticGraphBinding>,
	aliases: ReadonlyMap<string, SemanticGraphAlias>,
	visitedAliases: Set<string>,
): { readonly binding: SemanticGraphBinding; readonly path: ReadonlyArray<string> } | null {
	if (segments.length === 0) return null;

	const alias = aliases.get(segments[0]);
	if (alias) {
		if (visitedAliases.has(alias.name)) return null;
		if (aliasExcludesPath(alias, segments.slice(1))) return null;

		visitedAliases.add(alias.name);
		return resolveGraphSegments(
			[...splitStaticGraphPath(alias.target), ...segments.slice(1)],
			bindings,
			aliases,
			visitedAliases,
		);
	}

	const binding = bindings.get(segments[0]);
	if (!binding) return null;

	return {
		binding,
		path: segments.slice(1),
	};
}

function aliasExcludesPath(alias: SemanticGraphAlias, path: ReadonlyArray<string>): boolean {
	if (path.length === 0) return false;

	return (alias.excludedPaths ?? []).some((excludedPath) => {
		if (excludedPath.length > path.length) return false;

		return excludedPath.every((segment, index) => segment === path[index]);
	});
}

// Graph/member path parsing for compiler artifacts, not filesystem or URL path handling.
export function splitStaticGraphPath(source: string): string[] {
	return source
		.replace(compilerGraphPathStringSegmentMatcher, '.$1')
		.replace(compilerGraphPathIndexSegmentMatcher, '.$1')
		.split('.')
		.map((segment) => segment.trim())
		.filter(Boolean);
}
