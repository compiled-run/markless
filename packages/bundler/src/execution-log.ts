import type { MarklessExecutionLogMode } from './types.ts';
import type { MarklessBuildMetadataBundle } from './build/build-metadata.ts';
import type { GlobalInjections, MarklessBuildMetadata } from './types.ts';
import { MARKLESS_BUILD_PREFIX } from './build/chunking.ts';

export const MARKLESS_EXECUTION_LOG_MODULE_ID = 'virtual:markless:dev-log';
export const MARKLESS_EXECUTION_SIZES = `${MARKLESS_BUILD_PREFIX}execution-sizes.json`;

export type ExecutionSizeEntry = {
	readonly raw: number;
	readonly gzip: number;
	readonly chunk: string;
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

export function executionLogVirtualModuleSource(
	options: {
		readonly moduleSizes?: ReadonlyMap<string, number>;
		readonly sizesUrl?: string;
	} = {},
): string {
	const moduleSizes = options.moduleSizes
		? Object.fromEntries(
				[...options.moduleSizes].map(([id, raw]) => [id, { raw, estimated: true }]),
			)
		: null;
	return `
globalThis.__mxLog?.add(${JSON.stringify(MARKLESS_EXECUTION_LOG_MODULE_ID)});
const marklessDefaultModuleSizes = ${JSON.stringify(moduleSizes)};
const marklessSizesUrl = ${JSON.stringify(options.sizesUrl ?? null)};
let marklessSizesPromise;
function modules(log) { return log ? [...log] : []; }
function sizeRecord(input) { return !input ? undefined : typeof input === 'number' ? { raw: input, estimated: true } : input; }
function normalizeSizes(input) { if (!input) return undefined; const map = new Map(); for (const id of Object.keys(input)) map.set(id, sizeRecord(input[id])); return map; }
async function loadModuleSizes(input) {
	if (input.moduleSizes) return normalizeSizes(input.moduleSizes);
	if (marklessDefaultModuleSizes) return normalizeSizes(marklessDefaultModuleSizes);
	if (!marklessSizesUrl) return undefined;
	marklessSizesPromise ||= fetch(marklessSizesUrl).then((response) => response.ok ? response.json() : undefined).then(normalizeSizes).catch(() => undefined);
	return marklessSizesPromise;
}
function kb(items, sizes) {
	if (!sizes) return items.length === 1 ? '1 module' : items.length + ' modules';
	const records = items.map((id) => sizes.get(id)).filter(Boolean); const est = [...sizes.values()].some((record) => record.estimated); let total = 0;
	for (const record of records) total += record.estimated ? record.raw : (record.gzip || record.raw || 0);
	return (total / 1024).toFixed(1) + ' KB' + (est ? ' est.' : '');
}
function bytesText(items, sizes) { return !sizes ? (items.length === 1 ? '1 module executed' : items.length + ' modules executed') : kb(items, sizes) + ' executed'; }
function warmIds(event) { return [...new Set([event.dispatchModuleId, ...((event.eventRecord && event.eventRecord.symbolIds) || [])].filter(Boolean))]; }
function causeRows(input) {
	const before = input.before || new Set(); const after = input.after || new Set(); const woken = [...after].filter((id) => !before.has(id)); const record = input.eventRecord;
	const cause = record ? input.eventName + ' matched event record ' + record.hostNodeId : input.eventName + ' matched runtime records';
	const rows = woken.map((id) => 'woke ' + id + (input.moduleSizes ? ' (' + kb([id], input.moduleSizes) + ')' : '') + ' <- ' + cause);
	if (record) for (const id of warmIds(input)) rows.push('ran warm ' + id + (input.moduleSizes ? ' (' + kb([id], input.moduleSizes) + ')' : '') + ' <- ' + cause);
	if (record && !(input.view?.behaviors || []).some((b) => b.hostNodeId === record.hostNodeId)) rows.push('skip behavior — no matching record touched');
	return rows;
}
function mirror(text) {
	const root = document.documentElement; if (!root) return;
	const count = Number(root.getAttribute('data-markless-log-interactions') || '0') + 1;
	root.setAttribute('data-markless-log-interactions', String(count)); root.setAttribute('data-markless-log-last', text);
}
export async function installMarklessExecutionLog(input = {}) {
	const log = globalThis.__mxLog; if (!log || log.__marklessInstalled) return;
	log.__marklessInstalled = true;
	const moduleSizes = await loadModuleSizes(input); const preloaded = input.preloadedModuleCount || document.querySelectorAll('link[rel="modulepreload"]').length; const current = modules(log);
	if (input.printResumeSummary !== false) {
		const summary = 'markless: resumed — ' + bytesText(current, moduleSizes) + ', ' + preloaded + ' modules preloaded (' + current.length + ' executed)';
		console.log(summary); document.documentElement?.setAttribute('data-markless-log-summary', summary);
	}
	globalThis.__mxLogInteraction = (event) => {
		const after = modules(log); const before = event.before || new Set(); const woken = after.filter((id) => !before.has(id)); const warm = warmIds(event);
		if (event.noMatch) {
			const line = 'markless: ' + event.eventName + ' [' + (event.selector || 'event target') + '] — no event record matched (0.0 KB)';
			console.info(line); mirror(line); return;
		}
		const header = 'markless: ' + event.eventName + ' [' + (event.selector || 'event target') + '] · woke ' + woken.length + ' modules · ran warm ' + warm.length + ' modules · ' + kb([...new Set([...woken, ...warm])], moduleSizes);
		console.groupCollapsed(header);
		for (const row of causeRows({ ...event, after: new Set(after), moduleSizes })) console.log(row);
		console.groupEnd(); mirror(header);
	};
}
export async function logMarklessInteraction(event) { await installMarklessExecutionLog({ printResumeSummary: false }); globalThis.__mxLogInteraction?.(event); }
export async function logMarklessRenderSummary(input = {}) {
	const log = globalThis.__mxLog; if (!log) return;
	const moduleSizes = await loadModuleSizes(input); const current = modules(log);
	const summary = 'markless: rendered — ' + current.length + ' ' + (current.length === 1 ? 'module' : 'modules') + ' executed (' + kb(current, moduleSizes) + ')';
	console.log(summary); document.documentElement?.setAttribute('data-markless-log-summary', summary);
}
`;
}

export async function createExecutionSizesAsset(
	bundle: MarklessBuildMetadataBundle,
	metadata: MarklessBuildMetadata,
	canonPath: (fileName: string) => string = (fileName) => fileName,
) {
	const entries: Record<string, ExecutionSizeEntry> = {};
	const symbolLogIdsByChunk = new Map<string, string[]>();
	for (const module of metadata.modules) {
		for (const symbol of module.symbols) {
			if (!symbol.fileName) continue;
			const chunk = symbolLogIdsByChunk.get(symbol.fileName) ?? [];
			chunk.push(symbolLogId(symbol.symbolId));
			symbolLogIdsByChunk.set(symbol.fileName, chunk);
		}
	}

	for (const item of Object.values(bundle)) {
		if (item.type !== 'chunk') continue;
		const chunk = canonPath(item.fileName);
		const logIds = new Set<string>([
			...item.moduleIds.flatMap((id) => runtimeLogId(id) ?? []),
			...(symbolLogIdsByChunk.get(chunk) ?? []),
		]);
		if (logIds.size === 0) continue;
		const size = {
			raw: item.code.length,
			gzip: await gzipByteLength(item.code),
			chunk,
		};
		for (const id of logIds) entries[id] = size;
	}

	return {
		type: 'asset' as const,
		fileName: MARKLESS_EXECUTION_SIZES,
		source: JSON.stringify(sortRecord(entries)),
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

function runtimeLogId(id: string): string | null {
	const path = id.startsWith('\0') ? id.slice(1) : id;
	const match = path.match(/[/\\](web|runtime|serializer)[/\\]src[/\\]([^?#]+)\.ts$/);
	return match ? `${match[1]}:${match[2]!.replace(/[/\\]/g, '/')}` : null;
}

function symbolLogId(id: string): string {
	return id.startsWith('symbol:') ? id : `symbol:${id}`;
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
