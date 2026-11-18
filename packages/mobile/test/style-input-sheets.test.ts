import { join } from 'node:path';
import { expect, test } from 'vitest';
import { compileRungApp } from '../src/harness/rung.ts';
import { SHEET_AREAS } from '../src/sheet-areas.ts';
import { nativeStyleInputs } from '../src/style-input.ts';
import { compileNativeComponent } from '../src/compile.ts';

const proof = (folder: string) => join(import.meta.dirname, '..', 'proofs', folder);

test("a page's style inputs: the page without its sheet, then the sheet's content once per resting height", async () => {
	const build = await compileRungApp(proof('z3-sheet-size'), 'ios');
	const [route] = build.styleInputs;
	const sheet = build.payload!.routes[0]!.page.nodes.find((node) => node.kind === 'sheet')!;
	const content = build.payload!.routes[0]!.page.nodes.filter((node) => node.parent === sheet.id);
	expect(route!.input.nodes.map((node) => node.id)).not.toContain(content[0]!.id);
	expect(route!.input.viewports).toBeUndefined();
	expect(route!.sheets.map((entry) => [entry.node, entry.snapPoint])).toEqual([
		[sheet.id, 0.5],
		[sheet.id, 1],
	]);
	for (const entry of route!.sheets) {
		expect(entry.input.viewports).toEqual({
			ios: SHEET_AREAS.ios[entry.snapPoint as 0.5 | 1],
			android: SHEET_AREAS.android[entry.snapPoint as 0.5 | 1],
		});
		const top = entry.input.nodes.find((node) => node.id === content[0]!.id)!;
		expect(top.kind === 'element' && top.parent).toBe(sheet.parent);
		expect(entry.input.css).toBe(route!.input.css);
	}
});

test('a styled sheet lists only the styled cells its content reads', async () => {
	const build = await compileRungApp(proof('z5-sheet-state-style'), 'ios');
	const [route] = build.styleInputs;
	expect(route!.sheets[0]!.input.states.map((state) => state.cell)).toEqual(
		route!.input.states.map((state) => state.cell),
	);
	expect(route!.sheets[0]!.input.states).toHaveLength(1);
});

test('a styled sheet resting at a height not measured on both phones is refused by name', async () => {
	const build = await compileNativeComponent({
		filename: 'packages/mobile/test/fixtures/StyledSheetAtThird.tsrx',
		source: `import { state } from '@markless/core';
import { native, platform } from '@markless/device';

export default function App() @{
	let open = state(false);
	<main>
		<style>
			.box { padding: 8px; }
		</style>
		@if (!platform.web) {
			<native.sheet open={open} onChange={(next) => (open = next)} snapPoints={[0.3, 1]}>
				<p class="box">Inside</p>
			</native.sheet>
		}
	</main>
}`,
		target: 'ios',
	});
	expect(() => nativeStyleInputs(build.payload!, build.styles)).toThrow(
		'a styled system sheet rests at 0.3, but its content is laid out only at the heights measured on both phones (0.5 and 1)',
	);
});

test("a sheet's markup ancestors come along without boxes, for selectors and inherited values", async () => {
	const build = await compileRungApp(proof('z6-sheet-page-selectors'), 'ios');
	const page = build.payload!.routes[0]!.page;
	const sheet = page.nodes.find((node) => node.kind === 'sheet')!;
	const chain: string[] = [];
	for (let at = sheet.parent; at !== null; at = page.nodes.find((node) => node.id === at)!.parent)
		chain.unshift(at);
	const input = build.styleInputs[0]!.sheets[0]!.input;
	const boxless = input.nodes.flatMap((node) =>
		node.kind === 'element' && node.boxless ? [node.id] : [],
	);
	expect(boxless).toEqual(chain);
	expect(boxless.length).toBeGreaterThan(1);
	expect(build.styleInputs[0]!.input.nodes.some((node) => 'boxless' in node)).toBe(false);
});
