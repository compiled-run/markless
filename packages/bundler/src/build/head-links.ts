import { joinURL } from 'ufo';
import type { MarklessBundleGraph, GlobalInjections } from '../types.ts';
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
	bundleGraph: MarklessBundleGraph | undefined,
	options: {
		publicPath?: (fileName: string) => string;
	} = {},
): GlobalInjections[] {
	const roots = (bundleGraph ?? [])
		.filter((name): name is string => typeof name === 'string' && name.startsWith('symbol:'))
		.map((name) => ({ name, priority: 'high' as const }));

	return planModulePreloads({
		base: options.publicPath
			? options.publicPath(MARKLESS_BUILD_PREFIX)
			: joinURL('/', MARKLESS_BUILD_PREFIX),
		bundleGraph,
		roots,
	}).map(modulePreloadInjection);
}

export function injectHeadLinks(
	bundle: Record<string, unknown>,
	injections: readonly GlobalInjections[],
) {
	if (injections.length === 0) return;

	const links = injections.map(headLinkTag).join('');
	for (const output of Object.values(bundle)) {
		if (!isHtmlAssetWithSource(output)) continue;
		output.source = output.source.includes('</head>')
			? output.source.replace('</head>', `${links}</head>`)
			: `${links}${output.source}`;
	}
}

function headLinkTag(injection: GlobalInjections): string {
	const attributes = Object.entries(injection.attributes ?? {}).map(
		([name, value]) => `${name}="${value.replaceAll('"', '&quot;')}"`,
	);
	return `<${injection.tag} ${attributes.join(' ')}>`;
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
