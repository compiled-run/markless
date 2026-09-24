import { expect, test } from 'vitest';
import { compileTsrxModule, createTriggerGroups } from '../src/index.ts';

test('trigger-groups closes each delegated trigger over only its state and patch records', async () => {
	const result = await compileTsrxModule({
		filename: '/workspace/src/App.tsrx',
		resolverId: 'virtual:resolver',
		symbols: [],
		source: `
			import { state } from '@markless/core';
			export function App() @{
				let playing = state(false);
				let open = state(false);
				<section>
					<button class={playing ? 'playing' : 'paused'} onClick={() => playing = !playing}>Play</button>
					<button class={open ? 'open' : 'closed'} onClick={() => open = !open}>Menu</button>
				</section>
			}
		`,
	});

	expect(result.passGraph.orderedPassIds).toContain('trigger-groups');
	expect(result.triggerGroups.groups).toHaveLength(2);
	expect(result.triggerGroups.groups.map((group) => group.graphNodeIds)).toEqual([
		['state:playing'],
		['state:open'],
	]);
	expect(result.triggerGroups.groups.map((group) => group.payloadRecordIds)).toEqual([
		['dom-update:h1:symbol:2', 'event:h1:click'],
		['dom-update:h2:symbol:3', 'event:h2:click'],
	]);
	expect(result.triggerGroups.groups.map((group) => group.symbolIds)).toEqual([
		['symbol:0', 'symbol:2'],
		['symbol:1', 'symbol:3'],
	]);
});

test('trigger-groups stage zero-input behavior activation with the build-known interaction', async () => {
	const result = await compileTsrxModule({
		filename: '/workspace/src/App.tsrx',
		resolverId: 'virtual:resolver',
		symbols: [],
		source: `
			import { state } from '@markless/core';
			import { installController } from './controller';
			export function App() @{
				let playing = state(false);
				<section attach={installController}>
					<button onClick={() => playing = !playing}>Play</button>
				</section>
			}
		`,
	});

	const group = result.triggerGroups.groups[0];
	const behavior = result.protocolView.behaviors[0];
	expect(behavior?.inputGraphReads ?? []).toEqual([]);
	expect(group?.payloadRecordIds).toContain(
		`behavior:${behavior?.hostNodeId}:${behavior?.symbolId}`,
	);
	expect(group?.symbolIds).toContain(behavior?.symbolId);
	expect(group?.graphNodeIds).toEqual(['state:playing']);
});

test.each([
	['Page', 'Row', 'onPress', 'hidden', 'button', 'click'],
	['Screen', 'Field', 'onEdit', 'draft', 'input', 'input'],
])(
	'trigger-groups follows %s callbacks whose state has no DOM binding',
	async (page, child, prop, cell, tag, event) => {
		const result = await compileTsrxModule({
			filename: `/workspace/src/${page}.tsrx`,
			symbols: [],
			source: `import { state } from '@markless/core';
			export default function ${page}() @{
				let ${cell} = state(0);
				<${child} ${prop}={() => ${cell}++}/>
			}
			function ${child}({ ${prop} }) @{
				<${tag} on${event[0]!.toUpperCase() + event.slice(1)}={(event) => ${prop}?.(event)} />
			}`,
		});
		expect(result.protocolView.domUpdates).toEqual([]);
		expect(result.triggerGroups.groups).toHaveLength(1);
		expect(result.triggerGroups.groups[0]?.graphNodeIds).toEqual([`state:${cell}`]);
		const callback = result.symbolResolver.symbols.find(
			(symbol) => symbol.kind === 'callback-prop',
		);
		expect(callback).toBeDefined();
		expect(result.triggerGroups.groups[0]?.symbolIds).toContain(callback!.id);
	},
);

test('trigger-groups follows the chosen instance callback without its sibling state', async () => {
	const result = await compileTsrxModule({
		filename: '/workspace/src/Siblings.tsrx',
		symbols: [],
		source: `
		import { state } from '@markless/core';
		export default function Page() @{
			let left = state(0);
			let right = state(0);
			<section><Row onPress={() => left++}/><Row onPress={() => right++}/></section>
		}
		function Row({onPress}) @{ <button onClick={() => onPress?.()}>Change</button> }
	`,
	});
	const rows = result.boundSymbolResolver.rows.filter((row) =>
		row.captureSlots.some((slot) => slot.route.kind === 'callback-route'),
	);
	expect(rows).toHaveLength(2);
	for (const row of rows) {
		const group = createTriggerGroups({
			symbolResolver: result.symbolResolver,
			captureAnalysis: result.captureAnalysis,
			protocolState: result.protocolState,
			protocolView: result.protocolView,
			runtimeDemandMap: {
				...result.runtimeDemandMap,
				payloadRecords: result.runtimeDemandMap.payloadRecords.map((record) =>
					record.recordId.startsWith('event:')
						? { ...record, symbolIds: [row.id] }
						: record,
				),
			},
		}).groups[0]!;
		const route = row!.captureSlots.find((slot) => slot.route.kind === 'callback-route')!.route;
		if (route.kind !== 'callback-route') throw new Error('Expected resolved callback');
		const callback = result.symbolResolver.symbols.find(
			(symbol) => symbol.id === route.callbackSymbolId,
		)!;
		if (!('writes' in callback)) throw new Error('Expected state-writing callback');
		expect(group.graphNodeIds).toEqual(callback.writes!.map((write) => write.graphNodeId));
		expect(group.symbolIds).toContain(callback.id);
		expect(group.graphNodeIds).toHaveLength(1);
	}
});

test('trigger-groups closes forwarded callbacks over their parent graph reads', async () => {
	const result = await compileTsrxModule({
		filename: '/workspace/src/Forwarded.tsrx',
		symbols: [],
		source: `
		import { state } from '@markless/core';
		export default function Page() @{
			let total = state(0);
			<Wrapper onChange={() => total++}/>
		}
		function Wrapper({onChange}) @{ <Row onPress={() => onChange?.()}/> }
		function Row({onPress}) @{ <button onClick={() => onPress?.()}>Change</button> }
	`,
	});
	expect(result.protocolView.domUpdates).toEqual([]);
	expect(result.triggerGroups.groups[0]?.graphNodeIds).toEqual(['state:total']);
});

test('trigger-groups keeps forwarded sibling callbacks in their enclosing instance', async () => {
	const result = await compileTsrxModule({
		filename: '/workspace/src/NestedSiblings.tsrx',
		symbols: [],
		source: `
		import { state } from '@markless/core';
		export default function Page() @{
			let left = state(0);
			let right = state(0);
			<section><Wrapper onChange={() => left = 4}/><Wrapper onChange={() => right = 7}/></section>
		}
		function Wrapper({onChange}) @{ <Row onPress={() => onChange?.()}/> }
		function Row({onPress}) @{ <button onClick={() => onPress?.()}>Change</button> }
	`,
	});
	const event = result.symbolResolver.symbols.find((symbol) => symbol.kind === 'event-handler')!;
	const rows = result.boundSymbolResolver.rows
		.filter((row) => row.baseSymbolId === event.id)
		.sort((a, b) => a.componentEdgePath[0]!.localeCompare(b.componentEdgePath[0]!));
	expect(rows).toHaveLength(2);
	for (const [index, row] of rows.entries()) {
		const groups = createTriggerGroups({
			symbolResolver: result.symbolResolver,
			captureAnalysis: result.captureAnalysis,
			protocolState: result.protocolState,
			protocolView: result.protocolView,
			runtimeDemandMap: {
				...result.runtimeDemandMap,
				payloadRecords: result.runtimeDemandMap.payloadRecords.map((record) =>
					record.recordId.startsWith('event:')
						? { ...record, symbolIds: [row.id] }
						: record,
				),
			},
		}).groups;
		expect(groups).toHaveLength(1);
		expect(groups[0]?.graphNodeIds).toEqual([index === 0 ? 'state:left' : 'state:right']);
	}
});
