import type { GlobalInjections } from '../types.ts';

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
