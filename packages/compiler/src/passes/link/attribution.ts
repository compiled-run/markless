// Pass `execution-attribution`: flattens the linked module graph into the
// per-route scope tables the execution ledger reads. Specifier resolution and
// source encoding are inputs, not work this pass does: it never touches a
// bundler plugin context.
import type {
	ExecutionAttributionArtifact,
	ExecutionAttributionChild,
	ExecutionAttributionInput,
	ExecutionAttributionModuleManifest,
} from '../../artifacts.ts';

export const EXECUTION_ATTRIBUTION_PASS_ID = 'execution-attribution';

type AttributionNode = {
	readonly source: string;
	readonly symbolRoutes: ReadonlyArray<{ readonly prefix: string; readonly importSource: string }>;
};

export function computeExecutionAttribution(
	input: ExecutionAttributionInput,
): ExecutionAttributionArtifact {
	const nodes = canonicalExecutionAttributionNodes(input.moduleManifests);
	const childrenByRoute = canonicalChildTable(input.childTable);
	const roots = executionAttributionRoots(nodes, childrenByRoute, input.resolveSpecifier);
	const tables = Object.fromEntries(
		[...roots]
			.sort()
			.map((source) => [
				executionAttributionRouteKey(source, input.root),
				flattenExecutionAttributionScopes(source, nodes, childrenByRoute, input),
			]),
	);
	return {
		passId: EXECUTION_ATTRIBUTION_PASS_ID,
		tables,
		roots: [...roots].sort(),
		diagnostics: [],
	};
}

// The consumer looks these tables up by the bare path the document names (the
// route file, or the single root of a routeless build). A transform variant's
// query — `?markless-symbols`, `?markless-resume`, `?markless-prerender-wake` —
// is a build-side name for the same source file, so the variants of one source
// merge into one node. Without this, a component reached as a child under its
// bare path and as a root under its queried path is both, and no key the
// consumer can produce ever matches.
function canonicalExecutionAttributionSource(source: string): string {
	return source.split('?')[0]!.split('#')[0]!;
}

function canonicalExecutionAttributionNodes(
	manifests: Iterable<ExecutionAttributionModuleManifest>,
): ReadonlyMap<string, AttributionNode> {
	const routesBySource = new Map<string, Map<string, string>>();
	// Sorted so a prefix claimed by two variants resolves the same way on every
	// build; the emitted map is a permanent artifact, not a per-run reading.
	const sorted = [...manifests].sort((left, right) => left.source.localeCompare(right.source));
	for (const manifest of sorted) {
		const source = canonicalExecutionAttributionSource(manifest.source);
		const routes = routesBySource.get(source) ?? new Map<string, string>();
		for (const route of manifest.symbolRoutes ?? [])
			if (!routes.has(route.prefix)) routes.set(route.prefix, route.importSource);
		routesBySource.set(source, routes);
	}
	return new Map(
		[...routesBySource].map(([source, routes]) => [
			source,
			{
				source,
				symbolRoutes: [...routes].map(([prefix, importSource]) => ({ prefix, importSource })),
			},
		]),
	);
}

function canonicalChildTable(
	children: Iterable<ExecutionAttributionChild>,
): ReadonlyMap<string, string> {
	return new Map(
		[...children]
			.map(
				(child) =>
					[
						routeKey(
							canonicalExecutionAttributionSource(child.parent),
							child.specifier,
						),
						canonicalExecutionAttributionSource(child.source),
					] as const,
			)
			.sort((left, right) => left[0].localeCompare(right[0]) || left[1].localeCompare(right[1])),
	);
}

function executionAttributionRoots(
	nodes: ReadonlyMap<string, AttributionNode>,
	childrenByRoute: ReadonlyMap<string, string>,
	resolveSpecifier: ExecutionAttributionInput['resolveSpecifier'],
): string[] {
	const children = new Set<string>();
	for (const node of nodes.values()) {
		for (const route of node.symbolRoutes) {
			const child = resolvedRouteSource(
				node.source,
				route.importSource,
				childrenByRoute,
				resolveSpecifier,
			);
			if (nodes.has(child)) children.add(child);
		}
	}
	return [...nodes.keys()].filter((source) => !children.has(source));
}

function executionAttributionRouteKey(source: string, root: string | undefined): string {
	const prefix = root ? `${root.replace(/[/\\]+$/, '')}/` : '';
	return (prefix && source.startsWith(prefix) ? source.slice(prefix.length) : source).replace(
		/^[/\\]+/,
		'',
	);
}

function flattenExecutionAttributionScopes(
	root: string,
	nodes: ReadonlyMap<string, AttributionNode>,
	childrenByRoute: ReadonlyMap<string, string>,
	input: ExecutionAttributionInput,
): Record<string, string> {
	const scopes: Record<string, string> = {};
	const visit = (source: string, scope: string, seen: ReadonlySet<string>) => {
		if (seen.has(source)) return;
		scopes[scope] = input.encodeSource(source);
		const manifest = nodes.get(source);
		for (const route of manifest?.symbolRoutes ?? []) {
			const child = resolvedRouteSource(
				source,
				route.importSource,
				childrenByRoute,
				input.resolveSpecifier,
			);
			if (!nodes.has(child)) continue;
			visit(child, scope + route.prefix, new Set([...seen, source]));
		}
	};
	visit(root, '', new Set());
	return scopes;
}

function resolvedRouteSource(
	parent: string,
	specifier: string,
	childrenByRoute: ReadonlyMap<string, string>,
	resolveSpecifier: ExecutionAttributionInput['resolveSpecifier'],
): string {
	return childrenByRoute.get(routeKey(parent, specifier)) ?? resolveSpecifier(parent, specifier);
}

function routeKey(parent: string, specifier: string): string {
	return `${parent}\0${specifier}`;
}
