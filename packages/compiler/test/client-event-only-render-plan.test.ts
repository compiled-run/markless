import { expect, test } from 'vitest';
import { buildSemanticGraph, lowerStateAccess } from '../src/index.ts';
import { planClientEventOnlyRender } from '../src/passes/client-event-only-render-plan.ts';
import { planPayloadArena } from '../src/passes/payload-arena.ts';
import { planSymbolResolver } from '../src/passes/symbol-resolver.ts';

const benchmarkShapedSource = `
import { state } from 'arcade';
import { buildData, removeRow } from 'arcade-benchmark-data';

export function App() @{
	let rows = state([]);
	let selected = state(null);

	<div class="container">
		<button id="run" onClick={() => {
			rows = buildData(1, 1000);
			selected = null;
		}}>Create rows</button>
		<table>
			<tbody>
				@for (const row of rows; key row.id) {
					<tr class={selected === row.id ? 'danger' : ''}>
						<td class="col-md-1">{row.id}</td>
						<td class="col-md-4"><a onClick={() => selected = row.id}>{row.label}</a></td>
						<td class="col-md-1"><a onClick={() => rows = removeRow(rows, row.id)}><span class="remove"></span></a></td>
						<td class="col-md-6"></td>
					</tr>
				}
			</tbody>
		</table>
	</div>
}
`;

const alternateSource = `
import { state } from 'arcade';

export function App() @{
	let items = state([]);
	let activeKey = state(null);

	<section class="app">
		<button id="load" onClick={() => {
			items = [{ key: 1, name: 'one' }];
			activeKey = null;
		}}>Load</button>
		<ul>
			@for (const item of items; key item.key) {
				<li class={activeKey === item.key ? 'selected' : ''}>
					<button onClick={() => activeKey = item.key}>{item.name}</button>
					<i onClick={() => items = items.filter((entry) => entry.key !== item.key)}>x</i>
					<small>{item.key}</small>
				</li>
			}
		</ul>
	</section>
}
`;

test('planClientEventOnlyRender creates a structural keyed table render plan', async () => {
	const { plan } = await createRenderPlan('src/TableRows.tsrx', benchmarkShapedSource);
	const repeat = plan.keyedRepeats[0];

	expect(plan.passId).toBe('client-event-only-render-plan');
	expect(plan.rootTemplateHtml).toContain('<tbody></tbody>');
	expect(plan.rootTemplateHtml).not.toContain('<tr');
	expect(repeat).toEqual(
		expect.objectContaining({
			repeatId: 'repeat:0',
			parentHostNodeId: expect.any(String),
			rowHostNodeId: expect.any(String),
			itemName: 'row',
			collectionGraphNodeId: 'state:rows',
			collectionPath: [],
			keyPath: ['id'],
			rowTemplateHtml:
				'<tr class=""><td class="col-md-1"> </td><td class="col-md-4"><a> </a></td><td class="col-md-1"><a><span class="remove"></span></a></td><td class="col-md-6"></td></tr>',
		}),
	);
	expect(repeat?.textBindings).toEqual([
		{ source: 'row.id', itemPath: ['id'], nodePath: [0, 0] },
		{ source: 'row.label', itemPath: ['label'], nodePath: [1, 0, 0] },
	]);
	expect(repeat?.classBindings).toEqual([
		{
			source: "selected === row.id ? 'danger' : ''",
			hostPath: [],
			stateGraphNodeId: 'state:selected',
			statePath: [],
			itemPath: ['id'],
			trueClass: 'danger',
			falseClass: '',
		},
	]);
	expect(repeat?.eventControls).toEqual([
		{
			eventName: 'click',
			hostPath: [1, 0],
			handlerSource: '() => selected = row.id',
			symbolId: 'symbol:1',
		},
		{
			eventName: 'click',
			hostPath: [2, 0],
			handlerSource: '() => rows = removeRow(rows, row.id)',
			symbolId: 'symbol:2',
		},
	]);
	expect(plan.diagnostics).toEqual([]);
});

test('planClientEventOnlyRender handles alternate keyed list shape', async () => {
	const { plan } = await createRenderPlan('src/ItemList.tsrx', alternateSource);
	const repeat = plan.keyedRepeats[0];

	expect(plan.rootTemplateHtml).toContain('<ul></ul>');
	expect(plan.rootTemplateHtml).not.toContain('<li');
	expect(repeat).toEqual(
		expect.objectContaining({
			repeatId: 'repeat:0',
			itemName: 'item',
			collectionGraphNodeId: 'state:items',
			keyPath: ['key'],
			rowTemplateHtml: '<li class=""><button> </button><i>x</i><small> </small></li>',
		}),
	);
	expect(repeat?.textBindings).toEqual([
		{ source: 'item.name', itemPath: ['name'], nodePath: [0, 0] },
		{ source: 'item.key', itemPath: ['key'], nodePath: [2, 0] },
	]);
	expect(repeat?.classBindings).toEqual([
		{
			source: "activeKey === item.key ? 'selected' : ''",
			hostPath: [],
			stateGraphNodeId: 'state:activeKey',
			statePath: [],
			itemPath: ['key'],
			trueClass: 'selected',
			falseClass: '',
		},
	]);
	expect(repeat?.eventControls).toEqual([
		{
			eventName: 'click',
			hostPath: [0],
			handlerSource: '() => activeKey = item.key',
			symbolId: 'symbol:1',
		},
		{
			eventName: 'click',
			hostPath: [1],
			handlerSource: '() => items = items.filter((entry) => entry.key !== item.key)',
			symbolId: 'symbol:2',
		},
	]);
	expect(plan.diagnostics).toEqual([]);
});

async function createRenderPlan(filename: string, source: string) {
	const semanticGraph = await buildSemanticGraph({ filename, source });
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({
		semanticGraph,
		payloadArena,
		stateLowering,
	});
	const plan = planClientEventOnlyRender({
		source: { filename, source },
		semanticGraph,
		payloadArena,
		symbolResolver,
	});

	return { plan, payloadArena, semanticGraph, stateLowering, symbolResolver };
}
