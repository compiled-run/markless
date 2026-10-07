import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	createYukuTsrxBinding,
	type YukuParseOptions,
} from '../components/docs/code/yuku-tsrx-wasm.ts';

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, '..');

type Binding = {
	parse(bytes: Uint8Array, options?: YukuParseOptions): ArrayBuffer;
	analyze(bytes: Uint8Array, options?: YukuParseOptions): ArrayBuffer;
};

async function nativeBinding(): Promise<Binding> {
	const fromCore = createRequire(createRequire(import.meta.url).resolve('@markless/core'));
	const compilerSource = dirname(fromCore.resolve('@markless/compiler'));
	const addon = join(compilerSource, '../node_modules/@tsrx/yuku/binding.js');
	return ((await import(pathToFileURL(addon).href)) as { default: Binding }).default;
}

async function wasmBinding(): Promise<Binding> {
	const bytes = readFileSync(join(site, 'components/docs/code/yuku-tsrx.wasm'));
	const { instance } = await WebAssembly.instantiate(bytes, {});
	const exports = instance.exports as ReturnType<Parameters<typeof createYukuTsrxBinding>[0]>;
	return createYukuTsrxBinding(() => exports);
}

function tsrxSources(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return entry.name === 'generated' ? [] : tsrxSources(path);
		return entry.name.endsWith('.tsrx') ? [path] : [];
	});
}

const encoder = new TextEncoder();

describe('the browser yuku-tsrx build', () => {
	const files = tsrxSources(join(site, 'components'));

	it('finds sources to compare', () => {
		expect(files.length).toBeGreaterThan(10);
	});

	// Parses every site component twice; 4.5s alone, over the 5s default beside the other suites.
	it('writes the same parse and analyze buffers as the native addon for every site component', async () => {
		const [native, wasm] = await Promise.all([nativeBinding(), wasmBinding()]);
		const parseOptions: YukuParseOptions = {
			lang: 'tsx',
			sourceType: 'module',
			semanticErrors: true,
			attachComments: true,
		};
		for (const file of files) {
			const bytes = encoder.encode(readFileSync(file, 'utf8'));
			expect(new Uint8Array(wasm.parse(bytes, parseOptions)), file).toEqual(
				new Uint8Array(native.parse(bytes, parseOptions)),
			);
			expect(new Uint8Array(wasm.analyze(bytes, { lang: 'tsx' })), file).toEqual(
				new Uint8Array(native.analyze(bytes, { lang: 'tsx' })),
			);
		}
	}, 30_000);

	it('reports a syntax error in the buffer instead of failing the call', async () => {
		const wasm = await wasmBinding();
		const native = await nativeBinding();
		const broken = encoder.encode('export default function A() @{ <div> }');
		const options: YukuParseOptions = { lang: 'tsx', semanticErrors: true };
		expect(new Uint8Array(wasm.parse(broken, options))).toEqual(
			new Uint8Array(native.parse(broken, options)),
		);
	});
});
