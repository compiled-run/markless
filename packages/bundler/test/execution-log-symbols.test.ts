import { expect, test } from 'vitest';
import { rolldown } from 'rolldown';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rewriteGeneratedSymbolTableUrls } from '../src/build/symbol-table.ts';
import { injectExecutionLogModuleHook } from '../src/execution-log.ts';
import { marklessClient } from '../src/rolldown.ts';

test.each([false, true])(
	'emitted packed modules log their independent initialization with minify=%s',
	async (minify) => {
		const first = 'virtual:markless:symbol:%2Falpha.tsrx:symbol%3A0';
		const second = 'virtual:markless:symbol:%2Fbeta.tsrx:symbol%3A0';
		const sources: Record<string, string> = {
			'/entry.js': `export const first=()=>import(${JSON.stringify(first)});export const second=()=>import(${JSON.stringify(second)});`,
			[first]: injectExecutionLogModuleHook('export const value="α";', first, 'always'),
			[second]: injectExecutionLogModuleHook('export const value="β";', second, 'always'),
		};
		const directory = await mkdtemp(join(tmpdir(), 'markless-execution-identity-'));
		const build = await rolldown({
			input: '/entry.js',
			plugins: [
				{
					name: 'memory',
					resolveId: (id) => (id in sources ? id : null),
					load: (id) => sources[id],
				},
				marklessClient({ rootDir: '/', experimentalNativePacking: true }),
			],
		});
		try {
			const result = await build.write({
				dir: directory,
				format: 'es',
				minify,
				entryFileNames: '[name].mjs',
				chunkFileNames: '[name]-[hash].mjs',
			});
			const chunks = result.output.filter((chunk) => chunk.type === 'chunk');
			const packed = chunks.find((chunk) => chunk.moduleIds.includes(first))!;
			expect(packed.moduleIds).toContain(second);
			const entry = chunks.find((chunk) => chunk.isEntry)!;
			const output = execFileSync(
				process.execPath,
				[
					'--input-type=module',
					'-e',
					`
			globalThis.__mxLog=new Set();
			const entry=await import(${JSON.stringify(pathToFileURL(join(directory, entry.fileName)).href)});
			const before=[...globalThis.__mxLog];
			const first=await entry.first();
			const afterFirst=[...globalThis.__mxLog];
			await entry.first();
			const second=await entry.second();
			console.log(JSON.stringify({before,afterFirst,afterSecond:[...globalThis.__mxLog],values:[first.value,second.value]}));
		`,
				],
				{ encoding: 'utf8' },
			);
			expect(JSON.parse(output)).toEqual({
				before: [],
				afterFirst: [first],
				afterSecond: [first, second],
				values: ['α', 'β'],
			});
		} finally {
			await build.close();
			await rm(directory, { recursive: true, force: true });
		}
	},
);

test.each(['globalThis.__mxLog?.add', 'globalThis . __mxLog ?. add'])(
	'symbol URL rewriting retains logical execution identities in %s',
	(call) => {
		const first = 'virtual:markless:symbol:%2Falpha.tsrx:symbol%3A0';
		const second = 'virtual:markless:symbol:%2Fbeta.tsrx:symbol%3A0';
		const bundle = {
			'pack.js': {
				type: 'chunk' as const,
				fileName: 'pack.js',
				moduleIds: [first, second],
				code: `const urls="${first},${second}".split(",");function alpha(){${call}("${first}")}function beta(){${call}("${second}")}export {urls,alpha,beta};`,
			},
		};
		expect(rewriteGeneratedSymbolTableUrls(bundle)).toEqual({ rewritten: 2, unresolved: [] });
		expect(bundle['pack.js'].code).toContain('["./pack.js","./pack.js"]');
		expect(bundle['pack.js'].code).toContain(`${call}("${first}")`);
		expect(bundle['pack.js'].code).toContain(`${call}("${second}")`);
	},
);

test('an execution identity alone does not become an unresolved import', () => {
	const identity = 'virtual:markless:symbol:%2Fabsent.tsrx:symbol%3A0';
	const code = `globalThis.__mxLog?.add("${identity}");export {};`;
	const bundle = {
		'entry.js': { type: 'chunk' as const, fileName: 'entry.js', moduleIds: [], code },
	};
	expect(rewriteGeneratedSymbolTableUrls(bundle)).toEqual({ rewritten: 0, unresolved: [] });
	expect(bundle['entry.js'].code).toBe(code);
	bundle['entry.js'].code += `import("${identity}");`;
	expect(rewriteGeneratedSymbolTableUrls(bundle).unresolved).toEqual([identity]);
});
