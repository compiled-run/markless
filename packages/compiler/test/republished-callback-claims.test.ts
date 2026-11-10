import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import type { CaptureAnalysisArtifact, LinkedSymbolClaimManifest } from '../src/artifacts.ts';
import { linkedImportedSymbolInputs } from '../src/passes/link/module-link.ts';

type Compiled = Awaited<ReturnType<typeof compileTsrxModule>>;

function claimManifest(source: string, result: Compiled): LinkedSymbolClaimManifest {
	return {
		symbols: result.symbolResolver.symbols.map((symbol) => ({
			symbolId: symbol.id,
			exportName: `export_${symbol.id.replace(/\W/g, '_')}`,
			kind: symbol.kind,
			virtualModuleId: `virtual:markless:symbol:${source}:${symbol.id}`,
		})),
	};
}

// Compiles leaf -> middle -> top, linking each parent through the module linker.
async function compileChain(shape: {
	readonly leaf: { readonly file: string; readonly source: string };
	readonly middle: { readonly file: string; readonly source: string };
	readonly top: { readonly file: string; readonly source: string };
	readonly topLeafEdgeIds: ReadonlyArray<string>;
	readonly topMiddleEdgeId: string;
	readonly spelling?: {
		readonly moduleIdForSource: (source: string) => string;
		readonly sourceForModuleId: (moduleId: string) => string;
	};
}) {
	const metadata = new Map<string, CaptureAnalysisArtifact>();
	const manifests = new Map<string, LinkedSymbolClaimManifest>();
	const link = (children: ReadonlyArray<{ readonly source: string; readonly edge: string }>, parent: string) =>
		linkedImportedSymbolInputs({
			children: children.map((child) => ({
				parent,
				specifier: child.source,
				source: child.source,
				externalized: false,
				componentEdgeId: child.edge,
			})),
			captureMetadataForSource: (source) => metadata.get(source),
			symbolClaimsForSource: (source) => manifests.get(source),
			claimsPublished: () => true,
			...shape.spelling,
		});
	const leaf = await compileTsrxModule({ filename: shape.leaf.file, source: shape.leaf.source, symbols: [] });
	metadata.set(shape.leaf.file, leaf.captureAnalysis);
	manifests.set(shape.leaf.file, claimManifest(shape.leaf.file, leaf));
	const middle = await compileTsrxModule({
		filename: shape.middle.file,
		source: shape.middle.source,
		symbols: link([{ source: shape.leaf.file, edge: 'component-edge:0' }], shape.middle.file).symbols,
	});
	metadata.set(shape.middle.file, middle.captureAnalysis);
	const topLinked = link(
		[
			...shape.topLeafEdgeIds.map((edge) => ({ source: shape.leaf.file, edge })),
			{ source: shape.middle.file, edge: shape.topMiddleEdgeId },
		],
		shape.top.file,
	);
	const top = await compileTsrxModule({
		filename: shape.top.file,
		source: shape.top.source,
		symbols: topLinked.symbols,
	});
	return { leaf, middle, top, topLinked };
}

test('a callback forwarded through a middle module is bound by the module that owns it', async () => {
	for (const [leafName, middleName, prop, marker, leafFile, middleFile, topFile] of [
		['Picker', 'Relay', 'onPick', '!', '/w/src/picker.tsrx', '/w/src/relay.tsrx', '/w/src/page.tsrx'],
		['Chip', 'Tray', 'onChoose', '?', '/x/parts/chip.tsrx', '/x/parts/tray.tsrx', '/x/app.tsrx'],
	] as const) {
		const { middle, top, topLinked } = await compileChain({
			leaf: {
				file: leafFile,
				source: `
export function ${leafName}({ ${prop}, label }) @{
	<button type="button" onClick={() => ${prop}('${marker}')}>{label}</button>
}
`,
			},
			middle: {
				file: middleFile,
				source: `
import { ${leafName} } from '${leafFile}';

export function ${middleName}({ ${prop} }) @{
	<div>
		<${leafName} label="inner" ${prop}={${prop}} />
	</div>
}
`,
			},
			top: {
				file: topFile,
				source: `
import { state } from '@markless/core';
import { ${leafName} } from '${leafFile}';
import { ${middleName} } from '${middleFile}';

export function Top() @{
	let direct = state(0);
	let forwarded = state('');
	<section>
		<${leafName} label="direct" ${prop}={() => (direct = direct + 1)} />
		<${middleName} ${prop}={(mark) => (forwarded = forwarded + mark)} />
	</section>
}
`,
			},
			topLeafEdgeIds: ['component-edge:0'],
			topMiddleEdgeId: 'component-edge:1',
		});
		const middleRow = middle.captureAnalysis.boundResolverRows!.find((row) =>
			row.captureSlots.some((slot) => slot.route.kind === 'passthrough-route'),
		)!;
		const republished = topLinked.symbols.find((symbol) => symbol.componentEdgeId === 'component-edge:1')!;
		expect(republished).toEqual(
			expect.objectContaining({
				id: `imported:${encodeURIComponent(middleFile)}:${middleRow.id}`,
				chunk: `virtual:markless:symbol:${leafFile}:${middleRow.baseSymbolId.replace(/^imported:[^:]*:/, '')}`,
				ownerComponentName: middleName,
			}),
		);
		const topRow = top.captureAnalysis.boundResolverRows!.find(
			(row) => row.loaderSymbolId === republished.id,
		);
		expect(topRow?.captureSlots.map((slot) => slot.route.kind)).toEqual(['callback-route']);
		expect(topRow?.instancePath).toBe(`c1:${middleRow.instancePath}`);
		expect(top.captureAnalysis.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
	}
});

test('a forwarded claim that also reads the middle module state reads it under the middle instance', async () => {
	const { middle, top } = await compileChain({
		leaf: {
			file: '/w/src/leaf.tsrx',
			source: `
export function Leaf({ onPick, label }) @{
	<button type="button" onClick={() => onPick(label)}>{label}</button>
}
`,
		},
		middle: {
			file: '/w/src/holder.tsrx',
			source: `
import { state } from '@markless/core';
import { Leaf } from '/w/src/leaf.tsrx';

export function Holder({ onPick }) @{
	let label = state('held');
	<Leaf label={label} onPick={onPick} />
}
`,
		},
		top: {
			file: '/w/src/top.tsrx',
			source: `
import { Holder } from '/w/src/holder.tsrx';

export function Top() @{
	<Holder onPick={(mark) => console.log(mark)} />
}
`,
		},
		topLeafEdgeIds: [],
		topMiddleEdgeId: 'component-edge:0',
	});
	const middleRead = middle.captureAnalysis
		.boundResolverRows!.flatMap((row) => row.captureSlots)
		.find((slot) => slot.route.kind === 'graph-reference')!.route as { readonly graphNodeId: string };
	const topRow = top.captureAnalysis.boundResolverRows!.find((row) =>
		row.captureSlots.some((slot) => slot.route.kind === 'callback-route'),
	)!;
	expect(
		topRow.captureSlots.flatMap((slot) =>
			slot.route.kind === 'graph-reference' ? [slot.route.graphNodeId] : [],
		),
	).toEqual([`c0:${middleRead.graphNodeId}`]);
});

test('a forwarded claim that also runs a middle module callback stays with the middle module', async () => {
	const { topLinked } = await compileChain({
		leaf: {
			file: '/w/src/pair.tsrx',
			source: `
export function Pair({ onPick, onDone }) @{
	<button type="button" onClick={() => { onPick('a'); onDone(); }}>pair</button>
}
`,
		},
		middle: {
			file: '/w/src/pairs.tsrx',
			source: `
import { state } from '@markless/core';
import { Pair } from '/w/src/pair.tsrx';

export function Pairs({ onPick }) @{
	let done = state(0);
	<Pair onPick={onPick} onDone={() => (done = done + 1)} />
}
`,
		},
		top: {
			file: '/w/src/top.tsrx',
			source: `
import { Pairs } from '/w/src/pairs.tsrx';

export function Top() @{
	<Pairs onPick={(mark) => console.log(mark)} />
}
`,
		},
		topLeafEdgeIds: [],
		topMiddleEdgeId: 'component-edge:0',
	});
	expect(topLinked.symbols.filter((symbol) => symbol.id.includes('bound'))).toEqual([]);
});

test('claim ids spell sources through the caller spelling and still bind republished rows', async () => {
	const root = '/checkout/app/';
	const { middle, top, topLinked } = await compileChain({
		leaf: {
			file: `${root}src/picker.tsrx`,
			source: `
export function Picker({ onPick, label }) @{
	<button type="button" onClick={() => onPick('!')}>{label}</button>
}
`,
		},
		middle: {
			file: `${root}src/relay.tsrx`,
			source: `
import { Picker } from '${root}src/picker.tsrx';

export function Relay({ onPick }) @{
	<div><Picker label="inner" onPick={onPick} /></div>
}
`,
		},
		top: {
			file: `${root}src/page.tsrx`,
			source: `
import { state } from '@markless/core';
import { Relay } from '${root}src/relay.tsrx';

export function Top() @{
	let forwarded = state('');
	<section><Relay onPick={(mark) => (forwarded = forwarded + mark)} /></section>
}
`,
		},
		topLeafEdgeIds: [],
		topMiddleEdgeId: 'component-edge:0',
		spelling: {
			moduleIdForSource: (source) => source.slice(root.length),
			sourceForModuleId: (moduleId) => `${root}${moduleId}`,
		},
	});
	const middleRow = middle.captureAnalysis.boundResolverRows!.find((row) =>
		row.captureSlots.some((slot) => slot.route.kind === 'passthrough-route'),
	)!;
	const republished = topLinked.symbols.find((symbol) => symbol.componentEdgeId === 'component-edge:0')!;
	expect(republished.id).toBe(`imported:${encodeURIComponent('src/relay.tsrx')}:${middleRow.id}`);
	expect(republished.chunk).toContain(`${root}src/picker.tsrx`);
	expect(JSON.stringify(topLinked.symbols.map((symbol) => symbol.id))).not.toContain('checkout');
	expect(top.captureAnalysis.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
});

test('an async recipe reading a prop its middle module forwards is bound by the module that owns the value', async () => {
	for (const [leafName, middleName, prop, leafFile, middleFile, topFile, row] of [
		[
			'Detail',
			'List',
			'reload',
			'/w/src/detail.tsrx',
			'/w/src/list.tsrx',
			'/w/src/page.tsrx',
			false,
		],
		[
			'Quote',
			'Board',
			'round',
			'/x/parts/quote.tsrx',
			'/x/parts/board.tsrx',
			'/x/app.tsrx',
			true,
		],
	] as const) {
		const placed = `<${leafName} id="a" ${prop}={${prop}} />`;
		const { middle, top, topLinked } = await compileChain({
			leaf: {
				file: leafFile,
				source: `
import { computed } from '@markless/core';

export function ${leafName}({ id, ${prop} }) @{
	const text = computed(async () => await Promise.resolve(id + ${prop}));
	<p>
		@try {
			<span>{text}</span>
		} @pending {
			<span>wait</span>
		}
	</p>
}
`,
			},
			middle: {
				file: middleFile,
				source: `
import { state } from '@markless/core';
import { ${leafName} } from '${leafFile}';

export function ${middleName}({ ${prop} }) @{
	let open = state(['a']);
	<div>
		${row ? `@for (const key of open; key key) {\n\t\t\t${placed}\n\t\t}` : placed}
	</div>
}
`,
			},
			top: {
				file: topFile,
				source: `
import { state } from '@markless/core';
import { ${middleName} } from '${middleFile}';

export function Top() @{
	let ${prop} = state(0);
	<section>
		<button onClick={() => ${prop}++}>again</button>
		<${middleName} ${prop}={${prop}} />
	</section>
}
`,
			},
			topLeafEdgeIds: [],
			topMiddleEdgeId: 'component-edge:0',
		});
		const middleRow = middle.captureAnalysis.boundResolverRows!.find((candidate) =>
			candidate.captureSlots.some((slot) => slot.route.kind === 'passthrough-route'),
		)!;
		expect(middleRow).toBeDefined();
		const republished = topLinked.symbols.find(
			(symbol) => symbol.componentEdgeId === 'component-edge:0',
		);
		expect(republished?.id).toBe(`imported:${encodeURIComponent(middleFile)}:${middleRow.id}`);
		const topRow = top.captureAnalysis.boundResolverRows!.find(
			(candidate) => candidate.loaderSymbolId === republished!.id,
		);
		expect(
			topRow?.captureSlots.flatMap((slot) =>
				slot.route.kind === 'graph-reference' ? [slot.route.graphNodeId] : [],
			),
		).toEqual([`state:${prop}`]);
		expect(top.captureAnalysis.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
	}
});

test('an async recipe reading a prop that a row item hands its middle module stays with the middle module', async () => {
	const { topLinked, top } = await compileChain({
		leaf: {
			file: '/w/src/figure.tsrx',
			source: `
import { computed } from '@markless/core';

export function Figure({ range, reload }) @{
	const value = computed(async () => await Promise.resolve(range + reload));
	<p>
		@try {
			<span>{value}</span>
		} @pending {
			<span>wait</span>
		}
	</p>
}
`,
		},
		middle: {
			file: '/w/src/board.tsrx',
			source: `
import { state } from '@markless/core';
import { Figure } from '/w/src/figure.tsrx';

export function Board({ reload }) @{
	let range = state('7d');
	<Figure range={range} reload={reload} />
}
`,
		},
		top: {
			file: '/w/src/card.tsrx',
			source: `
import { computed, state } from '@markless/core';
import { Board } from '/w/src/board.tsrx';

export function Card() @{
	let run = state(0);
	let reload = state(0);
	const runs = computed(() => [{ run, reload }]);
	<div>
		@for (const item of runs; key item.run) {
			<Board reload={item.reload} />
		}
	</div>
}
`,
		},
		topLeafEdgeIds: [],
		topMiddleEdgeId: 'component-edge:0',
	});
	const republished = topLinked.symbols.find(
		(symbol) => symbol.componentEdgeId === 'component-edge:0',
	);
	expect(republished).toBeDefined();
	expect(
		top.captureAnalysis.boundResolverRows?.find(
			(row) => row.loaderSymbolId === republished!.id,
		),
	).toBeUndefined();
	expect(top.captureAnalysis.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
});
