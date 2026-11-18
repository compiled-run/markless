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
	const tagIndex = (route: number) => ios.routes[route]!.assignments[0]!.nodes[1]!.writes;
	expect(tagIndex(0)).toBe(tagIndex(1));
	expect(ios.writes[tagIndex(0)]).toEqual(tag);
	expect(ios.routes.map((route) => route.pattern)).toEqual(['/', '/basil']);
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
