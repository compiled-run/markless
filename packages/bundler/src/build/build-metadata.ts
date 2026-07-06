import { relative } from 'pathe';
import type {
	BundleGraphAdder,
	GlobalInjections,
	MarklessAsset,
	MarklessBuildMetadata,
	MarklessBundle,
	MarklessTransformManifest,
} from '../types.ts';
import { convertManifestToBundleGraph } from './bundle-graph.ts';
import { scanEmittedDynamicImports } from './dynamic-import-scan.ts';
import { collectHeadLinkInjections } from './head-links.ts';

export type MarklessBuildMetadataBundle = Record<string, MarklessBuildMetadataBundleItem>;

export type MarklessBuildMetadataBundleItem =
	| MarklessBuildMetadataAsset
	| MarklessBuildMetadataChunk;

export interface MarklessBuildMetadataAsset {
	type: 'asset';
	fileName: string;
	name?: string;
	names?: string[];
	source: string | Uint8Array;
}

export interface MarklessBuildMetadataChunk {
	type: 'chunk';
	fileName: string;
	name: string;
	code: string;
	exports: string[];
	imports: string[];
	dynamicImports: string[];
	moduleIds: string[];
	facadeModuleId?: string | null;
	viteMetadata?: {
		importedCss?: ReadonlySet<string> | readonly string[];
	};
}

export function createBuildMetadata(
	bundle: MarklessBuildMetadataBundle,
	transformManifests: Iterable<MarklessTransformManifest>,
	root: string | undefined,
	options: {
		bundleGraphAsset?: string;
		bundleGraphAdders?: Set<BundleGraphAdder>;
		canonPath?: (fileName: string) => string;
		publicPath?: (fileName: string) => string;
		injections?: GlobalInjections[];
	} = {},
) {
	const canonPath = options.canonPath ?? ((fileName: string) => fileName);
	const publicPath = options.publicPath ?? ((fileName: string) => fileName);
	const modules = [...transformManifests].map(cloneTransformManifest);
	const metadata: MarklessBuildMetadata = {
		version: 1,
		modules,
		bundles: {},
		assets: {},
		injections: [
			...(options.injections ?? []),
			...collectHeadLinkInjections(bundle, { publicPath }),
		],
	};

	for (const item of Object.values(bundle)) {
		if (item.type === 'asset') {
			if (item.fileName.endsWith('.js.map')) {
				continue;
			}

			metadata.assets![item.fileName] = assetInfo(item);
			continue;
		}

		const bundleFileName = canonPath(item.fileName);
		const origins = getOrigins(item, root);
		const asyncBundle: MarklessBundle = {
			size: item.code.length,
			total: item.code.length,
		};
		const imports = mapBundleNames(bundle, item.imports, canonPath);
		if (imports.length > 0) {
			asyncBundle.imports = imports;
		}
		// Union code-derived edges: rewrites leave real dynamic imports the
		// chunk metadata never carried (see dynamic-import-scan.ts). Metadata
		// edges are never removed — over-coverage is contract-safe.
		const dynamicImports = [
			...new Set([
				...mapBundleNames(bundle, item.dynamicImports, canonPath),
				...mapBundleNames(
					bundle,
					scanEmittedDynamicImports(item.code, item.fileName),
					canonPath,
				),
			]),
		];
		if (dynamicImports.length > 0) {
			asyncBundle.dynamicImports = dynamicImports;
		}
		if (origins.length > 0) {
			asyncBundle.origins = origins;
		}
		finalizeVirtualModuleReferences(modules, item, bundleFileName);
		const symbols = modules.flatMap((module) =>
			module.symbols
				.filter((symbol) => symbol.fileName === bundleFileName)
				.map((symbol) => symbol.symbolId),
		);
		if (symbols.length > 0) {
			asyncBundle.symbols = symbols;
		}

		metadata.bundles[bundleFileName] = asyncBundle;
	}

	computeTotals(metadata.bundles);
	sortBuildMetadata(metadata);

	if (options.bundleGraphAsset) {
		metadata.bundleGraph = convertManifestToBundleGraph(metadata, options.bundleGraphAdders);
		metadata.bundleGraphAsset = options.bundleGraphAsset;
		metadata.assets![options.bundleGraphAsset] = {
			name: 'bundle-graph.json',
			size: JSON.stringify(metadata.bundleGraph).length,
		};
	}

	return metadata;
}

function cloneTransformManifest(manifest: MarklessTransformManifest): MarklessTransformManifest {
	return {
		source: manifest.source,
		payload: { ...manifest.payload },
		resolver: { ...manifest.resolver },
		symbols: manifest.symbols.map((symbol) => ({ ...symbol })),
		runtimeDemandMap: manifest.runtimeDemandMap,
	};
}

function finalizeVirtualModuleReferences(
	modules: MarklessTransformManifest[],
	item: MarklessBuildMetadataChunk,
	bundleFileName: string,
) {
	const ids = new Set(
		[item.facadeModuleId ?? undefined, ...item.moduleIds]
			.filter((id): id is string => !!id)
			.map(normalizeVirtualModuleId),
	);
	for (const module of modules) {
		for (const reference of [module.payload, module.resolver]) {
			if (ids.has(normalizeVirtualModuleId(reference.virtualModuleId))) {
				reference.fileName = bundleFileName;
			}
		}
		for (const symbol of module.symbols) {
			if (ids.has(normalizeVirtualModuleId(symbol.virtualModuleId))) {
				symbol.fileName = bundleFileName;
			}
		}
	}
}

function normalizeVirtualModuleId(id: string) {
	if (id.startsWith('\0')) {
		return id.slice(1);
	}

	return id;
}

function assetInfo(item: MarklessBuildMetadataAsset): MarklessAsset {
	return {
		name: item.names?.[0] ?? item.name,
		size: item.source.length,
	};
}

function mapBundleNames(
	bundle: MarklessBuildMetadataBundle,
	names: string[],
	canonPath: (fileName: string) => string,
) {
	return names.flatMap((name) => {
		const item = bundle[name];
		if (item) {
			return [canonPath(item.fileName)];
		}

		return [canonPath(name)];
	});
}

function getOrigins(item: MarklessBuildMetadataChunk, root: string | undefined) {
	return item.moduleIds
		.filter((id) => !id.startsWith('\0'))
		.map((id) => {
			if (root) {
				return relative(root, id);
			}

			return id;
		})
		.sort();
}

function computeTotals(bundles: Record<string, MarklessBundle>) {
	const collect = (name: string, seen: Set<string>) => {
		const bundle = bundles[name];
		if (!bundle || seen.has(name)) return;
		seen.add(name);
		for (const dep of bundle.imports ?? []) {
			collect(dep, seen);
		}
	};

	for (const name of Object.keys(bundles)) {
		const seen = new Set<string>();
		collect(name, seen);
		bundles[name]!.total = [...seen].reduce((sum, dep) => sum + (bundles[dep]?.size ?? 0), 0);
	}
}

function sortBuildMetadata(metadata: MarklessBuildMetadata) {
	metadata.modules = metadata.modules.sort((a, b) => a.source.localeCompare(b.source));
	metadata.bundles = sortRecord(metadata.bundles);
	metadata.assets = sortRecord(metadata.assets ?? {});
	metadata.injections?.sort((a, b) => injectionKey(a).localeCompare(injectionKey(b)));
	for (const bundle of Object.values(metadata.bundles)) {
		bundle.imports?.sort();
		bundle.dynamicImports?.sort();
		bundle.origins?.sort();
		bundle.symbols?.sort();
	}
	for (const module of metadata.modules) {
		module.symbols.sort((a, b) => a.symbolId.localeCompare(b.symbolId));
	}
}

function sortRecord<T>(record: Record<string, T>) {
	const next: Record<string, T> = {};
	for (const key of Object.keys(record).sort()) {
		const value = record[key];
		if (value !== undefined) {
			next[key] = value;
		}
	}
	return next;
}

function injectionKey(injection: GlobalInjections) {
	return `${injection.location}:${injection.tag}:${injection.attributes?.href ?? ''}`;
}
