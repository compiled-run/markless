import { chromium } from '@playwright/test';
import { describe, expect, test } from 'vitest';
import {
	MARKLESS_CHUNK_SPECIFIER_PREFIX,
	MARKLESS_IMPORT_MAP_ASSET,
	importMapScript,
	insertImportMapScript,
	renameChunksToContentHashes,
	specifyChunkReferences,
	staleContentHashNames,
	unmappedChunkSpecifiers,
} from '../src/build/content-hash-names.ts';
import { collapseLazyModuleFacades } from '../src/build/lazy-module-facades.ts';

type TestChunk = {
	type: 'chunk';
	fileName: string;
	preliminaryFileName: string;
	name: string;
	facadeModuleId: string | null;
	code: string;
	imports: string[];
	dynamicImports: string[];
	moduleIds: string[];
};

const publicPath = (fileName: string) => `/docs/${fileName}`;

function chunk(fileName: string, placeholder: string, name: string, code: string): TestChunk {
	return {
		type: 'chunk',
		fileName,
		preliminaryFileName: fileName.replace(/chunk-[\w-]{8}/, `chunk-${placeholder}`),
		name,
		facadeModuleId: null,
		code,
		imports: [],
		dynamicImports: [],
		moduleIds: [`/app/${name}.js`],
	};
}

// The importer names the runtime four ways: static import, dynamic import, a resolver-table string, and a public URL inside JSON.
function appBundle(runtimeName: string, runtimeCode: string, unrelated = false) {
	const runtime = runtimeName.slice('build/'.length);
	return {
		'build/chunk-APP00000.js': chunk(
			'build/chunk-APP00000.js',
			'!~{001}~',
			'app',
			[
				`import{run}from"./${runtime}";`,
				`const table=["./${runtime}"];`,
				'const load=()=>import(`./' + runtime + '`);',
				`const json='[\\"/docs/build/${runtime}\\"]';`,
				unrelated ? `export const unrelated="/elsewhere/build/${runtime}";` : '',
				'export{run,table,load,json};',
			].join(''),
		),
		[runtimeName]: chunk(runtimeName, '!~{002}~', 'runtime', runtimeCode),
	};
}

async function build(bundle: Record<string, TestChunk>) {
	const specifiers = await specifyChunkReferences(bundle, { publicPath, root: '/app' });
	await renameChunksToContentHashes(bundle);
	return specifiers.importMap();
}

const byName = (bundle: Record<string, TestChunk>, name: string) =>
	Object.values(bundle).find((item) => item.name === name)!;

describe('chunks import each other through the import map', () => {
	test('a changed chunk renames only itself; its importer keeps its bytes and name', async () => {
		const before = appBundle('build/chunk-RUNTIME1.js', 'export const run=()=>1;');
		const after = appBundle('build/chunk-RUNTIME2.js', 'export const run=()=>2;');
		const beforeMap = await build(before);
		const afterMap = await build(after);

		expect(byName(after, 'runtime').fileName).not.toBe(byName(before, 'runtime').fileName);
		expect(byName(after, 'app').code).toBe(byName(before, 'app').code);
		expect(byName(after, 'app').fileName).toBe(byName(before, 'app').fileName);
		expect(Object.keys(afterMap.imports)).toEqual(Object.keys(beforeMap.imports));
		expect(Object.values(afterMap.imports)).toEqual([
			publicPath(byName(after, 'runtime').fileName),
		]);
		expect(await staleContentHashNames(after)).toEqual([]);
	});

	test("a new chunk leaves every other chunk's specifier key alone", async () => {
		const keyOf = (
			map: { imports: Record<string, string> },
			bundle: Record<string, TestChunk>,
		) =>
			Object.entries(map.imports).find(
				([, url]) => url === publicPath(byName(bundle, 'runtime').fileName),
			)![0];
		const before = appBundle('build/chunk-RUNTIME1.js', 'export const run=()=>1;');
		const after: Record<string, TestChunk> = {
			'build/chunk-AAAAAAAA.js': chunk(
				'build/chunk-AAAAAAAA.js',
				'!~{003}~',
				'added',
				'import{run}from"./chunk-RUNTIME1.js";export{run};',
			),
			...appBundle('build/chunk-RUNTIME1.js', 'export const run=()=>1;'),
		};
		expect(keyOf(await build(after), after)).toBe(keyOf(await build(before), before));
		expect(byName(after, 'app').code).toBe(byName(before, 'app').code);
	});

	test('every chunk-name shape that resolves to the target becomes its specifier; other strings stay', async () => {
		const bundle = appBundle('build/chunk-RUNTIME1.js', 'export const run=()=>1;', true);
		const { imports } = await build(bundle);
		const [specifier] = Object.keys(imports);
		const code = byName(bundle, 'app').code;

		expect(specifier).toMatch(new RegExp(`^${MARKLESS_CHUNK_SPECIFIER_PREFIX}[\\w-]{8}$`));
		expect(code).toContain(`from"${specifier}"`);
		expect(code).toContain(`["${specifier}"]`);
		expect(code).toContain('import(`' + specifier + '`)');
		expect(code).toContain(`'[\\"${specifier}\\"]'`);
		expect(code).toContain(`"/elsewhere/build/${byName(bundle, 'runtime').fileName.slice(6)}"`);
	});

	test('the fail-closed check names specifiers the emitted map does not resolve', async () => {
		const bundle: Record<string, unknown> = appBundle(
			'build/chunk-RUNTIME1.js',
			'export const run=()=>1;',
		);
		const map = await build(bundle as Record<string, TestChunk>);
		const asset = {
			type: 'asset',
			fileName: MARKLESS_IMPORT_MAP_ASSET,
			source: JSON.stringify(map),
		};
		bundle[MARKLESS_IMPORT_MAP_ASSET] = asset;
		expect(unmappedChunkSpecifiers(bundle)).toEqual([]);

		asset.source = JSON.stringify({ imports: {} });
		expect(unmappedChunkSpecifiers(bundle)).toEqual(Object.keys(map.imports));
	});
});

describe('import map placement', () => {
	test('the map follows <meta charset> and precedes every module preload', () => {
		const script = '<script type="importmap">{"imports":{}}</script>';
		expect(
			insertImportMapScript(
				'<html><head><meta charset="utf-8"></meta><link rel="modulepreload" href="/a.js"></head></html>',
				script,
			),
		).toBe(
			`<html><head><meta charset="utf-8"></meta>${script}<link rel="modulepreload" href="/a.js"></head></html>`,
		);
		expect(
			insertImportMapScript(
				'<html><head><script type="module" src="/a.js"></script></head></html>',
				script,
			),
		).toBe(`<html><head>${script}<script type="module" src="/a.js"></script></head></html>`);
	});
});

describe('the pack registry behind the import map', () => {
	test('a pack loaded through its mapped specifier answers a later load from the registry', async () => {
		const chunk = (name: string, code: string, imports: string[], exports: string[]) => ({
			type: 'chunk' as const,
			fileName: `build/chunk-${name}.js`,
			preliminaryFileName: `build/chunk-!~{${name.slice(0, 3)}}~.js`,
			name: name.toLowerCase(),
			facadeModuleId: null,
			code,
			imports,
			dynamicImports: [] as string[],
			moduleIds:
				name.startsWith('FIRST') || name.startsWith('OTHER') ? [] : [`/app/${name}.js`],
			exports,
		});
		const bundle: Record<string, ReturnType<typeof chunk>> = {
			'build/chunk-ENTRY000.js': {
				...chunk(
					'ENTRY000',
					'export const first=()=>import("./chunk-FIRST000.js");export const other=()=>import("./chunk-OTHER000.js");',
					[],
					['first', 'other'],
				),
				dynamicImports: ['build/chunk-FIRST000.js', 'build/chunk-OTHER000.js'],
			},
			'build/chunk-PACKS000.js': chunk(
				'PACKS000',
				'let a,b;function startA(){a=1}function startB(){b=2}export{startA,startB,a,b};',
				[],
				['startA', 'startB', 'a', 'b'],
			),
			'build/chunk-FIRST000.js': chunk(
				'FIRST000',
				'import{startA as s,a as v}from"./chunk-PACKS000.js";s();export{v as value};',
				['build/chunk-PACKS000.js'],
				['value'],
			),
			'build/chunk-OTHER000.js': chunk(
				'OTHER000',
				'import{startB as s,b as v}from"./chunk-PACKS000.js";s();export{v as value};',
				['build/chunk-PACKS000.js'],
				['value'],
			),
		};
		collapseLazyModuleFacades(bundle);
		const specifiers = await specifyChunkReferences(bundle, {
			publicPath: (file) => `/${file}`,
		});
		await renameChunksToContentHashes(bundle);
		const { imports } = specifiers.importMap();
		const entry = Object.values(bundle).find((item) => item.name === 'entry000')!;
		const pack = Object.values(bundle).find((item) => item.name === 'packs000')!;
		const [specifier] = Object.entries(imports).find(([, url]) => url === `/${pack.fileName}`)!;
		expect(entry.code).toContain(`__marklessPackLoad("${specifier}"`);
		expect(entry.code).not.toMatch(/chunk-[\w-]+\.js/);

		const origin = 'http://markless-import-map.test';
		const browser = await chromium.launch();
		try {
			const page = await browser.newPage();
			// A module script, so import.meta.resolve runs against the document's import map.
			const probe = [
				`const entry=await import(${JSON.stringify(`/${entry.fileName}`)});`,
				'const first=await entry.first();',
				'const registry=globalThis.__marklessPacks;',
				`const resolved=import.meta.resolve(${JSON.stringify(specifier)});`,
				'const packs=registry[resolved];let answered=0;',
				'for(const name of Object.keys(packs)){const load=packs[name];packs[name]=()=>(answered++,load())}',
				'const other=await entry.other();',
				'globalThis.proof={keys:Object.keys(registry),resolved,answered,first:first.value,other:other.value};',
			].join('');
			await page.route(`${origin}/**`, (route) => {
				const path = new URL(route.request().url()).pathname;
				const served = Object.values(bundle).find((item) => `/${item.fileName}` === path);
				return path === '/'
					? route.fulfill({
							contentType: 'text/html',
							body: `<!doctype html><html><head><meta charset="utf-8">${importMapScript({ imports })}<script type="module">${probe}</script></head><body></body></html>`,
						})
					: served
						? route.fulfill({ contentType: 'text/javascript', body: served.code })
						: route.fulfill({ status: 404 });
			});
			await page.goto(`${origin}/`);
			const proof = await (
				await page.waitForFunction(() => (globalThis as { proof?: unknown }).proof)
			).jsonValue();
			expect(proof).toEqual({
				keys: [`${origin}/${pack.fileName}`],
				resolved: `${origin}/${pack.fileName}`,
				answered: 1,
				first: 1,
				other: 2,
			});
		} finally {
			await browser.close();
		}
	}, 60_000);
});

// Two pages, each with a route chunk and a render-data chunk of its own, both loading a shared header and the runtime.
// The route table and its preload list name every page's chunks.
function siteBundle(variant: { readonly aData?: string; readonly header?: string } = {}) {
	const part = (name: string, id: string, moduleIds: string[], code: string): TestChunk => ({
		...chunk(`build/chunk-${id}.js`, `!~{${id.slice(0, 3)}}~`, name, code),
		moduleIds,
	});
	const items = [
		part(
			'runtime',
			'010RUNTI',
			['/app/node_modules/@markless/web/dist/runtime.js'],
			'export const run=()=>0;',
		),
		part(
			'header',
			'011HEADE',
			['/app/components/header.tsrx'],
			`import{run}from"./chunk-010RUNTI.js";export const header=()=>${variant.header ?? '"h"'};`,
		),
		part(
			'a-data',
			'012ADATA',
			[
				'\0virtual:markless:render-data:pages%2Fa.tsrx',
				'/app/pages/a.tsrx?markless-render-data',
			],
			`export const data=${variant.aData ?? '1'};`,
		),
		part(
			'b-data',
			'013BDATA',
			['\0virtual:markless:render-data:pages%2Fb.tsrx'],
			'export const data=2;',
		),
		part(
			'a-route',
			'014AROUT',
			['/app/pages/a.tsrx?markless-route'],
			'import{data}from"./chunk-012ADATA.js";import{header}from"./chunk-011HEADE.js";import{run}from"./chunk-010RUNTI.js";export{data,header,run};',
		),
		part(
			'b-route',
			'015BROUT',
			['/app/pages/b.tsrx?markless-route'],
			'import{data}from"./chunk-013BDATA.js";import{header}from"./chunk-011HEADE.js";import{run}from"./chunk-010RUNTI.js";export{data,header,run};',
		),
		part(
			'table',
			'016TABLE',
			['/app/node_modules/@markless/router/src/vite/entries/resume-entry.ts'],
			'import{run}from"./chunk-010RUNTI.js";const pages={"/pages/a.tsrx":()=>import("./chunk-014AROUT.js"),"/pages/b.tsrx":()=>import("./chunk-015BROUT.js")};const preloads=["/docs/build/chunk-012ADATA.js","/docs/build/chunk-013BDATA.js"];export{pages,preloads,run};',
		),
	];
	return Object.fromEntries(items.map((item) => [item.fileName, item]));
}

const isRoute = (moduleId: string) => /^pages\/[^?]+\.tsrx$/.test(moduleId);

async function buildSite(bundle: Record<string, TestChunk>) {
	const specifiers = await specifyChunkReferences(bundle, { publicPath, root: '/app', isRoute });
	await renameChunksToContentHashes(bundle);
	return specifiers.importMap();
}

const mappedNames = (bundle: Record<string, TestChunk>, map: { imports: Record<string, string> }) =>
	Object.values(map.imports)
		.map((url) => Object.values(bundle).find((item) => publicPath(item.fileName) === url)!.name)
		.sort();
const file = (bundle: Record<string, TestChunk>, name: string) =>
	byName(bundle, name).fileName.slice('build/'.length);

describe('with route modules, only chunks several pages load go through the import map', () => {
	test("a page's own chunks are named by path; shared chunks keep their specifiers", async () => {
		const bundle = siteBundle();
		const map = await buildSite(bundle);

		expect(mappedNames(bundle, map)).toEqual(['header', 'runtime']);
		const aRoute = byName(bundle, 'a-route').code;
		expect(aRoute).toContain(`from"./${file(bundle, 'a-data')}"`);
		expect(aRoute).not.toContain(file(bundle, 'header'));
		const table = byName(bundle, 'table').code;
		expect(table).toContain(`import("./${file(bundle, 'a-route')}")`);
		expect(table).toContain(`"/docs/build/${file(bundle, 'b-data')}"`);
		const mapped = {
			...bundle,
			[MARKLESS_IMPORT_MAP_ASSET]: {
				type: 'asset',
				fileName: MARKLESS_IMPORT_MAP_ASSET,
				source: JSON.stringify(map),
			},
		};
		expect(unmappedChunkSpecifiers(mapped)).toEqual([]);
		expect(await staleContentHashNames(bundle)).toEqual([]);
	});

	test("editing one page renames that page's chunks and the table, never the other page or a shared chunk", async () => {
		const before = siteBundle();
		const after = siteBundle({ aData: '9' });
		await buildSite(before);
		await buildSite(after);
		const renamed = (name: string) => file(after, name) !== file(before, name);

		expect(['a-data', 'a-route', 'table'].filter(renamed)).toEqual([
			'a-data',
			'a-route',
			'table',
		]);
		expect(['b-data', 'b-route', 'header', 'runtime'].filter(renamed)).toEqual([]);
	});

	test('editing a shared chunk renames only that chunk; the pages that load it keep their bytes', async () => {
		const before = siteBundle();
		const after = siteBundle({ header: '"changed"' });
		const beforeMap = await buildSite(before);
		const afterMap = await buildSite(after);

		expect(file(after, 'header')).not.toBe(file(before, 'header'));
		for (const name of ['a-route', 'b-route', 'table', 'a-data', 'runtime'])
			expect(byName(after, name).code).toBe(byName(before, name).code);
		expect(Object.keys(afterMap.imports)).toEqual(Object.keys(beforeMap.imports));
	});
});
