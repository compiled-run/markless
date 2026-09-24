// Classifies every shipped client module so byte gates can price framework overhead apart from the app.
import { MARKLESS_BYTE_ATTRIBUTION } from './chunking.ts';
import { runtimeModuleIdFromOrigin } from './bundle-graph.ts';
import type { MarklessBuildMetadataBundle } from './build-metadata.ts';

export { MARKLESS_BYTE_ATTRIBUTION };

export const BYTE_CATEGORY = {
	runtime: 'runtime',
	glue: 'glue',
	author: 'author',
	thirdParty: 'third-party',
} as const;

export type ByteCategory = (typeof BYTE_CATEGORY)[keyof typeof BYTE_CATEGORY];

/** Workspace packages whose client code is framework runtime. */
export const FRAMEWORK_RUNTIME_PACKAGES = [
	'web',
	'core',
	'runtime',
	'router',
	'serializer',
] as const;

/** [category, module key, rendered bytes before minification] */
export type ByteAttributionModule = readonly [ByteCategory, string, number];

export type ByteAttributionChunk = {
	/** Shipped bytes of the chunk as emitted. */
	readonly bytes: number;
	readonly modules: readonly ByteAttributionModule[];
};

export type ByteAttribution = {
	readonly version: 1;
	readonly chunks: Record<string, ByteAttributionChunk>;
};

const RUNTIME_PACKAGE_PATH = new RegExp(
	String.raw`(?:[/\\]packages[/\\]|[/\\]node_modules[/\\]@markless[/\\])(${FRAMEWORK_RUNTIME_PACKAGES.join('|')})[/\\](?:src|dist)[/\\](.+?)\.[cm]?[jt]sx?$`,
);
const NODE_MODULES = /.*[/\\]node_modules[/\\]((?:@[^/\\]+[/\\])?[^/\\]+)/;
const MARKLESS_VIRTUAL = 'virtual:markless:';
// Handler bodies and compiled markup are the author's code; the per-construct wrapper around them is priced by construct anchors.
const AUTHOR_VIRTUAL_KINDS = ['symbol', 'render-data'].map((kind) => `${MARKLESS_VIRTUAL}${kind}:`);
const MARKLESS_QUERY = /[?&]markless-/;
const AUTHOR_QUERY = /[?&]markless-render-data\b/;

/** Runtime module key (`web/resume-branches`), the same id the compiler's demand maps name. */
export function runtimeModuleKey(id: string): string | undefined {
	const path = (id.startsWith('\0') ? id.slice(1) : id).replace(/[?#].*$/, '');
	const known = runtimeModuleIdFromOrigin(path);
	if (known) return known;
	const match = RUNTIME_PACKAGE_PATH.exec(path);
	return match ? `${match[1]}/${match[2]!.replace(/\\/g, '/')}` : undefined;
}

export function classifyShippedModule(
	id: string,
	root: string | undefined,
): { readonly category: ByteCategory; readonly key: string } {
	const bare = withoutQueryValues(id.startsWith('\0') ? id.slice(1) : id);
	const runtime = runtimeModuleKey(bare);
	if (runtime) return { category: BYTE_CATEGORY.runtime, key: runtime };
	if (bare.startsWith(MARKLESS_VIRTUAL)) {
		return {
			category: AUTHOR_VIRTUAL_KINDS.some((prefix) => bare.startsWith(prefix))
				? BYTE_CATEGORY.author
				: BYTE_CATEGORY.glue,
			key: relativeToRoot(safeDecode(bare), root),
		};
	}
	const packageMatch = NODE_MODULES.exec(bare);
	if (packageMatch && !runtime)
		return {
			category: BYTE_CATEGORY.thirdParty,
			key: `npm:${packageMatch[1]!.replace(/\\/g, '/')}`,
		};
	if (MARKLESS_QUERY.test(bare))
		return {
			category: AUTHOR_QUERY.test(bare) ? BYTE_CATEGORY.author : BYTE_CATEGORY.glue,
			key: relativeToRoot(bare, root),
		};
	if (!bare.startsWith('/') && !/^[A-Za-z]:[/\\]/.test(bare))
		return { category: BYTE_CATEGORY.glue, key: bare };
	if (root && !bare.startsWith(withTrailingSlash(root)))
		return { category: BYTE_CATEGORY.thirdParty, key: bare };
	return { category: BYTE_CATEGORY.author, key: relativeToRoot(bare, root) };
}

type RenderedModules = Record<string, { readonly renderedLength: number } | undefined>;

// Rolldown's per-module rendered lengths are read before post-processing rewrites the chunk code.
export function collectRenderedModules(
	bundle: MarklessBuildMetadataBundle & Record<string, unknown>,
): Map<object, ReadonlyArray<readonly [string, number]>> {
	const rendered = new Map<object, ReadonlyArray<readonly [string, number]>>();
	for (const item of Object.values(bundle)) {
		if (!item || typeof item !== 'object' || (item as { type?: unknown }).type !== 'chunk')
			continue;
		const modules = (item as { modules?: RenderedModules }).modules;
		if (!modules) continue;
		rendered.set(
			item,
			Object.entries(modules)
				.map(([id, module]) => [id, module?.renderedLength ?? 0] as const)
				.filter(([, length]) => length > 0),
		);
	}
	return rendered;
}

export function createByteAttributionAsset(
	bundle: MarklessBuildMetadataBundle,
	rendered: ReadonlyMap<object, ReadonlyArray<readonly [string, number]>>,
	root: string | undefined,
	canonPath: (fileName: string) => string,
) {
	const chunks: Record<string, ByteAttributionChunk> = {};
	for (const item of Object.values(bundle)) {
		if (item.type !== 'chunk') continue;
		const modules = rendered.get(item);
		if (!modules) continue;
		const merged = new Map<string, [ByteCategory, string, number]>();
		for (const [id, length] of modules) {
			const { category, key } = classifyShippedModule(id, root);
			const entry = merged.get(`${category}\0${key}`);
			if (entry) entry[2] += length;
			else merged.set(`${category}\0${key}`, [category, key, length]);
		}
		chunks[canonPath(item.fileName)] = {
			bytes: new TextEncoder().encode(item.code).length,
			modules: [...merged.values()].sort((a, b) =>
				a[0] === b[0] ? (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) : a[0] < b[0] ? -1 : 1,
			),
		};
	}
	const attribution: ByteAttribution = {
		version: 1,
		chunks: Object.fromEntries(
			Object.keys(chunks)
				.sort()
				.map((key) => [key, chunks[key]!]),
		),
	};
	return {
		type: 'asset' as const,
		fileName: MARKLESS_BYTE_ATTRIBUTION,
		source: JSON.stringify(attribution),
	};
}

// Query values can embed absolute paths; the parameter names alone identify the generated module.
function withoutQueryValues(id: string): string {
	const index = id.indexOf('?');
	if (index === -1) return id;
	const names = id
		.slice(index + 1)
		.split('&')
		.map((part) => part.split('=')[0])
		.filter(Boolean);
	return names.length > 0 ? `${id.slice(0, index)}?${names[0]}` : id.slice(0, index);
}

function relativeToRoot(id: string, root: string | undefined): string {
	if (!root) return id;
	return id.split(withTrailingSlash(root)).join('');
}

function withTrailingSlash(path: string): string {
	return path.endsWith('/') ? path : `${path}/`;
}

function safeDecode(id: string): string {
	try {
		return decodeURIComponent(id);
	} catch {
		return id;
	}
}
