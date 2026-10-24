import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const ROW_MINT_UNSUPPORTED = 'MARKLESS_KEYED_REPEAT_ROW_MINT_UNSUPPORTED';

async function compile(source: string) {
	const result = await compileTsrxModule({ filename: 'src/Page.tsrx', source, symbols: [] });
	return {
		repeat: result.protocolView.keyedRepeats?.[0],
		branches: result.protocolView.branches ?? [],
		rowMintCodes: result.publicRenderPlan.diagnostics
			.map((diagnostic) => diagnostic.code)
			.filter((code) => code === ROW_MINT_UNSUPPORTED),
	};
}

// An @if in a row flips per row, so its test, its arms and their events ride the row template.
test('an @if in a row cell over page state and the row item ships as a row branch slot', async () => {
	for (const [list, item, pick, tag] of [
		['rows', 'row', 'editing', 'button'],
		['people', 'person', 'chosen', 'a'],
	] as const) {
		const { repeat, branches, rowMintCodes } = await compile(`
import { state } from '@markless/core';
export default function Page() @{
	let ${pick} = state('');
	let ${list} = state([{ id: 'a', name: 'Ann' }]);
	<table><tbody>
		@for (const ${item} of ${list}; key ${item}.id) {
			<tr><td>{${item}.name}</td><td>
				@if (${pick} === ${item}.id) {
					<${tag} data-save={${item}.id} onClick={() => (${pick} = '')}>Save</${tag}>
				} @else {
					<${tag} data-edit={${item}.id} onClick={() => (${pick} = ${item}.id)}>Edit</${tag}>
				}
			</td></tr>
		}
	</tbody></table>
}`);
		const [branch] = repeat?.rowTemplate?.branchSlots ?? [];
		expect(branch).toMatchObject({
			branchId: 'branch-site:0',
			source: `${pick} === ${item}.id`,
			reads: [{ graphNodeId: `state:${pick}`, path: [] }],
		});
		expect(branch?.arms.map((arm) => arm.attributeSlots)).toEqual([
			[{ path: [0], name: 'data-save', itemPath: ['id'] }],
			[{ path: [0], name: 'data-edit', itemPath: ['id'] }],
		]);
		expect(repeat?.rowEvents.map((event) => [event.hostPath, event.arm])).toEqual([
			[[0], { slot: 0, arm: 0 }],
			[[0], { slot: 0, arm: 1 }],
		]);
		// One page record would name one row's anchors; the row template owns every row's flip.
		expect(branches).toEqual([]);
		expect(rowMintCodes).toEqual([]);
	}
});

test('a row that IS an @if keeps a record whose markup is the branch alone', async () => {
	const { repeat, rowMintCodes } = await compile(`
import { state } from '@markless/core';
export default function Page() @{
	let lines = state([{ code: 1, open: false, label: 'One' }]);
	<ul>
		@for (const line of lines; key line.code) {
			@if (line.open) {
				<li class="open"><b>{line.label}</b></li>
			} @else {
				<li><i>{line.label}</i></li>
			}
		}
	</ul>
}`);
	expect(repeat?.rowTemplate?.html).toBe('<!--markless-slot:0-->');
	expect(repeat?.rowTemplate?.branchSlots?.[0]).toMatchObject({
		path: [0],
		source: 'line.open',
		arms: [
			{ textSlots: [{ path: [0, 0, 0], itemPath: ['label'] }] },
			{ textSlots: [{ path: [0, 0, 0], itemPath: ['label'] }] },
		],
	});
	expect(rowMintCodes).toEqual([]);
});

test('a @switch over the row index and a test over page state alone ship too', async () => {
	const { repeat } = await compile(`
import { state } from '@markless/core';
export default function Page() @{
	let compact = state(false);
	let cards = state([{ key: 'k', size: 'small' }]);
	<ol>
		@for (const card of cards; index at; key card.key) {
			<li>
				@switch (card.size) {
					@case 'small': { <small>{at}</small> }
					@default: { <big>{card.key}</big> }
				}
				@if (compact) { <em>c</em> } @else { <strong>w</strong> }
			</li>
		}
	</ol>
}`);
	const [switched, flag] = repeat?.rowTemplate?.branchSlots ?? [];
	expect(switched).toMatchObject({ armTests: ['small', null], source: 'card.size' });
	expect(flag).toMatchObject({ graphNodeId: 'state:compact', graphPath: [] });
});

test('an arm the row cannot rebuild keeps the served arm and says so', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Page.tsrx',
		source: `
import { state } from '@markless/core';
export default function Page() @{
	let open = state(false);
	let rows = state([{ id: 'a', tags: ['x'] }]);
	<ul>
		@for (const row of rows; key row.id) {
			<li>@if (open) { <ol>@for (const tag of row.tags; key tag) { <li>{tag}</li> }</ol> } @else { <span>none</span> }</li>
		}
	</ul>
}`,
		symbols: [],
	});
	expect(result.protocolView.keyedRepeats?.[0]?.rowTemplate).toBeUndefined();
	const flips = result.publicRenderPlan.diagnostics.filter(
		(diagnostic) => diagnostic.code === 'MARKLESS_ROW_BRANCH_FLIP_UNSUPPORTED',
	);
	expect(flips.map((diagnostic) => diagnostic.message)).toEqual([
		expect.stringContaining('each row keeps the arm the server rendered for @if (open)'),
	]);
});

test('the record folds in the row-branch module and names the index its handlers read', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Page.tsrx',
		source: `
import { state } from '@markless/core';
export default function Page() @{
	let slots = state([{ open: false }]);
	<ul>
		// markless-allow MARKLESS_REPEAT_KEY_IS_INDEX: slots are positions
		@for (const slot of slots; index at; key at) {
			<li>@if (slot.open) { <b>open</b> } @else { <button onClick={() => (slots = slots.map((each, n) => (n === at ? { open: true } : each)))}>open</button> }</li>
		}
	</ul>
}`,
		symbols: [],
	});
	const record = result.runtimeDemandMap.payloadRecords?.find(
		(entry) => entry.recordId === 'keyed-repeat:repeat:0',
	);
	expect(record?.runtimeModuleIds).toContain('web/fns/row-branch-mint');
	expect(result.protocolView.keyedRepeats?.[0]?.indexName).toBe('at');
	const handler = result.symbolModules.modules.find((module) => module.source.includes('state:slots'));
	expect(handler?.source).toContain('context.locals?.at');
});

test('an @if over page state whose arm shows the row item compiles: the row flips it, not a page-level module', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Page.tsrx',
		source: `
import { state } from '@markless/core';
export default function Page() @{
	let open = state(true);
	let rows = state([{ id: 1, name: 'ada' }]);
	<ul>
		@for (const row of rows; key row.id) {
			<li>@if (open) { <button>name {row.name}</button> } @else { <em>closed</em> }</li>
		}
	</ul>
}`,
		symbols: [],
	});
	const errors = [...result.symbolModules.diagnostics, ...result.publicRenderPlan.diagnostics].filter(
		(diagnostic) => diagnostic.severity === 'error',
	);
	expect(errors).toEqual([]);
	expect(result.protocolView.keyedRepeats?.[0]?.rowTemplate?.branchSlots?.[0]?.arms[0]).toMatchObject({
		textSlots: [{ itemPath: ['name'] }],
	});
});
