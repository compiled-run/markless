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
