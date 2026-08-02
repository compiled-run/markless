import { joinURL } from 'ufo';
import type { MarklessBuildMetadata, MarklessBundleGraph, GlobalInjections } from '../types.ts';
import { MARKLESS_BUILD_PREFIX } from './chunking.ts';
import { type ModulePreloadPlanEntry, planModulePreloads } from './preload-plan.ts';

type HeadLinkBundle = Record<string, HeadLinkBundleItem>;
type HeadLinkBundleItem = HeadLinkAsset | HeadLinkChunk;

interface HeadLinkAsset {
	type: 'asset';
	fileName: string;
}

interface HeadLinkChunk {
	type: 'chunk';
	viteMetadata?: {
		importedCss?: ReadonlySet<string> | readonly string[];
	};
}

const STYLESHEET_ASSET_RE = /\.css$/;

export function collectHeadLinkInjections(
	bundle: HeadLinkBundle,
	options: {
		publicPath?: (fileName: string) => string;
	} = {},
): GlobalInjections[] {
	const publicPath = options.publicPath ?? ((fileName: string) => fileName);
	const stylesheetFiles = stylesheetFilesFromViteMetadata(bundle);
	if (stylesheetFiles.size === 0) {
		for (const item of Object.values(bundle)) {
			if (item.type === 'asset' && STYLESHEET_ASSET_RE.test(item.fileName)) {
				stylesheetFiles.add(item.fileName);
			}
		}
	}

	return [...stylesheetFiles].sort().map((fileName) => stylesheetInjection(publicPath(fileName)));
}

function stylesheetFilesFromViteMetadata(bundle: HeadLinkBundle) {
	const stylesheetFiles = new Set<string>();
	for (const item of Object.values(bundle)) {
		if (item.type !== 'chunk') continue;
		for (const fileName of item.viteMetadata?.importedCss ?? []) {
			stylesheetFiles.add(fileName);
		}
	}
	return stylesheetFiles;
}

export function collectModulePreloadInjections(
	preloadSource: MarklessBuildMetadata | MarklessBundleGraph | undefined,
	options: {
		publicPath?: (fileName: string) => string;
		// Entry chunk names (bundle-graph normalized). Entries root the plan
		// with edges:'dynamic-only': their static closure is already loading
		// via the script tag, so only interaction-reachable dynamic targets
		// (the resume runtime's journal/settle modules) join the head links.
		entryChunks?: readonly string[];
	} = {},
): GlobalInjections[] {
	const buildMetadata = isBuildMetadata(preloadSource) ? preloadSource : undefined;
	const bundleGraph: MarklessBundleGraph | undefined = buildMetadata
		? buildMetadata.bundleGraph
		: (preloadSource as MarklessBundleGraph | undefined);
	const symbolRoots = buildMetadata
		? symbolRootsFromBuildMetadata(buildMetadata)
		: (bundleGraph ?? [])
				.filter(
					(name): name is string =>
						typeof name === 'string' && name.startsWith('symbol:'),
				)
				.map((name) => ({ name, priority: 'high' as const }));
	const roots = [
		...symbolRoots,
		...(options.entryChunks ?? []).map((name) => ({
			name,
			priority: 'auto' as const,
			edges: 'dynamic-only' as const,
		})),
	];

	return planModulePreloads({
		base: options.publicPath
			? options.publicPath(MARKLESS_BUILD_PREFIX)
			: joinURL('/', MARKLESS_BUILD_PREFIX),
		bundleGraph,
		roots,
	}).map(modulePreloadInjection);
}

function symbolRootsFromBuildMetadata(
	metadata: MarklessBuildMetadata,
): Array<{ readonly name: string; readonly priority: 'high' }> {
	const roots: Array<{ readonly name: string; readonly priority: 'high' }> = [];
	const seen = new Set<string>();
	for (const module of metadata.modules) {
		for (const symbol of module.symbols) {
			if (!symbol.fileName || seen.has(symbol.symbolId)) continue;
			seen.add(symbol.symbolId);
			roots.push({ name: symbol.symbolId, priority: 'high' });
		}
	}
	return roots;
}

function isBuildMetadata(value: unknown): value is MarklessBuildMetadata {
	return (
		!!value &&
		typeof value === 'object' &&
		!Array.isArray(value) &&
		Array.isArray((value as { modules?: unknown }).modules)
	);
}

export function injectHeadLinks(
	bundle: Record<string, unknown>,
	injections: readonly GlobalInjections[],
) {
	if (injections.length === 0) return;

	const links = [...new Map(injections.map((injection) => [headLinkKey(injection), injection])).values()]
		.map(headLinkTag)
		.join('');
	for (const output of Object.values(bundle)) {
		if (!isHtmlAssetWithSource(output)) continue;
		output.source = output.source.includes('</head>')
			? output.source.replace('</head>', `${links}</head>`)
			: `${links}${output.source}`;
	}
}

function headLinkTag(injection: GlobalInjections): string {
	if (injection.tag === 'link' && injection.attributes?.rel === 'modulepreload') {
		const attributes = Object.entries(injection.attributes)
			.map(([name, value]) => compactAttribute(name, value));
		return `<link ${attributes.join(' ')}>`;
	}
	const attributes = Object.entries(injection.attributes ?? {}).map(
		([name, value]) => `${name}="${value.replaceAll('"', '&quot;')}"`,
	);
	const open =
		attributes.length > 0 ? `<${injection.tag} ${attributes.join(' ')}>` : `<${injection.tag}>`;
	return injection.children === undefined
		? open
		: `${open}${injection.children}</${injection.tag}>`;
}

function headLinkKey(injection: GlobalInjections): string {
	return JSON.stringify([
		injection.tag,
		injection.location,
		Object.entries(injection.attributes ?? {}),
		injection.children,
	]);
}

function compactAttribute(name: string, value: string): string {
	if (name === 'crossorigin' && value === 'anonymous') return name;
	return /^[^\s"'`=<>]+$/.test(value)
		? `${name}=${value}`
		: `${name}="${value.replaceAll('"', '&quot;')}"`;
}

function isHtmlAssetWithSource(output: unknown): output is {
	readonly type: 'asset';
	readonly fileName: string;
	source: string;
} {
	if (!output || typeof output !== 'object') return false;
	const asset = output as {
		readonly type?: unknown;
		readonly fileName?: unknown;
		readonly source?: unknown;
	};
	return (
		asset.type === 'asset' &&
		typeof asset.fileName === 'string' &&
		asset.fileName.endsWith('.html') &&
		typeof asset.source === 'string'
	);
}

function modulePreloadInjection(preload: ModulePreloadPlanEntry): GlobalInjections {
	const attributes: Record<string, string> = {
		rel: 'modulepreload',
		href: preload.href,
		crossorigin: 'anonymous',
	};
	if (preload.fetchPriority && preload.fetchPriority !== 'auto') {
		attributes.fetchpriority = preload.fetchPriority;
	}
	return { tag: 'link', location: 'head', attributes };
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
