import type { MarklessBuildMetadata } from '../types.ts';
import {
	EXECUTION_LOG_DISPATCH_MODULE_IDS,
	MARKLESS_EXECUTION_LOG_MODULE_ID,
	type ExecutionAttributionTables,
} from '../execution-log.ts';
import type { MarklessBuildMetadataBundle, MarklessBuildMetadataChunk } from './build-metadata.ts';
import { MARKLESS_EXECUTION_SIZES } from './chunking.ts';
import { symbolExecutionLogId } from '../module-id.ts';
import { symbolVirtualModuleSourceFile } from '../source-module.ts';

export { MARKLESS_EXECUTION_SIZES };

export type ExecutionSizeEntry = {
	readonly raw: number;
	readonly gzip: number;
	readonly chunk: string;
	readonly instrument?: true;
	/** Bytes of execution-log hook calls; `raw` and `gzip` exclude them. */
	readonly instrumentRaw?: number;
	/** The module's own share of its chunk (by rendered length); without it the entry is the whole chunk. */
	readonly module?: true;
	/** A name several logged modules answer to; the ledger charges each of them once. */
	readonly alias?: readonly string[];
};

// Per-module rendered lengths, keyed by the chunk object they were read from.
export type RenderedChunkModules = ReadonlyMap<object, ReadonlyArray<readonly [string, number]>>;

const HOOK_CALL = String.raw`globalThis\.__mxLog\?\.add\((?:\x60[^\x60]*\x60|"(?:[^"\\]|\\.)*")\)`;
const HOOK_CALLS = new RegExp(`${HOOK_CALL}(?:;\\n?|,)|,${HOOK_CALL}|${HOOK_CALL}`, 'g');

/** The chunk code without its execution-log hook calls: what the log itself adds is instrument bytes. */
export function stripExecutionLogHookCalls(code: string): string {
	return code.replace(HOOK_CALLS, '');
}

const CONTENT_HASH_MODULE_SPECIFIER = /chunk-[A-Za-z0-9_-]+\.js/g;
const CONTENT_HASH_PLACEHOLDER = 'chunk-________.js';

export function canonicalizeContentHashSpecifiers(source: string): string {
	// PM ruling 2026-08-01: executed-app gzip walls measure code, so emitted
	// content hashes are fixed-width before compression instead of charging a
	// build's filename/hash lottery.
	return source.replace(CONTENT_HASH_MODULE_SPECIFIER, CONTENT_HASH_PLACEHOLDER);
}

export type ExecutionSizesCompletenessOptions = {
	// Enforcement follows the log gate: a 'never' build logs nothing, so it owes
	// nothing.
	readonly executionLogActive?: boolean;
	// log id -> the resolved module id the hook was injected into. The module id
	// is what decides whether the hook shipped; the log id is only its name.
	readonly hookedIds?: ReadonlyMap<string, string>;
	readonly root?: string;
	readonly renderedModules?: RenderedChunkModules;
};

export async function createExecutionSizesAsset(
	bundle: MarklessBuildMetadataBundle,
	metadata: MarklessBuildMetadata,
	canonPath: (fileName: string) => string = (fileName) => fileName,
	attribution?: ExecutionAttributionTables,
	options: ExecutionSizesCompletenessOptions = {},
) {
	const entries: Record<string, ExecutionSizeEntry> = {};
	const sizeByChunk = new Map<string, ExecutionSizeEntry>();
	const chunkSize = async (item: MarklessBuildMetadataChunk, chunk: string) => {
		const cached = sizeByChunk.get(chunk);
		if (cached) return cached;
		const code = item.moduleIds.some(
			(id) => stripResolvedIdMarker(id) === MARKLESS_EXECUTION_LOG_MODULE_ID,
		)
			? item.code
			: stripExecutionLogHookCalls(item.code);
		const instrumentRaw = item.code.length - code.length;
		const size = {
			raw: code.length,
			gzip: await gzipByteLength(canonicalizeContentHashSpecifiers(code)),
			chunk,
			...(instrumentRaw > 0 ? { instrumentRaw } : {}),
		};
		sizeByChunk.set(chunk, size);
		return size;
	};
	const moduleSize = (
		item: MarklessBuildMetadataChunk,
		size: ExecutionSizeEntry,
		moduleId: string,
	): ExecutionSizeEntry => {
		const rendered = options.renderedModules?.get(item);
		const total = rendered?.reduce((sum, [, length]) => sum + length, 0) ?? 0;
		const own = rendered?.find(([id]) => stripResolvedIdMarker(id) === moduleId)?.[1];
		if (!own || total === 0) return size;
		const share = (bytes: number) => Math.round((bytes * own) / total);
		return {
			raw: share(size.raw),
			gzip: share(size.gzip),
			chunk: size.chunk,
			...(size.instrumentRaw ? { instrumentRaw: share(size.instrumentRaw) } : {}),
			module: true,
		};
	};
	const symbolLogIdsByChunk = new Map<string, Array<readonly [string, string]>>();
	for (const module of metadata.modules) {
		for (const symbol of module.symbols) {
			if (!symbol.fileName) continue;
			const chunk = symbolLogIdsByChunk.get(symbol.fileName) ?? [];
			// Key symbols by their virtual module id (it embeds the source
			// filename): same-numbered symbols from two source files must not
			// overwrite each other in this flat map.
			chunk.push([
				symbolExecutionLogId(symbol.virtualModuleId, options.root),
				stripResolvedIdMarker(symbol.virtualModuleId),
			]);
			symbolLogIdsByChunk.set(symbol.fileName, chunk);
		}
	}

	for (const item of Object.values(bundle)) {
		if (item.type !== 'chunk') continue;
		const chunk = canonPath(item.fileName);
		const symbols = symbolLogIdsByChunk.get(chunk) ?? [];
		const moduleOf = new Map<string, string>([
			...item.moduleIds.flatMap((id): Array<[string, string]> => {
				const logId = chunkModuleLogId(id);
				return logId ? [[logId, stripResolvedIdMarker(id)]] : [];
			}),
			...symbols.map(([logId, moduleId]): [string, string] => [logId, moduleId]),
		]);
		const logIds = new Set(moduleOf.keys());
		if (logIds.size === 0) continue;
		if (logIds.has(MARKLESS_EXECUTION_LOG_MODULE_ID) && logIds.size > 1) {
			const cohabitingIds = [...logIds]
				.filter((id) => id !== MARKLESS_EXECUTION_LOG_MODULE_ID)
				.sort();
			throw new Error(
				`Markless execution sizes require an isolated dev-log chunk; chunk "${chunk}" also contains logged module ids: ${cohabitingIds.join(', ')}.`,
			);
		}
		const size = await chunkSize(item, chunk);
		for (const id of logIds)
			entries[id] =
				id === MARKLESS_EXECUTION_LOG_MODULE_ID
					? { ...size, instrument: true }
					: moduleSize(item, size, moduleOf.get(id)!);
		// Rolldown rewrites a symbol module's hook literal into the chunk-relative specifier it
		// emits, so symbol modules log "./chunk-x.js", which names every symbol module in the chunk.
		const emittedSpecifier = `./${chunk.split('/').pop()}`;
		const members = (symbols.length ? symbols.map(([logId]) => logId) : [...logIds]).filter(
			(id) => entries[id]?.module,
		);
		entries[emittedSpecifier] ??= members.length
			? {
					raw: members.reduce((sum, id) => sum + entries[id]!.raw, 0),
					gzip: members.reduce((sum, id) => sum + entries[id]!.gzip, 0),
					chunk,
					alias: members.sort(),
				}
			: size;
	}

	const unshipped: Record<string, string> = {};
	if (options.executionLogActive === true) {
		const absorbing = absorbingChunkIndex(bundle);
		const unmappable: string[] = [];
		for (const required of requiredExecutionLogIds(
			metadata,
			options.hookedIds,
			absorbing,
			options.root,
		)) {
			if (entries[required.id]) continue;
			const item = absorbing.get(required.moduleId ?? required.id);
			if (!item) {
				// A shipped producer that joins nothing is the hole this asset
				// exists to deny. A hooked module no client chunk carries cannot
				// execute in a browser, so it is not a hole — but it is never
				// silently dropped either: it is named here with its reason.
				if (required.shipped) unmappable.push(required.id);
				else if (required.hooked)
					unshipped[required.id] = UNSHIPPED_HOOK_REASON;
				continue;
			}
			const size = await chunkSize(item, canonPath(item.fileName));
			entries[required.id] =
				required.id === MARKLESS_EXECUTION_LOG_MODULE_ID
					? { ...size, instrument: true }
					: moduleSize(
							item,
							size,
							item.moduleIds
								.map(stripResolvedIdMarker)
								.find(
									(id) =>
										id === required.moduleId || workspaceModuleLogId(id) === required.id,
								) ?? required.id,
						);
		}
		if (unmappable.length > 0)
			throw new Error(
				`Markless execution sizes are incomplete: no chunk carries ${unmappable.sort().join(', ')}. Every id this build can log must join build/execution-sizes.json, or the in-page console reports "bytes unknown" for a real execution.`,
			);
	}

	return {
		type: 'asset' as const,
		fileName: MARKLESS_EXECUTION_SIZES,
		source: JSON.stringify({
			...sortRecord(entries),
			...(Object.keys(unshipped).length > 0 ? { unshipped: sortRecord(unshipped) } : {}),
			...(attribution && Object.keys(attribution).length > 0
				? { attribution: sortNestedRecord(attribution) }
				: {}),
		}),
	};
}

// Hooks are injected in `transform`, which runs before Rolldown decides the
// module graph, tree-shakes it and assigns chunks — so the injection site
// cannot know whether the module it is hooking will reach a client chunk. The
// bundle is the authority, and this is the reason it records for the ids it
// exempts.
export const UNSHIPPED_HOOK_REASON =
	'hooked at transform time (before chunk assignment exists); no client chunk carries this module, so it can never execute in a browser';

type RequiredExecutionLogId = {
	readonly id: string;
	readonly moduleId?: string;
	readonly shipped: boolean;
	readonly hooked?: boolean;
};

// The producers of log ids are the only authority on which ids exist: injected
// hooks, the self-registering instrument, the symbols an event record can name,
// and the runtime's dispatchModuleId literals.
function requiredExecutionLogIds(
	metadata: MarklessBuildMetadata,
	hookedIds: ReadonlyMap<string, string> = new Map(),
	absorbing: ReadonlyMap<string, MarklessBuildMetadataChunk> = new Map(),
	root?: string,
): RequiredExecutionLogId[] {
	const required = new Map<string, RequiredExecutionLogId>();
	const add = (id: string, shipped: boolean, hooked = false, moduleId = id) => {
		const current = required.get(id);
		if (!current || (shipped && !current.shipped))
			required.set(id, { id, moduleId, shipped, hooked: hooked || current?.hooked });
	};
	// A hook's module id, not its log id, decides whether it shipped: the bundle
	// either carries that module or it does not. Deriving "shipped" from the log
	// id instead would exempt exactly the ids whose derivation is broken.
	for (const [id, moduleId] of hookedIds)
		add(
			id,
			absorbing.has(moduleId),
			true,
			symbolVirtualModuleSourceFile(moduleId) === null ? id : moduleId,
		);
	add(MARKLESS_EXECUTION_LOG_MODULE_ID, false);
	for (const id of EXECUTION_LOG_DISPATCH_MODULE_IDS) add(id, false);
	for (const module of metadata.modules)
		for (const symbol of module.symbols)
			add(
				symbolExecutionLogId(symbol.virtualModuleId, root),
				!!symbol.fileName,
				false,
				stripResolvedIdMarker(symbol.virtualModuleId),
			);
	return [...required.values()];
}

// Resolves a required id to the chunk that actually absorbed its module, by
// exact module id (symbols, the instrument) or by workspace package path
// (framework ids, including packages the enumerating map does not walk).
function absorbingChunkIndex(
	bundle: MarklessBuildMetadataBundle,
): ReadonlyMap<string, MarklessBuildMetadataChunk> {
	const index = new Map<string, MarklessBuildMetadataChunk>();
	for (const item of Object.values(bundle)) {
		if (item.type !== 'chunk') continue;
		for (const raw of [...item.moduleIds, item.facadeModuleId ?? '']) {
			if (!raw) continue;
			const id = stripResolvedIdMarker(raw);
			if (!index.has(id)) index.set(id, item);
			const logId = workspaceModuleLogId(id);
			if (logId && !index.has(logId)) index.set(logId, item);
		}
	}
	return index;
}

function workspaceModuleLogId(path: string): string | null {
	const match = path.match(/[/\\]([a-z0-9-]+)[/\\]src[/\\]([^?#]+)\.ts$/);
	return match ? `${match[1]}:${match[2]!.replace(/[/\\]/g, '/')}` : null;
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
