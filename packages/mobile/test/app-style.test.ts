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
	const tagIndex = (route: number) => ios.routes[route]!.assignments[0]!.nodes[1]!.writes;
	expect(tagIndex(0)).toBe(tagIndex(1));
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
