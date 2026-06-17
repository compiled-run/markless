import { describe, expect, test } from 'vitest';
import { rewriteGeneratedSymbolFacadeImports } from '../src/build/symbol-facade-cleanup.ts';

describe('generated symbol facade cleanup', () => {
	test('rewrites resolver imports to shared symbol chunks and removes generated facades', () => {
		const symbolVirtualId = '\0virtual:arcade:symbol:%2Fworkspace%2Fsrc%2Froot.tsrx:symbol%3A0';
		const bundle = {
			'build/runtime.js': {
				type: 'chunk',
				fileName: 'build/runtime.js',
				code: 'async function load(id){return import("./symbol-0.js").then((mod)=>mod.symbol_0)}',
				exports: ['load'],
				imports: [],
				dynamicImports: ['build/symbol-0.js'],
				moduleIds: [
					'\0virtual:arcade:resolver:%2Fworkspace%2Fsrc%2Froot.tsrx',
					'/workspace/src/root.tsrx',
				],
			},
			'build/symbol-0.js': {
				type: 'chunk',
				fileName: 'build/symbol-0.js',
				code: 'import{init_root as i,symbol_0 as s}from"./shared.js";i();export{s as symbol_0};',
				exports: ['symbol_0'],
				imports: ['build/shared.js'],
				dynamicImports: [],
				moduleIds: [],
				facadeModuleId: symbolVirtualId,
				isDynamicEntry: true,
			},
			'build/shared.js': {
				type: 'chunk',
				fileName: 'build/shared.js',
				code: 'function init_root(){}function symbol_0(){}export{init_root,symbol_0};',
				exports: ['init_root', 'symbol_0'],
				imports: [],
				dynamicImports: [],
				moduleIds: [symbolVirtualId],
			},
		};

		rewriteGeneratedSymbolFacadeImports(bundle);

		expect(bundle['build/runtime.js']?.code).toBe(
			'async function load(id){return import("./shared.js").then(mod=>(mod.init_root(),mod.symbol_0))}',
		);
		expect(bundle['build/runtime.js']?.dynamicImports).toEqual(['build/shared.js']);
		expect(bundle['build/symbol-0.js']).toBeUndefined();
		expect(bundle['build/shared.js']?.moduleIds).toContain(symbolVirtualId);
	});

	test('keeps facades when the imported chunk does not export every facade export', () => {
		const symbolVirtualId = '\0virtual:arcade:symbol:%2Fworkspace%2Fsrc%2Froot.tsrx:symbol%3A0';
		const bundle = {
			'build/runtime.js': {
				type: 'chunk',
				fileName: 'build/runtime.js',
				code: 'async function load(id){return import("./symbol-0.js").then((mod)=>mod.symbol_0)}',
				exports: ['load'],
				imports: [],
				dynamicImports: ['build/symbol-0.js'],
				moduleIds: [
					'\0virtual:arcade:resolver:%2Fworkspace%2Fsrc%2Froot.tsrx',
					'/workspace/src/root.tsrx',
				],
			},
			'build/symbol-0.js': {
				type: 'chunk',
				fileName: 'build/symbol-0.js',
				code: 'import{init_root as i,symbol_0 as s}from"./shared.js";i();export{s as symbol_0};',
				exports: ['symbol_0'],
				imports: ['build/shared.js'],
				dynamicImports: [],
				moduleIds: [],
				facadeModuleId: symbolVirtualId,
				isDynamicEntry: true,
			},
			'build/shared.js': {
				type: 'chunk',
				fileName: 'build/shared.js',
				code: 'export const other = 1;',
				exports: ['other'],
				imports: [],
				dynamicImports: [],
				moduleIds: [],
			},
		};

		rewriteGeneratedSymbolFacadeImports(bundle);

		expect(bundle['build/runtime.js']?.code).toContain('./symbol-0.js');
		expect(bundle['build/symbol-0.js']).toBeDefined();
	});
});
