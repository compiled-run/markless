import { describe, expect, it } from 'vitest';
import { compileNativeComponent } from '../src/index.ts';

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

	it('refuses by name an href that names a symbol from its @for row, or a sprite the app does not serve', async () => {
		const { payload, diagnostics } = await build(`const ROWS = [{ id: 1, icon: 'leaf' }, { id: 2, icon: 'drop' }];
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
			'`href` on <use> follows its @for row; a native drawing is compiled once for every row, so a row cannot name its own symbol yet',
			'<use href="/static/gone.svg#leaf">: the app serves no file at /static/gone.svg',
		]);
	});
});
