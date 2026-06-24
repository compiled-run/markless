import { relative } from 'pathe';
import type {
	BundleGraphAdder,
	GlobalInjections,
	ArcadeAsset,
	ArcadeBundle,
	ArcadeManifest,
	ArcadeTransformManifest,
	ServerArcadeManifest,
} from '../types.ts';
import { convertManifestToBundleGraph } from './bundle-graph.ts';

export const ARCADE_MANIFEST = 'globalThis.__ARCADE_MANIFEST__';
export const ARCADE_MANIFEST_FILE = 'arcade-manifest.json';

export type ArcadeManifestBundle = Record<string, ArcadeManifestBundleItem>;

export type ArcadeManifestBundleItem = ArcadeManifestAsset | ArcadeManifestChunk;

export interface ArcadeManifestAsset {
	type: 'asset';
	fileName: string;
	name?: string;
	names?: string[];
	source: string | Uint8Array;
}

export interface ArcadeManifestChunk {
	type: 'chunk';
	fileName: string;
	name: string;
	code: string;
	exports: string[];
	imports: string[];
	dynamicImports: string[];
	moduleIds: string[];
	facadeModuleId?: string | null;
}

const STYLESHEET_ASSET_RE = /\.css$/;

export function createManifest(
	bundle: ArcadeManifestBundle,
	transformManifests: Iterable<ArcadeTransformManifest>,
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
	const manifest: ArcadeManifest = {
		version: 1,
		manifestHash: '',
		modules,
		bundles: {},
		assets: {},
		injections: [...(options.injections ?? [])],
	};

	for (const item of Object.values(bundle)) {
		if (item.type === 'asset') {
			if (item.fileName.endsWith('.js.map')) {
				continue;
			}

			manifest.assets![item.fileName] = assetInfo(item);
			if (STYLESHEET_ASSET_RE.test(item.fileName)) {
				manifest.injections!.push(stylesheetInjection(publicPath(item.fileName)));
			}
			continue;
		}

		const bundleFileName = canonPath(item.fileName);
		const origins = getOrigins(item, root);
		const asyncBundle: ArcadeBundle = {
			size: item.code.length,
			total: item.code.length,
		};
		const imports = mapBundleNames(bundle, item.imports, canonPath);
		if (imports.length > 0) {
			asyncBundle.imports = imports;
		}
		const dynamicImports = mapBundleNames(bundle, item.dynamicImports, canonPath);
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

		manifest.bundles[bundleFileName] = asyncBundle;
	}

	computeTotals(manifest.bundles);
	sortManifest(manifest);

	if (options.bundleGraphAsset) {
		manifest.bundleGraph = convertManifestToBundleGraph(manifest, options.bundleGraphAdders);
		manifest.bundleGraphAsset = options.bundleGraphAsset;
		manifest.assets![options.bundleGraphAsset] = {
			name: 'bundle-graph.json',
			size: JSON.stringify(manifest.bundleGraph).length,
		};
	}

	manifest.manifestHash = '';
	manifest.manifestHash = hash(JSON.stringify(manifest));
	return manifest;
}

export function devTagsManifest(devTags: GlobalInjections[]): ServerArcadeManifest {
	return { version: 1, manifestHash: 'dev', modules: [], injections: devTags };
}

export function injectManifest(
	code: string,
	manifest: ArcadeManifest | ServerArcadeManifest | null,
) {
	let value = ARCADE_MANIFEST;
	if (manifest?.manifestHash) {
		value = JSON.stringify({
			version: manifest.version,
			manifestHash: manifest.manifestHash,
			modules: manifest.modules,
			injections: manifest.injections,
			bundleGraph: manifest.bundleGraph,
			bundleGraphAsset: manifest.bundleGraphAsset,
		});
	}

	return code.replaceAll(`!${ARCADE_MANIFEST}`, 'false').replaceAll(ARCADE_MANIFEST, value);
}

function cloneTransformManifest(manifest: ArcadeTransformManifest): ArcadeTransformManifest {
	return {
		source: manifest.source,
		payload: { ...manifest.payload },
		resolver: { ...manifest.resolver },
		symbols: manifest.symbols.map((symbol) => ({ ...symbol })),
	};
}

function finalizeVirtualModuleReferences(
	modules: ArcadeTransformManifest[],
	item: ArcadeManifestChunk,
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

function assetInfo(item: ArcadeManifestAsset): ArcadeAsset {
	return {
		name: item.names?.[0] ?? item.name,
		size: item.source.length,
	};
}

function mapBundleNames(
	bundle: ArcadeManifestBundle,
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

function getOrigins(item: ArcadeManifestChunk, root: string | undefined) {
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

function computeTotals(bundles: Record<string, ArcadeBundle>) {
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

function sortManifest(manifest: ArcadeManifest) {
	manifest.modules = manifest.modules.sort((a, b) => a.source.localeCompare(b.source));
	manifest.bundles = sortRecord(manifest.bundles);
	manifest.assets = sortRecord(manifest.assets ?? {});
	manifest.injections?.sort((a, b) => injectionKey(a).localeCompare(injectionKey(b)));
	for (const bundle of Object.values(manifest.bundles)) {
		bundle.imports?.sort();
		bundle.dynamicImports?.sort();
		bundle.origins?.sort();
		bundle.symbols?.sort();
	}
	for (const module of manifest.modules) {
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

function stylesheetInjection(href: string): GlobalInjections {
	return {
		tag: 'link',
		location: 'head',
		attributes: {
			rel: 'stylesheet',
			href,
		},
	};
}

function injectionKey(injection: GlobalInjections) {
	return `${injection.location}:${injection.tag}:${injection.attributes?.href ?? ''}`;
}

function hash(value: string) {
	let next = 5381;
	for (let i = 0; i < value.length; i++) {
		next = (next * 33) ^ value.charCodeAt(i);
	}

	return (next >>> 0).toString(36);
}
