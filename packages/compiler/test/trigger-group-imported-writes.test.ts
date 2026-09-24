import { expect, test } from 'vitest';
import { compileTsrxModule, createTriggerGroups } from '../src/index.ts';
import type { CompileTsrxModuleResult, ExtractedCaptureSymbol } from '../src/artifacts.ts';

function groupFor(
	parent: CompileTsrxModuleResult,
	row: CompileTsrxModuleResult['boundSymbolResolver']['rows'][number],
) {
	const recordId = 'event:c0:control:click';
	return createTriggerGroups({
		symbolResolver: parent.symbolResolver,
		captureAnalysis: parent.captureAnalysis,
		protocolState: parent.protocolState,
		protocolView: parent.protocolView,
		runtimeDemandMap: {
			...parent.runtimeDemandMap,
			actions: [
				{
					hostNodeId: 'c0:control',
					eventName: 'click',
					recordKind: 'event',
					recordKinds: ['event'],
					payloadRecordIds: [recordId],
					runtimeModuleIds: [],
				},
			],
			payloadRecords: [
				{ recordId, kind: 'event', symbolIds: [row.id], runtimeModuleIds: [] },
			],
		},
	}).groups[0]!;
}

async function compose(captured: ExtractedCaptureSymbol, childName: string, prop: string) {
	return compileTsrxModule({
		filename: '/workspace/Parent.tsrx',
		symbols: [
			{
				id: 'imported:child',
				chunk: 'virtual:child',
				exportName: 'handler',
				componentEdgeId: 'component-edge:0',
				ownerComponentName: childName,
				claimKind: 'prop-bound',
				captureSymbol: captured,
			},
			{
				id: 'imported:child',
				chunk: 'virtual:child',
				exportName: 'handler',
				componentEdgeId: 'component-edge:1',
				ownerComponentName: childName,
				claimKind: 'prop-bound',
				captureSymbol: captured,
			},
		],
		source: `import {state} from '@markless/core';import {${childName}} from './Child.tsrx';
	export default function Parent() @{let first=state(0);let second=state(0);
	<section><${childName} ${prop}={()=>first=1}/><${childName} ${prop}={()=>second=2}/></section>}`,
	});
}

test.each([
	['Child', 'onChange', 'hidden', 'button', 'click'],
	['Field', 'onInput', 'draft', 'input', 'input'],
])(
	'retains imported write-only state for each %s instance',
	async (childName, prop, cell, tag, event) => {
		const child = await compileTsrxModule({
			filename: '/workspace/Child.tsrx',
			symbols: [],
			source: `import {state} from '@markless/core';
	export function ${childName}({${prop}}) @{let ${cell}=state(0);<${tag} on${event[0]!.toUpperCase() + event.slice(1)}={()=>{${cell}=5;${prop}?.()}}/>}`,
		});
		const captured = child.captureAnalysis.extractedSymbols.find(
			(symbol) => symbol.kind === 'event-handler',
		)!;
		expect(captured.graphWrites).toEqual([{ graphNodeId: `state:${cell}`, path: [] }]);
		const parent = await compose(captured, childName, prop);
		const rows = parent.boundSymbolResolver.rows;
		expect(rows).toHaveLength(2);
		for (const [index, row] of rows.entries()) {
			const group = groupFor(parent, row);
			expect(group.graphNodeIds).toEqual(
				[
					`${row.instancePath}state:${cell}`,
					index === 0 ? 'state:first' : 'state:second',
				].sort(),
			);
		}
	},
);

test('imported writes to page-scoped shared state retain their page identity', async () => {
	const child = await compileTsrxModule({
		filename: '/workspace/Shared.tsrx',
		symbols: [],
		source: `import {shared,state} from '@markless/core';
	const model=shared(()=>{const value=state({count:0});return {...value};},{scope:'page'});
	export function Child({onChange}) @{const value=model();<button onClick={()=>{value.count=5;onChange?.()}}>Set</button>}`,
	});
	const captured = child.captureAnalysis.extractedSymbols.find(
		(symbol) => symbol.kind === 'event-handler',
	)!;
	const write = child.symbolResolver.symbols.find((symbol) => symbol.kind === 'event-handler')!;
	if (!('writes' in write)) throw new Error('Expected handler writes');
	const graphNodeId = write.writes[0]!.graphNodeId;
	expect(captured.graphWrites).toEqual([{ graphNodeId, path: ['count'] }]);
	const parent = await compose(captured, 'Child', 'onChange');
	for (const [index, row] of parent.boundSymbolResolver.rows.entries())
		expect(groupFor(parent, row).graphNodeIds).toEqual(
			[graphNodeId, index === 0 ? 'state:first' : 'state:second'].sort(),
		);
});
