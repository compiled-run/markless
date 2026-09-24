import { expect, test } from 'vitest';
import {
	renameChunksToContentHashes,
	staleContentHashNames,
} from '../src/build/content-hash-names.ts';
import { collapseLazyModuleFacades } from '../src/build/lazy-module-facades.ts';
import { execFileSync } from 'node:child_process';
import { mkdtemp, realpath, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

test.each([
	'target then',
	'exported then',
	'import options',
	'computed import',
	'namespace key order',
])('preserves native import semantics for %s', (kind) => {
	const chunk = (
		fileName: string,
		code: string,
		imports: string[],
		dynamicImports: string[],
		exports: string[],
	) => ({
		type: 'chunk' as const,
		fileName,
		code,
		imports,
		dynamicImports,
		exports,
		moduleIds: [] as string[],
	});
	const bundle = {
		'entry.js': {
			...chunk(
				'entry.js',
				kind === 'import options'
					? 'export const load=()=>import("./action.js", {with:{type:"json"}});'
					: kind === 'computed import'
						? 'export const load=url=>import(url);'
						: 'export const load=()=>import("./action.js");',
				[],
				['action.js'],
				['load'],
			),
			isEntry: true,
		},
		'pack.js': chunk(
			'pack.js',
			'let value=42;function init(){}function then(resolve){resolve("wrong")}export{init,value,then};',
			[],
			[],
			kind === 'target then' ? ['init', 'value', 'then'] : ['init', 'value'],
		),
		'action.js': chunk(
			'action.js',
			`import{init,value}from"./pack.js";init();export{value as ${kind === 'exported then' ? 'then' : 'z'},value as a};`,
			['pack.js'],
			[],
			kind === 'exported then' ? ['then', 'a'] : ['z', 'a'],
		),
	};
	if (kind !== 'target then')
		bundle['pack.js'].code = bundle['pack.js'].code.replace(',then};', '};');
	const result = collapseLazyModuleFacades(bundle);
	if (kind === 'namespace key order') {
		expect(result.removed).toEqual(['action.js']);
		expect(bundle['pack.js'].code.indexOf('get "a"')).toBeLessThan(
			bundle['pack.js'].code.indexOf('get "z"'),
		);
	} else {
		expect(result.removed).toEqual([]);
		expect(bundle['entry.js'].dynamicImports).toEqual(['action.js']);
	}
});

test.each(['"', '`'])('replaces lazy facade requests written with %s', (quote) => {
	const chunk = (
		fileName: string,
		code: string,
		imports: string[] = [],
		dynamicImports: string[] = [],
		isEntry = false,
	) => ({
		type: 'chunk' as const,
		fileName,
		code,
		imports,
		dynamicImports,
		isEntry,
		moduleIds: [],
		exports: [] as string[],
	});
	const bundle = {
		'entry.js': chunk(
			'entry.js',
			`export const load = () => import(${quote}./action.js${quote});`,
			[],
			['action.js'],
			true,
		),
		'pack.js': chunk('pack.js', 'let value; function init(){value=42} export {init,value};'),
		'action.js': chunk(
			'action.js',
			'import {init as start,value as answer} from "./pack.js"; start(); export {answer};',
			['pack.js'],
		),
	};
	bundle['pack.js'].exports = ['init', 'value'];
	const result = collapseLazyModuleFacades(bundle);
	expect(result.removed).toEqual(['action.js']);
	expect(bundle['entry.js'].dynamicImports).toEqual(['pack.js']);
	expect(bundle['entry.js'].code).toContain('import("./pack.js").then(');
	expect(bundle['pack.js'].code).toContain('get "answer"()');
	expect(bundle['pack.js'].code).not.toContain('import(');
});

test.each(['external', 'internal', 'internal-await'])(
	'%s packed imports preserve deferred execution, live exports, namespace identity and failures',
	async (placement) => {
		const chunk = (
			fileName: string,
			code: string,
			imports: string[],
			dynamicImports: string[],
			moduleIds: string[],
			exports: string[],
			isEntry = false,
		) => ({
			type: 'chunk' as const,
			fileName,
			code,
			imports,
			dynamicImports,
			moduleIds,
			exports,
			isEntry,
		});
		const bundle = {
			'entry.mjs': chunk(
				'entry.mjs',
				'export const first=()=>import("./first.mjs");export const other=()=>import("./other.mjs");export const fault=()=>import("./fault.mjs");',
				[],
				['first.mjs', 'other.mjs', 'fault.mjs'],
				['entry'],
				['first', 'other', 'fault'],
				true,
			),
			'pack.mjs': chunk(
				'pack.mjs',
				'let count;function start(){globalThis.trace.push("first");count=1}function next(){globalThis.trace.push("other")}function fail(){globalThis.trace.push("fault");throw new Error("boom")}function bump(){count++}export{start,next,fail,count,bump};',
				[],
				[],
				['body'],
				['start', 'next', 'fail', 'count', 'bump'],
			),
			'first.mjs': chunk(
				'first.mjs',
				'import{start as go,count as value,bump as increment}from"./pack.mjs";go();export{value,increment};',
				['pack.mjs'],
				[],
				[],
				['value', 'increment'],
			),
			'other.mjs': chunk(
				'other.mjs',
				'import{next as go,count as value}from"./pack.mjs";go();export{value};',
				['pack.mjs'],
				[],
				[],
				['value'],
			),
			'fault.mjs': chunk(
				'fault.mjs',
				'import{fail as go,count as value}from"./pack.mjs";go();export{value};',
				['pack.mjs'],
				[],
				[],
				['value'],
			),
		};
		if (placement !== 'external') {
			bundle['pack.mjs'].code += bundle['entry.mjs'].code.replace(
				'first=()=>',
				'first=(Promise)=>',
			);
			bundle['pack.mjs'].code += 'async function unusedAwait(){await 0;}';
			if (placement === 'internal-await')
				bundle['pack.mjs'].code = 'await 0;' + bundle['pack.mjs'].code;
			bundle['pack.mjs'].dynamicImports = bundle['entry.mjs'].dynamicImports;
			bundle['pack.mjs'].exports.push('first', 'other', 'fault');
			bundle['entry.mjs'].code = 'export {first,other,fault} from "./pack.mjs";';
			bundle['entry.mjs'].imports = ['pack.mjs'];
			bundle['entry.mjs'].dynamicImports = [];
		}
		expect(collapseLazyModuleFacades(bundle).removed).toHaveLength(3);
		if (placement === 'internal') {
			expect(bundle['pack.mjs'].code).not.toContain('import("./pack.mjs")');
			expect(bundle['pack.mjs'].dynamicImports).toEqual([]);
		} else if (placement === 'internal-await') {
			expect(bundle['pack.mjs'].code).toContain('import("./pack.mjs")');
			expect(bundle['pack.mjs'].dynamicImports).toEqual(['pack.mjs']);
		}
		const directory = await mkdtemp(join(tmpdir(), 'markless-native-facades-'));
		try {
			for (const chunk of Object.values(bundle))
				await writeFile(join(directory, chunk.fileName), chunk.code);
			const url = pathToFileURL(join(directory, 'entry.mjs')).href;
			const proof = JSON.parse(
				execFileSync(
					process.execPath,
					[
						'--input-type=module',
						'-e',
						`globalThis.trace=[];const entry=await import(${JSON.stringify(url)});const initial=[...trace];const pending=entry.first();const beforeAwait=[...trace];const first=await pending;first.increment();const again=await entry.first();const beforeOther=[...trace];await entry.other();let a,b;try{await entry.fault()}catch(e){a=e}try{await entry.fault()}catch(e){b=e}const descriptor=Object.getOwnPropertyDescriptor(first,"value");const reflection={descriptor,keys:Object.keys(first),prototype:Object.getPrototypeOf(first),sealed:Object.isSealed(first),frozen:Object.isFrozen(first),tag:Object.getOwnPropertyDescriptor(first,Symbol.toStringTag),sameValue:Reflect.defineProperty(first,"value",{value:2}),changedValue:Reflect.defineProperty(first,"value",{value:3}),writable:Reflect.defineProperty(first,"value",{writable:false}),set:Reflect.set(first,"value",3),delete:Reflect.deleteProperty(first,"value")};console.log(JSON.stringify({initial,beforeAwait,value:first.value,same:first===again,beforeOther,trace,sameError:a===b,error:a.message,reflection}));`,
					],
					{ encoding: 'utf8' },
				),
			);
			expect(proof).toEqual({
				initial: [],
				beforeAwait: [],
				value: 2,
				same: true,
				beforeOther: ['first'],
				trace: ['first', 'other', 'fault'],
				sameError: true,
				error: 'boom',
				reflection: {
					descriptor: { value: 2, writable: true, enumerable: true, configurable: false },
					keys: ['increment', 'value'],
					prototype: null,
					sealed: true,
					frozen: false,
					tag: {
						value: 'Module',
						writable: false,
						enumerable: false,
						configurable: false,
					},
					sameValue: true,
					changedValue: false,
					writable: false,
					set: false,
					delete: false,
				},
			});
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	},
);

test.each([
	['bare', 'common.js', true],
	['named', 'common.js', true],
	['bare', 'elsewhere.js', false],
])(
	'a facade with a %s import of %s collapses into its target: %s',
	async (form, other, collapses) => {
		const chunk = (fileName: string, code: string, imports: string[], exports: string[]) => ({
			type: 'chunk' as const,
			fileName,
			code,
			imports,
			dynamicImports: [] as string[],
			moduleIds: [] as string[],
			exports,
		});
		const bundle = {
			'entry.mjs': {
				...chunk('entry.mjs', 'export const load=()=>import("./view.mjs");', [], ['load']),
				dynamicImports: ['view.mjs'],
				isEntry: true,
			},
			'common.mjs': chunk(
				'common.mjs',
				'let ready=0;function setup(){globalThis.trace.push("setup");ready=1}export{setup,ready};',
				[],
				['setup', 'ready'],
			),
			'elsewhere.mjs': chunk('elsewhere.mjs', 'globalThis.trace.push("elsewhere");', [], []),
			'pack.mjs': {
				...chunk(
					'pack.mjs',
					'import"./common.mjs";let value;function init(){globalThis.trace.push("init");value=7}export{init,value};',
					['common.mjs'],
					['init', 'value'],
				),
				moduleIds: ['pack'],
			},
			'view.mjs': chunk(
				'view.mjs',
				(form === 'named'
					? 'import{setup as s,ready as r}from"./common.mjs";'
					: `import"./${other.replace('.js', '.mjs')}";`) +
					'import{init as i,value as v}from"./pack.mjs";' +
					(form === 'named' ? 's();' : '') +
					'i();export{v as data' +
					(form === 'named' ? ',r as ready' : '') +
					'};',
				[other.replace('.js', '.mjs'), 'pack.mjs'],
				form === 'named' ? ['data', 'ready'] : ['data'],
			),
		};
		const result = collapseLazyModuleFacades(bundle);
		expect(result.removed).toEqual(collapses ? ['view.mjs'] : []);
		expect(bundle['entry.mjs'].dynamicImports).toEqual([collapses ? 'pack.mjs' : 'view.mjs']);
		if (!collapses) return;
		const directory = await mkdtemp(join(tmpdir(), 'markless-facade-imports-'));
		try {
			for (const item of Object.values(bundle))
				if (!result.removed.includes(item.fileName))
					await writeFile(join(directory, item.fileName), item.code);
			const url = pathToFileURL(join(directory, 'entry.mjs')).href;
			const proof = JSON.parse(
				execFileSync(
					process.execPath,
					[
						'--input-type=module',
						'-e',
						`globalThis.trace=[];const entry=await import(${JSON.stringify(url)});const before=[...trace];const view=await entry.load();console.log(JSON.stringify({before,trace,keys:Object.keys(view),data:view.data,ready:view.ready}));`,
					],
					{ encoding: 'utf8' },
				),
			);
			expect(proof).toEqual({
				before: [],
				trace: form === 'named' ? ['setup', 'init'] : ['init'],
				keys: form === 'named' ? ['data', 'ready'] : ['data'],
				data: 7,
				...(form === 'named' ? { ready: 1 } : {}),
			});
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	},
);

test('a new facade leaves every other loader name and importer byte alone', () => {
	const build = (withNewPage: boolean) => {
		const chunk = (
			fileName: string,
			code: string,
			extra: { imports?: string[]; dynamicImports?: string[]; exports?: string[] } = {},
		) => ({
			type: 'chunk' as const,
			fileName,
			code,
			imports: extra.imports ?? [],
			dynamicImports: extra.dynamicImports ?? [],
			exports: extra.exports ?? [],
			moduleIds: [] as string[],
		});
		const facade = (fileName: string, local: string, source: string) => ({
			...chunk(fileName, `import{${local}}from"./pack.js";export{${local} as value};`, {
				imports: ['pack.js'],
				exports: ['value'],
			}),
			facadeModuleId: `/app/${source}`,
		});
		const bundle: Record<string, ReturnType<typeof chunk> & { isEntry?: boolean }> = {
			...(withNewPage
				? {
						'a0.js': facade('a0.js', 'z', 'new-badge.tsrx'),
						'other.js': {
							...chunk('other.js', 'export const load=()=>import("./a0.js");', {
								dynamicImports: ['a0.js'],
								exports: ['load'],
							}),
							isEntry: true,
						},
					}
				: {}),
			'entry.js': {
				...chunk(
					'entry.js',
					'export const one=()=>import("./a1.js");export const two=()=>import("./a2.js");',
					{ dynamicImports: ['a1.js', 'a2.js'], exports: ['one', 'two'] },
				),
				isEntry: true,
			},
			'pack.js': {
				...chunk('pack.js', 'let x=1,y=2,z=3;export{x,y,z};', {
					exports: ['x', 'y', 'z'],
				}),
				moduleIds: ['/app/counter.tsrx', '/app/toggle.tsrx', '/app/new-badge.tsrx'],
			},
			'a1.js': facade('a1.js', 'x', 'counter.tsrx'),
			'a2.js': facade('a2.js', 'y', 'toggle.tsrx'),
		};
		collapseLazyModuleFacades(bundle, undefined, { root: '/app' });
		return bundle;
	};
	const before = build(false);
	const after = build(true);
	expect(after['entry.js']!.code).toBe(before['entry.js']!.code);
	const loaders = (code: string) => code.match(/__marklessPacked[\w$]+?(?=\(\))/g) ?? [];
	expect(loaders(before['entry.js']!.code)).toHaveLength(2);
	for (const declaration of before['pack.js']!.code.split('\n').slice(1))
		expect(after['pack.js']!.code).toContain(declaration);
});

test('a loader name already present in the target gets a deterministic suffix', () => {
	const build = (packCode: string) => {
		const bundle = {
			'entry.js': {
				type: 'chunk' as const,
				fileName: 'entry.js',
				code: 'export const load=()=>import("./a1.js");',
				imports: [] as string[],
				dynamicImports: ['a1.js'],
				exports: ['load'],
				moduleIds: [] as string[],
				isEntry: true,
			},
			'pack.js': {
				type: 'chunk' as const,
				fileName: 'pack.js',
				code: packCode,
				imports: [] as string[],
				dynamicImports: [] as string[],
				exports: ['x'],
				moduleIds: ['/app/counter.tsrx'],
			},
			'a1.js': {
				type: 'chunk' as const,
				fileName: 'a1.js',
				code: 'import{x}from"./pack.js";export{x as value};',
				imports: ['pack.js'],
				dynamicImports: [] as string[],
				exports: ['value'],
				moduleIds: [] as string[],
				facadeModuleId: '/app/counter.tsrx',
			},
		};
		collapseLazyModuleFacades(bundle, undefined, { root: '/app' });
		return /module\.(__marklessPacked[\w$]+)\(\)/.exec(bundle['entry.js'].code)![1]!;
	};
	const plain = build('let x=1;export{x};');
	expect(plain).toMatch(/^__marklessPacked[0-9A-Za-z]{4}$/);
	const taken = build(`let x=1,${plain}Value=0;export{x};`);
	expect(taken).toBe(`${plain}_1`);
	expect(build(`let x=1,${plain}Value=0;export{x};`)).toBe(taken);
});

test('an evaluated pack answers later loads from its registry instead of another import()', async () => {
	const chunk = (fileName: string, code: string, imports: string[], exports: string[]) => ({
		type: 'chunk' as const,
		fileName,
		code,
		imports,
		dynamicImports: [] as string[],
		moduleIds: [] as string[],
		exports,
	});
	const bundle = {
		'entry.mjs': {
			...chunk(
				'entry.mjs',
				'export const first=()=>import("./first.mjs");export const other=()=>import("./other.mjs");',
				[],
				['first', 'other'],
			),
			dynamicImports: ['first.mjs', 'other.mjs'],
			isEntry: false,
		},
		'pack.mjs': {
			...chunk(
				'pack.mjs',
				'let a,b;function startA(){globalThis.trace.push("a");a=1}function startB(){globalThis.trace.push("b");b=2}export{startA,startB,a,b};',
				[],
				['startA', 'startB', 'a', 'b'],
			),
			moduleIds: ['pack'],
		},
		'first.mjs': chunk(
			'first.mjs',
			'import{startA as s,a as v}from"./pack.mjs";s();export{v as value};',
			['pack.mjs'],
			['value'],
		),
		'other.mjs': chunk(
			'other.mjs',
			'import{startB as s,b as v}from"./pack.mjs";s();export{v as value};',
			['pack.mjs'],
			['value'],
		),
	};
	expect(collapseLazyModuleFacades(bundle).removed).toEqual(['first.mjs', 'other.mjs']);
	expect(bundle['entry.mjs'].code).toContain('()=>import("./pack.mjs")');
	const directory = await realpath(await mkdtemp(join(tmpdir(), 'markless-pack-registry-')));
	try {
		for (const name of ['entry.mjs', 'pack.mjs'] as const)
			await writeFile(join(directory, name), bundle[name].code);
		const entryUrl = pathToFileURL(join(directory, 'entry.mjs')).href;
		const packUrl = pathToFileURL(join(directory, 'pack.mjs')).href;
		const proof = JSON.parse(
			execFileSync(
				process.execPath,
				[
					'--input-type=module',
					'-e',
					`globalThis.trace=[];const entry=await import(${JSON.stringify(entryUrl)});const before=globalThis.__marklessPacks;const first=await entry.first();const packs=globalThis.__marklessPacks[${JSON.stringify(packUrl)}];const loaders=Object.keys(packs);const answered=[];for(const name of loaders){const load=packs[name];packs[name]=()=>(answered.push(name),load())}const pending=entry.other();const deferred=[...trace];const other=await pending;const again=await entry.first();console.log(JSON.stringify({before:before===undefined,loaders:loaders.length,deferred,trace,answered:answered.length,first:first.value,other:other.value,same:again===first}));`,
				],
				{ encoding: 'utf8' },
			),
		);
		expect(proof).toEqual({
			before: true,
			loaders: 2,
			deferred: ['a'],
			trace: ['a', 'b'],
			answered: 2,
			first: 1,
			other: 2,
			same: true,
		});
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test('a pack preloaded beside its importer is evaluated a task later, and only when its evaluation runs nothing', () => {
	const chunk = (fileName: string, code: string, imports: string[], moduleIds: string[]) => ({
		type: 'chunk' as const,
		fileName,
		code,
		imports,
		dynamicImports: [] as string[],
		moduleIds,
		exports: [] as string[],
	});
	const pack = (fileName: string, body: string, moduleId: string) => ({
		...chunk(
			fileName,
			`${body}function start(){}let value=1;export{start,value};`,
			[],
			[moduleId],
		),
		exports: ['start', 'value'],
	});
	const facade = (fileName: string, target: string) =>
		chunk(
			fileName,
			`import{start as s,value as v}from"./${target}";s();export{v as value};`,
			[target],
			[],
		);
	const bundle = {
		'route-a.js': chunk(
			'route-a.js',
			'export const load=()=>[import("./same.js"),import("./shared.js"),import("./other.js"),import("./busy.js"),import("./some.js"),import("./elsewhere.js")];',
			[],
			['a-root'],
		),
		'same.js': pack('same.js', '', 'a-leaf'),
		'shared.js': pack('shared.js', 'var tag=Object.freeze;', 'common'),
		'other.js': pack('other.js', '', 'b-leaf'),
		'busy.js': pack('busy.js', 'globalThis.trace?.push("ran");', 'a-busy'),
		'some.js': pack('some.js', '', 'a-and-c'),
		'elsewhere.js': pack('elsewhere.js', '', 'b-and-c'),
		'same-facade.js': facade('same-facade.js', 'same.js'),
		'shared-facade.js': facade('shared-facade.js', 'shared.js'),
		'other-facade.js': facade('other-facade.js', 'other.js'),
		'busy-facade.js': facade('busy-facade.js', 'busy.js'),
		'some-facade.js': facade('some-facade.js', 'some.js'),
		'elsewhere-facade.js': facade('elsewhere-facade.js', 'elsewhere.js'),
	};
	bundle['route-a.js'].code = bundle['route-a.js'].code
		.replace('./same.js', './same-facade.js')
		.replace('./shared.js', './shared-facade.js')
		.replace('./other.js', './other-facade.js')
		.replace('./busy.js', './busy-facade.js')
		.replace('./some.js', './some-facade.js')
		.replace('./elsewhere.js', './elsewhere-facade.js');
	bundle['route-a.js'].dynamicImports = [
		'same-facade.js',
		'shared-facade.js',
		'other-facade.js',
		'busy-facade.js',
		'some-facade.js',
		'elsewhere-facade.js',
	];
	const packs: Record<string, string> = {
		'a-root': 'route:pages/a.tsrx',
		'a-leaf': 'route:pages/a.tsrx~2',
		'a-busy': 'route:pages/a.tsrx~3',
		common: 'shared~1',
		'b-leaf': 'route:pages/b.tsrx~0',
		'a-and-c': 'shared:ac',
		'b-and-c': 'shared:bc~1',
	};
	const routeSets: Record<string, string[]> = {
		'shared:ac': ['pages/a.tsrx', 'pages/c.tsrx'],
		'shared:bc': ['pages/b.tsrx', 'pages/c.tsrx'],
	};
	const result = collapseLazyModuleFacades(bundle, undefined, {
		packOf: (id) => packs[id],
		packRoutes: (pack) => routeSets[pack],
	});
	expect(result.removed).toHaveLength(6);
	const code = bundle['route-a.js'].code;
	expect(code).toContain(
		'setTimeout(()=>{for(const pack of[import("./same.js"),import("./shared.js"),import("./some.js")])',
	);
	expect(bundle['route-a.js'].imports).toEqual([]);
});

test('the registry still answers after finalize renames packs to the hash of their bytes', async () => {
	const chunk = (name: string, code: string, imports: string[], exports: string[]) => ({
		type: 'chunk' as const,
		fileName: `chunk-${name}.js`,
		preliminaryFileName: `chunk-!~{${name.slice(0, 3)}}~.js`,
		name: 'chunk',
		code,
		imports,
		dynamicImports: [] as string[],
		moduleIds: name.startsWith('FIRST') || name.startsWith('OTHER') ? [] : [`/app/${name}.js`],
		exports,
	});
	const bundle: Record<string, ReturnType<typeof chunk> & { isEntry?: boolean }> = {
		'chunk-ENTRY000.js': {
			...chunk(
				'ENTRY000',
				'export const first=()=>import("./chunk-FIRST000.js");export const other=()=>import("./chunk-OTHER000.js");',
				[],
				['first', 'other'],
			),
			dynamicImports: ['chunk-FIRST000.js', 'chunk-OTHER000.js'],
			isEntry: false,
		},
		'chunk-PACKS000.js': chunk(
			'PACKS000',
			'let a,b;function startA(){a=1}function startB(){b=2}export{startA,startB,a,b};',
			[],
			['startA', 'startB', 'a', 'b'],
		),
		'chunk-FIRST000.js': chunk(
			'FIRST000',
			'import{startA as s,a as v}from"./chunk-PACKS000.js";s();export{v as value};',
			['chunk-PACKS000.js'],
			['value'],
		),
		'chunk-OTHER000.js': chunk(
			'OTHER000',
			'import{startB as s,b as v}from"./chunk-PACKS000.js";s();export{v as value};',
			['chunk-PACKS000.js'],
			['value'],
		),
	};
	collapseLazyModuleFacades(bundle);
	const renames = await renameChunksToContentHashes(bundle);
	const entry = Object.values(bundle).find((item) =>
		item.moduleIds.includes('/app/ENTRY000.js'),
	)!;
	const pack = Object.values(bundle).find((item) => item.moduleIds.includes('/app/PACKS000.js'))!;
	expect(renames.get('chunk-PACKS000.js')).toBe(pack.fileName);
	expect(pack.fileName).not.toBe('chunk-PACKS000.js');
	expect(entry.code).toContain(`"./${pack.fileName}"`);
	expect(entry.code).not.toContain('PACKS000');
	expect(await staleContentHashNames(bundle)).toEqual([]);
	const directory = await realpath(await mkdtemp(join(tmpdir(), 'markless-pack-rename-')));
	try {
		for (const item of [entry, pack])
			await writeFile(join(directory, item.fileName), item.code);
		const entryUrl = pathToFileURL(join(directory, entry.fileName)).href;
		const packUrl = pathToFileURL(join(directory, pack.fileName)).href;
		const proof = JSON.parse(
			execFileSync(
				process.execPath,
				[
					'--input-type=module',
					'-e',
					`const entry=await import(${JSON.stringify(entryUrl)});const first=await entry.first();const packs=globalThis.__marklessPacks[${JSON.stringify(packUrl)}];const answered=[];for(const name of Object.keys(packs)){const load=packs[name];packs[name]=()=>(answered.push(name),load())}const other=await entry.other();console.log(JSON.stringify({keys:Object.keys(globalThis.__marklessPacks),answered:answered.length,first:first.value,other:other.value}));`,
				],
				{ encoding: 'utf8' },
			),
		);
		expect(proof).toEqual({ keys: [packUrl], answered: 1, first: 1, other: 2 });
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
