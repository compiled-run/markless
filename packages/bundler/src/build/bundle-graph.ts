import { defDGraph } from '@thi.ng/dgraph';
import { normalize } from 'pathe';
import { withoutLeadingSlash } from 'ufo';
import type {
	BundleGraphAdder,
	PreloadGraphEntriesAdder,
	MarklessBuildMetadata,
	MarklessBundle,
	MarklessBundleGraph,
} from '../types.ts';

type BundleGraphEdge = [string, string | null];
type BundleGraphRecord = Partial<MarklessBundle>;

const MINIMUM_CONNECTION_BYTES_PER_SECOND = (300 * 1024) / 8;
const SLOW_BUNDLE_TOTAL = MINIMUM_CONNECTION_BYTES_PER_SECOND * 0.5;
const SMALL_BUNDLE_TOTAL = 1000;

export function convertManifestToBundleGraph(
	manifest: MarklessBuildMetadata,
	bundleGraphAdders?: Set<BundleGraphAdder>,
): MarklessBundleGraph {
	const graph = bundleGraphRecords(manifest, bundleGraphAdders);
	const dag = defDGraph(bundleGraphEdges(graph));
	const reduced = dag.copy();
	for (const name of dag.nodes()) {
		for (const dep of dag.immediateDependencies(name)) {
			for (const transitive of dag.transitiveDependencies(dep)) {
				reduced.removeEdge(name, transitive);
			}
		}
	}

	const nodes = Object.keys(graph)
		.sort()
		.map((name) => {
			const bundle = graph[name];
			const dynamicImports = (bundle?.dynamicImports ?? [])
				.map((dep) => [dep, dynamicImportMarker(bundle, graph[dep])] as const)
				.sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
			const deps: Array<string | number> = [...reduced.immediateDependencies(name)].sort();
			let lastMarker: number | undefined;
			for (const [dep, marker] of dynamicImports) {
				if (marker !== lastMarker) {
					deps.push(marker);
					lastMarker = marker;
				}
				deps.push(dep);
			}
			return [name, deps] as const;
		});
	const indexes = new Map<string, number>();
	let index = 0;
	for (const [name, deps] of nodes) {
		indexes.set(name, index);
		index += 1 + deps.length;
	}
	return nodes.flatMap(([name, deps]) => [
		name,
		...deps.map((dep) => {
			if (typeof dep === 'number') {
				return dep;
			}

			return indexes.get(dep)!;
		}),
	]);
}

export function createPreloadGraphAdder(addEntries: PreloadGraphEntriesAdder): BundleGraphAdder {
	return (manifest) =>
		addEntries({
			manifest,
			hasBundle: (bundleName) => !!manifest.bundles[bundleName],
			bundlesForOrigins: (origins) => bundlesForOrigins(manifest, origins),
		});
}

function bundlesForOrigins(manifest: MarklessBuildMetadata, origins: readonly string[]) {
	const normalizedOrigins = new Set(origins.map(normalizeManifestOrigin));
	const bundles: string[] = [];
	for (const [bundleName, bundle] of Object.entries(manifest.bundles)) {
		if (
			bundle.origins?.some((origin) => normalizedOrigins.has(normalizeManifestOrigin(origin)))
		) {
			bundles.push(bundleName);
		}
	}
	return bundles.sort();
}

function bundleGraphRecords(
	manifest: MarklessBuildMetadata,
	bundleGraphAdders?: Set<BundleGraphAdder>,
) {
	const graph: Record<string, BundleGraphRecord> = { ...manifest.bundles };
	const runtimeBundles = runtimeBundleNamesByModuleId(manifest);
	for (const module of manifest.modules) {
		const runtimeModuleIdsBySymbolId = new Map(
			(module.runtimeDemandMap?.symbols ?? []).map((symbol) => [
				symbol.symbolId,
				symbol.runtimeModuleIds,
			]),
		);
		for (const symbol of module.symbols) {
			if (!symbol.fileName) continue;
			const bundle = manifest.bundles[symbol.fileName];
			const imports = [
				...(bundle?.imports ?? []),
				...(module.resolver.fileName ? [module.resolver.fileName] : []),
			];
			const runtimeDemandBundles = (runtimeModuleIdsBySymbolId.get(symbol.symbolId) ?? [])
				.flatMap((id) => runtimeBundles.get(id) ?? []);
			const symbolBundle: BundleGraphRecord = {
				size: 0,
				total: 0,
				dynamicImports: [...new Set([symbol.fileName, ...runtimeDemandBundles])],
			};
			if (imports.length > 0) {
				symbolBundle.imports = imports;
			}
			graph[symbol.symbolId] = symbolBundle;
		}
	}
	for (const [bundleName, bundle] of Object.entries(graph)) {
		for (const symbolId of bundle.symbols ?? []) {
			if (symbolId === bundleName) continue;
			const symbolBundle = graph[symbolId] ?? { size: 0, total: 0 };
			graph[symbolId] = appendDynamicImport(symbolBundle, bundleName);
		}
	}
	if (bundleGraphAdders) {
		const combined = { ...manifest, bundles: graph as MarklessBuildMetadata['bundles'] };
		for (const add of bundleGraphAdders) {
			Object.assign(graph, add(combined));
		}
	}

	for (const bundleName of Object.keys(graph)) {
		const bundle = graph[bundleName];
		if (!bundle) continue;

		graph[bundleName] = {
			...bundle,
			imports: bundle.imports?.filter((dep) => graph[dep]) ?? [],
			dynamicImports: bundle.dynamicImports?.filter((dep) => graph[dep]) ?? [],
		};
	}
	const used = new Set<string>();
	for (const bundle of Object.values(graph)) {
		for (const dep of bundle.imports ?? []) used.add(dep);
		for (const dep of bundle.dynamicImports ?? []) used.add(dep);
	}
	for (const [bundleName, bundle] of Object.entries(graph)) {
		if (!used.has(bundleName) && !bundle.imports?.length && !bundle.dynamicImports?.length) {
			delete graph[bundleName];
		}
	}
	return graph;
}

function appendDynamicImport(bundle: BundleGraphRecord, dependency: string): BundleGraphRecord {
	if (bundle.dynamicImports?.includes(dependency)) return bundle;
	return {
		...bundle,
		dynamicImports: [...(bundle.dynamicImports ?? []), dependency],
	};
}

function runtimeBundleNamesByModuleId(manifest: MarklessBuildMetadata): ReadonlyMap<string, string[]> {
	const entries = new Map<string, string[]>();
	for (const [bundleName, bundle] of Object.entries(manifest.bundles)) {
		for (const origin of bundle.origins ?? []) {
			const runtimeModuleId = runtimeModuleIdFromOrigin(origin);
			if (!runtimeModuleId) continue;
			entries.set(runtimeModuleId, [...(entries.get(runtimeModuleId) ?? []), bundleName]);
		}
	}
	for (const [id, names] of entries) entries.set(id, names.sort());
	return entries;
}

function runtimeModuleIdFromOrigin(origin: string): string | undefined {
	const normalized = normalizeManifestOrigin(origin);
	for (const [prefix, marker] of [
		['web', 'packages/web/src/'],
		['core', 'packages/core/src/'],
	] as const) {
		const index = normalized.lastIndexOf(marker);
		if (index === -1 || !normalized.endsWith('.ts')) continue;
		return `${prefix}/${normalized.slice(index + marker.length, -'.ts'.length)}`;
	}
}

function dynamicImportMarker(
	bundle: BundleGraphRecord | undefined,
	dependency: BundleGraphRecord | undefined,
) {
	let probability = 0.5;
	if (hasRelatedOrigin(bundle, dependency)) probability += 0.25;
	if ((dependency?.total ?? 0) > SLOW_BUNDLE_TOTAL) {
		if (probability > 0.5) {
			probability += 0.02;
		} else {
			probability -= 0.02;
		}
	}
	if ((dependency?.total ?? 0) < SMALL_BUNDLE_TOTAL) probability += 0.15;
	probability = Math.min(probability, 0.99);
	return -Math.round(probability * 10);
}

function hasRelatedOrigin(
	bundle: BundleGraphRecord | undefined,
	dependency: BundleGraphRecord | undefined,
) {
	return !!bundle?.origins?.some((origin) =>
		dependency?.origins?.some((depOrigin) => depOrigin.startsWith(origin)),
	);
}

function* bundleGraphEdges(graph: Record<string, BundleGraphRecord>): Generator<BundleGraphEdge> {
	for (const [bundleName, bundle] of Object.entries(graph)) {
		yield [bundleName, null];
		for (const dep of bundle.imports ?? []) {
			yield [bundleName, dep];
		}
	}
}

function normalizeManifestOrigin(origin: string) {
	return withoutLeadingSlash(normalize(origin));
}
