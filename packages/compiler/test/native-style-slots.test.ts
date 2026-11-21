import { describe, expect, it } from 'vitest';
import type { SemanticGraphArtifact } from '../src/artifacts.ts';
import { createNativeViewPayload, NATIVE_FACT_COLLECTORS } from '../src/native.ts';
import { buildSemanticGraph } from '../src/passes/semantic-graph/index.ts';

const analyze = (filename: string, source: string) =>
	buildSemanticGraph({ filename, source, nativeFacts: NATIVE_FACT_COLLECTORS });

/** The build of src/App.tsrx with other modules: `files` by name, resolved from `./name`. */
const build = async (source: string, files: Record<string, string> = {}) => {
	const graphs = new Map<string, SemanticGraphArtifact>();
	for (const [name, text] of Object.entries(files))
		graphs.set(`src/${name}`, await analyze(`src/${name}`, text));
	return createNativeViewPayload(await analyze('src/App.tsrx', source), {
		readSource: (file) => (file === 'src/App.tsrx' ? source : files[file.replace('src/', '')]),
		modules: { graphs, resolve: (specifier) => `src/${specifier.replace('./', '')}` },
	});
};

const styled = (payload: Awaited<ReturnType<typeof build>>['payload']) =>
	payload?.nodes.flatMap((node) =>
		node.kind === 'element' && node.style ? [[node.id, node.style] as const] : [],
	);

describe('a style that follows state', () => {
	it('is its text with each number a slot of state, in the order the text reads them', async () => {
		const { payload, diagnostics } =
			await build(`import { computed, state } from '@markless/core';
export default function App() @{
	let at = state(25);
	const thumb = computed(() => \`--at: \${at}%; order: \${Math.round(at / 10)}\`);
	<main>
		<div style={thumb}>Thumb</div>
		<button onClick={() => (at = at + 12.5)}>Move</button>
	</main>
}`);
		expect(diagnostics).toEqual([]);
		expect(styled(payload)).toEqual([
			['h1', ['--at: ', { slot: 'slot:h1#0' }, '%; order: ', { slot: 'slot:h1#1' }]],
		]);
		expect(payload?.slots).toEqual([
			{ id: 'slot:h1#0', value: { cell: 'state:at' } },
			{
				id: 'slot:h1#1',
				value: {
					call: 'Math.round',
					arguments: [
						{ binary: '/', left: { cell: 'state:at' }, right: { literal: 10 } },
					],
				},
				integer: true,
			},
		]);
	});

	it('reads through a helper module as the web runs it, so a number it formats is still a hole', async () => {
		const { payload, diagnostics } = await build(
			`import { computed, state } from '@markless/core';
import { offsetStyle } from './geometry.ts';
export default function App() @{
	let value = state(3);
	const offset = computed(() => offsetStyle(value, 0, 8));
	<main><span style={offset}>Knob</span></main>
}`,
			{
				'geometry.ts': `function percentOf(value: number, min: number, max: number): string {
	return \`\${Math.round(((value - min) / (max - min)) * 10000) / 100}%\`;
}
export function offsetStyle(value: number, min: number, max: number): string {
	return \`--offset: \${percentOf(value, min, max)}\`;
}
`,
			},
		);
		expect(diagnostics).toEqual([]);
		expect(styled(payload)).toEqual([['h1', ['--offset: ', { slot: 'slot:h1#0' }, '%']]]);
		expect(payload?.slots?.length).toBe(1);
	});

	it('is a style attribute that follows a styled state when it is one of fixed texts', async () => {
		const { payload, diagnostics } =
			await build(`import { computed, state } from '@markless/core';
export default function App() @{
	let wide = state(false);
	const size = computed(() => (wide ? 'width: 100%' : 'width: 50%'));
	<main><div style={size}>Box</div><button onClick={() => (wide = !wide)}>Toggle</button></main>
}`);
		expect(diagnostics).toEqual([]);
		const box = payload?.nodes.find((node) => node.id === 'h1');
		expect(box?.kind === 'element' && box.bindings).toEqual([
			{
				attribute: 'style',
				value: {
					if: { cell: 'state:wide' },
					whenTrue: { literal: 'width: 100%' },
					whenFalse: { literal: 'width: 50%' },
				},
			},
		]);
		expect(payload?.cells.find((cell) => cell.id === 'state:wide')?.styled).toBe(true);
	});

	it('is a style case when it is a template while a condition holds and empty text otherwise', async () => {
		const { payload, diagnostics } =
			await build(`import { computed, state } from '@markless/core';
export default function App() @{
	let point = state<{ x: number } | null>(null);
	const place = computed(() => (point === null ? '' : \`--x: \${point.x}px\`));
	<main><div style={place}>Box</div><button onClick={() => (point = { x: 4 })}>Open</button></main>
}`);
		expect(diagnostics).toEqual([]);
		const box = payload?.nodes.find((node) => node.kind === 'element' && node.style);
		expect(box).toMatchObject({
			style: ['--x: ', { slot: 'slot:h1#0' }, 'px'],
			styleWhen: { case: 'case:h1', value: false },
		});
		expect(payload?.styleCases).toEqual([
			{
				id: 'case:h1',
				value: { binary: '===', left: { cell: 'state:point' }, right: { literal: null } },
			},
		]);
		expect(payload?.slots).toEqual([
			{
				id: 'slot:h1#0',
				value: { member: { cell: 'state:point' }, property: 'x' },
				when: { case: 'case:h1', value: false },
			},
		]);
	});

	it('is an attribute by state when it is a fixed text or absent, or a template of fixed texts chosen by state', async () => {
		const { payload, diagnostics } =
			await build(`import { computed, state } from '@markless/core';
export default function App() @{
	let low = state(false);
	const place = computed(() => (low ? 'top: 240px;' : undefined));
	const second = computed(() => \`\${low ? 'top: 270px; ' : ''}left: 8px;\`);
	<main><div style={place}>A</div><div style={second}>B</div><button onClick={() => (low = !low)}>Swap</button></main>
}`);
		expect(diagnostics).toEqual([]);
		const styled = payload!.nodes.flatMap((node) =>
			node.kind === 'element'
				? (node.bindings ?? []).filter(
						(binding) => 'attribute' in binding && binding.attribute === 'style',
					)
				: [],
		);
		expect(styled).toHaveLength(2);
		expect(payload!.slots).toBeUndefined();
		expect(payload!.cells.find((cell) => cell.id === 'state:low')?.styled).toBe(true);
	});

	it('is refused by name when its text, not only its numbers, follows state', async () => {
		const { payload, diagnostics } =
			await build(`import { computed, state } from '@markless/core';
export default function App() @{
	let at = state(0);
	const size = computed(() => (at > 3 ? \`width: \${at}px\` : \`height: \${at}px\`));
	<main><div style={size}>Box</div><button onClick={() => (at = at + 1)}>Grow</button></main>
}`);
		expect(payload).toBeNull();
		expect(diagnostics.map((d) => d.message)).toContain(
			'a `style` that follows state whose text is not known when the app is built (only numbers in it may follow state)',
		);
	});

	it('is refused by name inside a @for row, which Dragon lays out once for every row', async () => {
		const { payload, diagnostics } = await build(`import { state } from '@markless/core';
export default function App() @{
	let rows = state([{ id: 'a', at: 10 }]);
	<main>
		@for (const row of rows; key row.id) {
			<div style={\`--at: \${row.at}%\`}>Row</div>
		}
	</main>
}`);
		expect(payload).toBeNull();
		expect(diagnostics.map((d) => d.message)).toContain(
			'a `style` that follows state inside a @for row, which Dragon lays out once for every row',
		);
	});
});
