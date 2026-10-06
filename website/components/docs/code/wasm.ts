// Instantiated explicitly before the first compile: the published wasm packages use top-level
// await, which deadlocked the production chunk graph, so their bindings read from here instead.
import analyzerUrl from '@yuku-analyzer/wasm/yuku-analyzer.wasm?url';
import codegenUrl from '@yuku-codegen/wasm/yuku-codegen.wasm?url';
import tsrxUrl from './yuku-tsrx.wasm?url';

export type WasmMemoryExports = {
	readonly memory: WebAssembly.Memory;
	alloc(len: number): number;
	free(ptr: number, len: number): void;
};

type Instances = Record<'tsrx' | 'analyzer' | 'codegen', WebAssembly.Exports>;

let instances: Instances | undefined;
let loading: Promise<void> | undefined;

async function instantiate(url: string): Promise<WebAssembly.Exports> {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`Could not load ${url}: HTTP ${response.status}`);
	return (await WebAssembly.instantiate(await response.arrayBuffer(), {})).instance.exports;
}

export function loadCodeWasm(): Promise<void> {
	loading ??= Promise.all([
		instantiate(tsrxUrl),
		instantiate(analyzerUrl),
		instantiate(codegenUrl),
	]).then(
		([tsrx, analyzer, codegen]) => {
			instances = { tsrx, analyzer, codegen };
		},
		(error: unknown) => {
			loading = undefined;
			throw error;
		},
	);
	return loading;
}

export function wasmExports<T>(name: keyof Instances): T {
	if (!instances) throw new Error('The Code compiler is not loaded yet.');
	return instances[name] as T;
}

/** Copies `bytes` in, runs `call`, and copies the length-prefixed result out. */
export function callWasm(
	exports: WasmMemoryExports,
	bytes: Uint8Array,
	call: (ptr: number, len: number) => number,
	what: string,
): ArrayBuffer {
	const len = Math.max(bytes.length, 1);
	const input = exports.alloc(len);
	new Uint8Array(exports.memory.buffer, input, bytes.length).set(bytes);
	try {
		const output = call(input, bytes.length);
		if (output === 0) throw new Error(`${what} failed`);
		const size = new DataView(exports.memory.buffer).getUint32(output, true);
		const copy = exports.memory.buffer.slice(output + 4, output + 4 + size);
		exports.free(output, 4 + size);
		return copy;
	} finally {
		exports.free(input, len);
	}
}
