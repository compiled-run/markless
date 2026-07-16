import type { MarklessExecutionLogMode } from './types.ts';
import type { MarklessBuildMetadataBundle } from './build/build-metadata.ts';
import type { GlobalInjections, MarklessBuildMetadata } from './types.ts';
import { MARKLESS_BUILD_PREFIX } from './build/chunking.ts';

export const MARKLESS_EXECUTION_LOG_MODULE_ID = 'virtual:markless:dev-log';
export const MARKLESS_EXECUTION_SIZES = `${MARKLESS_BUILD_PREFIX}execution-sizes.json`;

export type ExecutionAttributionTables = Readonly<Record<string, Readonly<Record<string, string>>>>;

export type ExecutionSizeEntry = {
	readonly raw: number;
	readonly gzip: number;
	readonly chunk: string;
	readonly instrument?: true;
};

export function normalizeExecutionLogMode(
	mode: MarklessExecutionLogMode | undefined,
): MarklessExecutionLogMode {
	return mode ?? 'auto';
}

export function injectExecutionLogModuleHook(
	source: string,
	moduleId: string,
	mode: MarklessExecutionLogMode | undefined,
): string {
	if (normalizeExecutionLogMode(mode) === 'never') return source;
	return `globalThis.__mxLog?.add(${JSON.stringify(moduleId)});\n${source}`;
}

const EXECUTION_LOG_HOOK_LINE = /^globalThis\.__mxLog\?\.add\("(?:[^"\\]|\\.)*"\);\n/;

// The transform pass injects per-source-module symbol log ids ("symbol:N")
// that collide across source files. The plugin re-keys the hook to the symbol
// virtual module id (which embeds the source filename) so the executed id is
// exactly the size-map join key. No-op when the source carries no hook
// (production symbol modules).
export function requalifyExecutionLogModuleHook(source: string, moduleId: string): string {
	if (!EXECUTION_LOG_HOOK_LINE.test(source)) return source;
	return source.replace(
		EXECUTION_LOG_HOOK_LINE,
		`globalThis.__mxLog?.add(${JSON.stringify(moduleId)});\n`,
	);
}

export function executionLogVirtualModuleSource(
	options: {
		readonly moduleSizes?: ReadonlyMap<string, number>;
		readonly attribution?: ExecutionAttributionTables;
		readonly sizesUrl?: string;
	} = {},
): string {
	if (!options.moduleSizes) return executionLogVirtualModuleSourceWithOwnSize(options, null);
	// The module logs its own execution, so the dev estimate join must cover it
	// too: measure the emitted source and embed that size (build sizes come
	// from the emitted execution-sizes asset instead).
	return executionLogVirtualModuleSourceWithOwnSize(
		options,
		executionLogVirtualModuleSourceWithOwnSize(options, 0).length,
	);
}

function executionLogVirtualModuleSourceWithOwnSize(
	options: {
		readonly moduleSizes?: ReadonlyMap<string, number>;
		readonly attribution?: ExecutionAttributionTables;
		readonly sizesUrl?: string;
	},
	ownRawSize: number | null,
): string {
	const moduleSizes = options.moduleSizes
		? Object.fromEntries([
				...[...options.moduleSizes].map(([id, raw]) => [id, { raw, estimated: true }]),
				[
					MARKLESS_EXECUTION_LOG_MODULE_ID,
					{ raw: ownRawSize ?? 0, estimated: true, instrument: true },
				],
			])
		: null;
	return `
globalThis.__mxLog?.add(${JSON.stringify(MARKLESS_EXECUTION_LOG_MODULE_ID)});
const marklessDefaultModuleSizes = ${JSON.stringify(moduleSizes)};
const marklessDefaultAttribution = ${JSON.stringify(options.attribution ?? null)};
const marklessSizesUrl = ${JSON.stringify(options.sizesUrl ?? null)};
let marklessSizesPromise;
let marklessAttribution;
let marklessInstallPromise;
function modules(log) { return log ? [...log] : []; }
function sizeRecord(input) { return !input ? undefined : typeof input === 'number' ? { raw: input, estimated: true } : input; }
function normalizeSizes(input) { if (!input) return undefined; const map = new Map(); for (const id of Object.keys(input)) if (id !== 'attribution') map.set(id, sizeRecord(input[id])); return map; }
async function loadModuleSizes(input) {
	if (input.moduleSizes) return normalizeSizes(input.moduleSizes);
	if (marklessDefaultModuleSizes) { marklessAttribution = marklessDefaultAttribution; return normalizeSizes(marklessDefaultModuleSizes); }
	if (!marklessSizesUrl) return undefined;
	marklessSizesPromise ||= fetch(marklessSizesUrl).then((response) => response.ok ? response.json() : undefined).then((payload) => { marklessAttribution = payload && payload.attribution; return normalizeSizes(payload); }).catch(() => undefined);
	return marklessSizesPromise;
}
function symbolParts(id) { const match = /^virtual:markless:symbol:([^:]+):([^:]+)$/.exec(id); if (!match) return null; try { return { source: decodeURIComponent(match[1]), symbolId: decodeURIComponent(match[2]) }; } catch { return null; } }
function routeFile() { const text = document.querySelector?.('script[type="@markless/core/route"]')?.textContent; if (!text) return null; try { const value = JSON.parse(text).file; return typeof value === 'string' ? value : null; } catch { return null; } }
function qualifySymbolIds(ids, hostNodeId, sizes, tables) { const route = routeFile(); if (!route || route.includes('..') || route.includes('\\\\')) return ids; const canonical = route.replace(/^\\/+/, ''); const scopes = tables && Object.prototype.hasOwnProperty.call(tables, canonical) ? tables[canonical] : undefined; if (!scopes) return ids; const host = /^((?:c\\d+:)*)[^:]+$/.exec(hostNodeId); const hostScope = host && host[1]; return ids.map((id) => { const own = /^((?:c\\d+:)+)(.*)$/.exec(id); const scope = own ? own[1] : hostScope; if (scope === null || !Object.prototype.hasOwnProperty.call(scopes, scope)) return id; const local = own ? own[2] : id; if (!local.startsWith('symbol:')) return id; const matches = [...(sizes?.keys() || [])].filter((key) => { const match = /^virtual:markless:symbol:([^:]+):([^:]+)$/.exec(key); if (!match || match[1] !== scopes[scope]) return false; try { return decodeURIComponent(match[2]) === local; } catch { return false; } }); return matches.length === 1 ? matches[0] : id; }); }
function canonicalId(id, sizes) {
	if (!sizes || sizes.has(id)) return id;
	const local = id.replace(/^(?:c\\d+:)+/, '');
	if (!local.startsWith('symbol:')) return id;
	const matches = [...sizes.keys()].filter((key) => { const parts = symbolParts(key); return !!parts && parts.symbolId === local; });
	return matches.length === 1 ? matches[0] : id;
}
function displayId(id) { const parts = symbolParts(id); return parts ? parts.symbolId + ' (' + (parts.source.split('/').pop() || parts.source) + ')' : id; }
function accounting(items, sizes) {
	const ids = [...new Set(items.map((id) => canonicalId(id, sizes)))];
	if (!sizes) return { appBytes: ids.length ? null : 0, instrumentBytes: 0, appModules: ids.length, instrumentModules: 0, estimated: { app: false, instrument: false }, unmappedIds: [] };
	let appBytes = 0, instrumentBytes = 0, appModules = 0, instrumentModules = 0, appEstimated = false, instrumentEstimated = false; const unmappedIds = [];
	for (const id of ids) { const record = sizes.get(id); if (!record) { appModules++; unmappedIds.push(id); continue; } const bytes = record.estimated ? record.raw : (record.gzip ?? record.raw); if (record.instrument) { instrumentModules++; instrumentBytes += bytes; instrumentEstimated ||= !!record.estimated; } else { appModules++; appBytes += bytes; appEstimated ||= !!record.estimated; } }
	return { appBytes: unmappedIds.length ? null : appBytes, instrumentBytes, appModules, instrumentModules, estimated: { app: appEstimated, instrument: instrumentEstimated }, unmappedIds };
}
function category(a, name) { const bytes = name === 'app' ? a.appBytes : a.instrumentBytes; const count = name === 'app' ? a.appModules : a.instrumentModules; if (bytes === null) return count + ' ' + name + ' module' + (count === 1 ? '' : 's') + (name === 'app' && a.unmappedIds.length ? ' (bytes unknown; ' + a.unmappedIds.length + ' unmapped)' : ''); return (bytes / 1024).toFixed(1) + ' KB' + (a.estimated[name] ? ' est. source' : '') + ' ' + name; }
function rowKb(items, sizes) { const a = accounting(items, sizes); if (a.unmappedIds.length) return 'bytes unknown'; const total = (a.appBytes || 0) + (a.instrumentBytes || 0); return (total / 1024).toFixed(1) + ' KB' + (a.estimated.app || a.estimated.instrument ? ' est. source' : ''); }
function warmIds(event) { return [...new Set([event.dispatchModuleId, ...((event.eventRecord && event.eventRecord.symbolIds) || [])].filter(Boolean))]; }
function causeRows(input) {
	const before = input.before || new Set(); const after = input.after || new Set(); const woken = [...after].filter((id) => !before.has(id)); const record = input.eventRecord;
	const cause = record ? input.eventName + ' matched event record ' + record.hostNodeId : input.eventName + ' matched runtime records';
	const label = (id) => displayId(canonicalId(id, input.moduleSizes));
	const rows = woken.map((id) => 'woke ' + label(id) + (input.moduleSizes ? ' (' + rowKb([id], input.moduleSizes) + (input.moduleSizes.get(canonicalId(id, input.moduleSizes))?.instrument ? ' instrument' : '') + ')' : '') + ' <- ' + cause);
	if (record) for (const id of warmIds(input)) rows.push('ran warm ' + label(id) + (input.moduleSizes ? ' (' + rowKb([id], input.moduleSizes) + (input.moduleSizes.get(canonicalId(id, input.moduleSizes))?.instrument ? ' instrument' : '') + ')' : '') + ' <- ' + cause);
	if (record && !(input.view?.behaviors || []).some((b) => b.hostNodeId === record.hostNodeId)) rows.push('skip behavior — no matching record touched');
	return rows;
}
function mirror(text, a) {
	const root = document.documentElement; if (!root) return;
	const count = Number(root.getAttribute('data-markless-log-interactions') || '0') + 1;
	root.setAttribute('data-markless-log-interactions', String(count)); root.setAttribute('data-markless-log-last', text); mirrorBytes(root, a);
}
function mirrorBytes(root, a) { if (a.appBytes === null || a.instrumentBytes === null) { root.removeAttribute('data-markless-log-app-bytes'); root.removeAttribute('data-markless-log-instrument-bytes'); return; } root.setAttribute('data-markless-log-app-bytes', String(a.appBytes)); root.setAttribute('data-markless-log-instrument-bytes', String(a.instrumentBytes)); }
export async function installMarklessExecutionLog(input = {}) {
	const log = globalThis.__mxLog; if (!log || globalThis.__mxLogInteraction) return;
	if (marklessInstallPromise) return marklessInstallPromise;
	marklessInstallPromise = (async () => {
	const moduleSizes = await loadModuleSizes(input); const preloaded = input.preloadedModuleCount || document.querySelectorAll('link[rel="modulepreload"]').length; const current = modules(log);
	if (input.printResumeSummary !== false) {
		const a = accounting(current, moduleSizes); const summary = 'markless: resumed — ' + category(a, 'app') + ' executed, ' + preloaded + ' modules preloaded (' + a.appModules + ' app executed) · ' + category(a, 'instrument');
		console.log(summary); const root = document.documentElement; if (root) { root.setAttribute('data-markless-log-summary', summary); mirrorBytes(root, a); }
	}
	globalThis.__mxLogInteraction = (event) => {
		const capturedAfter = modules(event.after || log);
		const symbolIds = qualifySymbolIds((event.eventRecord && event.eventRecord.symbolIds) || [], event.eventRecord && event.eventRecord.hostNodeId, moduleSizes, marklessAttribution);
		if (event.eventRecord) event = { ...event, eventRecord: { ...event.eventRecord, symbolIds } };
		const after = capturedAfter; const before = event.before || new Set(); if (log.has(${JSON.stringify(MARKLESS_EXECUTION_LOG_MODULE_ID)}) && !after.includes(${JSON.stringify(MARKLESS_EXECUTION_LOG_MODULE_ID)})) after.push(${JSON.stringify(MARKLESS_EXECUTION_LOG_MODULE_ID)}); const woken = after.filter((id) => !before.has(id)); const warm = warmIds(event);
		if (event.noMatch) {
			const a = accounting([], moduleSizes); const line = 'markless: ' + event.eventName + ' [' + (event.selector || 'event target') + '] — no event record matched · 0.0 KB app · 0.0 KB instrument';
			console.info(line); mirror(line, a); return;
		}
		const a = accounting([...woken, ...warm], moduleSizes); const header = 'markless: ' + event.eventName + ' [' + (event.selector || 'event target') + '] · woke ' + woken.length + ' modules · ran warm ' + warm.length + ' modules · ' + category(a, 'app') + ' · ' + category(a, 'instrument');
		console.groupCollapsed(header);
		for (const row of causeRows({ ...event, after: new Set(after), moduleSizes })) console.log(row);
		console.groupEnd(); mirror(header, a);
	};
	log.__marklessInstalled = true;
	})();
	return marklessInstallPromise;
}
export async function logMarklessInteraction(event) { await installMarklessExecutionLog({ printResumeSummary: false }); globalThis.__mxLogInteraction?.(event); }
export async function logMarklessSpecializedInteraction(input, before) {
	const target = input.element ?? input.event?.target;
	const tag = typeof target?.tagName === 'string' ? target.tagName.toLowerCase() : 'element';
	await logMarklessInteraction({ eventName: input.event?.type ?? 'event', eventRecord: input.eventRecord, before, selector: tag + (target?.id ? '#' + target.id : ''), after: new Set(globalThis.__mxLog) });
}
export async function logMarklessRenderSummary(input = {}) {
	const log = globalThis.__mxLog; if (!log) return;
	const moduleSizes = await loadModuleSizes(input); const current = modules(log); const a = accounting(current, moduleSizes);
	const summary = 'markless: rendered — ' + a.appModules + ' app module' + (a.appModules === 1 ? '' : 's') + ' executed (' + category(a, 'app') + ') · ' + a.instrumentModules + ' instrument module' + (a.instrumentModules === 1 ? '' : 's') + ' executed (' + category(a, 'instrument').replace(/ instrument$/, '') + ')';
	console.log(summary); const root = document.documentElement; if (root) { root.setAttribute('data-markless-log-summary', summary); mirrorBytes(root, a); }
}
`;
}

export async function createExecutionSizesAsset(
	bundle: MarklessBuildMetadataBundle,
	metadata: MarklessBuildMetadata,
	canonPath: (fileName: string) => string = (fileName) => fileName,
	attribution?: ExecutionAttributionTables,
) {
	const entries: Record<string, ExecutionSizeEntry> = {};
	const symbolLogIdsByChunk = new Map<string, string[]>();
	for (const module of metadata.modules) {
		for (const symbol of module.symbols) {
			if (!symbol.fileName) continue;
			const chunk = symbolLogIdsByChunk.get(symbol.fileName) ?? [];
			// Key symbols by their virtual module id (it embeds the source
			// filename): same-numbered symbols from two source files must not
			// overwrite each other in this flat map.
			chunk.push(stripResolvedIdMarker(symbol.virtualModuleId));
			symbolLogIdsByChunk.set(symbol.fileName, chunk);
		}
	}

	for (const item of Object.values(bundle)) {
		if (item.type !== 'chunk') continue;
		const chunk = canonPath(item.fileName);
		const logIds = new Set<string>([
			...item.moduleIds.flatMap((id) => chunkModuleLogId(id) ?? []),
			...(symbolLogIdsByChunk.get(chunk) ?? []),
		]);
		if (logIds.size === 0) continue;
		if (logIds.has(MARKLESS_EXECUTION_LOG_MODULE_ID) && logIds.size > 1) {
			const cohabitingIds = [...logIds]
				.filter((id) => id !== MARKLESS_EXECUTION_LOG_MODULE_ID)
				.sort();
			throw new Error(
				`Markless execution sizes require an isolated dev-log chunk; chunk "${chunk}" also contains logged module ids: ${cohabitingIds.join(', ')}.`,
			);
		}
		const size = {
			raw: item.code.length,
			gzip: await gzipByteLength(item.code),
			chunk,
		};
		for (const id of logIds)
			entries[id] =
				id === MARKLESS_EXECUTION_LOG_MODULE_ID ? { ...size, instrument: true } : size;
	}

	return {
		type: 'asset' as const,
		fileName: MARKLESS_EXECUTION_SIZES,
		source: JSON.stringify({
			...sortRecord(entries),
			...(attribution && Object.keys(attribution).length > 0
				? { attribution: sortNestedRecord(attribution) }
				: {}),
		}),
	};
}

export function executionLogActivationInjection(
	mode: MarklessExecutionLogMode | undefined,
): GlobalInjections | null {
	if (normalizeExecutionLogMode(mode) === 'never') return null;
	const predicate =
		mode === 'always'
			? 'true'
			: "/^https?:\\/\\/(?:localhost|127\\.0\\.0\\.1|\\[::1\\])(?::|$)/.test(l.origin) || new URLSearchParams(l.search).has('markless-log') || (() => { try { return localStorage.getItem('marklessLog') === '1'; } catch { return false; } })()";
	return {
		tag: 'script',
		location: 'head' as const,
		children: `(() => { const l = location; if (${predicate}) globalThis.__mxLog = globalThis.__mxLog || new Set(); })();`,
	};
}

// Every id the execution-log hook can add to __mxLog must resolve here, or
// the console reports "0.0 KB" for real executions: runtime package modules
// (dev hook ids reused as build keys) and the dev-log module itself, which
// self-registers when it loads.
function chunkModuleLogId(id: string): string | null {
	const path = stripResolvedIdMarker(id);
	if (path === MARKLESS_EXECUTION_LOG_MODULE_ID) return path;
	const match = path.match(/[/\\](web|runtime|serializer)[/\\]src[/\\]([^?#]+)\.ts$/);
	return match ? `${match[1]}:${match[2]!.replace(/[/\\]/g, '/')}` : null;
}

function stripResolvedIdMarker(id: string): string {
	return id.startsWith('\0') ? id.slice(1) : id;
}

async function gzipByteLength(code: string): Promise<number> {
	const encoded = new TextEncoder().encode(code);
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(encoded);
			controller.close();
		},
	}).pipeThrough(new CompressionStream('gzip') as ReadableWritablePair<Uint8Array, Uint8Array>);
	const reader = stream.getReader();
	let total = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
	}
	return total;
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
	const next: Record<string, T> = {};
	for (const key of Object.keys(record).sort()) next[key] = record[key]!;
	return next;
}

function sortNestedRecord(
	record: ExecutionAttributionTables,
): Record<string, Record<string, string>> {
	const next: Record<string, Record<string, string>> = {};
	for (const key of Object.keys(record).sort()) next[key] = sortRecord({ ...record[key] });
	return next;
}
