import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileTsrxModule } from '../../../../packages/compiler/src/index.ts';
import { drawing } from './inspector.ts';
import { EDGES, NODES, type NodeKey, PLAYER_SOURCE, reachOf, shownNodes } from './model.ts';

const sceneArt = drawing();
const page = readFileSync(new URL('../../../pages/how-it-works/state-graph.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./graph-anatomy.tsrx', import.meta.url), 'utf8');
const compiled = await compileTsrxModule({ filename: '/player.tsrx', source: PLAYER_SOURCE, symbols: [] });

describe('the state-graph figure draws the real graph', () => {
	it('compiles player.tsrx cleanly', () => {
		const errors = [compiled.semanticGraph.diagnostics, compiled.captureAnalysis.diagnostics, compiled.publicRenderModule.diagnostics].flat().filter((d) => d?.severity === 'error');
		expect(errors).toEqual([]);
	});

	it('has exactly the edges the compiler records, and no invented ones', () => {
		const graph = compiled.semanticGraph;
		const keyOfId = (id: string) => (Object.keys(NODES) as NodeKey[]).find((key) => NODES[key].id === id);
		const bindings = graph.graphBindings.filter((b) => b.kind === 'state' || b.kind === 'computed');
		const real = new Set<string>();
		for (const binding of bindings)
			for (const dep of (binding as { dependencies?: { graphNodeId: string }[] }).dependencies ?? []) {
				const from = keyOfId(dep.graphNodeId);
				const to = keyOfId(binding.id);
				if (from && to) real.add(from + '-' + to);
			}
		for (const read of graph.templateReads) {
			const reader = keyOfId(read.hostNodeId + ' ' + ((read.target as { name?: string }).name ?? read.target.kind));
			if (!reader) continue;
			for (const binding of bindings) if (new RegExp(`\\b${binding.name}\\b`).test(read.source)) real.add(keyOfId(binding.id) + '-' + reader);
		}
		expect([...real].sort()).toEqual(EDGES.map((edge) => edge.key).sort());
	});

	it('branches: one state feeds several nodes, and one computed reads two states', () => {
		expect(EDGES.filter((edge) => edge.from === 'playing')).toHaveLength(4);
		expect(EDGES.filter((edge) => edge.to === 'isLiked').map((edge) => edge.from).sort()).toEqual(['liked', 'playing']);
		const all = shownNodes({ header: true, heart: true, cover: true, knob: true, heading: true });
		expect(reachOf('playing', all)).toBe(4);
		expect(reachOf('liked', all)).toBe(1);
		expect(reachOf('volume', all)).toBe(1);
		expect(reachOf('playing', shownNodes({ header: false, heart: false, cover: false, knob: false, heading: true }))).toBe(1);
	});
});

describe('the state-graph figure', () => {
	it('draws the same scene every time, laid out in three columns', () => {
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(sceneArt));
		expect(new Set(sceneArt.nodes.map((node) => node.column))).toEqual(new Set([0, 1, 2]));
		expect(sceneArt.edges).toHaveLength(EDGES.length);
	});

	it('has a live region, keys and Escape, and no counters', () => {
		expect(piece).toContain('aria-live="polite"');
		expect(piece).not.toMatch(/bags|counter/i);
		expect(piece).toContain("event.key === 'Escape'");
		expect(piece).toContain('onPointerover');
		expect(piece).toContain('describeDrop');
	});

	it('is on the State graph page, which shows the same player.tsrx', () => {
		expect(page).toContain("from '../../components/figures/state-graph/graph-anatomy.tsrx';");
		expect(page).toContain('const isLiked = computed(() => liked.has(playing));');
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by inspector.test.ts from inspector.ts. Run the figure test with -u to refresh.
import type { drawing } from './inspector.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(sceneArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./inspector.art.ts');
	});
});
