import { moduleIdFor } from '../module-id.ts';
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
import { scanGeneratedSymbolTableImports } from './symbol-table.ts';

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
	const references = indexVirtualModuleReferences(modules);
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
				...mapBundleNames(
					bundle,
					scanGeneratedSymbolTableImports(item.code, item.fileName),
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
		finalizeVirtualModuleReferences(references, item, bundleFileName);
		const symbols = [...(references.symbolsByFile.get(bundleFileName) ?? [])]
			.sort((left, right) => left.order - right.order)
			.map(({ symbol }) => symbol.symbolId);
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

type SymbolReference = {
	readonly symbol: MarklessTransformManifest['symbols'][number];
	readonly order: number;
};

type VirtualModuleReferences = {
	readonly byId: Map<string, Array<{ fileName?: string } | SymbolReference>>;
	// Symbols by the file they currently name, kept in step with every reassignment.
	readonly symbolsByFile: Map<string | undefined, Set<SymbolReference>>;
};

// One pass over the manifests instead of one per chunk: the bundle has hundreds of each.
function indexVirtualModuleReferences(
	modules: readonly MarklessTransformManifest[],
): VirtualModuleReferences {
	const byId: VirtualModuleReferences['byId'] = new Map();
	const symbolsByFile: VirtualModuleReferences['symbolsByFile'] = new Map();
	const add = (id: string, reference: { fileName?: string } | SymbolReference) => {
		const key = normalizeVirtualModuleId(id);
		const list = byId.get(key);
		if (list) list.push(reference);
		else byId.set(key, [reference]);
	};
	let order = 0;
	for (const module of modules) {
		for (const reference of [module.payload, module.resolver])
			add(reference.virtualModuleId, reference);
		for (const symbol of module.symbols) {
			const reference = { symbol, order: order++ };
			add(symbol.virtualModuleId, reference);
			const bucket = symbolsByFile.get(symbol.fileName);
			if (bucket) bucket.add(reference);
			else symbolsByFile.set(symbol.fileName, new Set([reference]));
		}
	}
	return { byId, symbolsByFile };
}

function finalizeVirtualModuleReferences(
	references: VirtualModuleReferences,
	item: MarklessBuildMetadataChunk,
	bundleFileName: string,
) {
	const ids = new Set(
		[item.facadeModuleId ?? undefined, ...item.moduleIds]
			.filter((id): id is string => !!id)
			.map(normalizeVirtualModuleId),
	);
	for (const id of ids) {
		for (const reference of references.byId.get(id) ?? []) {
			if (!('symbol' in reference)) {
				reference.fileName = bundleFileName;
				continue;
			}
			references.symbolsByFile.get(reference.symbol.fileName)?.delete(reference);
			reference.symbol.fileName = bundleFileName;
			const bucket = references.symbolsByFile.get(bundleFileName);
			if (bucket) bucket.add(reference);
			else references.symbolsByFile.set(bundleFileName, new Set([reference]));
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
		.map((id) => moduleIdFor(id, root))
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

// The collator `localeCompare` builds on every call, built once.
const localeOrder = new Intl.Collator().compare;

function sortBuildMetadata(metadata: MarklessBuildMetadata) {
	metadata.modules = metadata.modules.sort((a, b) => localeOrder(a.source, b.source));
	metadata.bundles = sortRecord(metadata.bundles);
	metadata.assets = sortRecord(metadata.assets ?? {});
	metadata.injections?.sort((a, b) => localeOrder(injectionKey(a), injectionKey(b)));
	for (const bundle of Object.values(metadata.bundles)) {
		bundle.imports?.sort();
		bundle.dynamicImports?.sort();
		bundle.origins?.sort();
		bundle.symbols?.sort();
	}
	for (const module of metadata.modules) {
		module.symbols.sort((a, b) => localeOrder(a.symbolId, b.symbolId));
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
