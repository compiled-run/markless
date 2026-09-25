import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import type { CaptureAnalysisArtifact, LinkedSymbolClaimManifest } from '../src/artifacts.ts';
import { linkedImportedSymbolInputs } from '../src/passes/link/module-link.ts';
import { emitSymbolResolverModule } from '../src/passes/symbol-resolver-module.ts';

type Compiled = Awaited<ReturnType<typeof compileTsrxModule>>;
type Module = { readonly file: string; readonly source: string };

function claimManifest(file: string, result: Compiled): LinkedSymbolClaimManifest {
	return {
		symbols: result.symbolResolver.symbols.map((symbol) => ({
			symbolId: symbol.id,
			exportName: `export_${symbol.id.replace(/\W/g, '_')}`,
			kind: symbol.kind,
			virtualModuleId: `virtual:markless:symbol:${file}:${symbol.id}`,
		})),
	};
}

// Compiles each module after the ones it imports, linking every edge into an earlier module.
async function compileLinked(modules: ReadonlyArray<Module & { readonly edges?: Readonly<Record<string, string>> }>) {
	const metadata = new Map<string, CaptureAnalysisArtifact>();
	const manifests = new Map<string, LinkedSymbolClaimManifest>();
	const compiled = new Map<string, Compiled>();
	const linked = new Map<string, ReturnType<typeof linkedImportedSymbolInputs>>();
	for (const module of modules) {
		const links = linkedImportedSymbolInputs({
			children: Object.entries(module.edges ?? {}).map(([edge, source]) => ({
				parent: module.file,
				specifier: source,
				source,
				externalized: false,
				componentEdgeId: edge,
			})),
			captureMetadataForSource: (source) => metadata.get(source),
			symbolClaimsForSource: (source) => manifests.get(source),
			claimsPublished: () => true,
		});
		const result = await compileTsrxModule({ filename: module.file, source: module.source, symbols: links.symbols });
		metadata.set(module.file, result.captureAnalysis);
		manifests.set(module.file, claimManifest(module.file, result));
		compiled.set(module.file, result);
		linked.set(module.file, links);
	}
	return { compiled, linked };
}

test('a bound row inside a keyed repeat names each edge by its host and instance segment', async () => {
	for (const [items, part, key] of [
		['Marks', 'Mark', 'entry'],
		['Chips', 'Chip', 'token'],
	] as const) {
		const { compiled } = await compileLinked([
			{
				file: `/k/${part}.tsrx`,
				source: `
import { state } from '@markless/core';
export function Frame({ children }) @{
	<section>{children}</section>
}
export function ${part}({ value, onPick }) @{
	const own = state({ value, hits: 0 });
	<button onClick={() => { own.hits = own.hits + 1; onPick?.(own.value); }}>{own.hits}</button>
}
`,
			},
			{
				file: `/k/page-${part}.tsrx`,
				source: `
import { state } from '@markless/core';
import { Frame, ${part} } from './${part}.tsrx';
function ${items}({ list }) @{
	<div>
		@for (const ${key} of list; key ${key}) {
			<${part} value={${key}} />
		}
	</div>
}
export default function Page() @{
	const list = state([1, 2]);
	<main><Frame><${items} list={list} /></Frame></main>
}
`,
				edges: { 'component-edge:0': `/k/${part}.tsrx`, 'component-edge:1': `/k/${part}.tsrx` },
			},
		]);
		const page = compiled.get(`/k/page-${part}.tsrx`)!;
		const row = page.captureAnalysis.boundResolverRows!.find((candidate) =>
			candidate.ancestry.some((entry) => entry.keyedRepeatScopeIds.length > 0),
		)!;
		// Host ids spell the part by its place among its parent's edges; instance paths by module edge and projection.
		expect(row.instancePath).toBe('c1:p2:c0:');
		expect(row.rowPieces).toEqual([
			['c1:', 'c1:p2:', 0],
			['c0:', 'c0:', 1],
		]);
	}
});

test('only a resolver holding a keyed bound row places rows per dispatch', () => {
	const row = {
		id: 'bound:symbol%3A0:component-edge%3A2/component-edge%3A0[b=;k=repeat%3A0]',
		baseSymbolId: 'symbol:0',
		instancePath: 'c1:p2:c0:',
		componentEdgePath: ['component-edge:2', 'component-edge:0'],
		ancestry: [],
		captureSlots: [],
	};
	const symbols = [{ id: 'symbol:0', chunk: 'virtual:markless:symbol:0', exportName: 'own' }];
	const keyed = emitSymbolResolverModule({
		symbols,
		boundSymbols: [{ ...row, rowPieces: [['c1:', 'c1:p2:', 0], ['c0:', 'c0:', 1]] }],
	});
	const flat = emitSymbolResolverModule({ symbols, boundSymbols: [row] });

	expect(keyed).toContain("import { marklessRowBoundGraphNodeId, marklessRowBoundPath } from '@markless/web/fns/row-bound-path';");
	expect(keyed).toContain('marklessRowBoundPath(bound, context.graph)');
	expect(keyed).toContain('"rowPieces":[["c1:","c1:p2:",0],["c0:","c0:",1]]');
	expect(flat).not.toContain('row-bound-path');
	expect(flat).not.toContain('rowedPath');
});

test('a derive reads the prop of the component that declared it when module-mates share the prop name', async () => {
	const { compiled } = await compileLinked([
		{
			file: '/d/chain.tsrx',
			source: `
import { computed } from '@markless/core';
import { twice } from './twice.ts';
function Tail({ seed }) @{
	<i>{seed}</i>
}
function Inner({ seed, input }) @{
	const inner = computed(() => twice(input));
	<div><output>{inner}</output><Tail seed={seed} /></div>
}
export default function Outer({ seed }) @{
	const outer = computed(() => twice(seed));
	<section><output>{outer}</output><Inner seed={seed} input={outer} /></section>
}
`,
		},
	]);
	const chain = compiled.get('/d/chain.tsrx')!;
	const derive = chain.captureAnalysis.extractedSymbols.find(
		(symbol) => symbol.kind === 'sync-computed-derive' && symbol.source.includes('twice(seed)'),
	)!;
	expect(derive.captureSlots.map((slot) => slot.owner.componentName)).toEqual(['Outer']);
	expect(chain.captureAnalysis.boundResolverRows!.some((row) => row.baseSymbolId === derive.symbolId)).toBe(false);
});

test('a derive whose prop passes through a module is bound by the module that owns the value', async () => {
	const { compiled, linked } = await compileLinked([
		{
			file: '/p/leaf.tsrx',
			source: `
import { computed } from '@markless/core';
import { summed } from './sum.ts';
export default function Leaf({ base, seed }) @{
	const total = computed(() => summed(base, seed));
	<output>{total}</output>
}
`,
		},
		{
			file: '/p/relay.tsrx',
			source: `
import { computed } from '@markless/core';
import Leaf from './leaf.tsrx';
import { summed } from './sum.ts';
function Hop({ seed }) @{
	const base = computed(() => summed(100, seed));
	<section><output>{base}</output><Leaf base={base} seed={seed} /></section>
}
export default function Relay({ seed }) @{
	<Hop seed={seed} />
}
`,
			edges: { 'component-edge:0': '/p/leaf.tsrx' },
		},
		{
			file: '/p/page.tsrx',
			source: `
import { state } from '@markless/core';
import Relay from './relay.tsrx';
export default function Page() @{
	let seed = state(1);
	<main><button onClick={() => seed++}>b</button><Relay seed={seed} /></main>
}
`,
			edges: { 'component-edge:0': '/p/relay.tsrx' },
		},
	]);
	const page = compiled.get('/p/page.tsrx')!;
	const republished = linked
		.get('/p/page.tsrx')!
		.symbols.filter((claim) => claim.id.includes(':bound:'));
	// Both derives reach the page as rows the relay republished, owned by the relay's root.
	expect(republished.map((claim) => [claim.captureSymbol?.kind, claim.ownerComponentName])).toEqual([
		['sync-computed-derive', 'Relay'],
		['sync-computed-derive', 'Relay'],
	]);
	// Hop's own claim is not the page's to bind: the edge places Relay, which renders Hop.
	const rows = page.captureAnalysis.boundResolverRows!.map((row) => [
		row.instancePath,
		row.captureSlots.map((slot) => ('graphNodeId' in slot.route ? slot.route.graphNodeId : slot.route.kind)),
	]);
	expect(rows).toEqual([
		['c0:c1:', ['state:seed']],
		['c0:c1:c0:', ['c0:c1:computed:base', 'state:seed']],
	]);
	expect(
		page.captureAnalysis.boundResolverRows!.every((row) =>
			row.captureSlots.every((slot) => slot.route.kind !== 'passthrough-route'),
		),
	).toBe(true);
});

test('a module exporting several components offers a claim only to the edge placing its owner', async () => {
	const { compiled, linked } = await compileLinked([
		{
			file: '/m/parts.tsrx',
			source: `
import { state } from '@markless/core';
function Knob({ onTurn }) @{
	<button onClick={() => onTurn('knob')}>knob</button>
}
export function Panel({ onTurn }) @{
	<div><Knob onTurn={onTurn} /></div>
}
export function Badge({ label, onTap }) @{
	<span onClick={() => onTap(label)}>{label}</span>
}
`,
		},
		{
			file: '/m/page.tsrx',
			source: `
import { state } from '@markless/core';
import { Badge, Panel } from './parts.tsrx';
export default function Page() @{
	let last = state('');
	<main>
		<Badge label="b" onTap={(value) => (last = value)} />
		<Panel onTurn={(value) => (last = value)} />
		<output>{last}</output>
	</main>
}
`,
			edges: { 'component-edge:0': '/m/parts.tsrx', 'component-edge:1': '/m/parts.tsrx' },
		},
	]);
	const page = compiled.get('/m/page.tsrx')!;
	expect(linked.get('/m/page.tsrx')!.symbols.find((claim) => claim.ownerComponentName === 'Knob')).toEqual(
		expect.objectContaining({ moduleComponentNames: ['Knob', 'Panel', 'Badge'] }),
	);
	// Knob renders only inside Panel: its claim binds as Panel's republished row, under Knob's place in Panel, and never on Badge's edge.
	expect(
		page.captureAnalysis.boundResolverRows!.map((row) => [
			row.componentEdgePath.join('/'),
			row.baseSymbolId.replace(/^imported:[^:]*:/, ''),
			row.instancePath,
		]),
	).toEqual([
		['component-edge:0', 'symbol:1', 'c0:'],
		['component-edge:1', 'bound:symbol%3A0:component-edge%3A0', 'c1:c0:'],
	]);
	expect(page.captureAnalysis.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
});
