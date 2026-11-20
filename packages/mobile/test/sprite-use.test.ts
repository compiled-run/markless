import { describe, expect, it } from 'vitest';
import { compileNativeComponent, createNativeRuntime } from '../src/index.ts';
import { nodeScriptHost } from '../src/node-engine.ts';

// A `<use>` naming a symbol in a sprite the app serves, its path computed by app code: the build runs that code, reads the
// sprite and draws the symbol, as the web's server renders the href and the browser fetches the file.

const sprite = `<svg xmlns="http://www.w3.org/2000/svg">
<symbol id="leaf" viewBox="0 0 12 12"><path fill="#2a9d8f" d="M0 0h12v12z" /></symbol>
<symbol id="drop" viewBox="0 0 6 6"><circle cx="3" cy="3" r="3" fill="#264653" /></symbol>
</svg>`;
const files: Record<string, string> = {
	'site/base.ts': `export const siteBase = '/static/';
export function asset(path: string): string {
	return siteBase + path.replace(/^\\/+/, '');
}
`,
	'site/marks.ts': `export const MARKS = 'marks.svg';\n`,
};
const readModule = (specifier: string) => {
	const filename = `site/${specifier.replace('./', '')}`;
	return filename in files ? { filename, source: files[filename]! } : undefined;
};
const reads: string[] = [];
const readAsset = (path: string) => {
	reads.push(path);
	return path === '/static/marks.svg' ? sprite : undefined;
};
const build = (body: string) =>
	compileNativeComponent({
		filename: 'site/App.tsrx',
		source: `import { asset } from './base.ts';
import { MARKS } from './marks.ts';
${body}`,
		readModule,
		readAsset,
	});
const drawings = (payload: NonNullable<Awaited<ReturnType<typeof build>>['payload']>) =>
	payload.nodes.flatMap((node) =>
		node.kind === 'element' && node.drawing ? [node.drawing.shapes] : [],
	);

describe('a <use> of a sprite symbol whose href app code computes', () => {
	it('runs the code when the app is built and draws each symbol it names, in each component that names one', async () => {
		reads.length = 0;
		const { payload, diagnostics } = await build(`function Mark({ name }: { readonly name: string }) @{
	const marks = asset(MARKS) + '#';
	<svg viewBox="0 0 24 24" width="48" height="48"><use href={marks + name} /></svg>
}
export default function App() @{
	const marks = asset(MARKS) + '#';
	<main>
		<svg viewBox="0 0 24 24"><use href={marks + 'drop'} /></svg>
		<Mark name="leaf" />
		<Mark name="drop" />
	</main>
}`);
		expect(diagnostics).toEqual([]);
		expect(reads).toEqual(['/static/marks.svg']);
		expect(payload!.script).toBeUndefined();
		const [first, leaf, drop] = drawings(payload!);
		expect(first![0]).toMatchObject({
			fill: { r: 38, g: 70, b: 83, alpha: 255 },
			transform: [4, 0, 0, 4, 0, 0],
		});
		expect(leaf![0]).toMatchObject({
			fill: { r: 42, g: 157, b: 143, alpha: 255 },
			transform: [2, 0, 0, 2, 0, 0],
		});
		expect(drop![0]!.fill).toEqual(first![0]!.fill);
	});

	it('draws in each list row the symbol its own item names, and follows the rows as they move, leave or change', async () => {
		reads.length = 0;
		const { payload, diagnostics } = await build(`import { state } from '@markless/core';
const PLANTS = [
	{ name: 'fern', mark: 'leaf' },
	{ name: 'cactus', mark: 'drop' },
	{ name: 'skip', mark: 'none' },
].filter((plant) => plant.name !== 'skip');
export default function App() @{
	const marks = asset(MARKS) + '#';
	let shelf = state([{ id: 'x', mark: 'drop' }, { id: 'y', mark: 'leaf' }, { id: 'z', mark: 'drop' }]);
	<main>
		<ul>
			@for (const plant of PLANTS; key plant.name) {
				<li><svg viewBox="0 0 24 24" aria-label={plant.name}><use href={marks + plant.mark} /></svg></li>
			}
		</ul>
		<button onClick={() => (shelf = [...shelf].reverse())}>Flip</button>
		<button onClick={() => (shelf = shelf.slice(1))}>Drop first</button>
		<button onClick={() => (shelf = shelf.map((pot) => (pot.id === 'y' ? { ...pot, mark: 'drop' } : pot)))}>Repot</button>
		<ol>
			@for (const pot of shelf; key pot.id) {
				<li><svg viewBox="0 0 24 24"><use href={marks + pot.mark} /></svg></li>
			}
		</ol>
	</main>
}`);
		expect(diagnostics).toEqual([]);
		expect(new Set(reads)).toEqual(new Set(['/static/marks.svg']));
		const svgs = payload!.nodes.filter(
			(node): node is Extract<typeof node, { kind: 'element' }> =>
				node.kind === 'element' && node.element === 'svg',
		);
		expect(JSON.stringify(svgs.map((svg) => svg.bindings))).not.toContain('"script"');
		expect(svgs.map((svg) => Object.keys(svg.drawings!).sort())).toEqual([
			['/static/marks.svg#drop', '/static/marks.svg#leaf'],
			['/static/marks.svg#drop', '/static/marks.svg#leaf'],
		]);
		const leaf = svgs[0]!.drawings!['/static/marks.svg#leaf']!.shapes[0]!;
		const drop = svgs[0]!.drawings!['/static/marks.svg#drop']!.shapes[0]!;
		expect(leaf.fill).toEqual({ r: 42, g: 157, b: 143, alpha: 255 });
		expect(drop.fill).toEqual({ r: 38, g: 70, b: 83, alpha: 255 });

		const runtime = createNativeRuntime(payload!, new Map(), {}, undefined, undefined, nodeScriptHost());
		const hrefs = () =>
			Object.fromEntries(
				runtime
					.attributes()
					.filter(([node, name]) => name === 'href' && node.includes('@'))
					.map(([node, , value]) => [node, value]),
			);
		const [plants, pots] = svgs.map((svg) => svg.id);
		expect(hrefs()).toEqual({
			[`${plants}@fern`]: '/static/marks.svg#leaf',
			[`${plants}@cactus`]: '/static/marks.svg#drop',
			[`${pots}@x`]: '/static/marks.svg#drop',
			[`${pots}@y`]: '/static/marks.svg#leaf',
			[`${pots}@z`]: '/static/marks.svg#drop',
		});
		const button = (label: string) =>
			payload!.events[
				['Flip', 'Drop first', 'Repot'].indexOf(label)
			]!.host;
		const shelfRows = () => runtime.rows().find(([node]) => node !== payload!.nodes.find((n) => n.kind === 'repeat')!.id)![1];
		expect(runtime.dispatch({ event: 'activate', host: button('Flip') })).toEqual([
			expect.objectContaining({ op: 'rows', keys: ['z', 'y', 'x'] }),
		]);
		expect(shelfRows()).toEqual(['z', 'y', 'x']);
		expect(runtime.dispatch({ event: 'activate', host: button('Drop first') })).toEqual([
			expect.objectContaining({ op: 'rows', keys: ['y', 'x'] }),
		]);
		expect(runtime.dispatch({ event: 'activate', host: button('Repot') })).toEqual([
			{ op: 'attribute', node: `${pots}@y`, name: 'href', value: '/static/marks.svg#drop' },
		]);
	});

	it('refuses by name a row whose item names no symbol in the sprite, or a sprite the app does not serve', async () => {
		const { payload, diagnostics } = await build(`const ROWS = [{ id: 1, icon: 'leaf' }, { id: 2, icon: 'stem' }];
export default function App() @{
	const marks = asset(MARKS) + '#';
	<main>
		@for (const row of ROWS; key row.id) {
			<svg viewBox="0 0 24 24"><use href={marks + row.icon} /></svg>
		}
		<svg viewBox="0 0 24 24"><use href={asset('gone.svg') + '#leaf'} /></svg>
	</main>
}`);
		expect(payload).toBeNull();
		expect(diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
			'<use href="/static/marks.svg#stem">, which names nothing in /static/marks.svg',
			'<use href="/static/gone.svg#leaf">: the app serves no file at /static/gone.svg',
		]);
	});
});
