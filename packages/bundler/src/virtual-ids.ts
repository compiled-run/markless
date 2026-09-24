// Knows rolldown's id conventions: the `?markless-*` query surface, the `virtual:markless:*`
// prefixes, their predicates and normalizers, and the id constructors.
import { isAbsolute, resolve } from 'pathe';
import { joinURL, parsePath, withQuery, withoutLeadingSlash } from 'ufo';
import { MARKLESS_BUILD_PREFIX } from './build/chunking.ts';
import { symbolVirtualModuleSourceFile } from './source-module.ts';
import { MARKLESS_VIRTUAL_PREFIX } from './transform.ts';
import { triggerGroupVirtualModuleSourceFile } from './trigger-groups.ts';
import type { MarklessEnvironment, MarklessVirtualModule } from './types.ts';
import { MARKLESS_SCALAR_PLAN_SOURCE_QUERY } from './scalar-plan-source.ts';

export const TSRX_SOURCE_FILE = /\.tsrx(?:[?#].*)?$/;
const MARKLESS_SYMBOL_SOURCE_QUERY_RE = /[?&]markless-symbols(?:[&#]|$)/;
const MARKLESS_RESUME_SOURCE_QUERY_RE = /[?&]markless-resume(?:[&#]|$)/;
const MARKLESS_RENDER_DATA_SOURCE_QUERY_RE = /[?&]markless-render-data(?:[&#]|$)/;
const MARKLESS_REACHED_FROM_SOURCE_QUERY = 'markless-reached-from';
// Reached render data does not depend on which route reached it, so every route shares one id.
const MARKLESS_REACHED_FROM_ROUTE = 'route';
const MARKLESS_PRERENDER_WAKE_SOURCE_QUERY_RE = /[?&]markless-prerender-wake(?:[&#]|$)/;
export const MARKLESS_ROUTE_SOURCE_QUERY_RE = /[?&]markless-route(?:[&#]|$)/;
const RESUME_VIRTUAL_ID_RE = /^virtual:markless:resume:([^:]+)$/;
const PRERENDER_WAKE_VIRTUAL_ID_RE = /^virtual:markless:prerender-wake:([^:]+)$/;
const SETTLE_VIRTUAL_ID_RE = /^virtual:markless:settle:([^:]+)$/;
const SYMBOL_VIRTUAL_STRING_RE = /(["'`])((?:virtual:markless:symbol:)[^"'`]+)\1/g;

export function stripBuildPrefix(fileName: string) {
	return fileName.startsWith(MARKLESS_BUILD_PREFIX)
		? fileName.slice(MARKLESS_BUILD_PREFIX.length)
		: fileName;
}

export function virtualModuleSourceForLoad(
	module: MarklessVirtualModule,
	options: {
		readonly dev: boolean;
		readonly publicPath?: (fileName: string) => string;
	},
) {
	if (!options.dev || module.type !== 'resolver') return module.source;
	if (!module.source.includes('moduleUrls[row[0]]')) return module.source;

	return module.source.replace(SYMBOL_VIRTUAL_STRING_RE, (_match, _quote, virtualId) =>
		JSON.stringify(devBrowserVirtualModuleUrl(virtualId, options.publicPath)),
	);
}

// Always the /@fs/<absolute> form, even for sources under the Vite root: a
// root-relative source URL (e.g. /pages/r/[repo]/index.tsrx?import) collides
// with the app's own route space on framework dev servers (nitro routes it
// and 404s), which kills the first full-resume wake in dev. Vite serves
// /@fs URLs for any allowed path and resolves them to the same module-graph
// entry, so the HMR full-reload contract is unchanged.
export function devBrowserSourceModuleUrl(
	source: string,
	_root: string | undefined,
	publicPath: ((fileName: string) => string) | undefined,
) {
	const path = withQuery(joinURL('@fs', withoutLeadingSlash(source)), { import: null });
	return publicPath ? publicPath(path) : joinURL('/', path);
}

export function devBrowserVirtualModuleUrl(
	virtualId: string,
	publicPath: ((fileName: string) => string) | undefined,
) {
	const path = joinURL('@id', resolveVirtualId(virtualId).replace('\0', '__x00__'));
	return publicPath ? publicPath(path) : joinURL('/', path);
}

export function clientSymbolEntries(input: unknown, root: string | undefined): string[] {
	if (!input || typeof input !== 'object' || Array.isArray(input)) {
		return [];
	}

	const sources: string[] = [];
	for (const [name, value] of Object.entries(input as Record<string, unknown>)) {
		if (!/symbol/i.test(name)) continue;
		for (const entry of inputEntryValues(value)) {
			if (typeof entry === 'string' && TSRX_SOURCE_FILE.test(entry)) {
				sources.push(normalizeInputSource(entry, root));
			}
		}
	}
	return sources;
}

function inputEntryValues(value: unknown): unknown[] {
	return Array.isArray(value) ? value.flatMap(inputEntryValues) : [value];
}

function normalizeInputSource(source: string, root: string | undefined) {
	const path = pathname(source);
	if (isAbsolute(path)) return path;
	return pathname(resolve(root ?? '', path));
}

export function isSymbolOnlySourceRequest(id: string): boolean {
	return MARKLESS_SYMBOL_SOURCE_QUERY_RE.test(id);
}

export function isScalarPlanSourceRequest(id: string): boolean {
	return (
		isSymbolOnlySourceRequest(id) &&
		new URLSearchParams(parsePath(id).search).has(MARKLESS_SCALAR_PLAN_SOURCE_QUERY)
	);
}

export function isResumeSourceRequest(id: string): boolean {
	return MARKLESS_RESUME_SOURCE_QUERY_RE.test(id);
}

export function isRenderDataSourceRequest(id: string): boolean {
	return MARKLESS_RENDER_DATA_SOURCE_QUERY_RE.test(id);
}

// Transport only: reads the route root a render-data request says it was
// reached from. Whether that qualifies the link is the `module-link` pass's
// call (`linkedRenderDataReachRoot`), not this id's.
export function renderDataReachedFromQuery(id: string): string | undefined {
	return (
		new URLSearchParams(parsePath(id).search).get(MARKLESS_REACHED_FROM_SOURCE_QUERY) ??
		undefined
	);
}

// A route's client-navigation facade or its own render data: only navigating to the route runs it.
export function isRouteNavigationSourceRequest(id: string): boolean {
	return (
		MARKLESS_ROUTE_SOURCE_QUERY_RE.test(id) ||
		(isRenderDataSourceRequest(id) && renderDataReachedFromQuery(id) === undefined)
	);
}

export function materializedReachedRenderDataSource(source: string): string {
	return withQuery(source, {
		'markless-render-data': null,
		[MARKLESS_REACHED_FROM_SOURCE_QUERY]: MARKLESS_REACHED_FROM_ROUTE,
	});
}

// The shared spelling of a reached render-data request that names its route root, or
// undefined when the request is already shared or is not reached render data.
export function sharedReachedRenderDataRequest(id: string): string | undefined {
	if (!isRenderDataSourceRequest(id)) return undefined;
	const reachedFrom = renderDataReachedFromQuery(id);
	return reachedFrom === undefined || reachedFrom === MARKLESS_REACHED_FROM_ROUTE
		? undefined
		: withQuery(id, { [MARKLESS_REACHED_FROM_SOURCE_QUERY]: MARKLESS_REACHED_FROM_ROUTE });
}

export function isPrerenderWakeSourceRequest(id: string): boolean {
	return MARKLESS_PRERENDER_WAKE_SOURCE_QUERY_RE.test(id);
}

export function isClientPrimarySourceRequest(id: string): boolean {
	return !(
		MARKLESS_SYMBOL_SOURCE_QUERY_RE.test(id) ||
		MARKLESS_RESUME_SOURCE_QUERY_RE.test(id) ||
		MARKLESS_RENDER_DATA_SOURCE_QUERY_RE.test(id) ||
		MARKLESS_PRERENDER_WAKE_SOURCE_QUERY_RE.test(id) ||
		MARKLESS_ROUTE_SOURCE_QUERY_RE.test(id)
	);
}

export function clientRouteArtifactReference(source: string): string {
	// Keep the queried navigation facade outside the primary route chunk.
	const symbolSource = source.includes('?')
		? `${source}&markless-symbols`
		: `${source}?markless-symbols`;
	const renderDataSource = source.includes('?')
		? `${source}&markless-render-data`
		: `${source}?markless-render-data`;
	return [
		`const [symbolModule, renderDataModule] = await Promise.all([import(${JSON.stringify(symbolSource)}), import(${JSON.stringify(renderDataSource)})]);`,
		'const marklessRouteArtifact = {',
		'\trenderData: renderDataModule.marklessPrerenderData,',
		'\tloadSymbol: symbolModule.loadSymbol,',
		'};',
		'export default marklessRouteArtifact;',
	].join('\n');
}

export function sourceForSymbolVirtualImporter(importer: string | undefined): string | null {
	if (!importer) return null;

	return symbolVirtualModuleSourceFile(normalizeVirtualId(importer));
}

export function sourceForResumeVirtualImporter(importer: string | undefined): string | null {
	if (!importer) return null;

	const match = normalizeVirtualId(importer).match(RESUME_VIRTUAL_ID_RE);
	return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function resolverVirtualModuleSourceFile(id: string): string | null {
	const prefix = `${MARKLESS_VIRTUAL_PREFIX}resolver:`;
	return id.startsWith(prefix) ? decodeURIComponent(id.slice(prefix.length)) : null;
}

export function sourceForTriggerGroupVirtualImporter(importer: string | undefined): string | null {
	if (!importer) return null;
	return triggerGroupVirtualModuleSourceFile(normalizeVirtualId(importer));
}

export function sourceForPrerenderWakeVirtualImporter(importer: string | undefined): string | null {
	if (!importer) return null;

	const match = normalizeVirtualId(importer).match(PRERENDER_WAKE_VIRTUAL_ID_RE);
	return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function sourceForSettleVirtualImporter(importer: string | undefined): string | null {
	if (!importer) return null;

	const match = normalizeVirtualId(importer).match(SETTLE_VIRTUAL_ID_RE);
	return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function isRelativeImport(source: string): boolean {
	return source.startsWith('./') || source.startsWith('../');
}

export function isMarklessRuntimeModule(id: string): boolean {
	const path = pathname(id);
	return /[/\\](?:web|runtime|serializer)[/\\]src[/\\].+\.ts$/.test(path);
}

export function executionLogRuntimeModuleId(id: string): string {
	const path = pathname(id);
	const match = path.match(/[/\\](web|runtime|serializer)[/\\]src[/\\]([^?#]+)\.ts$/);
	return match ? `${match[1]}:${match[2].replace(/[/\\]/g, '/')}` : path;
}

export function normalizeVirtualId(id: string) {
	const bare = id.startsWith('\0') ? id.slice(1) : id;
	if (!bare.startsWith(MARKLESS_VIRTUAL_PREFIX)) return bare;
	// Markless virtual ids embed the encodeURIComponent'd source path and END
	// in .tsrx, so dev requests arrive mangled twice: Vite's import analysis
	// appends `?import` as if they were assets, and the /@id middleware
	// decodeURI()s the path — %2F survives (reserved) but %5B/%5D decode to
	// raw brackets, so ids for pages like pages/r/[repo] come in
	// half-decoded. Strip the query and re-canonicalize each colon segment to
	// the registered encoding, or the first full-resume wake in dev 404s on
	// its payload/view imports.
	const queryIndex = bare.indexOf('?');
	const withoutQuery = queryIndex === -1 ? bare : bare.slice(0, queryIndex);
	const segments = withoutQuery
		.slice(MARKLESS_VIRTUAL_PREFIX.length)
		.split(':')
		.map((segment) => {
			try {
				return encodeURIComponent(decodeURIComponent(segment));
			} catch {
				return segment;
			}
		});
	return `${MARKLESS_VIRTUAL_PREFIX}${segments.join(':')}`;
}

export function emittedBundleModuleIds(bundle: Record<string, unknown>): Set<string> {
	const ids = new Set<string>();
	for (const output of Object.values(bundle)) {
		if (!output || typeof output !== 'object') continue;
		const chunk = output as {
			readonly type?: unknown;
			readonly facadeModuleId?: unknown;
			readonly moduleIds?: unknown;
		};
		if (chunk.type !== 'chunk') continue;
		if (typeof chunk.facadeModuleId === 'string') {
			ids.add(normalizeVirtualId(chunk.facadeModuleId));
		}
		if (Array.isArray(chunk.moduleIds)) {
			for (const id of chunk.moduleIds) {
				if (typeof id === 'string') ids.add(normalizeVirtualId(id));
			}
		}
	}
	return ids;
}

export function resolveVirtualId(id: string) {
	if (id.startsWith('\0')) {
		return id;
	}

	return `\0${id}`;
}

export function pathname(id: string) {
	return parsePath(id).pathname;
}

// Queries that only shape client output: the server compiles each to the plain source module.
const CLIENT_ONLY_SOURCE_QUERY_KEYS = new Set([
	'markless-render-data',
	'markless-reached-from',
	'markless-symbols',
	'markless-scalar-plans',
]);

// The plain source a server request only re-exports, so each source ships one server copy.
export function serverSharedSourceRequest(
	id: string,
	environment: MarklessEnvironment,
): string | undefined {
	if (environment !== 'server') return undefined;
	const { pathname: path, search } = parsePath(id);
	if (!search || !TSRX_SOURCE_FILE.test(path)) return undefined;
	const keys = [...new URLSearchParams(search).keys()];
	return keys.length > 0 && keys.every((key) => CLIENT_ONLY_SOURCE_QUERY_KEYS.has(key))
		? path
		: undefined;
}
