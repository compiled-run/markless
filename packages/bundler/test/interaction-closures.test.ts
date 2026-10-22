import { describe, expect, test } from 'vitest';
import {
	computeInteractionClosures,
	interactionClosuresAsset,
	readInteractionClosuresAsset,
	type InteractionClosureModule,
} from '../src/build/interaction-closures.ts';
import { symbolVirtualModuleId } from '../src/source-module.ts';
import type { RuntimeDemandMapManifest } from '../src/types.ts';
import { LEAN_DISPATCH_MARKER_MODULES } from '@markless/compiler';

const root = '/app';
const runtime = (path: string) => `/repo/packages/web/src/${path}.ts`;
const symbol = (file: string, id: string) => `\0${symbolVirtualModuleId(file, id)}`;

type FirstUsePage = NonNullable<RuntimeDemandMapManifest['firstUsePage']>;

function demandMap(
	input: Partial<Pick<RuntimeDemandMapManifest, 'payloadRecords' | 'actions'>> & {
		readonly unknown?: readonly string[];
		readonly page?: Partial<FirstUsePage>;
	},
): RuntimeDemandMapManifest {
	return {
		version: 1,
		recordKinds: [],
		symbols: [],
		payloadRecords: input.payloadRecords ?? [],
		actions: input.actions ?? [],
		unknownRecordModuleIds: [...(input.unknown ?? [])],
		firstUsePage: {
			resume: { symbolIds: [], runtimeModuleIds: [] },
			pageSpaceReaders: [],
			passedProps: [],
			callbackSlots: [],
			...input.page,
		},
	};
}

function graph(file: string, handler: string, render: string, row: string) {
	return new Map<string, InteractionClosureModule>([
		[`${file}?markless-resume`, { dependencies: [runtime('resume-events')], source: file }],
		[`${file}?markless-render-data`, { dependencies: [symbol(file, render)], source: file }],
		[symbol(file, handler), { dependencies: [`${root}/lib/format.ts`], source: file }],
		[symbol(file, render), { dependencies: [], source: file }],
		[symbol(file, row), { dependencies: [], source: file }],
		[`${root}/lib/format.ts`, { dependencies: [], source: `${root}/lib/format.ts` }],
		[
			runtime('resume-events'),
			{
				dependencies: [runtime('dom-journal')],
				dynamicDependencies: [runtime('resume-branches')],
				source: runtime('resume-events'),
			},
		],
		[runtime('dom-journal'), { dependencies: [], source: runtime('dom-journal') }],
		[runtime('resume-branches'), { dependencies: [], source: runtime('resume-branches') }],
	]);
}

type KeydownFirstUse = RuntimeDemandMapManifest['actions'][number]['firstUse'];

function closuresFor(
	names: { handler: string; render: string; row: string; host: string },
	keydown: {
		readonly firstUse?: KeydownFirstUse;
		// The compiled source whose map could not bound the keydown.
		readonly unboundIn?: 'resume';
	} = {},
) {
	const file = `${root}/screens/panel.tsrx`;
	const modules = graph(file, names.handler, names.render, names.row);
	const routes = new Map([
		['screens/panel.tsrx', [...modules.keys()].filter((id) => id.includes('panel'))],
	]);
	const map = demandMap({
		payloadRecords: [
			{
				recordId: `event:${names.host}:click`,
				kind: 'event',
				symbolIds: [names.handler],
				runtimeModuleIds: ['web/resume-events'],
			},
			{
				recordId: `dom-update:h9:${names.render}`,
				kind: 'dom-update',
				symbolIds: [names.render],
				runtimeModuleIds: [],
			},
		],
		actions: [
			{
				hostNodeId: names.host,
				eventName: 'click',
				recordKind: 'event',
				recordKinds: ['event', 'dom-update'],
				payloadRecordIds: [`event:${names.host}:click`, `dom-update:h9:${names.render}`],
				runtimeModuleIds: ['web/resume-events'],
			},
			{
				hostNodeId: 'h4',
				eventName: 'keydown',
				recordKind: 'event',
				recordKinds: ['event', 'branch'],
				payloadRecordIds: [],
				runtimeModuleIds: [],
				...(keydown.firstUse ? { firstUse: keydown.firstUse } : {}),
			},
		],
		unknown: ['web/resume-branches'],
	});
	const unbound = {
		...map,
		actions: map.actions.map(({ firstUse: _firstUse, ...action }) => action),
	};
	return {
		file,
		modules,
		closures: computeInteractionClosures({
			root,
			modules,
			routes,
			demand: [
				{ source: `${file}?markless-symbols`, map },
				{
					source: `${file}?markless-resume`,
					map: keydown.unboundIn === 'resume' ? unbound : map,
				},
			],
		}),
	};
}

test('joins a control to its handler, the records it writes, and their runtime closure', () => {
	const { file, closures } = closuresFor({
		handler: 'symbol:0',
		render: 'symbol:1',
		row: 'symbol:2',
		host: 'h1',
	});
	expect(closures).toHaveLength(1);
	const [route] = closures;
	expect(route!.fallback).toBeUndefined();
	const byKey = new Map(route!.consumers.map((consumer) => [consumer.key, consumer]));
	// Runtime the resume path can import stays with boot; deferring runtime is the undemanded-runtime rule's call.
	expect(byKey.get('boot')!.modules).toEqual(
		[
			`${file}?markless-resume`,
			runtime('dom-journal'),
			runtime('resume-events'),
			runtime('resume-branches'),
		].sort(),
	);
	expect(byKey.get('render')!.modules).toEqual(
		[`${file}?markless-render-data`, symbol(file, 'symbol:1')].sort(),
	);
	const click = byKey.get('action:screens/panel.tsrx#h1:click')!;
	expect(click.conservative).toBeUndefined();
	expect(click.modules).toEqual(
		[
			symbol(file, 'symbol:0'),
			symbol(file, 'symbol:1'),
			`${root}/lib/format.ts`,
			runtime('resume-events'),
			runtime('dom-journal'),
		].sort(),
	);
	expect(click.modules).not.toContain(symbol(file, 'symbol:2'));
	expect(click.modules).not.toContain(runtime('resume-branches'));
});

test('widens a control whose records carry unlisted records to every symbol and unknown runtime', () => {
	const { file, closures } = closuresFor({
		handler: 'symbol:0',
		render: 'symbol:1',
		row: 'symbol:2',
		host: 'h1',
	});
	const keydown = closures[0]!.consumers.find((consumer) =>
		consumer.key.endsWith('#h4:keydown'),
	)!;
	expect(keydown.conservative).toBe('unlisted-records');
	for (const id of ['symbol:0', 'symbol:1', 'symbol:2'])
		expect(keydown.modules).toContain(symbol(file, id));
	expect(keydown.modules).toContain(runtime('resume-branches'));
});

test('a branch-flipping control the compiler bounded joins only its arm and row symbols', () => {
	const names = { handler: 'symbol:0', render: 'symbol:1', row: 'symbol:2', host: 'h1' };
	const firstUse = { symbolIds: ['symbol:2'], runtimeModuleIds: ['web/resume-branches'] };
	const { file, closures } = closuresFor(names, { firstUse });
	const keydown = closures[0]!.consumers.find((consumer) =>
		consumer.key.endsWith('#h4:keydown'),
	)!;
	expect(keydown.conservative).toBeUndefined();
	expect(keydown.modules).toEqual([symbol(file, 'symbol:2'), runtime('resume-branches')].sort());
});

test('a control stays conservative when any compiled source leaves its first use unbounded', () => {
	const names = { handler: 'symbol:0', render: 'symbol:1', row: 'symbol:2', host: 'h1' };
	const firstUse = { symbolIds: ['symbol:2'], runtimeModuleIds: ['web/resume-branches'] };
	const { file, closures } = closuresFor(names, { firstUse, unboundIn: 'resume' });
	const keydown = closures[0]!.consumers.find((consumer) =>
		consumer.key.endsWith('#h4:keydown'),
	)!;
	expect(keydown.conservative).toBe('unlisted-records');
	for (const id of ['symbol:0', 'symbol:1', 'symbol:2'])
		expect(keydown.modules).toContain(symbol(file, id));
});

test('joins by structure, not by symbol numbering or host ids', () => {
	const { file, closures } = closuresFor({
		handler: 'symbol:7',
		render: 'symbol:3',
		row: 'symbol:5',
		host: 'h42',
	});
	const click = closures[0]!.consumers.find((consumer) => consumer.key.endsWith('#h42:click'))!;
	expect(click.modules).toContain(symbol(file, 'symbol:7'));
	expect(click.modules).toContain(symbol(file, 'symbol:3'));
	expect(click.modules).not.toContain(symbol(file, 'symbol:5'));
});

test('falls back for a route whose compiled source has no demand map', () => {
	const file = `${root}/pages/other.tsrx`;
	const modules = graph(file, 'symbol:0', 'symbol:1', 'symbol:2');
	const closures = computeInteractionClosures({
		root,
		modules,
		routes: new Map([
			['pages/other.tsrx', [`${file}?markless-resume`, symbol(file, 'symbol:0')]],
		]),
		demand: [{ source: `${file}?markless-symbols`, map: undefined }],
	});
	expect(closures).toEqual([
		{
			route: 'pages/other.tsrx',
			fallback: 'missing-demand-map:pages/other.tsrx',
			consumers: [],
		},
	]);
	const missing = computeInteractionClosures({
		root,
		modules,
		routes: new Map([
			['pages/other.tsrx', [`${file}?markless-resume`, symbol(file, 'symbol:0')]],
		]),
		demand: [],
	});
	expect(missing[0]!.fallback).toBe('missing-demand-map:pages/other.tsrx');
});

test('the closures asset names modules relative to the root and is stable', () => {
	const { closures } = closuresFor({
		handler: 'symbol:0',
		render: 'symbol:1',
		row: 'symbol:2',
		host: 'h1',
	});
	const packs = new Map([[`${root}/lib/format.ts`, 'route:screens/panel.tsrx']]);
	const asset = interactionClosuresAsset({ root, closures, packs, partition: 'tiers' });
	expect(asset).toBe(interactionClosuresAsset({ root, closures, packs, partition: 'tiers' }));
	const parsed = readInteractionClosuresAsset(asset);
	expect(parsed.version).toBe(2);
	expect(parsed.packs).toEqual({ 'route:screens/panel.tsrx': ['lib/format.ts'] });
	expect(asset).not.toContain(encodeURIComponent(`${root}/`));
	const click = parsed.routes[0]!.consumers.find((consumer) => consumer.key.endsWith('#h1:click'))!;
	expect(click.modules).toContain('virtual:markless:symbol:screens%2Fpanel.tsrx:symbol%3A0');
});

// ui.shadcn.com's asset passed V8's string limit: 400 handlers each listing a 2,000-module closure on one page.
test('the closures asset writes each module and each distinct closure once, whatever the handler count', () => {
	const shared = Array.from({ length: 2_000 }, (_, i) => `${root}/lib/module-${i}.ts`);
	const routeCount = 3;
	const actionCount = 400;
	const closures = Array.from({ length: routeCount }, (_, r) => ({
		route: `pages/p${r}.tsrx`,
		consumers: [
			{ key: 'boot', kind: 'boot' as const, modules: shared.slice(0, 100) },
			...Array.from({ length: actionCount }, (_, a) => ({
				key: `action:pages/p${r}.tsrx#h${a}:click`,
				kind: 'action' as const,
				modules: a % 2 ? shared : [...shared.slice(0, 1_000), `${root}/pages/p${r}.tsrx`],
			})),
		],
	}));
	const asset = interactionClosuresAsset({ root, closures, packs: new Map(), partition: 'tiers' });
	const idBytes = shared.reduce((sum, id) => sum + id.length - root.length, 0);
	expect(asset.length).toBeLessThan(idBytes * 3 + routeCount * actionCount * 80);
	const decoded = readInteractionClosuresAsset(asset);
	const click = decoded.routes[2]!.consumers.find((consumer) => consumer.key.endsWith('#h7:click'))!;
	expect(click.modules).toEqual(shared.map((id) => id.slice(root.length + 1)).sort());
	const other = decoded.routes[1]!.consumers.find((consumer) => consumer.key.endsWith('#h8:click'))!;
	expect(other.modules).toContain('pages/p1.tsrx');
	expect(other.modules).toHaveLength(1_001);
});

test('a control whose first use the compiler could not classify keeps everything landing code can import', () => {
	const names = { handler: 'symbol:0', render: 'symbol:1', row: 'symbol:2', host: 'h1' };
	const { closures } = closuresFor(names, { firstUse: 'unknown' });
	const keydown = closures[0]!.consumers.find((consumer) =>
		consumer.key.endsWith('#h4:keydown'),
	)!;
	expect(keydown.conservative).toBe('unknown-first-use');
	const landing = closures[0]!.consumers
		.filter((consumer) => consumer.kind !== 'render')
		.flatMap((consumer) => consumer.modules);
	for (const id of landing) expect(keydown.modules).toContain(id);
	// Only client navigation runs the route's own render data; a landing click never does.
	expect(keydown.modules).not.toContain(`${root}/screens/panel.tsrx?markless-render-data`);
});

test('a control whose writes re-render another module joins that module symbols', () => {
	const file = `${root}/screens/panel.tsrx`;
	const child = `${root}/widgets/gauge.tsrx`;
	const modules = new Map<string, InteractionClosureModule>([
		...graph(file, 'symbol:0', 'symbol:1', 'symbol:2'),
		[`${child}?markless-resume`, { dependencies: [], source: child }],
		[symbol(child, 'symbol:0'), { dependencies: [], source: child }],
		[symbol(child, 'symbol:1'), { dependencies: [], source: child }],
	]);
	const routes = new Map([['screens/panel.tsrx', [...modules.keys()]]]);
	const map = demandMap({
		actions: [
			{
				hostNodeId: 'h1',
				eventName: 'click',
				recordKind: 'event',
				recordKinds: ['event'],
				payloadRecordIds: [],
				runtimeModuleIds: [],
				firstUse: {
					symbolIds: ['symbol:0'],
					runtimeModuleIds: [],
					foreign: [{ file: child, symbolIds: ['symbol:1'] }],
				},
			},
		],
	});
	const closures = computeInteractionClosures({
		root,
		modules,
		routes,
		demand: [
			{ source: `${file}?markless-symbols`, map },
			{ source: `${child}?markless-symbols`, map: demandMap({}) },
		],
	});
	const click = closures[0]!.consumers.find((consumer) => consumer.key.endsWith('#h1:click'))!;
	expect(click.conservative).toBeUndefined();
	expect(click.modules).toContain(symbol(child, 'symbol:1'));
	expect(click.modules).not.toContain(symbol(child, 'symbol:0'));
	expect(click.modules).toContain(symbol(file, 'symbol:0'));
});

test('a control whose writes re-render a module that is also a route of its own joins that module symbols', () => {
	const file = `${root}/pages/index.tsrx`;
	const child = `${root}/pages/summary.tsrx`;
	const modules = new Map<string, InteractionClosureModule>([
		[`${file}?markless-resume`, { dependencies: [], source: file }],
		[symbol(file, 'symbol:0'), { dependencies: [], source: file }],
		[
			`${child}?markless-resume`,
			{ dependencies: [], dynamicDependencies: [symbol(child, 'symbol:1')], source: child },
		],
		[symbol(child, 'symbol:0'), { dependencies: [`${child}?entry`], source: child }],
		[`${child}?entry`, { dependencies: [runtime('fns/update-text')], source: child }],
		[symbol(child, 'symbol:1'), { dependencies: [], source: child }],
		[
			`${child}?markless-symbols`,
			{
				dependencies: [],
				dynamicDependencies: [symbol(child, 'symbol:0'), symbol(child, 'symbol:1')],
				source: child,
			},
		],
		[runtime('fns/update-text'), { dependencies: [], source: runtime('fns/update-text') }],
	]);
	const routes = new Map([
		['pages/index.tsrx', [...modules.keys()].filter((id) => id.includes('index'))],
		['pages/summary.tsrx', [...modules.keys()].filter((id) => id.includes('summary'))],
	]);
	const closures = computeInteractionClosures({
		root,
		modules,
		routes,
		demand: [
			{
				source: `${file}?markless-symbols`,
				map: demandMap({
					actions: [
						click('h1', {
							symbolIds: ['symbol:0'],
							runtimeModuleIds: [],
							foreign: [{ file: child, symbolIds: ['symbol:0'] }],
						}),
					],
				}),
			},
			{ source: `${child}?markless-symbols`, map: demandMap({}) },
		],
	});
	const index = closures.find((route) => route.route === 'pages/index.tsrx')!;
	const press = index.consumers.find((consumer) => consumer.key.endsWith('#h1:click'))!;
	expect(press.modules).toContain(symbol(child, 'symbol:0'));
	expect(press.modules).toContain(`${child}?entry`);
	expect(press.modules).toContain(runtime('fns/update-text'));
	// The child's resolver is how the page loads that symbol.
	expect(press.modules).toContain(`${child}?markless-symbols`);
	expect(press.modules).not.toContain(symbol(child, 'symbol:1'));
	expect(press.modules).not.toContain(`${child}?markless-resume`);
});

const click = (host: string, firstUse: KeydownFirstUse) => ({
	hostNodeId: host,
	eventName: 'click',
	recordKind: 'event' as const,
	recordKinds: ['event' as const],
	payloadRecordIds: [],
	runtimeModuleIds: [],
	firstUse,
});

// One route over several compiled files, each with a few symbol modules.
function pageOf(files: Record<string, { symbols: string[]; map: RuntimeDemandMapManifest }>) {
	const modules = new Map<string, InteractionClosureModule>();
	for (const [file, { symbols }] of Object.entries(files)) {
		modules.set(`${file}?markless-resume`, { dependencies: [], source: file });
		for (const id of symbols) modules.set(symbol(file, id), { dependencies: [], source: file });
	}
	const closures = computeInteractionClosures({
		root,
		modules,
		routes: new Map([['screens/panel.tsrx', [...modules.keys()]]]),
		demand: Object.entries(files).map(([file, { map }]) => ({
			source: `${file}?markless-symbols`,
			map,
		})),
	});
	return (key: string) => closures[0]!.consumers.find((consumer) => consumer.key.endsWith(key))!;
}

const PAGE = `${root}/screens/panel.tsrx`;
const TOGGLE = `${root}/widgets/toggle.tsrx`;
const LAYOUT = `${root}/screens/layout.tsrx`;

test('every bounded control on a route joins what resume start runs anywhere on it', () => {
	const consumer = pageOf({
		[PAGE]: {
			symbols: ['symbol:0', 'symbol:1'],
			map: demandMap({
				actions: [click('h1', { symbolIds: ['symbol:0'], runtimeModuleIds: [] })],
				page: { resume: { symbolIds: ['symbol:1'], runtimeModuleIds: [] } },
			}),
		},
		[TOGGLE]: {
			symbols: ['symbol:0'],
			map: demandMap({
				actions: [click('h7', { symbolIds: ['symbol:0'], runtimeModuleIds: [] })],
			}),
		},
	});
	const toggle = consumer('widgets/toggle.tsrx#h7:click');
	expect(toggle.conservative).toBeUndefined();
	expect(toggle.modules).toContain(symbol(PAGE, 'symbol:1'));
	expect(toggle.modules).not.toContain(symbol(PAGE, 'symbol:0'));
});

test('a module whose resume start is unbounded leaves every control on its page unknown', () => {
	const consumer = pageOf({
		[PAGE]: {
			symbols: ['symbol:0'],
			map: demandMap({ page: { resume: 'unknown' } }),
		},
		[TOGGLE]: {
			symbols: ['symbol:0'],
			map: demandMap({
				actions: [click('h7', { symbolIds: ['symbol:0'], runtimeModuleIds: [] })],
			}),
		},
	});
	expect(consumer('widgets/toggle.tsrx#h7:click').conservative).toBe('unknown-first-use');
});

test('a page-space write joins what every module on the page re-runs for that cell', () => {
	const cell = 'shared:widgets/toggle.tsrx#toggleState/state:toggle';
	const consumer = pageOf({
		[TOGGLE]: {
			symbols: ['symbol:0', 'symbol:1'],
			map: demandMap({
				actions: [
					click('h1', {
						symbolIds: ['symbol:0'],
						runtimeModuleIds: [],
						pageSpaceWrites: [cell],
					}),
				],
			}),
		},
		[PAGE]: {
			symbols: ['symbol:0', 'symbol:1', 'symbol:2'],
			map: demandMap({
				page: {
					pageSpaceReaders: [
						{
							graphNodeId: cell,
							reach: { symbolIds: ['symbol:1'], runtimeModuleIds: [] },
						},
						{ graphNodeId: 'storage:other#key', reach: 'unknown' },
					],
				},
			}),
		},
	});
	const flip = consumer('widgets/toggle.tsrx#h1:click');
	expect(flip.conservative).toBeUndefined();
	expect(flip.modules).toContain(symbol(PAGE, 'symbol:1'));
	expect(flip.modules).not.toContain(symbol(PAGE, 'symbol:0'));
	expect(flip.modules).not.toContain(symbol(PAGE, 'symbol:2'));
	expect(flip.modules).not.toContain(symbol(TOGGLE, 'symbol:1'));
});

test('a page-space write some reader could not bound is unknown', () => {
	const cell = 'storage:screens/panel.tsrx#theme';
	const consumer = pageOf({
		[TOGGLE]: {
			symbols: ['symbol:0'],
			map: demandMap({
				actions: [
					click('h1', {
						symbolIds: ['symbol:0'],
						runtimeModuleIds: [],
						pageSpaceWrites: [cell],
					}),
				],
			}),
		},
		[PAGE]: {
			symbols: ['symbol:0'],
			map: demandMap({
				page: { pageSpaceReaders: [{ graphNodeId: cell, reach: 'unknown' }] },
			}),
		},
	});
	expect(consumer('widgets/toggle.tsrx#h1:click').conservative).toBe('unknown-first-use');
});

test('a called prop joins the callback each composing module passes, through forwarding', () => {
	const consumer = pageOf({
		[TOGGLE]: {
			symbols: ['symbol:0', 'symbol:1'],
			map: demandMap({
				actions: [
					click('h1', {
						symbolIds: ['symbol:0'],
						runtimeModuleIds: [],
						calls: [{ prop: 'onPress' }, { slot: 'shared:t#s/slot:onChange' }],
					}),
				],
				// The root answers the slot with its own prop.
				page: { callbackSlots: [{ slot: 'shared:t#s/slot:onChange', prop: 'onChange' }] },
			}),
		},
		[LAYOUT]: {
			symbols: ['symbol:0', 'symbol:1'],
			map: demandMap({
				page: {
					passedProps: [
						{ file: TOGGLE, excludeNames: ['title'], reach: 'same-prop' },
						{
							file: TOGGLE,
							prop: 'onChange',
							reach: { symbolIds: ['symbol:1'], runtimeModuleIds: [] },
						},
					],
				},
			}),
		},
		[PAGE]: {
			symbols: ['symbol:0', 'symbol:1', 'symbol:2'],
			map: demandMap({
				page: {
					passedProps: [
						{
							file: LAYOUT,
							prop: 'onPress',
							reach: { symbolIds: ['symbol:2'], runtimeModuleIds: [] },
						},
						{ file: LAYOUT, prop: 'onOther', reach: 'unknown' },
					],
				},
			}),
		},
	});
	const press = consumer('widgets/toggle.tsrx#h1:click');
	expect(press.conservative).toBeUndefined();
	expect(press.modules).toContain(symbol(PAGE, 'symbol:2'));
	expect(press.modules).toContain(symbol(LAYOUT, 'symbol:1'));
	expect(press.modules).not.toContain(symbol(PAGE, 'symbol:1'));
	expect(press.modules).not.toContain(symbol(LAYOUT, 'symbol:0'));
});

test('a called prop some composer passes as unclassified code is unknown', () => {
	const consumer = pageOf({
		[TOGGLE]: {
			symbols: ['symbol:0'],
			map: demandMap({
				actions: [
					click('h1', {
						symbolIds: ['symbol:0'],
						runtimeModuleIds: [],
						calls: [{ prop: 'onPress' }],
					}),
				],
			}),
		},
		[PAGE]: {
			symbols: ['symbol:0'],
			// A child this compile could not name answers for every file.
			map: demandMap({
				page: { passedProps: [{ file: null, prop: 'onPress', reach: 'unknown' }] },
			}),
		},
	});
	expect(consumer('widgets/toggle.tsrx#h1:click').conservative).toBe('unknown-first-use');
});

test('a demand map that publishes no page data leaves every control on its page unknown', () => {
	const consumer = pageOf({
		[PAGE]: {
			symbols: ['symbol:0'],
			map: { ...demandMap({}), firstUsePage: undefined },
		},
		[TOGGLE]: {
			symbols: ['symbol:0'],
			map: demandMap({
				actions: [click('h7', { symbolIds: ['symbol:0'], runtimeModuleIds: [] })],
			}),
		},
	});
	expect(consumer('widgets/toggle.tsrx#h7:click').conservative).toBe('unknown-first-use');
});

test('a control closure follows dynamic imports the demand maps cannot rule out', () => {
	const file = `${root}/pages/list.tsrx`;
	const lazyHelper = `${root}/lib/lazy-helper.ts`;
	const child = `${root}/lib/child.tsrx`;
	const modules = new Map<string, InteractionClosureModule>([
		[
			`${file}?markless-resume`,
			{
				dependencies: [],
				dynamicDependencies: [
					runtime('resume-events'),
					`\0virtual:markless:render-data:pages%2Flist.tsrx`,
				],
				source: file,
			},
		],
		[
			`${file}?markless-route`,
			{
				dependencies: [],
				dynamicDependencies: [`${file}?markless-render-data`],
				source: file,
			},
		],
		[
			`${file}?markless-render-data`,
			{ dependencies: [symbol(file, 'symbol:1')], source: file },
		],
		[
			`\0virtual:markless:render-data:pages%2Flist.tsrx`,
			{ dependencies: [symbol(file, 'symbol:1')] },
		],
		[
			symbol(file, 'symbol:0'),
			{
				dependencies: [],
				dynamicDependencies: [
					lazyHelper,
					symbol(file, 'symbol:1'),
					symbol(child, 'symbol:0'),
				],
				source: file,
			},
		],
		[symbol(file, 'symbol:1'), { dependencies: [], source: file }],
		[lazyHelper, { dependencies: [], source: lazyHelper }],
		[symbol(child, 'symbol:0'), { dependencies: [], source: child }],
		[
			runtime('resume-events'),
			{
				dependencies: [],
				dynamicDependencies: [runtime('resume-branches'), runtime('storage-plane')],
				source: runtime('resume-events'),
			},
		],
		[runtime('resume-branches'), { dependencies: [], source: runtime('resume-branches') }],
		[runtime('storage-plane'), { dependencies: [], source: runtime('storage-plane') }],
		[runtime('scalar-served'), { dependencies: [], source: runtime('scalar-served') }],
	]);
	const map = demandMap({
		actions: [
			{
				hostNodeId: 'h1',
				eventName: 'click',
				recordKind: 'event',
				recordKinds: ['event'],
				payloadRecordIds: [],
				runtimeModuleIds: ['web/resume-events', 'web/scalar-served'],
				firstUse: { symbolIds: ['symbol:0'], runtimeModuleIds: ['web/resume-events'] },
			},
		],
		unknown: ['web/resume-events', 'web/resume-branches'],
	});
	const [route] = computeInteractionClosures({
		root,
		modules,
		routes: new Map([
			['pages/list.tsrx', [...modules.keys()].filter((id) => id.startsWith(file))],
		]),
		demand: [
			{ source: `${file}?markless-symbols`, map },
			{ source: `${child}?markless-symbols`, map: demandMap({}) },
		],
	});
	const byKey = new Map(route!.consumers.map((consumer) => [consumer.key, consumer.modules]));
	const click = byKey.get('action:pages/list.tsrx#h1:click')!;
	// Runtime the compiler does not track stays in; code the author imports lazily is left to load when reached.
	expect(click).not.toContain(lazyHelper);
	expect(click).toContain(runtime('storage-plane'));
	// Another file's symbols its map cannot bound for this control stay in.
	expect(click).toContain(symbol(child, 'symbol:0'));
	// Tracked runtime this control does not demand, and symbols the map assigns, stay out.
	expect(click).not.toContain(runtime('resume-branches'));
	expect(click).not.toContain(symbol(file, 'symbol:1'));
	// Runtime the map names but this route never imports is no route's first-use code.
	for (const modules of byKey.values()) expect(modules).not.toContain(runtime('scalar-served'));
	// Render data the resume module loads lazily is landing code, not render-only code.
	const boot = byKey.get('boot')!;
	expect(boot).toContain(`\0virtual:markless:render-data:pages%2Flist.tsrx`);
	// A first input resumes the whole page, so boot holds all the resume module can import.
	expect(boot).toContain(runtime('resume-events'));
	expect(boot).toContain(runtime('resume-branches'));
	expect(boot).toContain(symbol(file, 'symbol:1'));
	// The route module serves client navigation, so it roots the render closure, not boot.
	expect(boot).not.toContain(`${file}?markless-route`);
	expect(byKey.get('render')).toContain(`${file}?markless-route`);
	expect(byKey.get('render')).toContain(`${file}?markless-render-data`);
});

// An import() the author wrote is code they chose to load when it is reached, so no first use preloads it.
test('a module the author imports lazily joins no closure, from a control, from boot or unbounded', () => {
	const file = `${root}/pages/home.tsrx`;
	const site = `${root}/lib/site.ts`;
	const search = `${root}/lib/search.ts`;
	const searchLib = `${root}/node_modules/search-lib/index.js`;
	const modules = new Map<string, InteractionClosureModule>([
		[
			`${file}?markless-resume`,
			{ dependencies: [], dynamicDependencies: [runtime('resume-events')], source: file },
		],
		[symbol(file, 'symbol:0'), { dependencies: [site], source: file }],
		[symbol(file, 'symbol:1'), { dependencies: [site], source: file }],
		[site, { dependencies: [], dynamicDependencies: [search], source: site }],
		[search, { dependencies: [], dynamicDependencies: [searchLib], source: search }],
		[searchLib, { dependencies: [], source: searchLib }],
		[runtime('resume-events'), { dependencies: [], source: runtime('resume-events') }],
	]);
	const action = (hostNodeId: string, unknown: boolean) => ({
		hostNodeId,
		eventName: 'click',
		recordKind: 'event' as const,
		recordKinds: ['event' as const],
		payloadRecordIds: [],
		runtimeModuleIds: ['web/resume-events'],
		firstUse: unknown
			? ('unknown' as const)
			: { symbolIds: ['symbol:0'], runtimeModuleIds: ['web/resume-events'] },
	});
	for (const unknown of [false, true]) {
		const [route] = computeInteractionClosures({
			root,
			modules,
			routes: new Map([
				[
					'pages/home.tsrx',
					[`${file}?markless-resume`, symbol(file, 'symbol:0'), symbol(file, 'symbol:1')],
				],
			]),
			demand: [
				{
					source: `${file}?markless-symbols`,
					map: demandMap({
						actions: [action('h1', unknown)],
						page: { resume: { symbolIds: ['symbol:1'], runtimeModuleIds: [] } },
					}),
				},
			],
		});
		expect(route!.fallback).toBeUndefined();
		for (const consumer of route!.consumers) {
			if (consumer.kind === 'render') continue;
			expect(consumer.modules, consumer.key).not.toContain(search);
			expect(consumer.modules, consumer.key).not.toContain(searchLib);
		}
		const click = route!.consumers.find((consumer) => consumer.kind === 'action')!;
		expect(click.modules).toContain(site);
	}
});

test('boot leaves a symbol only a control or nothing loads to that control, unless resume start is unbounded', () => {
	const file = `${root}/pages/panel.tsrx`;
	const modules = new Map<string, InteractionClosureModule>([
		[
			`${file}?markless-resume`,
			{
				dependencies: [],
				dynamicDependencies: [
					symbol(file, 'symbol:0'),
					symbol(file, 'symbol:1'),
					symbol(file, 'symbol:2'),
					symbol(file, 'symbol:3'),
				],
				source: file,
			},
		],
		...['symbol:0', 'symbol:1', 'symbol:2', 'symbol:3'].map(
			(id): [string, InteractionClosureModule] => [
				symbol(file, id),
				{ dependencies: [], source: file },
			],
		),
	]);
	const closures = (map: RuntimeDemandMapManifest) =>
		new Map(
			computeInteractionClosures({
				root,
				modules,
				routes: new Map([['pages/panel.tsrx', [`${file}?markless-resume`]]]),
				demand: [{ source: `${file}?markless-symbols`, map }],
			})[0]!.consumers.map((consumer) => [consumer.key, consumer.modules]),
		);
	const served = {
		recordId: 'r1',
		kind: 'behavior' as const,
		symbolIds: ['symbol:2'],
		runtimeModuleIds: [],
	};
	const click = {
		hostNodeId: 'h1',
		eventName: 'click',
		recordKind: 'event' as const,
		recordKinds: ['event' as const],
		payloadRecordIds: [],
		runtimeModuleIds: [],
		firstUse: { symbolIds: ['symbol:0'], runtimeModuleIds: [] },
	};
	const resume = { symbolIds: ['symbol:1'], runtimeModuleIds: [] };
	const bounded = closures(
		demandMap({ payloadRecords: [served], actions: [click], page: { resume } }),
	);
	// Resume start and served records run at landing; the handler waits for its control's closure.
	expect(bounded.get('boot')).toContain(symbol(file, 'symbol:1'));
	expect(bounded.get('boot')).toContain(symbol(file, 'symbol:2'));
	expect(bounded.get('boot')).not.toContain(symbol(file, 'symbol:0'));
	expect(bounded.get('action:pages/panel.tsrx#h1:click')).toContain(symbol(file, 'symbol:0'));
	// Nothing names it: no landing consumer holds it.
	for (const modules of bounded.values()) expect(modules).not.toContain(symbol(file, 'symbol:3'));

	// A page whose resume start the compiler could not bound keeps all landing code in boot.
	const unbounded = closures(
		demandMap({ payloadRecords: [served], actions: [click], page: { resume: 'unknown' } }),
	);
	expect(unbounded.get('boot')).toContain(symbol(file, 'symbol:3'));
});

test('runtime only a fallback path imports joins boot only when something that runs at landing names it', () => {
	for (const [file, marker, full, loadsLean] of [
		[
			`${root}/pages/counter.tsrx`,
			LEAN_DISPATCH_MARKER_MODULES.scalar[1],
			'resume-runtime',
			'static',
		],
		[
			`${root}/screens/tally.tsrx`,
			LEAN_DISPATCH_MARKER_MODULES.row[0],
			'payload-resume',
			'lazy',
		],
	] as const) {
		const lean = marker.replace(/^web\//, '');
		const modules = new Map<string, InteractionClosureModule>([
			[
				`${file}?markless-resume`,
				{
					dependencies: loadsLean === 'static' ? [runtime(lean)] : [],
					dynamicDependencies: [
						runtime(full),
						symbol(file, 'symbol:0'),
						...(loadsLean === 'lazy' ? [runtime(lean)] : []),
					],
					source: file,
				},
			],
			[symbol(file, 'symbol:0'), { dependencies: [], source: file }],
			[symbol(file, 'symbol:1'), { dependencies: [], source: file }],
			[runtime(lean), { dependencies: [], source: runtime(lean) }],
			[runtime(full), { dependencies: [], source: runtime(full) }],
		]);
		const route = relative(file);
		const consumers = (map: RuntimeDemandMapManifest) =>
			new Map(
				computeInteractionClosures({
					root,
					modules,
					routes: new Map([[route, [`${file}?markless-resume`]]]),
					demand: [{ source: `${file}?markless-symbols`, map }],
				})[0]!.consumers.map((consumer) => [consumer.key, consumer.modules]),
			);
		const action = {
			hostNodeId: 'h3',
			eventName: 'click',
			recordKind: 'event' as const,
			recordKinds: ['event' as const],
			payloadRecordIds: ['event:h3:click'],
			runtimeModuleIds: [`web/${lean}`, `web/${full}`],
			firstUse: { symbolIds: ['symbol:0'], runtimeModuleIds: [`web/${lean}`] },
		};
		const event = {
			recordId: 'event:h3:click',
			kind: 'event' as const,
			symbolIds: ['symbol:0'],
			runtimeModuleIds: [`web/${lean}`, `web/${full}`],
		};
		const lone = consumers(
			demandMap({ payloadRecords: [event], actions: [action], unknown: [`web/${full}`] }),
		);
		for (const modules of lone.values()) expect(modules).not.toContain(runtime(full));
		expect(lone.get(`action:${route}#h3:click`)).toContain(runtime(lean));
		expect(lone.get(`action:${route}#h3:click`)).toContain(symbol(file, 'symbol:0'));

		const behavior = {
			recordId: 'behavior:h4:symbol:1',
			kind: 'behavior' as const,
			symbolIds: ['symbol:1'],
			runtimeModuleIds: [`web/${full}`],
		};
		const attached = consumers(
			demandMap({
				payloadRecords: [event, behavior],
				actions: [action],
				unknown: [`web/${full}`],
			}),
		);
		expect(attached.get('boot')).toContain(runtime(full));
		expect(attached.get('boot')).toContain(symbol(file, 'symbol:1'));
	}

	function relative(file: string) {
		return file.slice(root.length + 1);
	}
});

test('a lean action keeps the lean first use when a client-render variant of its file dispatches it in full', () => {
	const file = `${root}/components/tally.tsrx`;
	const marker = LEAN_DISPATCH_MARKER_MODULES.scalar[0];
	const modules = new Map<string, InteractionClosureModule>([
		[
			`${file}?markless-resume`,
			{
				dependencies: [runtime(marker.replace(/^web\//, ''))],
				dynamicDependencies: [runtime('resume-runtime'), symbol(file, 'symbol:0')],
				source: file,
			},
		],
		[symbol(file, 'symbol:0'), { dependencies: [], source: file }],
		[
			runtime(marker.replace(/^web\//, '')),
			{ dependencies: [], source: runtime(marker.replace(/^web\//, '')) },
		],
		[runtime('resume-runtime'), { dependencies: [], source: runtime('resume-runtime') }],
	]);
	const action = (runtimeModuleIds: string[], firstUse: string[]) => ({
		hostNodeId: 'h1',
		eventName: 'click',
		recordKind: 'event' as const,
		recordKinds: ['event' as const],
		payloadRecordIds: ['event:h1:click'],
		runtimeModuleIds,
		firstUse: { symbolIds: ['symbol:0'], runtimeModuleIds: firstUse },
	});
	const [route] = computeInteractionClosures({
		root,
		modules,
		routes: new Map([['components/tally.tsrx', [`${file}?markless-resume`]]]),
		demand: [
			{
				source: `${file}?markless-symbols`,
				map: demandMap({
					actions: [action([marker, 'web/resume-runtime'], [marker])],
					unknown: ['web/resume-runtime'],
				}),
			},
			{
				source: `${file}?markless-render-data&markless-reached-from=route`,
				map: demandMap({
					actions: [action(['web/resume-runtime'], ['web/resume-runtime'])],
					unknown: ['web/resume-runtime'],
				}),
			},
		],
	});
	for (const consumer of route!.consumers)
		expect(consumer.modules).not.toContain(runtime('resume-runtime'));
});

test('runtime a feature needs stays out of a route whose own demand maps never name it', () => {
	const list = `${root}/pages/list.tsrx`;
	const about = `${root}/pages/about.tsrx`;
	const page = (file: string) =>
		new Map<string, InteractionClosureModule>([
			[`${file}?markless-resume`, { dependencies: [runtime('resume-events')], source: file }],
		]);
	const modules = new Map<string, InteractionClosureModule>([
		...page(list),
		...page(about),
		[
			runtime('resume-events'),
			{
				dependencies: [],
				dynamicDependencies: [runtime('resume-keyed-repeats')],
				source: runtime('resume-events'),
			},
		],
		[
			runtime('resume-keyed-repeats'),
			{ dependencies: [], source: runtime('resume-keyed-repeats') },
		],
	]);
	const pageMap = (repeats: boolean, actionKinds: string[] = ['event']) => ({
		...demandMap({
			payloadRecords: [
				{
					recordId: 'event:h1:click',
					kind: 'event',
					symbolIds: [],
					runtimeModuleIds: ['web/resume-events'],
				},
				...(repeats
					? [
							{
								recordId: 'keyed-repeat:h2',
								kind: 'keyed-repeat' as const,
								symbolIds: [],
								runtimeModuleIds: ['web/resume-keyed-repeats'],
							},
						]
					: []),
			],
			actions: [
				{
					hostNodeId: 'h1',
					eventName: 'click',
					recordKind: 'event',
					recordKinds:
						actionKinds as RuntimeDemandMapManifest['actions'][number]['recordKinds'],
					payloadRecordIds: ['event:h1:click'],
					runtimeModuleIds: ['web/resume-events'],
				},
			],
			unknown: ['web/resume-keyed-repeats'],
		}),
		capabilityModuleIds: [],
		...(actionKinds.includes('branch') ? {} : { nestedRecordModuleIds: [] }),
	});
	const boot = (aboutMap: RuntimeDemandMapManifest) => {
		const closures = computeInteractionClosures({
			root,
			modules,
			routes: new Map([
				['pages/list.tsrx', [`${list}?markless-resume`]],
				['pages/about.tsrx', [`${about}?markless-resume`]],
			]),
			demand: [
				{ source: `${list}?markless-resume`, map: pageMap(true) },
				{ source: `${about}?markless-resume`, map: aboutMap },
			],
		});
		return (route: string) =>
			closures.find((closure) => closure.route === route)!.consumers[0]!.modules;
	};
	const bounded = boot(pageMap(false));
	expect(bounded('pages/list.tsrx')).toContain(runtime('resume-keyed-repeats'));
	expect(bounded('pages/about.tsrx')).not.toContain(runtime('resume-keyed-repeats'));
	expect(bounded('pages/about.tsrx')).toContain(runtime('resume-events'));
	// An action whose records the map cannot enumerate keeps every capability the runtime can load.
	const open = boot(pageMap(false, ['event', 'branch']));
	expect(open('pages/about.tsrx')).toContain(runtime('resume-keyed-repeats'));
});

// The planner splits landing packs only for controls the compiler serves without the full resume runtime.
test('marks an action lean by its lean dispatch runtime and joins controls written inside arms', () => {
	for (const [lean, full, arm, marker] of [
		['h1', 'h2', 'h7', LEAN_DISPATCH_MARKER_MODULES.scalar[0]],
		['h5', 'h3', 'h8', LEAN_DISPATCH_MARKER_MODULES.row[0]],
	] as const) {
		const file = `${root}/screens/panel.tsrx`;
		const modules = graph(file, 'symbol:0', 'symbol:1', 'symbol:2');
		const bounded = (symbolIds: string[]) => ({
			symbolIds,
			runtimeModuleIds: ['web/resume-events'],
		});
		const action = (host: string, runtimeModuleIds: string[], symbolIds: string[]) => ({
			hostNodeId: host,
			eventName: 'click',
			recordKind: 'event' as const,
			recordKinds: ['event' as const],
			payloadRecordIds: [`event:${host}:click`],
			runtimeModuleIds,
			firstUse: bounded(symbolIds),
		});
		const map: RuntimeDemandMapManifest = {
			...demandMap({
				payloadRecords: [
					{
						recordId: `event:${lean}:click`,
						kind: 'event',
						symbolIds: ['symbol:0'],
						runtimeModuleIds: [],
					},
					{
						recordId: `event:${full}:click`,
						kind: 'event',
						symbolIds: ['symbol:0'],
						runtimeModuleIds: [],
					},
					{
						recordId: 'async-boundary:a0',
						kind: 'async-boundary',
						symbolIds: [],
						runtimeModuleIds: [],
					},
				],
				actions: [
					action(lean, ['web/resume-events', marker], ['symbol:0']),
					action(full, ['web/resume-events', 'web/resume-runtime'], ['symbol:0']),
				],
			}),
			armActions: [
				{
					...action(arm, ['web/resume-events', 'web/resume-runtime'], ['symbol:2']),
					recordKinds: ['event', 'async-boundary'],
					payloadRecordIds: ['async-boundary:a0'],
				},
			],
		};
		const [route] = computeInteractionClosures({
			root,
			modules,
			routes: new Map([
				['screens/panel.tsrx', [...modules.keys()].filter((id) => id.includes('panel'))],
			]),
			demand: [{ source: `${file}?markless-symbols`, map }],
		});
		const byKey = new Map(route!.consumers.map((consumer) => [consumer.key, consumer]));
		expect(byKey.get(`action:screens/panel.tsrx#${lean}:click`)?.lean).toBe(true);
		expect(byKey.get(`action:screens/panel.tsrx#${full}:click`)?.lean).toBeUndefined();
		const armed = byKey.get(`action:screens/panel.tsrx#${arm}:click`);
		expect(armed?.lean).toBeUndefined();
		expect(armed?.modules).toContain(symbol(file, 'symbol:2'));
	}
});

describe('an async boundary on a landing page the server streams', () => {
	const file = `${root}/screens/feed.tsrx`;
	const modules = new Map<string, InteractionClosureModule>([
		[`${file}?markless-resume`, { dependencies: [runtime('resume-events')], source: file }],
		[symbol(file, 'symbol:0'), { dependencies: [], source: file }],
		[symbol(file, 'symbol:1'), { dependencies: [], source: file }],
		[symbol(file, 'symbol:6'), { dependencies: [], source: file }],
		[
			symbol(file, 'symbol:8'),
			{ dependencies: [runtime('fns/prerender-resume')], source: file },
		],
		[runtime('resume-events'), { dependencies: [], source: runtime('resume-events') }],
		[
			runtime('fns/prerender-resume'),
			{ dependencies: [], source: runtime('fns/prerender-resume') },
		],
	]);
	const map = {
		...demandMap({
			payloadRecords: [
				{
					recordId: 'async-boundary:b0',
					kind: 'async-boundary',
					symbolIds: ['symbol:8', 'symbol:6'],
					runtimeModuleIds: [],
				},
			],
			actions: [
				click('h2', { symbolIds: ['symbol:0'], runtimeModuleIds: [] }),
				click('h3', {
					symbolIds: ['symbol:1', 'symbol:8', 'symbol:6'],
					runtimeModuleIds: [],
				}),
			],
		}),
		armActions: [
			{
				...click('h11', { symbolIds: ['symbol:1'], runtimeModuleIds: [] }),
				recordKinds: ['event' as const, 'async-boundary' as const],
				payloadRecordIds: ['async-boundary:b0'],
			},
		],
	};
	const consumers = (landingArmsServed: boolean) => {
		const [route] = computeInteractionClosures({
			root,
			modules,
			routes: new Map([
				['screens/feed.tsrx', [...modules.keys()].filter((id) => id.includes('feed'))],
			]),
			demand: [{ source: `${file}?markless-symbols`, map }],
			landingArmsServed,
		});
		return new Map(route!.consumers.map((consumer) => [consumer.key, consumer.modules]));
	};

	test('boot and the controls inside its arm never settle it, so they carry none of its settle code', () => {
		const served = consumers(true);
		for (const key of [
			'boot',
			'action:screens/feed.tsrx#h11:click',
			'action:screens/feed.tsrx#h2:click',
		]) {
			expect(served.get(key)).not.toContain(symbol(file, 'symbol:8'));
			expect(served.get(key)).not.toContain(runtime('fns/prerender-resume'));
		}
		expect(served.get('action:screens/feed.tsrx#h11:click')).toContain(
			symbol(file, 'symbol:1'),
		);
	});

	test('a control whose writes reach what the boundary reads still carries its settle code', () => {
		const writes = consumers(true).get('action:screens/feed.tsrx#h3:click');
		expect(writes).toContain(symbol(file, 'symbol:8'));
		expect(writes).toContain(runtime('fns/prerender-resume'));
	});

	test('the bindings a streamed arm brings join boot, so adopting it after a click fetches nothing', () => {
		const [route] = computeInteractionClosures({
			root,
			modules: new Map([
				...modules,
				[symbol(file, 'symbol:4'), { dependencies: [], source: file }],
			]),
			routes: new Map([
				[
					'screens/feed.tsrx',
					[...modules.keys(), symbol(file, 'symbol:4')].filter((id) =>
						id.includes('feed'),
					),
				],
			]),
			demand: [
				{
					source: `${file}?markless-symbols`,
					map: {
						...map,
						firstUsePage: {
							...map.firstUsePage!,
							streamedSettle: { symbolIds: ['symbol:4'], runtimeModuleIds: [] },
						},
					},
				},
			],
			landingArmsServed: true,
		});
		const boot = route!.consumers.find((consumer) => consumer.key === 'boot')!.modules;
		expect(boot).toContain(symbol(file, 'symbol:4'));
		expect(boot).not.toContain(symbol(file, 'symbol:8'));
	});

	test('a landing that can serve @pending without streaming the arm keeps the settle code at boot', () => {
		expect(consumers(false).get('boot')).toContain(runtime('fns/prerender-resume'));
		expect(consumers(false).get('action:screens/feed.tsrx#h11:click')).toContain(
			runtime('fns/prerender-resume'),
		);
	});
});
