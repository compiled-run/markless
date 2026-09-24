import { expect, test } from 'vitest';
import { rolldown } from 'rolldown';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
	isMarklessDeferredPack,
	isMarklessNavigationPack,
	isStartupPack,
	MARKLESS_DEFERRED_PACK,
	planRoutePackGroups,
} from '../src/build/route-pack-groups.ts';

test('packs route-local modules together and retains shared module identity', () => {
	const groups = planRoutePackGroups({
		modules: new Map([
			['alpha', { dependencies: ['control', 'shared'], source: 'a' }],
			['beta', { dependencies: ['shared'], source: 'b' }],
			['control', { dependencies: [], source: 'control' }],
			['hidden-handler', { dependencies: ['helper'], source: 'control' }],
			['helper', { dependencies: [], source: 'helper' }],
			['shared', { dependencies: [], source: 'shared' }],
			['router', { dependencies: ['alpha', 'beta'], source: 'router' }],
		]),
		routes: new Map([
			['/one', ['alpha']],
			['/two', ['beta']],
		]),
	});
	expect(groups.get('alpha')).toBe(groups.get('hidden-handler'));
	expect(groups.get('alpha')).toBe(groups.get('helper'));
	expect(groups.get('beta')).not.toBe(groups.get('alpha'));
	expect(groups.get('shared')).toBe('shared');
	expect(groups.has('router')).toBe(false);
	expect(new Set(groups.values()).size).toBe(3);
});

test('leaves modules outside every route closure to reachability chunking', () => {
	const groups = planRoutePackGroups({
		modules: new Map([
			['entry', { dependencies: ['navigation'], source: 'entry' }],
			['navigation', { dependencies: ['polyfill', 'page'], source: 'navigation' }],
			['polyfill', { dependencies: ['polyfill-part'], source: 'polyfill' }],
			['polyfill-part', { dependencies: [], source: 'polyfill-part' }],
			['page', { dependencies: ['page-action'], source: 'page' }],
			['page-action', { dependencies: [], source: 'page-action' }],
		]),
		routes: new Map([['/page', ['page']]]),
	});
	expect(groups.get('page-action')).toBe(groups.get('page'));
	for (const id of ['entry', 'navigation', 'polyfill', 'polyfill-part'])
		expect(groups.has(id)).toBe(false);
});

// Code outside every route (the client render path) runs on any route; a module it imports
// placed in one route's pack would make every navigation fetch that route's pack.
test('keeps a module shared with code outside every route out of the route pack', () => {
	const groups = planRoutePackGroups({
		modules: new Map([
			[
				'entry',
				{
					dependencies: [],
					dynamicDependencies: ['renderer', 'list', 'form'],
					source: 'entry',
				},
			],
			['renderer', { dependencies: ['surface', 'common'], source: 'renderer' }],
			['surface', { dependencies: ['surface-part'], source: 'surface' }],
			['surface-part', { dependencies: [], source: 'surface-part' }],
			['list', { dependencies: ['row-mint', 'common'], source: 'list' }],
			['row-mint', { dependencies: ['surface', 'list-only'], source: 'row-mint' }],
			['list-only', { dependencies: [], source: 'list-only' }],
			['form', { dependencies: ['common'], source: 'form' }],
			['common', { dependencies: [], source: 'common' }],
			['about', { dependencies: [], source: 'about' }],
		]),
		routes: new Map([
			['/list', ['list']],
			['/form', ['form']],
			['/about', ['about']],
		]),
	});
	expect(groups.get('row-mint')).toBe(groups.get('list'));
	expect(groups.get('list-only')).toBe(groups.get('list'));
	expect(groups.has('surface')).toBe(false);
	expect(groups.has('surface-part')).toBe(false);
	expect(groups.get('common')).toBe('shared');
	for (const id of ['entry', 'renderer']) expect(groups.has(id)).toBe(false);
});

test('stops traversal at a foreign route root and handles circular dependencies', () => {
	const groups = planRoutePackGroups({
		modules: new Map([
			['red', { dependencies: ['cycle', 'blue'] }],
			['blue', { dependencies: [] }],
			['cycle', { dependencies: ['red'] }],
		]),
		routes: new Map([
			['red-page', ['red']],
			['blue-page', ['blue']],
		]),
	});
	expect(groups.get('red')).toBe(groups.get('cycle'));
	expect(groups.get('red')).not.toBe(groups.get('blue'));
});

type TierModule = {
	dependencies: string[];
	dynamicDependencies?: string[];
	source?: string;
	size?: number;
};

// Two routes: each boots its page, one control each, a render path, and code nothing needs first.
function tierInput(order?: readonly string[], size = 20_000) {
	const at = (module: Omit<TierModule, 'size'>): TierModule => ({ ...module, size });
	const modules = new Map<string, TierModule>([
		[
			'a',
			at({
				dependencies: [],
				dynamicDependencies: ['a-open', 'a-draw', 'a-idle'],
				source: 'a',
			}),
		],
		['b', at({ dependencies: [], dynamicDependencies: ['b-open', 'b-draw'], source: 'b' })],
		['a-open', at({ dependencies: ['core', 'a-only'], source: 'a-open' })],
		['a-only', at({ dependencies: [], source: 'a-only' })],
		['b-open', at({ dependencies: ['core', 'a-chrome'], source: 'b-open' })],
		['core', at({ dependencies: [], source: 'core' })],
		['a-draw', at({ dependencies: ['chrome', 'a-chrome'], source: 'a-draw' })],
		['b-draw', at({ dependencies: ['chrome'], source: 'b-draw' })],
		['chrome', at({ dependencies: [], source: 'chrome' })],
		['a-chrome', at({ dependencies: [], source: 'a-chrome' })],
		['a-idle', at({ dependencies: ['idle-helper'], source: 'a-idle' })],
		['idle-helper', at({ dependencies: [], source: 'idle-helper' })],
	]);
	const closures = [
		{
			route: '/a',
			consumers: [
				{ key: 'boot', kind: 'boot' as const, modules: ['a'] },
				{
					key: 'render',
					kind: 'render' as const,
					modules: ['a-draw', 'chrome', 'a-chrome'],
				},
				{
					key: 'action:open',
					kind: 'action' as const,
					modules: ['a-open', 'core', 'a-only'],
				},
			],
		},
		{
			route: '/b',
			consumers: [
				{ key: 'boot', kind: 'boot' as const, modules: ['b'] },
				{ key: 'render', kind: 'render' as const, modules: ['b-draw', 'chrome'] },
				{
					key: 'action:open',
					kind: 'action' as const,
					modules: ['b-open', 'core', 'a-chrome'],
				},
			],
		},
	];
	return {
		modules: new Map((order ?? [...modules.keys()]).map((id) => [id, modules.get(id)!])),
		routes: new Map([
			['/a', ['a']],
			['/b', ['b']],
		]),
		closures,
	};
}

test('first-use code of a route rides its route pack, whole, in one preload round', () => {
	const groups = planRoutePackGroups(tierInput());
	for (const id of ['a', 'a-open', 'a-only']) expect(groups.get(id)).toBe('route:/a');
	expect(groups.get('b')).toBe('route:/b');
	expect(groups.get('core')).toBe('shared');
	expect(new Set(groups.values()).size).toBeLessThanOrEqual(8);
});

test('code only a client render needs leaves the landing packs for navigation packs', () => {
	const groups = planRoutePackGroups(tierInput());
	expect(isMarklessNavigationPack(groups.get('a-draw'))).toBe(true);
	expect(isMarklessNavigationPack(groups.get('b-draw'))).toBe(true);
	expect(groups.get('a-draw')).not.toBe(groups.get('b-draw'));
	// Both routes render it, so it shares one navigation pack.
	expect(groups.get('chrome')).toBe('navigation:shared');
	expect(isMarklessNavigationPack('route:/a')).toBe(false);
	expect(isMarklessNavigationPack(MARKLESS_DEFERRED_PACK)).toBe(false);
});

test('code no boot, first use or render needs is deferred', () => {
	const groups = planRoutePackGroups(tierInput());
	expect(groups.get('a-idle')).toBe(MARKLESS_DEFERRED_PACK);
	expect(groups.get('idle-helper')).toBe(MARKLESS_DEFERRED_PACK);
});

test('deferred code that imports render-only code rides its navigation pack, one fetch deep', () => {
	const input = tierInput();
	const modules = new Map(input.modules);
	modules.set('a-idle', { ...modules.get('a-idle')!, dependencies: ['idle-helper'] });
	modules.set('idle-helper', { ...modules.get('idle-helper')!, dependencies: ['chrome'] });
	const groups = planRoutePackGroups({ ...input, modules });
	expect(groups.get('idle-helper')).toBe(groups.get('chrome'));
	expect(groups.get('a-idle')).toBe(groups.get('chrome'));
});

test('deferred code splits by the routes that reach it and stays one fetch deep', () => {
	const modules = new Map<string, TierModule>([
		[
			'a',
			{
				dependencies: [],
				dynamicDependencies: ['a-late', 'b-later'],
				source: 'a',
				size: 100,
			},
		],
		[
			'b',
			{
				dependencies: [],
				dynamicDependencies: ['b-late', 'b-later'],
				source: 'b',
				size: 100,
			},
		],
		['a-late', { dependencies: [], source: 'a-late', size: 40_000 }],
		['b-late', { dependencies: [], source: 'b-late', size: 40_000 }],
		['b-later', { dependencies: ['b-late'], source: 'b-later', size: 40_000 }],
	]);
	const groups = planRoutePackGroups({
		modules,
		routes: new Map([
			['/a', ['a']],
			['/b', ['b']],
		]),
		closures: [
			{ route: '/a', consumers: [{ key: 'boot', kind: 'boot' as const, modules: ['a'] }] },
			{ route: '/b', consumers: [{ key: 'boot', kind: 'boot' as const, modules: ['b'] }] },
		],
	});
	for (const id of ['a-late', 'b-late', 'b-later'])
		expect(isMarklessDeferredPack(groups.get(id))).toBe(true);
	// Loading /a's own deferred code never pulls /b's; code both reach rides what it imports.
	expect(groups.get('a-late')).not.toBe(groups.get('b-late'));
	expect(groups.get('b-later')).toBe(groups.get('b-late'));
	expect(isMarklessDeferredPack('route:/a')).toBe(false);
});

test('a route pack never carries code another route needs to render', () => {
	const groups = planRoutePackGroups(tierInput());
	// First use on /b only, yet /a renders it: a /b route pack would pull /b's route chunk into /a.
	expect(groups.get('a-chrome')).toMatch(/^shared:/);
	expect(groups.get('a-chrome')).not.toBe(groups.get('b'));
	expect(groups.get('a-chrome')).not.toBe(groups.get('core'));
});

test('tiering skips a pack split that saves less than a file costs', () => {
	const groups = planRoutePackGroups(tierInput(undefined, 100));
	const untiered = planRoutePackGroups({ ...tierInput(undefined, 100), closures: undefined });
	for (const id of ['a-idle', 'idle-helper', 'a-draw', 'chrome'])
		expect(groups.get(id)).toBe(untiered.get(id));
});

test('first-use code some routes share joins the shared pack when its bytes cost less than a file', () => {
	const size = (id: string) => (id === 'large' ? 40_000 : 100);
	const modules = new Map<string, TierModule>(
		['a', 'b', 'c', 'small', 'large'].map((id) => [
			id,
			{
				dependencies:
					(
						{ a: ['small', 'large'], b: ['large'], c: ['small'] } as Record<
							string,
							string[]
						>
					)[id] ?? [],
				source: id,
				size: size(id),
			},
		]),
	);
	const consumer = (route: string, extra: string[]) => ({
		route,
		consumers: [{ key: 'boot', kind: 'boot' as const, modules: [route.slice(1), ...extra] }],
	});
	const groups = planRoutePackGroups({
		modules,
		routes: new Map([
			['/a', ['a']],
			['/b', ['b']],
			['/c', ['c']],
		]),
		closures: [
			consumer('/a', ['small', 'large']),
			consumer('/b', ['large']),
			consumer('/c', ['small']),
		],
	});
	expect(groups.get('small')).toBe('shared');
	expect(groups.get('large')).toMatch(/^shared:\w+$/);
});

test('tier pack names do not depend on module discovery order', () => {
	const forward = planRoutePackGroups(tierInput());
	const reverse = planRoutePackGroups(tierInput([...tierInput().modules.keys()].reverse()));
	expect(new Map([...reverse].sort())).toEqual(new Map([...forward].sort()));
});

test('a route without usable demand data keeps its untiered packs', () => {
	const input = tierInput();
	const groups = planRoutePackGroups({
		...input,
		closures: [
			{ route: '/a', fallback: 'missing-demand-map:a', consumers: [] },
			{ route: '/b', fallback: 'missing-demand-map:b', consumers: [] },
		],
	});
	expect(groups).toEqual(planRoutePackGroups({ ...input, closures: undefined }));
});

test('undemanded runtime stays in the one deferred pack under tiering', () => {
	const input = tierInput();
	const groups = planRoutePackGroups({ ...input, undemandedDynamicTargets: new Set(['b-open']) });
	expect(groups.get('b-open')).toBe(MARKLESS_DEFERRED_PACK);
});

test("a route's navigation-only roots leave its landing pack for their own pack", () => {
	const input = {
		modules: new Map([
			[
				'home-facade',
				{
					dependencies: [],
					dynamicDependencies: ['home-data', 'home-code'],
					source: 'home',
					navigationOnly: true,
				},
			],
			[
				'home-data',
				{ dependencies: ['home-handler', 'shared'], source: 'home', navigationOnly: true },
			],
			['home-code', { dependencies: ['home-handler', 'shared'], source: 'home' }],
			['home-handler', { dependencies: [], source: 'home' }],
			['static-facade', { dependencies: ['shared'], source: 'static', navigationOnly: true }],
			['shared', { dependencies: [] }],
		]),
		routes: new Map([
			['pages/home', ['home-facade', 'home-data', 'home-code', 'home-handler']],
			['pages/static', ['static-facade']],
		]),
	};
	const groups = planRoutePackGroups(input);
	expect(groups.get('home-code')).toBe('route:pages/home');
	expect(groups.get('home-handler')).toBe('route:pages/home');
	expect(groups.get('home-facade')).toBe('navigation:pages/home');
	expect(groups.get('home-data')).toBe('navigation:pages/home');
	expect(isStartupPack(groups.get('home-code')!)).toBe(true);
	expect(isStartupPack(groups.get('home-data')!)).toBe(false);
	expect(isStartupPack(MARKLESS_DEFERRED_PACK)).toBe(false);
	// A route with nothing but navigation-only roots has no landing code to keep apart from.
	expect(groups.get('static-facade')).toBe('route:pages/static');
	expect(groups.get('shared')).toBe('shared');

	const sized = new Map(
		[...input.modules].map(([id, module]) => [id, { ...module, size: 20_000 }]),
	);
	const tiered = planRoutePackGroups({
		...input,
		modules: sized,
		closures: [
			{
				route: 'pages/home',
				consumers: [
					{ key: 'boot', kind: 'boot', modules: ['home-code', 'home-handler', 'shared'] },
					{
						key: 'render',
						kind: 'render',
						modules: ['home-facade', 'home-data', 'home-handler', 'shared'],
					},
				],
			},
			{
				route: 'pages/static',
				consumers: [
					{ key: 'render', kind: 'render', modules: ['static-facade', 'shared'] },
				],
			},
		],
	});
	// The planner's render tier is the same navigation pack the default build cuts.
	expect(tiered.get('home-facade')).toBe(groups.get('home-facade'));
	expect(tiered.get('home-data')).toBe(groups.get('home-data'));
	expect(tiered.get('home-code')).toBe('route:pages/home');
	expect(isStartupPack(tiered.get('static-facade')!)).toBe(false);
});

test('render data a navigation-only root shares with landing code rides the landing pack once', () => {
	const groups = planRoutePackGroups({
		modules: new Map([
			[
				'list-facade',
				{
					dependencies: [],
					dynamicDependencies: ['list-data'],
					source: 'list',
					navigationOnly: true,
				},
			],
			['list-data', { dependencies: ['list-render'], source: 'list', navigationOnly: true }],
			['list-resume', { dependencies: ['list-render'], source: 'list' }],
			['list-render', { dependencies: ['layout-render'] }],
			[
				'home-facade',
				{
					dependencies: [],
					dynamicDependencies: ['home-data'],
					source: 'home',
					navigationOnly: true,
				},
			],
			['home-data', { dependencies: ['home-render'], source: 'home', navigationOnly: true }],
			[
				'home-resume',
				{
					dependencies: [],
					dynamicDependencies: ['home-symbol', 'widget-data'],
					source: 'home',
				},
			],
			['home-symbol', { dependencies: [] }],
			// A component's own render data request is not a route root; landing code may load it.
			['widget-data', { dependencies: [], navigationOnly: true }],
			['home-render', { dependencies: ['layout-render', 'home-symbol'] }],
			['layout-render', { dependencies: [] }],
		]),
		routes: new Map([
			['pages/list', ['list-facade', 'list-data', 'list-resume']],
			['pages/home', ['home-facade', 'home-data', 'home-resume']],
		]),
		undemandedDynamicTargets: new Set(['home-symbol']),
	});
	expect(groups.get('list-render')).toBe('route:pages/list');
	expect(groups.get('list-data')).toBe('navigation:pages/list');
	expect(groups.get('home-render')).toBe('navigation:pages/home');
	expect(groups.get('home-data')).toBe('navigation:pages/home');
	expect(groups.get('home-resume')).toBe('route:pages/home');
	expect(groups.get('layout-render')).toBe('shared');
});

test('refuses missing route roots', () => {
	expect(() =>
		planRoutePackGroups({ modules: new Map(), routes: new Map([['page', ['missing']]]) }),
	).toThrow(/missing/);
});

test('native ESM packing keeps unrelated module initialization lazy', async () => {
	const modules = new Map([
		[
			'entry',
			'export const first = () => import("first"); export const second = () => import("second");',
		],
		['first', 'globalThis.__nativePackTrace.push("first"); export const run = () => 17;'],
		['second', 'globalThis.__nativePackTrace.push("second"); export const run = () => 29;'],
	]);
	const build = await rolldown({
		input: 'entry',
		preserveEntrySignatures: 'allow-extension',
		plugins: [
			{
				name: 'memory',
				resolveId: (id) => (modules.has(id) ? id : null),
				load: (id) => modules.get(id),
			},
		],
	});
	try {
		const output = await build.generate({
			format: 'es',
			entryFileNames: '[name].mjs',
			strictExecutionOrder: true,
			codeSplitting: {
				groups: [{ name: 'transport', includeDependenciesRecursively: false }],
			},
		});
		const chunks = output.output.filter((item) => item.type === 'chunk');
		expect(chunks).toHaveLength(1);
		const directory = await mkdtemp(join(tmpdir(), 'markless-native-lazy-'));
		try {
			await writeFile(join(directory, chunks[0]!.fileName), chunks[0]!.code);
			const url = pathToFileURL(join(directory, chunks[0]!.fileName)).href;
			const proof = JSON.parse(
				execFileSync(
					process.execPath,
					[
						'--input-type=module',
						'-e',
						`globalThis.__nativePackTrace=[];const entry=await import(${JSON.stringify(url)});const initial=[...__nativePackTrace];const first=(await entry.first()).run();const middle=[...__nativePackTrace];const second=(await entry.second()).run();console.log(JSON.stringify({initial,first,middle,second,final:__nativePackTrace}));`,
					],
					{ encoding: 'utf8' },
				),
			);
			expect(proof).toEqual({
				initial: [],
				first: 17,
				middle: ['first'],
				second: 29,
				final: ['first', 'second'],
			});
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	} finally {
		await build.close();
	}
});

test('code reachable only through an undemanded dynamic import leaves the eager packs', () => {
	for (const [page, capability, exclusive, common] of [
		['page', 'capability', 'capability-helper', 'runtime'],
		['screen', 'feature', 'feature-part', 'kernel'],
	] as const) {
		const groups = planRoutePackGroups({
			modules: new Map([
				[page, { dependencies: [common], dynamicDependencies: ['wiring', capability] }],
				[`${page}-two`, { dependencies: [common], dynamicDependencies: [capability] }],
				[common, { dependencies: [] }],
				['wiring', { dependencies: [common] }],
				[capability, { dependencies: [exclusive, common], dynamicDependencies: ['late'] }],
				[exclusive, { dependencies: [] }],
				['late', { dependencies: [] }],
			]),
			routes: new Map([
				['/a', [page]],
				['/b', [`${page}-two`]],
			]),
			undemandedDynamicTargets: new Set([capability]),
		});
		for (const id of [capability, exclusive, 'late'])
			expect(groups.get(id)).toBe(MARKLESS_DEFERRED_PACK);
		expect(groups.get(common)).toBe('shared');
		expect(groups.get('wiring')).toBe('route:/a');
	}
});

test('a static edge keeps an undemanded target eager', () => {
	const groups = planRoutePackGroups({
		modules: new Map([
			['page', { dependencies: ['capability'], dynamicDependencies: ['capability'] }],
			['capability', { dependencies: [] }],
		]),
		routes: new Map([['/page', ['page']]]),
		undemandedDynamicTargets: new Set(['capability']),
	});
	expect(groups.get('capability')).toBe('route:/page');
});

test('code outside the route closures keeps what it imports eager', () => {
	const groups = planRoutePackGroups({
		modules: new Map([
			['view', { dependencies: [], dynamicDependencies: ['policy', 'rows'] }],
			['client-render', { dependencies: ['policy'] }],
			['policy', { dependencies: ['policy-part'] }],
			['policy-part', { dependencies: [] }],
			['rows', { dependencies: [] }],
		]),
		routes: new Map([['/view', ['view']]]),
		undemandedDynamicTargets: new Set(['policy', 'rows']),
	});
	expect(groups.get('policy')).toBe('route:/view');
	expect(groups.get('policy-part')).toBe('route:/view');
	expect(groups.get('rows')).toBe(MARKLESS_DEFERRED_PACK);
	expect(groups.has('client-render')).toBe(false);
});

test('route-qualified render data stays with the route that reaches it', () => {
	for (const [left, right, component, part] of [
		['/one', '/two', 'nav', 'nav-symbol'],
		['/docs/b', '/docs/a', 'banner', 'banner-handler'],
	] as const) {
		const groups = planRoutePackGroups({
			modules: new Map([
				[
					left,
					{ dependencies: [component], dynamicDependencies: [`${component}@${left}`] },
				],
				[
					right,
					{ dependencies: [component], dynamicDependencies: [`${component}@${right}`] },
				],
				[component, { dependencies: [part], source: component }],
				[part, { dependencies: [], source: component }],
				[
					`${component}@${left}`,
					{ dependencies: [], source: component, reachedFrom: left },
				],
				[
					`${component}@${right}`,
					{ dependencies: [], source: component, reachedFrom: right },
				],
			]),
			routes: new Map([
				[left, [left]],
				[right, [right]],
			]),
		});
		expect(groups.get(`${component}@${left}`)).toBe(`route:${left}`);
		expect(groups.get(`${component}@${right}`)).toBe(`route:${right}`);
		expect(groups.get(component)).toBe('shared');
		expect(groups.get(part)).toBe('shared');
	}
});

test('render data several routes reach packs with exactly those routes, not the shared pack', () => {
	for (const [left, right, other, component] of [
		['/one', '/two', '/three', 'nav'],
		['/docs/b', '/docs/a', '/blog', 'banner'],
	] as const) {
		const reached = `${component}@reached`;
		const groups = planRoutePackGroups({
			modules: new Map([
				[left, { dependencies: ['runtime', reached] }],
				[right, { dependencies: ['runtime', reached] }],
				[other, { dependencies: ['runtime'] }],
				['runtime', { dependencies: [] }],
				[reached, { dependencies: [], source: component, reachedFrom: 'route' }],
			]),
			routes: new Map([
				[left, [left]],
				[right, [right]],
				[other, [other]],
			]),
		});
		expect(groups.get('runtime')).toBe('shared');
		expect(groups.get(reached)).not.toBe('shared');
		expect(groups.get(reached)).toBe(
			planRoutePackGroups({
				modules: new Map([
					[right, { dependencies: [reached] }],
					[left, { dependencies: [reached] }],
					[reached, { dependencies: [], source: component, reachedFrom: 'route' }],
				]),
				routes: new Map([
					[right, [right]],
					[left, [left]],
				]),
			}).get(reached),
		);
	}
});

test('code only some routes reach gets its own pack when the others would pay more for it', () => {
	for (const [left, right, other, scene, capability, helper] of [
		['/gallery', '/example', '/home', 'scene', 'row-refresh', 'row-refresh-part'],
		['/b/one', '/a/two', '/c/three', 'widget', 'mint', 'mint-helper'],
	] as const) {
		const routeSets = new Map<string, ReadonlyArray<string>>();
		const groups = planRoutePackGroups({
			routeSets,
			modules: new Map([
				[left, { dependencies: ['runtime', scene] }],
				[right, { dependencies: ['runtime', scene] }],
				[other, { dependencies: ['runtime'] }],
				['runtime', { dependencies: [] }],
				[scene, { dependencies: ['runtime'], dynamicDependencies: [capability], size: 20_000 }],
				[capability, { dependencies: [helper, 'runtime'], size: 20_000 }],
				[helper, { dependencies: [] }],
			]),
			routes: new Map([
				[left, [left]],
				[right, [right]],
				[other, [other]],
			]),
		});
		const subset = groups.get(scene)!;
		expect(subset).toMatch(/^shared:\w+$/);
		for (const id of [capability, helper]) expect(groups.get(id)).toBe(subset);
		expect(groups.get('runtime')).toBe('shared');
		expect(isStartupPack(subset)).toBe(true);
		expect([...routeSets.get(subset)!].sort()).toEqual([left, right].sort());
	}
});

test('code only some routes reach stays in the shared pack when a file of its own costs more', () => {
	const groups = planRoutePackGroups({
		modules: new Map([
			['/one', { dependencies: ['helper'] }],
			['/two', { dependencies: ['helper'] }],
			['/three', { dependencies: [] }],
			['helper', { dependencies: [], size: 2_000 }],
		]),
		routes: new Map([
			['/one', ['/one']],
			['/two', ['/two']],
			['/three', ['/three']],
		]),
	});
	expect(groups.get('helper')).toBe('shared');
});

test('a module code outside the routes imports stays in the shared pack', () => {
	const groups = planRoutePackGroups({
		modules: new Map([
			['/one', { dependencies: ['policy'] }],
			['/two', { dependencies: ['policy'] }],
			['/three', { dependencies: [] }],
			['policy', { dependencies: [], size: 100_000 }],
			['navigation', { dependencies: ['policy'] }],
		]),
		routes: new Map([
			['/one', ['/one']],
			['/two', ['/two']],
			['/three', ['/three']],
		]),
	});
	expect(groups.get('policy')).toBe('shared');
});

test('a pack many routes share keeps a name short enough to be a file name', () => {
	const pages = Array.from({ length: 300 }, (_, index) => `/docs/section-${index}/a-long-page-slug`);
	const groups = planRoutePackGroups({
		modules: new Map([
			...pages.map((page): [string, { dependencies: string[] }] => [page, { dependencies: ['layout'] }]),
			['/home', { dependencies: [] }],
			['layout', { dependencies: [], size: 10_000_000 }],
		]),
		routes: new Map([...pages.map((page): [string, string[]] => [page, [page]]), ['/home', ['/home']]]),
	});
	expect(groups.get('layout')).toMatch(/^shared:\w{1,16}$/);
});

test('render data and code the same routes reach never share a pack', () => {
	const groups = planRoutePackGroups({
		modules: new Map([
			['/one', { dependencies: ['view', 'view@reached'] }],
			['/two', { dependencies: ['view', 'view@reached'] }],
			['/three', { dependencies: [] }],
			['view', { dependencies: [], source: 'view', size: 100_000 }],
			['view@reached', { dependencies: [], source: 'view', reachedFrom: 'route' }],
		]),
		routes: new Map([
			['/one', ['/one']],
			['/two', ['/two']],
			['/three', ['/three']],
		]),
	});
	expect(groups.get('view')).toMatch(/^shared:/);
	expect(groups.get('view@reached')).toMatch(/^shared:/);
	expect(groups.get('view@reached')).not.toBe(groups.get('view'));
});

// Pack names become import-map specifier keys, so a new pack must not rename the packs beside it.
test('a new tier pack leaves every other pack name alone', () => {
	const module = (dependencies: string[], size = 100) => ({ dependencies, size });
	const input = (withD: boolean) => {
		const modules = new Map<string, TierModule>([
			['a', { ...module(['small', 'large']), source: 'a' }],
			['b', { ...module(['large']), source: 'b' }],
			['c', { ...module(['small', ...(withD ? ['large-cd'] : [])]), source: 'c' }],
			['small', { ...module([]), source: 'small' }],
			['large', { ...module([], 40_000), source: 'large' }],
			...(withD
				? ([
						['d', { ...module(['large-cd']), source: 'd' }],
						['large-cd', { ...module([], 40_000), source: 'large-cd' }],
					] as [string, TierModule][])
				: []),
		]);
		const boot = (route: string) => ({
			route,
			consumers: [
				{
					key: 'boot',
					kind: 'boot' as const,
					modules: [...closureOf(modules, route.slice(1))],
				},
			],
		});
		const routes = withD ? ['/a', '/b', '/c', '/d'] : ['/a', '/b', '/c'];
		return {
			modules,
			routes: new Map(routes.map((route) => [route, [route.slice(1)]])),
			closures: routes.map(boot),
		};
	};
	const before = planRoutePackGroups(input(false));
	const after = planRoutePackGroups(input(true));
	expect(after.get('large-cd')).toMatch(/^shared:\w+$/);
	expect(after.get('large-cd')).not.toBe(after.get('large'));
	for (const [id, name] of before) expect(after.get(id)).toBe(name);
});

function closureOf(modules: ReadonlyMap<string, TierModule>, root: string): Set<string> {
	const seen = new Set<string>();
	const pending = [root];
	while (pending.length) {
		const id = pending.pop()!;
		if (seen.has(id)) continue;
		seen.add(id);
		pending.push(...(modules.get(id)?.dependencies ?? []));
	}
	return seen;
}
