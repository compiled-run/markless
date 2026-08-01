import type { MarklessBuildMetadata } from '../types.ts';
import {
	MARKLESS_EXECUTION_LOG_MODULE_ID,
	type ExecutionAttributionTables,
} from '../execution-log.ts';
import type { MarklessBuildMetadataBundle } from './build-metadata.ts';
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
			gzip: await gzipByteLength(canonicalizeContentHashSpecifiers(item.code)),
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
