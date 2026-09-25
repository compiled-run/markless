import { rolldown } from 'rolldown';
import { expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { EAGER_COMPILE_HINT, nativePackingPlugins } from '../src/build/native-packing.ts';
import { MARKLESS_DEFERRED_PACK } from '../src/build/route-pack-groups.ts';
import type { RuntimeDemandMapManifest } from '../src/types.ts';
import { markless } from '../src/vite/index.ts';
import { marklessClient, marklessServer } from '../src/rolldown.ts';
import { MARKLESS_EXECUTION_LOG_MODULE_ID } from '../src/execution-log.ts';
import { DEPRECATED_NATIVE_PACKING_WARNING } from '../src/packing-option.ts';
import { callLoad, callTransform } from './helpers.ts';

test('native packs keep the execution instrument separate from measured runtime code', async () => {
	const runtime = '/workspace/packages/web/src/packing-example.ts';
	const sources: Record<string, string> = {
		'/workspace/entry.js': `export const action=()=>import(${JSON.stringify(runtime)});export const inspect=()=>import(${JSON.stringify(MARKLESS_EXECUTION_LOG_MODULE_ID)});`,
		[runtime]: 'export const value=42;',
		[MARKLESS_EXECUTION_LOG_MODULE_ID]: 'export const inspect=()=>42;',
	};
	const build = await rolldown({
		input: '/workspace/entry.js',
		plugins: [
			{
				name: 'memory',
				resolveId: (id) => (id in sources ? id : null),
				load: (id) => sources[id],
			},
			marklessClient({
				rootDir: '/workspace',
				executionLog: 'always',
			}),
		],
	});
	try {
		const { output } = await build.generate({ format: 'es' });
		const asset = output.find(
			(item) => item.type === 'asset' && item.fileName.endsWith('execution-sizes.json'),
		)!;
		if (asset.type !== 'asset') throw new Error('execution sizes were not emitted');
		const sizes = JSON.parse(String(asset.source));
		expect(sizes[MARKLESS_EXECUTION_LOG_MODULE_ID].instrument).toBe(true);
		expect(sizes['web:packing-example'].chunk).not.toBe(
			sizes[MARKLESS_EXECUTION_LOG_MODULE_ID].chunk,
		);
	} finally {
		await build.close();
	}
});

test('the standalone client option groups lazy modules and preserves its plugin API', async () => {
	const sources: Record<string, string> = {
		'/workspace/entry.js':
			'export const first=()=>import("./first.js");export const second=()=>import("./second.js");',
		'/workspace/first.js': 'export const value=1;',
		'/workspace/second.js': 'export const value=2;',
	};
	const plugin = marklessClient({ rootDir: '/workspace' });
	expect(typeof plugin.api.invalidateGeneratedModules).toBe('function');
	const build = await rolldown({
		input: '/workspace/entry.js',
		plugins: [
			{
				name: 'memory',
				resolveId(id) {
					const resolved = id.startsWith('./') ? `/workspace/${id.slice(2)}` : id;
					return resolved in sources ? resolved : null;
				},
				load: (id) => sources[id],
			},
			plugin,
		],
	});
	try {
		const { output } = await build.generate({ format: 'es' });
		const chunks = output.filter((chunk) => chunk.type === 'chunk');
		const first = chunks.find((chunk) => chunk.moduleIds.includes('/workspace/first.js'))!;
		expect(first.moduleIds).toContain('/workspace/second.js');
		await expect(build.generate({ format: 'cjs' })).rejects.toThrow(
			'requires ES module output',
		);
	} finally {
		await build.close();
	}
	expect(marklessServer().renderChunk).toBeUndefined();
	expect(marklessClient({ dev: true }).renderChunk).toBeUndefined();
	expect(marklessClient({ packing: false }).renderChunk).toBeUndefined();
});

test('Vite builds pack by default and opt out with packing: false', () => {
	const names = markless().map((plugin) => plugin.name);
	expect(names).toContain('markless:route-packs');
	expect(names).toContain('markless-lazy-module-facades');
	expect(markless({ packing: false }).map((plugin) => plugin.name)).not.toContain(
		'markless:route-packs',
	);
});

// A function config makes plugins per environment; per-environment packing plugins would read an
// unconfigured base plugin (no root, no demand maps), so they must be the shared build instances.
test('Vite packing plugins share the build with the base plugin they read', () => {
	const plugins = markless();
	const shared = (name: string) =>
		(plugins.find((plugin) => plugin.name === name) as { sharedDuringBuild?: boolean })
			.sharedDuringBuild;
	expect(shared('vite-plugin-markless')).toBe(true);
	expect(shared('markless:route-packs')).toBe(true);
	expect(shared('markless-lazy-module-facades')).toBe(true);
});

test('the deprecated experimentalNativePacking alias still decides packing and warns', () => {
	expect(
		markless({ experimentalNativePacking: false }).map((plugin) => plugin.name),
	).not.toContain('markless:route-packs');
	expect(markless({ experimentalNativePacking: true }).map((plugin) => plugin.name)).toContain(
		'markless:route-packs',
	);
	expect(
		markless({ packing: false, experimentalNativePacking: true }).map((plugin) => plugin.name),
	).not.toContain('markless:route-packs');
	const warnings: string[] = [];
	const plugin = markless({ experimentalNativePacking: true }).find(
		(item) => item.name === 'vite-plugin-markless',
	)!;
	const configResolved = plugin.configResolved as (config: unknown) => void;
	configResolved({
		root: '/workspace',
		base: '/',
		command: 'build',
		build: {},
		logger: { warn: (message: string) => warnings.push(message) },
	});
	expect(warnings).toEqual([DEPRECATED_NATIVE_PACKING_WARNING]);
});

test('route query roots pack their lazy actions without assuming a pages directory', async () => {
	const root = '/workspace';
	const alpha = `${root}/screens/alpha.tsrx?markless-route`;
	const beta = `${root}/elsewhere/beta.mdx?markless-route`;
	const sources: Record<string, string> = {
		[`${root}/entry.js`]: `export const alpha=()=>import(${JSON.stringify(alpha)});export const beta=()=>import(${JSON.stringify(beta)});`,
		[alpha]: 'export const run=()=>import("/workspace/alpha-action.js");',
		[beta]: 'export const run=()=>import("/workspace/beta-action.js");',
		[`${root}/alpha-action.js`]:
			'import {read} from "/workspace/shared.js";export const run=read;',
		[`${root}/beta-action.js`]:
			'import {read} from "/workspace/shared.js";export const run=read;',
		[`${root}/shared.js`]: 'export const read=()=>Date.now();',
	};
	const build = await rolldown({
		input: `${root}/entry.js`,
		plugins: [
			{
				name: 'memory',
				resolveId: (id) => (id in sources ? id : null),
				load: (id) => sources[id],
			},
			...nativePackingPlugins(() => root),
		],
	});
	try {
		const { output } = await build.generate({ format: 'es' });
		const chunks = output.filter((chunk) => chunk.type === 'chunk');
		const a = chunks.find((chunk) => chunk.moduleIds.includes(alpha))!;
		const b = chunks.find((chunk) => chunk.moduleIds.includes(beta))!;
		expect(a.moduleIds).toContain(`${root}/alpha-action.js`);
		expect(b.moduleIds).toContain(`${root}/beta-action.js`);
		expect(a).not.toBe(b);
		expect(a.moduleIds).not.toContain(`${root}/shared.js`);
		expect(b.moduleIds).not.toContain(`${root}/shared.js`);
	} finally {
		await build.close();
	}
});

test('dynamic-only modules outside every route stay out of the eager pack until import()', async () => {
	const root = '/workspace';
	const alpha = `${root}/pages/alpha.tsrx?markless-route`;
	const beta = `${root}/pages/beta.tsrx?markless-route`;
	const sources: Record<string, string> = {
		[`${root}/entry.js`]: `import {navigate} from "/workspace/router.js";export {navigate};export const alpha=()=>import(${JSON.stringify(alpha)});export const beta=()=>import(${JSON.stringify(beta)});`,
		[`${root}/router.js`]:
			'export const navigate=async()=>{const {installed}=await import("/workspace/polyfill.js");const {render}=await import("/workspace/renderer.js");return [installed,render()];};',
		[`${root}/polyfill.js`]:
			'import {mark} from "/workspace/lazy-helper.js";mark("polyfill");export const installed=true;',
		[`${root}/renderer.js`]:
			'import {mark} from "/workspace/lazy-helper.js";mark("renderer");export const render=()=>"rendered";',
		[`${root}/lazy-helper.js`]:
			'export const mark=(name)=>globalThis.__lazyPackTrace.push(name);',
		[alpha]: 'import {read} from "/workspace/shared.js";export const run=read;',
		[beta]: 'import {read} from "/workspace/shared.js";export const run=read;',
		[`${root}/shared.js`]: 'export const read=()=>1;',
	};
	const build = await rolldown({
		input: `${root}/entry.js`,
		plugins: [
			{
				name: 'memory',
				resolveId: (id) => (id in sources ? id : null),
				load: (id) => sources[id],
			},
			...nativePackingPlugins(() => root),
		],
	});
	try {
		const { output } = await build.generate({ format: 'es' });
		const chunks = output.filter((chunk) => chunk.type === 'chunk');
		const byFile = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
		const holder = (id: string) => chunks.find((chunk) => chunk.moduleIds.includes(id))!;
		const eager = new Set<string>();
		const visit = (fileName: string) => {
			if (eager.has(fileName)) return;
			eager.add(fileName);
			for (const imported of byFile.get(fileName)?.imports ?? []) visit(imported);
		};
		visit(chunks.find((chunk) => chunk.isEntry)!.fileName);
		for (const lazy of ['polyfill.js', 'renderer.js', 'lazy-helper.js'])
			expect(eager.has(holder(`${root}/${lazy}`).fileName)).toBe(false);
		expect(eager.has(holder(`${root}/router.js`).fileName)).toBe(true);
		expect(holder(`${root}/polyfill.js`)).not.toBe(holder(`${root}/renderer.js`));
		expect(holder(`${root}/shared.js`)).not.toBe(holder(alpha));

		const directory = await mkdtemp(join(tmpdir(), 'markless-native-dynamic-'));
		try {
			for (const chunk of chunks) {
				await mkdir(dirname(join(directory, chunk.fileName)), { recursive: true });
				await writeFile(join(directory, chunk.fileName), chunk.code);
			}
			const entry = chunks.find((chunk) => chunk.isEntry)!;
			const url = pathToFileURL(join(directory, entry.fileName)).href;
			const proof = JSON.parse(
				execFileSync(
					process.execPath,
					[
						'--input-type=module',
						'-e',
						`globalThis.__lazyPackTrace=[];const entry=await import(${JSON.stringify(url)});const initial=[...__lazyPackTrace];const result=await entry.navigate();console.log(JSON.stringify({initial,result,final:__lazyPackTrace}));`,
					],
					{ encoding: 'utf8' },
				),
			);
			expect(proof).toEqual({
				initial: [],
				result: [true, 'rendered'],
				final: ['polyfill', 'renderer'],
			});
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	} finally {
		await build.close();
	}
});

test('a route artifact source keeps literal symbol imports in the resolver its symbols pass publishes', async () => {
	const filename = '/workspace/pages/home.tsrx';
	const tallies = ['north', 'south', 'east', 'west', 'up', 'down', 'left', 'right', 'near'];
	const source = `import { state } from '@markless/core';
export default function Home() @{
${tallies.map((name) => `\tlet ${name} = state(0);`).join('\n')}
	<section>
${tallies.map((name) => `\t\t<button type="button" onClick={() => ${name}++}>{${name}}</button>`).join('\n')}
	</section>
}`;
	const plugin = marklessClient({
		executionLog: 'never',
		rootDir: '/workspace',
	});
	await callTransform(plugin, source, `${filename}?markless-route`);
	await callTransform(plugin, source, `${filename}?markless-symbols`);
	const resolver = (await callLoad(
		plugin,
		`\0virtual:markless:resolver:${encodeURIComponent(filename)}`,
	)) as string;

	expect(resolver).toContain('const moduleLoads = {');
	expect(resolver).not.toContain('import(/* @vite-ignore */ moduleUrls[');
});

test('critical packs lead with the V8 eager-compile hint; deferred and lazy chunks do not', async () => {
	const root = '/workspace';
	const alpha = `${root}/pages/alpha.tsrx?markless-route`;
	const deferredRuntime = `${root}/packages/web/src/resume-branches.ts`;
	const dispatch = ['web/resume-runtime', 'web/resume-events'];
	const sources: Record<string, string> = {
		[`${root}/entry.js`]: `export const navigate=()=>import("/workspace/renderer.js");export const alpha=()=>import(${JSON.stringify(alpha)});`,
		[`${root}/renderer.js`]: 'export const render=()=>"rendered";',
		[alpha]: `import {read} from "/workspace/shared.js";export const run=read;export const arms=()=>import(${JSON.stringify(deferredRuntime)});`,
		[`${root}/shared.js`]: 'export const read=()=>1;',
		[deferredRuntime]: 'export const arm=()=>2;',
	};
	const demandMap = {
		version: 1,
		recordKinds: [{ kind: 'event', replaced: false }],
		symbols: [],
		payloadRecords: [
			{
				recordId: 'event:h1:click',
				kind: 'event',
				hostNodeId: 'h1',
				eventName: 'click',
				symbolIds: [],
				runtimeModuleIds: dispatch,
			},
		],
		actions: [],
		unknownRecordModuleIds: [...dispatch, 'web/resume-branches'],
	} as unknown as RuntimeDemandMapManifest;
	const build = await rolldown({
		input: `${root}/entry.js`,
		plugins: [
			{
				name: 'memory',
				resolveId: (id) => (id in sources ? id : null),
				load: (id) => sources[id],
			},
			...nativePackingPlugins(
				() => root,
				() => [demandMap],
			),
		],
	});
	try {
		const { output } = await build.generate({ format: 'es', postBanner: '/* user */' });
		const chunks = output.filter((chunk) => chunk.type === 'chunk');
		const holder = (id: string) => chunks.find((chunk) => chunk.moduleIds.includes(id))!;
		const routePack = holder(alpha);
		const deferredPack = holder(deferredRuntime);
		const lazyChunk = holder(`${root}/renderer.js`);
		expect(deferredPack.name).toBe(MARKLESS_DEFERRED_PACK);
		expect(routePack.code.startsWith(`${EAGER_COMPILE_HINT}\n/* user */`)).toBe(true);
		for (const chunk of [deferredPack, lazyChunk]) {
			expect(chunk.code).not.toContain(EAGER_COMPILE_HINT);
			expect(chunk.code.startsWith('/* user */')).toBe(true);
		}
	} finally {
		await build.close();
	}
});

test('packed init exports carry no trace of the build directory', async () => {
	const root = '/home/ci/repo/app';
	const shared = `\0virtual:markless:resolver:${encodeURIComponent(`${root}/shared.tsrx`)}`;
	const linked = `\0virtual:markless:resolver:${encodeURIComponent('/home/ci/repo/lib/linked.tsrx')}`;
	const alpha = `${root}/alpha.tsrx?markless-route`;
	const beta = `${root}/beta.tsrx?markless-route`;
	const sources: Record<string, string> = {
		[`${root}/entry.js`]: `export const alpha=()=>import(${JSON.stringify(alpha)});export const beta=()=>import(${JSON.stringify(beta)});`,
		[alpha]: `import {read} from ${JSON.stringify(shared)};import {tag} from ${JSON.stringify(linked)};export const run=()=>tag(read("alpha"));`,
		[beta]: `import {read} from ${JSON.stringify(shared)};import {tag} from ${JSON.stringify(linked)};export const run=()=>tag(read("beta"));`,
		[linked]: 'export const tag=(name)=>name;',
		[shared]:
			'globalThis.__rootlessTrace=(globalThis.__rootlessTrace??0)+1;export const read=(name)=>name;',
	};
	const build = await rolldown({
		input: `${root}/entry.js`,
		plugins: [
			{
				name: 'memory',
				resolveId: (id) => (id in sources ? id : null),
				load: (id) => sources[id],
			},
			...nativePackingPlugins(() => root),
		],
	});
	try {
		const { output } = await build.generate({ format: 'es' });
		const chunks = output.filter((chunk) => chunk.type === 'chunk');
		const encodedRoot = encodeURIComponent('/home/ci/').replace(/[^\w$]/g, '_');
		expect(chunks.some((chunk) => chunk.imports.length > 0)).toBe(true);
		// Rolldown names the shared init export after the virtual id; only the shipped code is rewritten.
		expect(
			chunks.some((chunk) => chunk.exports.some((name) => name.includes(encodedRoot))),
		).toBe(true);
		for (const chunk of chunks) expect(chunk.code).not.toContain(encodedRoot);
		const directory = await mkdtemp(join(tmpdir(), 'markless-rootless-'));
		try {
			for (const chunk of chunks)
				await writeFile(join(directory, chunk.fileName), chunk.code);
			const entry = chunks.find((chunk) => chunk.isEntry)!;
			const url = pathToFileURL(join(directory, entry.fileName)).href;
			const result = execFileSync(
				process.execPath,
				[
					'--input-type=module',
					'-e',
					`const entry=await import(${JSON.stringify(url)});const a=(await entry.alpha()).run();const b=(await entry.beta()).run();console.log(JSON.stringify([a,b,globalThis.__rootlessTrace]));`,
				],
				{ encoding: 'utf8' },
			);
			expect(JSON.parse(result)).toEqual(['alpha', 'beta', 1]);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	} finally {
		await build.close();
	}
});
