import { expect, test } from 'vitest';
import { nativePackingPlugins } from '../src/build/native-packing.ts';
import { plannedStylesheetRoutes } from '../src/build/planned-landing.ts';
import { MARKLESS_INTERACTION_CLOSURES_ASSET } from '../src/build/planned-landing.ts';
import { planRoutePackGroups } from '../src/build/route-pack-groups.ts';

const isStylesheet = (id: string) => id.endsWith('.css');

// A route set's component can ride a pack every route loads; its sheet belongs to the routes that reach its styles.
test('each stylesheet is attributed to the routes that reach one of its style modules', async () => {
	const route = (name: string) => `/app/pages/${name}.tsrx?markless-route`;
	const graph: Record<string, { imports: string[]; dynamic?: string[]; entry?: true }> = {
		'/app/entry.ts': {
			imports: ['/app/global.css'],
			dynamic: [route('home'), route('dial'), route('meter')],
			entry: true,
		},
		'/app/global.css': { imports: [] },
		[route('home')]: { imports: ['/app/src/nav.tsrx'] },
		[route('dial')]: { imports: ['/app/src/nav.tsrx', '/app/src/study.tsrx'] },
		// The meter reaches the study only through a lazy import.
		[route('meter')]: { imports: ['/app/src/nav.tsrx'], dynamic: ['/app/src/study.tsrx'] },
		'/app/src/nav.tsrx': { imports: ['/app/src/nav.tsrx.css'] },
		'/app/src/nav.tsrx.css': { imports: [] },
		'/app/src/study.tsrx': { imports: ['/app/src/study.tsrx.css'] },
		'/app/src/study.tsrx.css': { imports: [] },
	};
	const [packing] = nativePackingPlugins(
		() => '/app',
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		isStylesheet,
	);
	type Hook = (this: unknown, ...args: unknown[]) => unknown;
	const info = (id: string) => ({
		importedIds: graph[id]!.imports,
		dynamicallyImportedIds: graph[id]!.dynamic ?? [],
		isEntry: graph[id]!.entry === true,
		code: 'x',
	});
	await (packing!.buildEnd as Hook).call({
		getModuleIds: () => Object.keys(graph)[Symbol.iterator](),
		getModuleInfo: info,
		resolve: async () => null,
	});
	(packing!.renderStart as Hook).call({});
	const renderChunk = (packing!.renderChunk as { handler: Hook }).handler;
	const chunks = [
		// One pack every route loads holds the nav, the study and both their styles; Vite splits its CSS into two sheets here.
		{ moduleIds: ['/app/src/nav.tsrx', '/app/src/nav.tsrx.css'], css: ['assets/nav.css'] },
		{
			moduleIds: ['/app/src/study.tsrx', '/app/src/study.tsrx.css'],
			css: ['assets/study.css'],
		},
		{ moduleIds: ['/app/entry.ts', '/app/global.css'], css: ['assets/global.css'] },
		{ moduleIds: ['/app/src/no-css.ts'], css: [] },
	];
	for (const chunk of chunks)
		renderChunk.call({}, '', {
			moduleIds: chunk.moduleIds,
			viteMetadata: { importedCss: new Set(chunk.css) },
		});
	let asset = '';
	await (packing!.generateBundle as Hook).call(
		{ emitFile: (file: { source: string }) => (asset = file.source), getModuleInfo: info },
		{},
		{},
	);
	const routes = plannedStylesheetRoutes({
		[MARKLESS_INTERACTION_CLOSURES_ASSET]: { type: 'asset', source: asset },
	});
	expect(Object.fromEntries([...routes].map(([sheet, names]) => [sheet, [...names]]))).toEqual({
		'assets/nav.css': ['pages/dial.tsrx', 'pages/home.tsrx', 'pages/meter.tsrx'],
		'assets/study.css': ['pages/dial.tsrx', 'pages/meter.tsrx'],
	});
	// The entry's sheet is outside every route closure: unattributed, so every route that reaches it keeps it.
	expect(routes.has('assets/global.css')).toBe(false);
});

test('a route that imports another route’s module reaches what that route reaches', () => {
	const moduleRoutes = new Map<string, ReadonlySet<string>>();
	planRoutePackGroups({
		modules: new Map([
			['home', { dependencies: ['gallery'], source: 'home' }],
			['gallery', { dependencies: ['frame'], source: 'gallery' }],
			['frame', { dependencies: ['frame.css'], source: 'frame' }],
			['frame.css', { dependencies: [], source: 'frame.css' }],
			['about', { dependencies: [], source: 'about' }],
		]),
		routes: new Map([
			['/home', ['home']],
			['/gallery', ['gallery']],
			['/about', ['about']],
		]),
		moduleRoutes,
	});
	expect([...moduleRoutes.get('frame.css')!].sort()).toEqual(['/gallery', '/home']);
	expect([...moduleRoutes.get('about')!]).toEqual(['/about']);
});
