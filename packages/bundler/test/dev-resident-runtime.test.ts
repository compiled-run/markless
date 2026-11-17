import { realpathSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'pathe';
import { build } from 'rolldown';
import { createServer } from 'vite';
import { expect, test } from 'vitest';
import { markless } from '../src/vite/index.ts';
import {
	devResidentRuntimeImports,
	runtimePackageRoots,
} from '../src/vite/dev-resident-runtime.ts';
import {
	marklessDevDemand,
	marklessDevLoad,
	marklessDevWarm,
	marklessDevWarmed,
} from '../../web/src/fns/dev-resident.ts';
import { marklessWhenLoaded } from '../../web/src/fns/resident-load.ts';

const fixtureRoot = fileURLToPath(new URL('./fixtures/rebound-route', import.meta.url));
const webSource = fileURLToPath(new URL('../../web/src/', import.meta.url));

async function servedRuntimeModule(file: string) {
	const server = await createServer({
		root: fixtureRoot,
		configFile: false,
		logLevel: 'error',
		appType: 'custom',
		server: { middlewareMode: true, hmr: false, preTransformRequests: false },
		plugins: [markless() as never],
	});
	try {
		const result = await server.environments.client.transformRequest(`/@fs${webSource}${file}`);
		if (!result) throw new Error(`${file} did not transform`);
		return result.code;
	} finally {
		await server.close();
	}
}

test('the runtime package and the packages it depends on are the runtime roots', () => {
	const roots = runtimePackageRoots().map((root) => root.split('/').at(-2));
	expect(roots.sort()).toEqual(['runtime', 'serializer', 'web']);
});

test('on the dev server a runtime lazy import asks the dev-resident helper before it fetches', async () => {
	const code = await servedRuntimeModule('resume-sync-demand.ts');
	expect(code).not.toMatch(/import \* as /);
	expect(code).toMatch(
		/marklessDevLoad\('', "[^"]*\/resume-sync-computed\.ts", \(\) => import\(['"][^'"]*resume-sync-computed\.ts[^'"]*['"]\)\)/,
	);
});

test('the dev-resident helper names every runtime module the runtime imports lazily, and loads none', async () => {
	const code = await servedRuntimeModule('fns/dev-resident.ts');
	const named = [...code.matchAll(/\["([^"]+)", \(\) => import\(/g)].map(([, id]) => id!);
	expect(named).toContain(`${webSource}resume-sync-computed.ts`);
	expect(named).toContain(`${webSource}submit-hold.ts`);
	expect(named.every((id) => !id.endsWith('/fns/dev-resident.ts'))).toBe(true);
	expect(code).not.toMatch(/^import \* as /m);
});

test('an installed runtime the dependency optimizer pre-bundles makes the same imports resident', async () => {
	const directory = realpathSync(await mkdtemp(join(tmpdir(), 'installed-runtime-')));
	try {
		const runtime = join(directory, 'node_modules', '@markless', 'web', 'dist');
		await mkdir(runtime, { recursive: true });
		await writeFile(
			join(runtime, 'entry.js'),
			"export const load = () => import('./lazy.js');\n",
		);
		await writeFile(join(runtime, 'lazy.js'), 'export const value = 1;\n');
		await writeFile(
			join(directory, 'app.js'),
			"export const app = () => import('./app-lazy.js');\n",
		);
		await writeFile(join(directory, 'app-lazy.js'), 'export const value = 2;\n');
		const transform = devResidentRuntimeImports(
			() => [`${runtime}/`],
			join(runtime, 'fns', 'dev-resident.js'),
		);
		const output = await build({
			input: [join(runtime, 'entry.js'), join(directory, 'app.js')],
			write: false,
			plugins: [{ name: 'dev-resident-runtime', transform }],
			external: [/\/fns\/dev-resident\./],
		});
		const chunks = output.output.filter((item) => item.type === 'chunk');
		const entry = chunks.find((chunk) => chunk.name === 'entry')!;
		const app = chunks.find((chunk) => chunk.name === 'app')!;
		expect(entry.code).toContain('marklessDevLoad(');
		expect(entry.dynamicImports).toHaveLength(1);
		expect(app.code).not.toContain('marklessDevLoad(');
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test('the same relative specifier in two modules names two modules once warmed', async () => {
	const first = { name: 'first' };
	const second = { name: 'second' };
	marklessDevWarm('/a/page.tsrx', '/a/page.tsrx', [['./row.tsrx', async () => first]]);
	marklessDevWarm('/b/page.tsrx', '/b/page.tsrx', [['./row.tsrx', async () => second]]);
	await marklessDevWarmed();
	const unloaded = async () => ({ name: 'fetched' });
	expect(marklessWhenLoaded(marklessDevLoad('/a/page.tsrx', './row.tsrx', unloaded), (mod) => mod)).toBe(first);
	expect(marklessWhenLoaded(marklessDevLoad('/b/page.tsrx', './row.tsrx', unloaded), (mod) => mod)).toBe(second);
});

const isLoaded = (scope: string, specifier: string) =>
	marklessWhenLoaded(
		marklessDevLoad(scope, specifier, async () => 'fetched'),
		() => true,
	) === true;

test("a handler's warm loads what the page join closes over: the composer's passed callback and a page-space reader", async () => {
	const composer = '/join/composer.tsrx';
	const child = '/join/child.tsrx';
	marklessDevDemand(composer, {
		actions: [],
		capabilityModuleIds: [],
		page: {
			pageSpaceReaders: [
				{
					graphNodeId: 'shared:join#s/state:open',
					reach: { symbolIds: ['symbol:9'], runtimeModuleIds: [] },
				},
			],
			passedProps: [
				{
					file: child,
					prop: 'onPick',
					reach: { symbolIds: ['symbol:1'], runtimeModuleIds: [] },
				},
			],
			callbackSlots: [],
		},
	});
	const module = (name: string) => async () => ({ name });
	marklessDevWarm(composer, composer, [
		['./passed.js', module('passed'), { symbolId: 'symbol:1' }],
		['./reader.js', module('reader'), { symbolId: 'symbol:9' }],
		['./other.js', module('other'), { symbolId: 'symbol:5' }],
	]);
	marklessDevWarm(child, child, [['./click.js', module('click'), { symbolId: 'symbol:0' }]]);
	await marklessDevWarmed({
		file: child,
		runtimeModuleIds: [],
		actions: [
			{
				symbolIds: ['symbol:0'],
				runtimeModuleIds: [],
				pageSpaceWrites: ['shared:join#s/state:open'],
				calls: [{ prop: 'onPick' }],
			},
		],
	});
	expect(isLoaded(child, './click.js')).toBe(true);
	expect(isLoaded(composer, './passed.js')).toBe(true);
	expect(isLoaded(composer, './reader.js')).toBe(true);
	expect(isLoaded(composer, './other.js')).toBe(false);
});

test("a composer's load of a child module warms for the child's handler, and a bound child that has not published loads first", async () => {
	const composer = '/bound/composer.tsrx';
	const child = '/bound/child.tsrx';
	const childModule = async () => {
		marklessDevDemand(child, {
			actions: [{ symbolIds: ['symbol:2'], runtimeModuleIds: [] }],
			capabilityModuleIds: [],
		});
		marklessDevWarm(child, child, [
			['./run.js', async () => ({ name: 'run' }), { symbolId: 'symbol:2' }],
			['./idle.js', async () => ({ name: 'idle' }), { symbolId: 'symbol:3' }],
		]);
		return { name: 'child' };
	};
	marklessDevWarm(composer, composer, [
		['./child.tsrx?markless-symbols', childModule, { file: child }],
	]);
	await marklessDevWarmed({
		file: composer,
		runtimeModuleIds: [],
		actions: [],
		children: [child],
	});
	expect(isLoaded(composer, './child.tsrx?markless-symbols')).toBe(true);
	expect(isLoaded(child, './run.js')).toBe(true);
	expect(isLoaded(child, './idle.js')).toBe(false);
});
