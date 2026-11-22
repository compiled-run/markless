import { join } from 'node:path';
import { expect, test } from 'vitest';
import { appStyleFonts, nativeAppStyle, type DragonStyleExport } from '../src/app-style.ts';
import { compileRungApp } from '../src/harness/rung.ts';
import { nativeStyleInputAt, stylesheetFonts } from '../src/style-input.ts';

const rung = 'packages/mobile/proofs/s9-web-font';

test("an app's @font-face files reach its style input: each url as the CSS spells it, resolved against its stylesheet", async () => {
	const build = await compileRungApp(join(import.meta.dirname, '..', 'proofs', 's9-web-font'));
	const [page] = build.styleInputs;
	expect(page!.input.fonts).toEqual([
		{ url: './fonts/Lato-Regular.ttf', file: `${rung}/styles/fonts/Lato-Regular.ttf` },
		{ url: './fonts/Lato-Bold.ttf', file: `${rung}/styles/fonts/Lato-Bold.ttf` },
	]);
});

test('only relative urls name files: a remote, data:, root-relative or local() source is left for Dragon to name', () => {
	const cssText = `@font-face { font-family: A; src: url(https://cdn.test/a.ttf), url(data:font/ttf;base64,AA==), url(/fonts/a.ttf), local(A), url('../fonts/My%20Face.ttf?v=2#x'); }
.x { background: url(./bg.png); }`;
	expect(stylesheetFonts([{ file: 'app/styles/app.css', cssText }])).toEqual([
		{ url: '../fonts/My%20Face.ttf?v=2#x', file: 'app/fonts/My Face.ttf' },
	]);
	expect(
		stylesheetFonts([
			{ file: '/abs/app/app.css', cssText: '@font-face { src: url(./a.ttf) }' },
		]),
	).toEqual([{ url: './a.ttf', file: '/abs/app/a.ttf' }]);
});

test('one url naming two files from two stylesheets is refused, since the joined CSS cannot tell them apart', () => {
	const face = '@font-face { font-family: A; src: url(./a.ttf) }';
	expect(() =>
		stylesheetFonts([
			{ file: 'one/app.css', cssText: face },
			{ file: 'two/app.css', cssText: face },
		]),
	).toThrow(
		'two/app.css and one/app.css both name the font url ./a.ttf, for two/a.ttf and one/a.ttf',
	);
	expect(
		stylesheetFonts([
			{ file: 'one/app.css', cssText: face },
			{ file: 'one/more.css', cssText: face },
		]),
	).toEqual([{ url: './a.ttf', file: 'one/a.ttf' }]);
});

test('a style input is written with each font file relative to it', () => {
	const input = {
		version: 'markless.native-style-input/0' as const,
		component: 'Almanac',
		nodes: [],
		css: '',
		states: [],
		fonts: [{ url: './fonts/a.ttf', file: 'app/styles/fonts/a.ttf' }],
	};
	expect(nativeStyleInputAt(input, (file) => `../${file}`).fonts).toEqual([
		{ url: './fonts/a.ttf', file: '../app/styles/fonts/a.ttf' },
	]);
	const { fonts: _, ...none } = input;
	expect(nativeStyleInputAt(none, () => 'unused')).toBe(none);
});

const exported = (fonts: DragonStyleExport['fonts']): DragonStyleExport => ({
	schema: 'dragon.native-style-export/1',
	units: 'px',
	compiler: 'digest',
	component: 'Almanac',
	warnings: [],
	fonts,
	targets: {},
});

test("the app's faces keep where each file is, the Dragon checkout or beside the style input; the shipped style names each by id and file", () => {
	const lato = { id: 'sha256:bb', file: 'styles/fonts/Lato-Regular.ttf', from: 'input' as const };
	const inter = { id: 'sha256:aa', file: 'vendor/fonts/Inter/Inter-Regular.ttf' };
	const pages = [
		{ pattern: '/', exported: exported([lato]) },
		{ pattern: '/more', exported: exported([inter, lato]) },
	];
	expect(appStyleFonts(pages)).toEqual([inter, lato]);
	expect(nativeAppStyle(pages).fonts).toEqual([inter, { id: lato.id, file: lato.file }]);
	expect(() =>
		appStyleFonts([
			{ pattern: '/', exported: exported([lato]) },
			{ pattern: '/more', exported: exported([{ id: lato.id, file: lato.file }]) },
		]),
	).toThrow('font sha256:bb names two files');
});

test('pages at different depths that share one web font give one face: Dragon decodes it beside each style input, and the id is its bytes', () => {
	const decoded = (dir: string) => ({
		id: 'sha256:cc',
		file: `${dir}dragon-decoded-fonts/cc.ttf`,
		from: 'input' as const,
	});
	const pages = [
		{ pattern: '/', exported: exported([decoded('native-style-input/')]) },
		{ pattern: '/tags', exported: exported([decoded('native-style-input/tags/')]) },
		{ pattern: '/notes/[id]', exported: exported([decoded('native-style-input/notes/[id]/')]) },
	];
	expect(appStyleFonts(pages)).toEqual([decoded('native-style-input/')]);
	expect(nativeAppStyle(pages).fonts).toEqual([
		{ id: 'sha256:cc', file: 'native-style-input/dragon-decoded-fonts/cc.ttf' },
	]);
});
