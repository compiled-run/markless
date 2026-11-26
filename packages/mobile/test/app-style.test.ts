import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { nativeAppStyle, nativeAppStyleSize, type DragonStyleExport } from '../src/app-style.ts';

const tag = [
	{
		kind: 'background-color',
		key: 'backgroundColor',
		color: { r: 216, g: 243, b: 220, alpha: 255 },
	},
];
const page = (component: string, background: number): DragonStyleExport => ({
	schema: 'dragon.native-style-export/1',
	units: 'px',
	compiler: `digest-${component}`,
	component,
	warnings: [],
	fonts: [{ id: 'sha256:aa', file: 'vendor/fonts/a.ttf' }],
	targets: {
		ios: {
			backend: 'uikit',
			viewport: { width: 402, height: 778 },
			dpr: 3,
			readiness: { kind: 'analysis-only', reason: 'lanes' },
			states: [],
			initial: 0,
			next: [[]],
			assignments: [
				{
					values: {},
					canvas: { r: 18, g: 52, b: 86, alpha: 255 },
					nodes: [
						{
							id: 'h0',
							parent: null,
							writes: [
								{
									kind: 'background-color',
									key: 'backgroundColor',
									color: { r: background, g: 0, b: 0, alpha: 255 },
								},
							],
						},
						{ id: 'component-edge:0/h0', parent: 'h0', writes: tag },
					],
				},
			],
		},
	},
});

test('a component styled alike on two pages carries its writes once; each page keeps its own', () => {
	const pages = [
		{ pattern: '/', exported: page('Shelf', 1) },
		{ pattern: '/basil', exported: page('Basil', 2) },
	];
	const style = nativeAppStyle(pages);
	const ios = style.targets.ios!;
	expect(ios.writes).toHaveLength(3);
	const tagIndex = (route: number) => ios.nodes[ios.routes[route]!.assignments[0]!.nodes[1]!]!.writes;
	expect(tagIndex(0)).toBe(tagIndex(1));
	// The tag is the same node on both pages, so both name one pool entry; each page's own background is its own.
	expect(ios.nodes).toHaveLength(3);
	expect(ios.routes.map((route) => route.assignments[0]!.nodes)).toEqual([
		[0, 1],
		[2, 1],
	]);
	expect(ios.writes[tagIndex(0)]).toEqual(tag);
	expect(ios.routes.map((route) => route.pattern)).toEqual(['/', '/basil']);
	expect(ios.routes.map((route) => route.assignments[0]!.canvas)).toEqual([
		{ r: 18, g: 52, b: 86, alpha: 255 },
		{ r: 18, g: 52, b: 86, alpha: 255 },
	]);
	expect(style.fonts).toEqual([{ id: 'sha256:aa', file: 'vendor/fonts/a.ttf' }]);
	const size = nativeAppStyleSize(pages, style);
	expect(size.targets.ios).toEqual({ writeLists: 3, writeListReferences: 4 });
	expect(size.app).toBeLessThan(size.perPageTotal);
});

test('pages laid out for different devices are refused by name', () => {
	const other = page('Basil', 2);
	const moved = {
		...other,
		targets: { ios: { ...other.targets.ios!, dpr: 2 } },
	};
	expect(() =>
		nativeAppStyle([
			{ pattern: '/', exported: page('Shelf', 1) },
			{ pattern: '/basil', exported: moved },
		]),
	).toThrow('/basil: the ios export was laid out for another device');
});

test('an export without a canvas colour is refused by name', () => {
	const other = page('Basil', 2);
	const [assignment] = other.targets.ios!.assignments;
	const { canvas: _canvas, ...bare } = assignment!;
	const without = {
		...other,
		targets: { ios: { ...other.targets.ios!, assignments: [bare] } },
	} as unknown as DragonStyleExport;
	expect(() => nativeAppStyle([{ pattern: '/basil', exported: without }])).toThrow(
		"/basil: the ios export's assignment 0 has no canvas",
	);
});

test("a sheet's content at each resting height shares the page's write lists and keeps its own viewport", () => {
	const atHeight = (height: number): DragonStyleExport => {
		const exported = page('ShelfSheet0', 1);
		return {
			...exported,
			targets: {
				ios: { ...exported.targets.ios!, viewport: { width: 386, height } },
			},
		};
	};
	const pages = [
		{
			pattern: '/',
			exported: page('Shelf', 1),
			sheets: [
				{ node: 'sheet:component-edge:1', snapPoint: 0.5, exported: atHeight(418) },
				{ node: 'sheet:component-edge:1', snapPoint: 1, exported: atHeight(778) },
			],
		},
	];
	const style = nativeAppStyle(pages);
	const route = style.targets.ios!.routes[0]!;
	expect(style.targets.ios!.writes).toHaveLength(2);
	expect(route.sheets).toHaveLength(1);
	const [half, full] = route.sheets![0]!.heights;
	expect([half!.snapPoint, full!.snapPoint]).toEqual([0.5, 1]);
	expect([half!.viewport, full!.viewport]).toEqual([
		{ width: 386, height: 418 },
		{ width: 386, height: 778 },
	]);
	expect(half!.assignments[0]!.nodes[1]!.writes).toBe(route.assignments[0]!.nodes[1]!.writes);
	expect(nativeAppStyleSize(pages, style).targets.ios).toEqual({
		writeLists: 2,
		writeListReferences: 6,
	});
});

test('a sheet laid out at another pixel ratio than its page is refused by name', () => {
	const other = page('ShelfSheet0', 1);
	expect(() =>
		nativeAppStyle([
			{
				pattern: '/',
				exported: page('Shelf', 1),
				sheets: [
					{
						node: 'sheet:component-edge:1',
						snapPoint: 1,
						exported: { ...other, targets: { ios: { ...other.targets.ios!, dpr: 2 } } },
					},
				],
			},
		]),
	).toThrow("/: sheet:component-edge:1's ios export at 1 was laid out for another device");
});

test("the pages' system faces are listed once each by id, and one id rebuilt two ways is refused", () => {
	const ui = {
		id: 'system:system-ui:700',
		ios: { face: { kind: 'system', weight: 0.4, design: 'default' } },
		android: { file: 'Roboto-Regular.ttf', index: 0, axes: { wght: 700 }, sha256: 'a' },
	};
	const serif = {
		id: 'system:serif:400',
		ios: { face: { kind: 'name', postScriptName: 'TimesNewRomanPSMT' } },
	};
	const style = nativeAppStyle([
		{ pattern: '/', exported: { ...page('Home', 255), systemFonts: [ui, serif] } },
		{ pattern: '/about', exported: { ...page('About', 255), systemFonts: [ui] } },
	]);
	expect(style.systemFonts).toEqual([serif, ui]);
	expect(
		nativeAppStyle([{ pattern: '/', exported: page('Home', 255) }]).systemFonts,
	).toBeUndefined();
	expect(() =>
		nativeAppStyle([
			{ pattern: '/', exported: { ...page('Home', 255), systemFonts: [ui] } },
			{
				pattern: '/about',
				exported: {
					...page('About', 255),
					systemFonts: [{ ...ui, android: { ...ui.android, file: 'Other.ttf' } }],
				},
			},
		]),
	).toThrow('system face system:system-ui:700 is rebuilt two ways');
});

test("a page's slots ride on its route, and a page without them has none", () => {
	const slots = [{ id: 'slot:h0#0', initial: 25 }];
	const style = nativeAppStyle([
		{ pattern: '/', exported: { ...page('Home', 10), slots } },
		{ pattern: '/about', exported: page('About', 20) },
	]);
	const [home, about] = style.targets['ios']!.routes;
	expect(home!.slots).toEqual(slots);
	expect(about).not.toHaveProperty('slots');
});

test("a factored page's route keeps each table, its states written once, and the product, its nodes in the app's pool", () => {
	const exported = JSON.parse(
		readFileSync(new URL('../src/adapters/android/test/fixtures/state-groups.native-style.json', import.meta.url), 'utf8'),
	) as DragonStyleExport;
	const style = nativeAppStyle([{ pattern: '/', exported }]);
	for (const name of ['ios', 'android']) {
		const app = style.targets[name]!;
		const route = app.routes[0]! as unknown as {
			readonly groups: ReadonlyArray<{ readonly assignments: ReadonlyArray<{ readonly nodes: ReadonlyArray<number> }>; readonly interaction?: { readonly states: ReadonlyArray<{ readonly nodes: ReadonlyArray<number> }> } }>;
			readonly product: unknown;
			readonly plan: unknown;
		} & { readonly assignments: ReadonlyArray<{ readonly nodes: ReadonlyArray<number> }>; readonly interaction?: { readonly states: ReadonlyArray<{ readonly nodes: ReadonlyArray<number> }> } };
		const source = exported.targets[name]! as unknown as {
			readonly groups: ReadonlyArray<{ readonly assignments: ReadonlyArray<{ readonly nodes: ReadonlyArray<{ readonly writes: unknown }> }>; readonly interaction?: { readonly states: ReadonlyArray<{ readonly nodes: ReadonlyArray<{ readonly writes: unknown }> }> } }>;
			readonly product: unknown;
			readonly plan: unknown;
		} & { readonly assignments: ReadonlyArray<{ readonly nodes: ReadonlyArray<{ readonly writes: unknown }> }>; readonly interaction?: { readonly states: ReadonlyArray<{ readonly nodes: ReadonlyArray<{ readonly writes: unknown }> }> } };
		expect(route.product).toEqual(source.product);
		expect(route.plan).toEqual(source.plan);
		// Every node of every table, and of each table's interaction states, is the export's, through the app's pools.
		const expand = (index: number) => {
			const { writes, ...node } = app.nodes[index]!;
			return { ...node, writes: app.writes[writes as number] };
		};
		const tables = [[route, source] as const, ...route.groups.map((g, k) => [g, source.groups[k]!] as const)];
		expect(tables).toHaveLength(4);
		for (const [interned, original] of tables) {
			expect(interned.assignments.map((a) => a.nodes.map(expand))).toEqual(original.assignments.map((a) => a.nodes));
			expect((interned.interaction?.states ?? []).map((s) => s.nodes.map(expand))).toEqual((original.interaction?.states ?? []).map((s) => s.nodes));
		}
	}
});
