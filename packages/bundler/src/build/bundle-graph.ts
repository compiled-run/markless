import { defDGraph } from '@thi.ng/dgraph';
import { normalize } from 'pathe';
import { withoutLeadingSlash } from 'ufo';
import type {
	BundleGraphAdder,
	PreloadGraphEntriesAdder,
	ArcadeBundle,
	ArcadeBundleGraph,
	ArcadeManifest,
} from '../types.ts';

type BundleGraphEdge = [string, string | null];
type BundleGraphRecord = Partial<ArcadeBundle>;

const MINIMUM_CONNECTION_BYTES_PER_SECOND = (300 * 1024) / 8;
const SLOW_BUNDLE_TOTAL = MINIMUM_CONNECTION_BYTES_PER_SECOND * 0.5;
const SMALL_BUNDLE_TOTAL = 1000;

export function convertManifestToBundleGraph(
	manifest: ArcadeManifest,
	bundleGraphAdders?: Set<BundleGraphAdder>,
): ArcadeBundleGraph {
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

function bundlesForOrigins(manifest: ArcadeManifest, origins: readonly string[]) {
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

function bundleGraphRecords(manifest: ArcadeManifest, bundleGraphAdders?: Set<BundleGraphAdder>) {
	const graph: Record<string, BundleGraphRecord> = { ...manifest.bundles };
	for (const module of manifest.modules) {
		for (const symbol of module.symbols) {
			if (!symbol.fileName) continue;
			const bundle = manifest.bundles[symbol.fileName];
			const symbolBundle: BundleGraphRecord = {
				size: 0,
				total: 0,
				dynamicImports: [symbol.fileName],
			};
			if (bundle?.imports) {
				symbolBundle.imports = [...bundle.imports];
			}
			graph[symbol.symbolId] = symbolBundle;
		}
	}
	if (bundleGraphAdders) {
		const combined = { ...manifest, bundles: graph as ArcadeManifest['bundles'] };
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
