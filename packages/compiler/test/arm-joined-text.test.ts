import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '../src/index.ts';

const errors = (result: Awaited<ReturnType<typeof compileTsrxModule>>) =>
	collectTsrxModuleDiagnostics(result)
		.filter((diagnostic) => diagnostic.severity === 'error')
		.map((diagnostic) => diagnostic.code);

const JOINED_ARM = `
import { computed, state } from '@markless/core';

export default function Pager() @{
	const pages = computed(async () => [{ id: 'a', low: true }, { id: 'b', low: false }, { id: 'c', low: true }]);
	const low = computed(() => pages.filter((page) => page.low));
	let at = state(0);
	const current = computed(() => (low.length > 0 ? low[at % low.length] : null));
	<main>
		<button onClick={() => at++}>next</button>
		@try {
			<section>
				@if (current) {
					<p>{at + 1} / {low.length}</p>
				}
			</section>
		} @pending {
			<p>Loading</p>
		}
	</main>
}
`;

test('each interpolation of a text joined inside a flipped arm reads a graph node', async () => {
	const result = await compileTsrxModule({ filename: 'src/pager.tsrx', source: JOINED_ARM, symbols: [] });
	expect(errors(result)).toEqual([]);
	const arm = result.semanticGraph.markup.chunks.find((chunk) => chunk.kind === 'branch-arm' && chunk.slots.length > 0);
	const residues = arm?.slots.flatMap((slot) => (slot.kind === 'text' ? [slot.residue] : []));
	expect(residues?.map((residue) => residue.kind)).toEqual(['graph-read', 'graph-read']);
	const [first] = residues ?? [];
	const lifted = result.semanticGraph.graphBindings.find(
		(binding) => first?.kind === 'graph-read' && binding.id === first.graphNodeId,
	);
	expect(
		lifted?.dependencies?.map((dependency) => [dependency.graphNodeId, dependency.armGuard]),
	).toEqual([
		['state:at', undefined],
		['computed:current', true],
	]);
});

test('two expressions joined under an @if on plain state rebuild from their own graph nodes', async () => {
	const result = await compileTsrxModule({
		filename: 'src/steps.tsrx',
		source: `
import { state } from '@markless/core';
export default function Steps() @{
	let step = state(1);
	let open = state(true);
	<div>
		<button onClick={() => { step++; open = !open; }}>go</button>
		@if (open) {
			<span>{step * 10} of {step + 2} done</span>
		}
	</div>
}
`,
		symbols: [],
	});
	expect(errors(result)).toEqual([]);
});

const ROW = `
export default function Row({ entry, onPick }: { entry: { id: string }; onPick: (id: string) => void }) @{
	<tr onClick={() => onPick(entry.id)}><td>{entry.id}</td></tr>
}
`;
const NONE = `export function None() @{\n\t<tr><td>none</td></tr>\n}\n`;
const tabs = (empty: string) => `
import { computed, state } from '@markless/core';
import Row from './row.tsrx';
import { None } from './none.tsrx';

export default function Tabs() @{
	const entries = computed(async () => [{ id: 'a', done: false }, { id: 'b', done: true }]);
	const open = computed(() => entries.filter((entry) => !entry.done));
	let tab = state('open');
	let picked = state('');
	<div>
		<button onClick={() => (tab = 'all')}>all</button>
		@try {
			<table>
				@switch (tab) {
					@case 'open': {
						<tbody>
							@for (const entry of open; key entry.id) {
								<Row entry={entry} onPick={(id) => (picked = id)} />
							}${empty}
						</tbody>
					}
					@default: {
						<tbody>
							@for (const entry of entries; key entry.id) {
								<Row entry={entry} onPick={(id) => (picked = id)} />
							}
						</tbody>
					}
				}
			</table>
		} @pending {
			<p>Loading</p>
		}
	</div>
}
`;

async function compileTabs(empty: string) {
	const row = await compileTsrxModule({ filename: 'src/row.tsrx', source: ROW, symbols: [] });
	const none = await compileTsrxModule({ filename: 'src/none.tsrx', source: NONE, symbols: [] });
	return compileTsrxModule({
		filename: 'src/tabs.tsrx',
		source: tabs(empty),
		symbols: [],
		importedModuleInterfaces: {
			'./row.tsrx': row.moduleGraphInterface,
			'./none.tsrx': none.moduleGraphInterface,
		},
	});
}

test('a @switch over keyed rows of an imported component builds', async () => {
	expect(errors(await compileTabs(' @empty { <tr><td>none</td></tr> }'))).toEqual([]);
});

test('a component in @empty is reported alone, not also as a @switch that cannot be rebuilt', async () => {
	expect(errors(await compileTabs(' @empty { <None /> }'))).toEqual(['MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT']);
});

test('an @if beside the list shows a component when the list is empty', async () => {
	expect(errors(await compileTabs('\n\t\t\t\t\t\t\t@if (open.length === 0) { <None /> }'))).toEqual([]);
});
