// @yuku-analyzer/wasm's binding.js without its top-level await; same flag packing.
import { callWasm, wasmExports, type WasmMemoryExports } from './wasm.ts';

type AnalyzerExports = WasmMemoryExports & {
	analyze(ptr: number, len: number, flags: number): number;
};

type AnalyzeOptions = {
	readonly sourceType?: string;
	readonly lang?: string;
	readonly preserveParens?: boolean;
	readonly attachComments?: boolean;
};

const SOURCE_TYPES: Record<string, number> = { script: 0, module: 1, commonjs: 2 };
const LANGS: Record<string, number> = { js: 0, ts: 1, jsx: 2, tsx: 3, dts: 4 };
const encoder = new TextEncoder();

function packFlags(options: AnalyzeOptions = {}): number {
	let flags =
		(SOURCE_TYPES[options.sourceType ?? ''] ?? 1) | ((LANGS[options.lang ?? ''] ?? 0) << 2);
	if (options.preserveParens !== false) flags |= 1 << 5;
	if (options.attachComments) flags |= 1 << 7;
	return flags;
}

export default {
	analyze(source: string | Uint8Array, options?: AnalyzeOptions): ArrayBuffer {
		const wasm = wasmExports<AnalyzerExports>('analyzer');
		const bytes = typeof source === 'string' ? encoder.encode(source) : source;
		const flags = packFlags(options);
		return callWasm(
			wasm,
			bytes,
			(ptr, len) => wasm.analyze(ptr, len, flags),
			'yuku-analyzer wasm: analyze',
		);
	},
};
