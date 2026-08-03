import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

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
