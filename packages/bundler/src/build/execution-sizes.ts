import type { MarklessBuildMetadata } from '../types.ts';
import {
	EXECUTION_LOG_DISPATCH_MODULE_IDS,
	MARKLESS_EXECUTION_LOG_MODULE_ID,
	type ExecutionAttributionTables,
} from '../execution-log.ts';
import type { MarklessBuildMetadataBundle, MarklessBuildMetadataChunk } from './build-metadata.ts';
import { MARKLESS_BUILD_PREFIX } from './chunking.ts';

export const MARKLESS_EXECUTION_SIZES = `${MARKLESS_BUILD_PREFIX}execution-sizes.json`;

export type ExecutionSizeEntry = {
	readonly raw: number;
	readonly gzip: number;
	readonly chunk: string;
	readonly instrument?: true;
};

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
		const size = {
			raw: item.code.length,
			gzip: await gzipByteLength(canonicalizeContentHashSpecifiers(item.code)),
			chunk,
		};
		sizeByChunk.set(chunk, size);
		return size;
	};
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
		const size = await chunkSize(item, chunk);
		for (const id of logIds)
			entries[id] =
				id === MARKLESS_EXECUTION_LOG_MODULE_ID ? { ...size, instrument: true } : size;
		// Rolldown rewrites a hook's own module-id literal into the chunk-relative
		// specifier it emits for that module, so symbol modules log "./chunk-x.js".
		// The unit is already the chunk, so the chunk answers to that name too —
		// otherwise every symbol execution reads as an unmapped id.
		const emittedSpecifier = `./${chunk.split('/').pop()}`;
		entries[emittedSpecifier] ??= size;
	}

	const unshipped: Record<string, string> = {};
	if (options.executionLogActive === true) {
		const absorbing = absorbingChunkIndex(bundle);
		const unmappable: string[] = [];
		for (const required of requiredExecutionLogIds(metadata, options.hookedIds, absorbing)) {
			if (entries[required.id]) continue;
			const item = absorbing.get(required.id);
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
					: size;
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
): RequiredExecutionLogId[] {
	const required = new Map<string, RequiredExecutionLogId>();
	const add = (id: string, shipped: boolean, hooked = false) => {
		const current = required.get(id);
		if (!current || (shipped && !current.shipped))
			required.set(id, { id, shipped, hooked: hooked || current?.hooked });
	};
	// A hook's module id, not its log id, decides whether it shipped: the bundle
	// either carries that module or it does not. Deriving "shipped" from the log
	// id instead would exempt exactly the ids whose derivation is broken.
	for (const [id, moduleId] of hookedIds) add(id, absorbing.has(moduleId), true);
	add(MARKLESS_EXECUTION_LOG_MODULE_ID, false);
	for (const id of EXECUTION_LOG_DISPATCH_MODULE_IDS) add(id, false);
	for (const module of metadata.modules)
		for (const symbol of module.symbols)
			add(stripResolvedIdMarker(symbol.virtualModuleId), !!symbol.fileName);
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
