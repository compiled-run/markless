import { describe, expect, test } from 'vitest';
import {
	compactGeneratedDirectSymbolLoaders,
	rewriteGeneratedSymbolFacadeImports,
	rewriteGeneratedSymbolInitExports,
} from '../src/build/symbol-facade-cleanup.ts';

describe('generated symbol facade cleanup', () => {
	test('rewrites resolver imports to shared symbol chunks and removes generated facades', () => {
		const symbolVirtualId =
			'\0virtual:markless:symbol:%2Fworkspace%2Fsrc%2Froot.tsrx:symbol%3A0';
		const bundle = {
			'build/runtime.js': {
				type: 'chunk',
				fileName: 'build/runtime.js',
				code: 'async function load(id){return import("./symbol-0.js").then((mod)=>mod.symbol_0)}',
				exports: ['load'],
				imports: [],
				dynamicImports: ['build/symbol-0.js'],
				moduleIds: [
					'\0virtual:markless:resolver:%2Fworkspace%2Fsrc%2Froot.tsrx',
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

	test('rewrites source helper imports to shared symbol chunks and removes generated facades', () => {
		const symbolVirtualId =
			'\0virtual:markless:symbol:%2Fworkspace%2Fsrc%2Froot.tsrx:symbol%3A0';
		const bundle = {
			'build/app.js': {
				type: 'chunk',
				fileName: 'build/app.js',
				code: 'function load(){return import("./symbol-0.js").then((mod)=>readSymbol(mod,"symbol_0"))}',
				exports: ['load'],
				imports: [],
				dynamicImports: ['build/symbol-0.js'],
				moduleIds: ['/workspace/src/root.tsrx'],
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

		expect(bundle['build/app.js']?.code).toBe(
			'function load(){return import("./shared.js").then(mod=>readSymbol(mod,"symbol_0"))}',
		);
		expect(bundle['build/app.js']?.dynamicImports).toEqual(['build/shared.js']);
		expect(bundle['build/symbol-0.js']).toBeUndefined();
		expect(bundle['build/shared.js']?.moduleIds).toContain(symbolVirtualId);
	});

	test('keeps facades when the imported chunk does not export every facade export', () => {
		const symbolVirtualId =
			'\0virtual:markless:symbol:%2Fworkspace%2Fsrc%2Froot.tsrx:symbol%3A0';
		const bundle = {
			'build/runtime.js': {
				type: 'chunk',
				fileName: 'build/runtime.js',
				code: 'async function load(id){return import("./symbol-0.js").then((mod)=>mod.symbol_0)}',
				exports: ['load'],
				imports: [],
				dynamicImports: ['build/symbol-0.js'],
				moduleIds: [
					'\0virtual:markless:resolver:%2Fworkspace%2Fsrc%2Froot.tsrx',
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

	test('shortens generated symbol chunk init export aliases', () => {
		const symbolVirtualId =
			'\0virtual:markless:symbol:%2Fworkspace%2Fsrc%2Froot.tsrx:symbol%3A0';
		const firstInit = 'init__virtual_markless_symbol__2Fworkspace_2Fsrc_2Froot_2Etsrx';
		const bundle = {
			'build/runtime.js': {
				type: 'chunk',
				fileName: 'build/runtime.js',
				code: `function load(){return import("./shared.js").then(mod=>(mod.${firstInit}(),mod.symbol_0))}`,
				exports: ['load'],
				imports: [],
				dynamicImports: ['build/shared.js'],
				moduleIds: [
					'\0virtual:markless:resolver:%2Fworkspace%2Fsrc%2Froot.tsrx',
					'/workspace/src/root.tsrx',
				],
			},
			'build/shared.js': {
				type: 'chunk',
				fileName: 'build/shared.js',
				code: `function a(){}function symbol_0(){}export{a as ${firstInit},symbol_0};`,
				exports: [firstInit, 'symbol_0'],
				imports: [],
				dynamicImports: [],
				moduleIds: [symbolVirtualId],
			},
		};

		const result = rewriteGeneratedSymbolInitExports(bundle);

		expect(result.renamed).toBe(1);
		expect(bundle['build/shared.js']?.exports).toEqual([
			'init__virtual_markless_symbol',
			'symbol_0',
		]);
		expect(bundle['build/shared.js']?.code).toBe(
			'function a(){}function symbol_0(){}export{a as init__virtual_markless_symbol,symbol_0};',
		);
		expect(bundle['build/runtime.js']?.code).toBe(
			'function load(){return import("./shared.js").then(mod=>(mod.init__virtual_markless_symbol(),mod.symbol_0))}',
		);
	});

	test('collapses generated symbol init exports into one stable chunk initializer', () => {
		const symbolVirtualId =
			'\0virtual:markless:symbol:%2Fworkspace%2Fsrc%2Froot.tsrx:symbol%3A0';
		const firstInit = 'init__virtual_markless_symbol__2Fworkspace_2Fsrc_2Froot_2Etsrx';
		const secondInit = 'init__virtual_markless_symbol__2Fworkspace_2Fsrc_2Froot_2Etsrx$1';
		const bundle = {
			'build/shared.js': {
				type: 'chunk',
				fileName: 'build/shared.js',
				code: `function a(){}function b(){}function symbol_0(){}export{a as ${firstInit},b as ${secondInit},symbol_0};`,
				exports: [firstInit, secondInit, 'symbol_0'],
				imports: [],
				dynamicImports: [],
				moduleIds: [symbolVirtualId],
			},
		};

		rewriteGeneratedSymbolInitExports(bundle);

		expect(bundle['build/shared.js']?.exports).toEqual([
			'init__virtual_markless_symbol',
			'symbol_0',
		]);
		expect(bundle['build/shared.js']?.code).toBe(
			'function a(){}function b(){}function symbol_0(){}function $i(){a();b()}export{$i as init__virtual_markless_symbol,symbol_0};',
		);
	});

	test('compacts generated direct loaders after symbol facades merge into one chunk', () => {
		const bundle = {
			'build/app.js': {
				type: 'chunk',
				fileName: 'build/app.js',
				code: 'function o(e){return e==="symbol:0"?import("./shared.js").then(e=>s(e,"symbol_0")):e==="symbol:1"?import("./shared.js").then(e=>s(e,"symbol_1")):Promise.reject(Error(`Unknown async symbol ${e}`))}function s(e,t){return e.init__virtual_markless_symbol?.(),e[t]}',
				exports: [],
				imports: [],
				dynamicImports: ['build/shared.js'],
				moduleIds: ['/workspace/src/root.tsrx'],
			},
		};

		const result = compactGeneratedDirectSymbolLoaders(bundle);

		expect(result.compacted).toBe(1);
		expect(bundle['build/app.js']?.code).toBe(
			'let $m;function o(e){let t=+e.slice(7);if(e===`symbol:${t}`&&t>=0&&t<2){if($m)return s($m,`symbol_${t}`);return import("./shared.js").then(e=>($m=e,s(e,`symbol_${t}`)))}return Promise.reject(Error(`Unknown async symbol ${e}`))}function s(e,t){return e.init__virtual_markless_symbol?.(),e[t]}',
		);
	});

	test('uses a lookup table when direct loader symbol names are not generated ranges', () => {
		const bundle = {
			'build/app.js': {
				type: 'chunk',
				fileName: 'build/app.js',
				code: 'function o(e){return e==="root#save"?import("./shared.js").then(e=>s(e,"save")):e==="root#close"?import("./shared.js").then(e=>s(e,"close")):Promise.reject(Error(`Unknown async symbol ${e}`))}function s(e,t){return e[t]}',
				exports: [],
				imports: [],
				dynamicImports: ['build/shared.js'],
				moduleIds: ['/workspace/src/root.tsrx'],
			},
		};

		compactGeneratedDirectSymbolLoaders(bundle);

		expect(bundle['build/app.js']?.code).toBe(
			'const $s={"root#save":"save","root#close":"close"};let $m;function o(e){let t=$s[e];if(t){if($m)return s($m,t);return import("./shared.js").then(e=>($m=e,s(e,t)))}return Promise.reject(Error(`Unknown async symbol ${e}`))}function s(e,t){return e[t]}',
		);
	});
});
