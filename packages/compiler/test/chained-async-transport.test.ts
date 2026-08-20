import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

test('chained async runners travel independently from boundary-authored reads', async () => {
	const result = await compileTsrxModule({
		filename: 'src/CeramicLedger.tsrx',
		source: `
import { computed, state } from '@markless/core';

export function CeramicLedger() @{
	let mineral = state('azurite');
	const kilnSensor = computed(async () => {
		const batch = mineral;
		return { tone: batch + '-fired' };
	});
	const archiveLabel = computed(async () => {
		return { text: 'Archive ' + kilnSensor.tone };
	});

	<article>
		@try {
			<strong>{archiveLabel.text}</strong>
		} @pending {
			<strong>Cataloguing</strong>
		} @catch {
			<strong>Archive unavailable</strong>
		}
	</article>
}
`,
		symbols: [],
	});

	const upstreamRunner = result.symbolResolver.symbols.find(
		(symbol) =>
			symbol.kind === 'async-computed-runner' && symbol.graphNodeId === 'computed:kilnSensor',
	);
	if (!upstreamRunner) throw new Error('Expected the upstream async runner symbol.');

	const view = result.protocolView;
	expect.soft(view.asyncRunners).toMatchObject({
		'computed:kilnSensor': upstreamRunner.id,
	});
	expect
		.soft(
			view.asyncBoundaries.map((boundary) =>
				boundary.asyncReads.map(({ runnerSymbolId: _runnerSymbolId, ...read }) => read),
			),
		)
		.toEqual([
			[
				{
					source: 'archiveLabel.text',
					graphNodeId: 'computed:archiveLabel',
					path: ['text'],
				},
			],
		]);
});
test('async runner transport crosses a sync computed dependency hop', async () => {
	const result = await compileTsrxModule({
		filename: 'src/GlassArchive.tsrx',
		source: `
import { computed, state } from '@markless/core';

export function GlassArchive() @{
	let pigment = state('indigo');
	const furnaceReading = computed(async () => {
		const runs = ((globalThis as any).__glassRuns ||= { sample: 0, label: 0 });
		runs.sample++;
		const batch = pigment;
		await Promise.resolve();
		return { tone: batch + '-fired' };
	});
	const displayCard = computed(() => ({ caption: furnaceReading.tone }));
	const archiveEntry = computed(async () => {
		const runs = ((globalThis as any).__glassRuns ||= { sample: 0, label: 0 });
		runs.label++;
		await Promise.resolve();
		return { text: 'Archive ' + displayCard.caption };
	});

	<article>
		@try {
			<strong>{archiveEntry.text}</strong>
		} @pending {
			<strong>Cataloguing</strong>
		} @catch {
			<strong>Archive unavailable</strong>
		}
	</article>
}
`,
		symbols: [],
	});

	const upstreamRunner = result.symbolResolver.symbols.find(
		(symbol) =>
			symbol.kind === 'async-computed-runner' &&
			symbol.graphNodeId === 'computed:furnaceReading',
	);
	if (!upstreamRunner) throw new Error('Expected the upstream async runner symbol.');

	expect(result.protocolView.asyncRunners).toMatchObject({
		'computed:furnaceReading': upstreamRunner.id,
	});
	expect(result.publicRenderModule.ssrModuleSource).toContain(
		'dependencies:["computed:furnaceReading"]',
	);
	expect(result.publicRenderModule.ssrModuleSource).toContain(
		'const displayCard=read("computed:displayCard",[]);',
	);
	const syncDerive = result.symbolModules.modules.find(
		(module) =>
			module.kind === 'sync-computed-derive' &&
			result.symbolResolver.symbols.some(
				(symbol) =>
					symbol.id === module.symbolId && symbol.graphNodeId === 'computed:displayCard',
			),
	);
	if (!syncDerive) throw new Error('Expected the sync-hop derive module.');
	expect(syncDerive.source).toContain(
		'context.graph.read("computed:furnaceReading", ["value", "tone"])',
	);
	expect(syncDerive.source).not.toContain('return ({ caption: furnaceReading.tone })');
	expect(result.protocolState.computed).toContainEqual({
		graphNodeId: 'computed:displayCard',
		name: 'displayCard',
		async: false,
		deriveSymbolId: syncDerive.symbolId,
		dependencies: [{ graphNodeId: 'computed:furnaceReading', path: ['value', 'tone'] }],
	});
	const downstreamRunner = result.symbolModules.modules.find(
		(module) =>
			module.kind === 'async-computed-runner' &&
			result.symbolResolver.symbols.some(
				(symbol) =>
					symbol.id === module.symbolId && symbol.graphNodeId === 'computed:archiveEntry',
			),
	);
	if (!downstreamRunner) throw new Error('Expected the downstream async runner module.');
	expect(downstreamRunner.source).toContain('const displayCard = read("computed:displayCard");');
});

test('sync computed without an async dependency stays available to linked render data', async () => {
	const result = await compileTsrxModule({
		filename: 'src/InlineCard.tsrx',
		source: `
import { computed, state } from '@markless/core';

export function InlineCard() @{
	let pigment = state('indigo');
	const displayCard = computed(() => ({ caption: pigment + '-fired' }));

	<article>{displayCard.caption}</article>
}
`,
		symbols: [],
	});

	const definition = result.publicRenderModule.componentDefinitions[0];
	expect(definition?.initialValueKinds).toEqual(
		expect.objectContaining({ 'computed:displayCard': 'sync-computed-derive' }),
	);
	expect(
		result.symbolModules.modules.some((module) =>
			module.source.includes("caption: pigment + '-fired'"),
		),
	).toBe(true);
});

test('a template-read sync computed gates its boundary on every async ancestor', async () => {
	const result = await compileTsrxModule({
		filename: 'src/SignalCard.tsrx',
		source: `
import { computed } from '@markless/core';

export function SignalCard() @{
	const east = computed(async () => ({ label: 'east' }));
	const west = computed(async () => ({ label: 'west' }));
	const card = computed(() => ({ label: east.label + '-' + west.label }));

	<section>
		@try {
			<p>{card.label}</p>
		} @pending {
			<p>Aligning</p>
		} @catch {
			<p>Unavailable</p>
		}
	</section>
}
`,
		symbols: [],
	});

	expect(result.protocolView.asyncBoundaries[0]?.asyncReads).toEqual([
		expect.objectContaining({ graphNodeId: 'computed:east' }),
		expect.objectContaining({ graphNodeId: 'computed:west' }),
		expect.objectContaining({ graphNodeId: 'computed:card' }),
	]);
	expect(result.publicRenderModule.ssrModuleSource).toContain(
		"const derive=() => ({ label: east.label + '-' + west.label });return derive()",
	);
	expect(result.publicRenderModule.ssrModuleSource).toContain(
		'marklessSsrRunAsyncComputed(marklessSsrAsyncSnapshots,"computed:card"',
	);
	const boundary = result.protocolView.asyncBoundaries[0];
	const updateSymbol = result.symbolResolver.symbols.find(
		(symbol) => symbol.kind === 'async-boundary-update' && symbol.boundaryId === boundary?.id,
	);
	expect(boundary?.runnerGraphNodeId).toBe('computed:card');
	expect(boundary?.updateSymbolId).toBe(updateSymbol?.id);
	expect(
		result.symbolModules.modules.some(
			(module) =>
				module.kind === 'async-boundary-update' && module.symbolId === updateSymbol?.id,
		),
	).toBe(true);
});
