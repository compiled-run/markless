import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../compiler/src/index.ts';
import { planPrerenderTriggerGroups } from '../src/trigger-groups.ts';

// A branch whose arm holds a component with state of its own escalates: the flip
// runs that component and names its handlers and updates through the resolver of
// the group that flipped it. The group has to carry them, but the component's
// hosts are not in the served DOM, so none of their served records may ride along.

const PAGE = `
import { computed, state } from '@markless/core';

function Badge() @{
	let hits = state(0);
	const doubled = computed(() => hits * 2);

	<em class="badge" onClick={() => hits = hits + 1}><b>{hits}</b><u>{doubled}</u></em>
}

export function Page() @{
	let shown = state(false);

	<section>
		<button type="button" onClick={() => shown = !shown}>Show</button>
		@if (shown) { <Badge /> }
	</section>
}
`;

test('the group that flips an escalated arm carries the symbols its component names', async () => {
	const compiled = await compileTsrxModule({
		filename: 'src/Page.tsrx',
		source: PAGE,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
	const branch = compiled.protocolView.branches?.[0];
	expect(branch?.escalates).toBe(true);
	const groups = planPrerenderTriggerGroups({
		filename: 'src/Page.tsrx',
		state: compiled.protocolState,
		view: compiled.protocolView,
		triggerGroups: compiled.triggerGroups,
		symbolResolver: compiled.symbolResolver,
		boundRows: compiled.boundSymbolResolver.rows,
		componentEdges: compiled.semanticGraph.componentEdges,
		renderData: compiled.renderData,
	});
	const toggle = groups.find((group) => group.hostTagName === 'button');
	expect(toggle).toBeDefined();

	const badgeHosts = new Set(
		compiled.renderData.chunks
			.filter((chunk) => chunk.componentName === 'Badge')
			.flatMap((chunk) => chunk.hosts.map((host) => host.hostNodeId)),
	);
	const badgeSymbols = compiled.symbolResolver.symbols.filter(
		(symbol) =>
			('hostNodeId' in symbol && badgeHosts.has(symbol.hostNodeId)) ||
			(symbol.kind === 'sync-computed-derive' && symbol.graphNodeId === 'computed:doubled'),
	);
	expect(badgeSymbols.map((symbol) => symbol.kind).sort()).toEqual([
		'dom-update',
		'dom-update',
		'event-handler',
		'sync-computed-derive',
	]);
	for (const symbol of badgeSymbols) expect(toggle!.symbolIds).toContain(symbol.id);
	for (const record of [
		...toggle!.view.locators,
		...toggle!.view.domUpdates,
		...toggle!.view.behaviors,
		...toggle!.view.elementHandles,
	])
		expect(badgeHosts.has(record.hostNodeId), JSON.stringify(record)).toBe(false);
});

// One text joining several holes updates from a node derived from all of them;
// the flip must ship that node's derive, whether the component or the page wrote the text.
test('the group that flips an escalated arm carries the derive behind a joined text', async () => {
	const compiled = await compileTsrxModule({
		filename: 'src/Panel.tsrx',
		source: `
import { computed, state } from '@markless/core';

function Tally() @{
	let count = state(0);
	const tripled = computed(() => count * 3);

	<strong onClick={() => count = count + 1}>tally {count} of {tripled}</strong>
}

export function Panel() @{
	let expanded = state(false);
	let steps = state(1);
	const half = computed(() => steps / 2);

	<article>
		<a href="#" onClick={() => expanded = !expanded}>Expand</a>
		@if (expanded) {
			<Tally />
			<p>{steps} and {half}</p>
		}
	</article>
}
`,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
	// A joined text reads the one derived node standing for all of its holes.
	const joinedDerives = new Map(
		compiled.symbolResolver.symbols.flatMap((symbol) => {
			if (symbol.kind !== 'dom-update') return [];
			const computed = compiled.protocolState.computed.find(
				(record) => record.graphNodeId === symbol.graphNodeId,
			);
			return computed && (computed.dependencies?.length ?? 0) > 1
				? [[computed.graphNodeId, computed.deriveSymbolId] as const]
				: [];
		}),
	);
	expect(joinedDerives.size).toBe(2);
	// The arm is closed when the page prerenders, so nothing inside it was served.
	const armHosts = new Set(
		compiled.renderData.chunks
			.filter((chunk) => chunk.componentName === 'Tally' || chunk.id.startsWith('branch:'))
			.flatMap((chunk) => chunk.hosts.map((host) => host.hostNodeId)),
	);
	const served = <T extends { readonly hostNodeId: string }>(records: ReadonlyArray<T>) =>
		records.filter((record) => !armHosts.has(record.hostNodeId));
	const groups = planPrerenderTriggerGroups({
		filename: 'src/Panel.tsrx',
		state: {
			...compiled.protocolState,
			computed: compiled.protocolState.computed.filter(
				(record) => !joinedDerives.has(record.graphNodeId),
			),
		},
		view: {
			...compiled.protocolView,
			locators: served(compiled.protocolView.locators),
			events: served(compiled.protocolView.events),
			domUpdates: served(compiled.protocolView.domUpdates),
		},
		completeView: compiled.protocolView,
		triggerGroups: compiled.triggerGroups,
		symbolResolver: compiled.symbolResolver,
		boundRows: compiled.boundSymbolResolver.rows,
		componentEdges: compiled.semanticGraph.componentEdges,
		renderData: compiled.renderData,
	});
	const toggle = groups.find((group) => group.hostTagName === 'a');
	expect(toggle).toBeDefined();
	for (const derive of joinedDerives.values()) expect(toggle!.symbolIds).toContain(derive);
});
