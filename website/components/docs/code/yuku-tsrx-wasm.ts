// Stands in for @tsrx/yuku's native addon in the browser. The wasm module is built from the
// same yuku-tsrx tree as the pinned addon, so its buffers decode with that package's decoders.
import { callWasm, type WasmMemoryExports } from './wasm.ts';

type YukuTsrxExports = WasmMemoryExports & {
	parse(ptr: number, len: number, flags: number): number;
	analyze(ptr: number, len: number, flags: number): number;
};

export type YukuParseOptions = {
	readonly sourceType?: 'script' | 'module' | 'commonjs';
	readonly lang?: 'js' | 'ts' | 'jsx' | 'tsx' | 'dts';
	readonly preserveParens?: boolean;
	readonly semanticErrors?: boolean;
	readonly attachComments?: boolean;
	readonly loose?: boolean;
};

const SOURCE_TYPES = ['script', 'module', 'commonjs'];
const LANGS = ['js', 'ts', 'jsx', 'tsx', 'dts'];

// Bit layout mirrors src/ffi/wasm.zig; defaults mirror the napi option structs in src/ffi/root.zig.
export function packYukuFlags(options: YukuParseOptions = {}): number {
	const sourceType = SOURCE_TYPES.indexOf(options.sourceType ?? 'module');
	const lang = LANGS.indexOf(options.lang ?? 'js');
	if (sourceType < 0) throw new Error(`yuku-tsrx wasm: unknown sourceType ${options.sourceType}`);
	if (lang < 0) throw new Error(`yuku-tsrx wasm: unknown lang ${options.lang}`);
	let flags = sourceType | (lang << 2);
	if (options.preserveParens !== false) flags |= 1 << 5;
	if (options.semanticErrors) flags |= 1 << 6;
	if (options.attachComments) flags |= 1 << 7;
	if (options.loose) flags |= 1 << 8;
	return flags >>> 0;
}

export function createYukuTsrxBinding(exports: () => YukuTsrxExports) {
	return {
		parse(bytes: Uint8Array, options?: YukuParseOptions): ArrayBuffer {
			const wasm = exports();
			const flags = packYukuFlags(options);
			return callWasm(
				wasm,
				bytes,
				(ptr, len) => wasm.parse(ptr, len, flags),
				'yuku-tsrx wasm: parse',
			);
		},
		analyze(bytes: Uint8Array, options?: YukuParseOptions): ArrayBuffer {
			const wasm = exports();
			const flags = packYukuFlags({ ...options, semanticErrors: false, loose: false });
			return callWasm(
				wasm,
				bytes,
				(ptr, len) => wasm.analyze(ptr, len, flags),
				'yuku-tsrx wasm: analyze',
			);
		},
		generate(): never {
			throw new Error('yuku-tsrx wasm: generate from an encoded tree is not in this build');
		},
	};
}
