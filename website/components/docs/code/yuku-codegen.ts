// yuku-codegen's `generate` over its published wasm build, flags packed as @yuku-codegen/wasm
// does. The wasm printer returns text only, so `errors` is always empty and a requested source
// map comes back with no mappings.
import { encode } from '@yuku-codegen/wasm/encode.js';
import { callWasm, wasmExports, type WasmMemoryExports } from './wasm.ts';

type CodegenExports = WasmMemoryExports & {
	codegen(ptr: number, len: number, flags: number): number;
};

type MinifyOptions = {
	readonly whitespace?: boolean;
	readonly syntax?: boolean;
	readonly quotes?: boolean;
};

type Options = {
	readonly strip?: boolean;
	readonly minify?: boolean | MinifyOptions;
	readonly format?: 'pretty' | 'compact';
	readonly indent?: number;
	readonly quotes?: string;
	readonly comments?: boolean | string;
	readonly sourceMap?: { readonly file?: string; readonly sourceFileName?: string };
};

const QUOTES: Record<string, number> = { preserve: 0, double: 1, single: 2, shortest: 3 };
const COMMENTS: Record<string, number> = {
	none: 0,
	false: 0,
	all: 1,
	true: 1,
	some: 2,
	line: 3,
	block: 4,
};
const decoder = new TextDecoder();

function packFlags(options: Options): number {
	const minify: MinifyOptions =
		options.minify === true
			? { whitespace: true, syntax: true, quotes: true }
			: options.minify || {};
	return (
		(options.strip ? 1 : 0) |
		(minify.syntax ? 2 : 0) |
		(minify.whitespace || options.format === 'compact' ? 4 : 0) |
		((minify.quotes ? 3 : (QUOTES[options.quotes ?? ''] ?? 0)) << 3) |
		((COMMENTS[String(options.comments)] ?? 2) << 5) |
		(((options.indent ?? 2) & 0xff) << 8)
	);
}

export function generate(program: unknown, options: Options = {}) {
	const wasm = wasmExports<CodegenExports>('codegen');
	const flags = packFlags(options);
	const ast = new Uint8Array(encode(program, null));
	const code = decoder.decode(
		callWasm(
			wasm,
			ast,
			(ptr, len) => wasm.codegen(ptr, len, flags),
			'yuku-codegen wasm: generate',
		),
	);
	return {
		code,
		errors: [],
		map: options.sourceMap
			? {
					version: 3,
					file: options.sourceMap.file ?? null,
					sources: [options.sourceMap.sourceFileName ?? ''],
					sourcesContent: null,
					names: [],
					mappings: '',
				}
			: null,
	};
}
