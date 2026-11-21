import { describe, expect, it } from 'vitest';
import { compileNativeComponent } from '../src/index.ts';

// A bound svg attribute whose value is fixed when the app is built is drawn as the web renders it.

const files: Record<string, string> = {
	'app/art.ts': `export const art = { size: 24, logos: { vite: 'M2 2 L22 2 L12 22 Z', node: 'M12 2 L22 12 L12 22 L2 12 Z' } };\n`,
	'app/Logo.tsrx': `import { art } from './art.ts';
export default function Logo({ mark }: { readonly mark: 'vite' | 'node' }) @{
	<svg viewBox={'0 0 ' + art.size + ' ' + art.size} width="24" height="24"><path d={art.logos[mark]} /></svg>
}
`,
};
const readModule = (specifier: string) => {
	const filename = `app/${specifier.replace('./', '')}`;
	return filename in files ? { filename, source: files[filename]! } : undefined;
};
const drawingsOf = (nodes: ReadonlyArray<{ readonly drawing?: unknown }>) =>
	nodes.flatMap((node) =>
		node.drawing ? [node.drawing as { viewBox: unknown; shapes: { path: number[] }[] }] : [],
	);

describe('a bound svg attribute fixed when the app is built', () => {
	it("draws each instance with its caller's prop and the module's constants", async () => {
		const { payload, diagnostics } = await compileNativeComponent({
			filename: 'app/App.tsrx',
			source: `import Logo from './Logo.tsrx';\nexport default function App() @{\n\t<main><Logo mark="vite" /><Logo mark="node" /></main>\n}\n`,
			readModule,
		});
		expect(diagnostics).toEqual([]);
		expect(
			drawingsOf(payload!.nodes).map((drawing) => [drawing.viewBox, drawing.shapes[0]!.path]),
		).toEqual([
			[
				[0, 0, 24, 24],
				[0, 2, 2, 1, 22, 2, 1, 12, 22, 4],
			],
			[
				[0, 0, 24, 24],
				[0, 12, 2, 1, 22, 12, 1, 12, 22, 1, 2, 12, 4],
			],
		]);
	});

	it('still refuses one that follows state', async () => {
		const { payload, diagnostics } = await compileNativeComponent({
			filename: 'app/App.tsrx',
			source: `import { state } from '@markless/core';\nexport default function App() @{\n\tlet d = state('M0 0 L1 1');\n\t<main><svg viewBox="0 0 2 2"><path d={d} /></svg><button onClick={() => (d = 'M1 1 L0 0')}>x</button></main>\n}\n`,
		});
		expect(payload).toBeNull();
		expect(diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
			'`d` on <path> follows state; a native drawing is compiled when the app is built',
		]);
	});
});
