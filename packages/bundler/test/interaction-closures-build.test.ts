import { execFile } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { resolve } from 'pathe';
import { afterAll, expect, test } from 'vitest';
import { nativePackingPlugins } from '../src/build/native-packing.ts';
import { marklessBuildManifestPath } from '../src/build/build-manifests.ts';
import { MARKLESS_INTERACTION_CLOSURES } from '../src/build/chunking.ts';
import { readInteractionClosuresAsset } from '../src/build/interaction-closures.ts';

const exec = promisify(execFile);
const fixture = resolve(import.meta.dirname, '../fixtures/vite-ssr');
const outDir = resolve(fixture, 'node_modules/.markless-pack-planner');
afterAll(() => rm(outDir, { force: true, recursive: true }));

test('a real counter build names the click handler and its dispatch runtime in the click closure', async () => {
	await exec(
		process.execPath,
		[resolve(import.meta.dirname, 'helpers/build-pack-planner-fixture.ts'), outDir],
		{ cwd: fixture },
	);
	const asset = readInteractionClosuresAsset(
		await readFile(marklessBuildManifestPath(outDir, MARKLESS_INTERACTION_CLOSURES), 'utf8'),
	);
	// Entry-rooted builds keep their packs whole; the closures are still reported.
	expect(asset.partition).toBe('unsplit:entry-roots');
	const route = asset.routes.find((candidate) => candidate.route === 'src/root.tsrx')!;
	expect(route.fallback).toBeUndefined();
	const clicks = route.consumers.filter((consumer) => consumer.key.endsWith(':click'));
	expect(clicks).toHaveLength(1);
	const [click] = clicks;
	expect(click!.modules).toContain('virtual:markless:symbol:src%2Froot.tsrx:symbol%3A0');
	expect(click!.modules.some((id) => id.endsWith('web/src/fns/write-scalar.ts'))).toBe(true);
	const boot = route.consumers.find((consumer) => consumer.kind === 'boot')!;
	expect(boot.modules).toContain('virtual:markless:resume:src%2Froot.tsrx');
	// The resume module can import every handler through its resolver, so boot holds the handler.
	expect(boot.modules).toContain('virtual:markless:symbol:src%2Froot.tsrx:symbol%3A0');
}, 180_000);

test('native packing always plans packs from interaction closures', () => {
	const [packing] = nativePackingPlugins(() => '/workspace');
	expect(typeof packing!.generateBundle).toBe('function');
});

// An import() of a module whose chunk kept a module-free facade fetches the facade first; a landing
// that preloads only the pack would fetch that facade at first use.
test('planned first-use files list the facade chunk an import() fetches in front of its pack', async () => {
	const page = '/app/pages/feed.tsrx';
	const adopt = '/repo/packages/web/src/resume-stream-patches.ts';
	const graph: Record<string, { imports: string[]; dynamic: string[] }> = {
		[`${page}?markless-route`]: { imports: [`${page}?markless-resume`], dynamic: [] },
		[`${page}?markless-resume`]: { imports: [], dynamic: [adopt] },
		[adopt]: { imports: [], dynamic: [] },
	};
	const map = {
		version: 1,
		recordKinds: [],
		symbols: [],
		payloadRecords: [],
		actions: [],
		unknownRecordModuleIds: [],
		firstUsePage: {
			resume: { symbolIds: [], runtimeModuleIds: [] },
			pageSpaceReaders: [],
			passedProps: [],
			callbackSlots: [],
		},
	};
	const [packing] = nativePackingPlugins(
		() => '/app',
		() => [],
		() => [{ source: `${page}?markless-resume`, map }],
	);
	type Hook = (this: unknown, ...args: unknown[]) => void;
	(packing!.buildEnd as Hook).call({
		getModuleIds: () => Object.keys(graph)[Symbol.iterator](),
		getModuleInfo: (id: string) => ({
			importedIds: graph[id]!.imports,
			dynamicallyImportedIds: graph[id]!.dynamic,
			isEntry: id === `${page}?markless-route`,
			code: 'x',
		}),
	});
	let asset = '';
	await (packing!.generateBundle as Hook).call(
		{
			emitFile: (file: { source: string }) => (asset = file.source),
			getModuleInfo: () => ({ code: 'x' }),
		},
		{},
		{
			'pack.js': {
				type: 'chunk',
				fileName: 'pack.js',
				moduleIds: Object.keys(graph),
				facadeModuleId: null,
			},
			'adopt-facade.js': {
				type: 'chunk',
				fileName: 'adopt-facade.js',
				moduleIds: [],
				facadeModuleId: adopt,
			},
		},
	);
	const route = (
		JSON.parse(asset) as { routes: { route: string; files: { firstUse: string[] } }[] }
	).routes.find((candidate) => candidate.route === 'pages/feed.tsrx')!;
	expect(route.files.firstUse).toEqual(['adopt-facade.js', 'pack.js']);
});

// A route's checks are reused while the code it can run is unchanged: each module's hash follows its own code, never the pack it lands in.
test('each module a route can run is listed with a hash of its own code', async () => {
	const page = '/app/pages/feed.tsrx';
	const handler = 'virtual:markless:symbol:%2Fapp%2Fpages%2Ffeed.tsrx:symbol%3A0';
	const other = 'virtual:markless:symbol:%2Fapp%2Fpages%2Ffeed.tsrx:symbol%3A1';
	const build = async (code: Record<string, string>) => {
		const graph: Record<string, string[]> = {
			[`${page}?markless-route`]: [`${page}?markless-resume`],
			[`${page}?markless-resume`]: [handler, other],
			[handler]: [],
			[other]: [],
		};
		const map = {
			version: 1,
			recordKinds: [],
			symbols: [],
			payloadRecords: [],
			actions: [],
			unknownRecordModuleIds: [],
			firstUsePage: {
				resume: { symbolIds: [], runtimeModuleIds: [] },
				pageSpaceReaders: [],
				passedProps: [],
				callbackSlots: [],
			},
		};
		const [packing] = nativePackingPlugins(
			() => '/app',
			() => [],
			() => [{ source: `${page}?markless-resume`, map }],
		);
		type Hook = (this: unknown, ...args: unknown[]) => unknown;
		const info = (id: string) => ({
			importedIds: graph[id]!,
			dynamicallyImportedIds: [],
			isEntry: id === `${page}?markless-route`,
			code: code[id] ?? `export const id = ${JSON.stringify(id)};`,
		});
		(packing!.buildEnd as Hook).call({
			getModuleIds: () => Object.keys(graph)[Symbol.iterator](),
			getModuleInfo: info,
		});
		let asset = '';
		await (packing!.generateBundle as Hook).call(
			{ emitFile: (file: { source: string }) => (asset = file.source), getModuleInfo: info },
			{},
			{
				'pack.js': {
					type: 'chunk',
					fileName: 'pack.js',
					moduleIds: Object.keys(graph),
					facadeModuleId: null,
				},
			},
		);
		return readInteractionClosuresAsset(asset).moduleHashes!;
	};
	const before = await build({});
	const after = await build({ [handler]: 'export const id = "changed";' });
	const shown = 'virtual:markless:symbol:pages%2Ffeed.tsrx:symbol%3A0';
	expect(Object.keys(before)).toContain(shown);
	expect(after[shown]).not.toBe(before[shown]);
	for (const id of Object.keys(before)) if (id !== shown) expect(after[id]).toBe(before[id]);
});
