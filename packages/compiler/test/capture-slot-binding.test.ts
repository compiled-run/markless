import { expect, test } from 'vitest';
import {
	analyzeCaptures,
	buildSemanticGraph,
	lowerStateAccess,
	planPayloadArena,
	planSymbolResolver,
} from '../src/index.ts';

async function compileCaptureArtifacts(source: string) {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/CaptureSlots.tsrx',
		source,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena, stateLowering });
	const captureAnalysis = analyzeCaptures({ semanticGraph, symbolResolver });
	return { semanticGraph, stateLowering, symbolResolver, captureAnalysis };
}

test('prop declarations and reads retain distinct AST binding ownership', async () => {
	const source = `
function First({ label }: { label: string }) @{
	<button onClick={() => console.log(label)}>{label}</button>
}

function Second({ label }: { label: string }) @{
	<button onClick={() => console.log(label)}>{label}</button>
}
`;
	const { semanticGraph, stateLowering } = await compileCaptureArtifacts(source);
	const first = semanticGraph.componentPropBindings.find(
		(binding) => binding.componentName === 'First',
	);
	const second = semanticGraph.componentPropBindings.find(
		(binding) => binding.componentName === 'Second',
	);

	expect(first).toEqual(
		expect.objectContaining({
			componentId: expect.stringMatching(/^component:/),
			componentName: 'First',
			sourceSpan: expect.objectContaining({ filename: 'src/CaptureSlots.tsrx' }),
		}),
	);
	expect(first).toEqual(
		expect.objectContaining({
			componentName: 'First',
			localName: 'label',
			propPath: ['label'],
			bindingId: expect.stringMatching(/^binding:/),
			sourceSpan: expect.objectContaining({ filename: 'src/CaptureSlots.tsrx' }),
		}),
	);
	expect(second).toEqual(
		expect.objectContaining({
			componentName: 'Second',
			localName: 'label',
			propPath: ['label'],
			bindingId: expect.stringMatching(/^binding:/),
		}),
	);
	expect(first?.bindingId).not.toBe(second?.bindingId);
	expect(stateLowering.reads).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				bindingId: first?.bindingId,
				componentName: 'First',
				graphNodeId: 'prop:props',
				path: ['label'],
				sourceSpan: expect.objectContaining({ filename: 'src/CaptureSlots.tsrx' }),
			}),
			expect.objectContaining({
				bindingId: second?.bindingId,
				componentName: 'Second',
				graphNodeId: 'prop:props',
				path: ['label'],
			}),
		]),
	);
});

test('capture slots classify graph, literal, and callback routes per component edge', async () => {
	const source = `
import { state } from '@markless/core';

function Child({ count, label, onTrace }: { count: number; label: string; onTrace: (value: number) => void }) @{
	<button onClick={() => { console.log(label); onTrace(count); }}>{label}</button>
}

export function App() @{
	let count = state(1);
	let baseline = state(2);
	let observed = state(0);
	<Child count={count} label="stable" onTrace={(value) => observed = baseline + value} />
}
`;
	const { captureAnalysis } = await compileCaptureArtifacts(source);
	const childHandler = captureAnalysis.extractedSymbols.find(
		(symbol) => symbol.kind === 'event-handler' && symbol.owner?.componentName === 'Child',
	);

	expect(childHandler?.captureSlots).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				propName: 'count',
				owner: expect.objectContaining({ componentName: 'Child' }),
				routes: [
					expect.objectContaining({
						kind: 'graph-reference',
						componentEdgeId: 'component-edge:0',
						graphNodeId: 'state:count',
						path: [],
					}),
				],
			}),
			expect.objectContaining({
				propName: 'onTrace',
				routes: [
					expect.objectContaining({
						kind: 'callback-route',
						componentEdgeId: 'component-edge:0',
						callbackSymbolId: expect.stringMatching(/^symbol:/),
					}),
				],
			}),
		]),
	);

	const labelSlot = captureAnalysis.extractedSymbols
		.flatMap((symbol) => symbol.captureSlots)
		.find((slot) => slot.propName === 'label');
	expect(labelSlot?.routes).toEqual([
		expect.objectContaining({
			kind: 'compiler-known-constant',
			componentEdgeId: 'component-edge:0',
			value: 'stable',
		}),
	]);
	const callback = captureAnalysis.extractedSymbols.find(
		(symbol) => symbol.kind === 'callback-prop',
	);
	expect(callback).toEqual(
		expect.objectContaining({
			owner: expect.objectContaining({ componentName: 'App' }),
			captureSlots: [
				expect.objectContaining({
					source: 'baseline',
					owner: expect.objectContaining({ componentName: 'App' }),
					routes: [
						expect.objectContaining({
							kind: 'graph-reference',
							graphNodeId: 'state:baseline',
							path: [],
						}),
					],
				}),
			],
		}),
	);
	expect(captureAnalysis.diagnostics).toEqual([]);
});

test('callback parameter member reads do not capture an unrelated state binding', async () => {
	const source = `
import { state } from '@markless/core';

function Child({ onTrace }: { onTrace: (payload: { count: number }) => void }) @{
	<button onClick={() => onTrace({ count: 7 })}>Trace</button>
}

export function App() @{
	let count = state(0);
	let observed = state(0);
	<>
		<Child onTrace={(payload) => observed = payload.count} />
		<button onClick={() => count++}>{count}</button>
	</>
}
`;
	const { symbolResolver } = await compileCaptureArtifacts(source);
	const callback = symbolResolver.symbols.find((symbol) => symbol.kind === 'callback-prop');

	expect(callback).toEqual(
		expect.objectContaining({
			parameters: ['payload'],
			reads: [],
			writes: [expect.objectContaining({ graphNodeId: 'state:observed' })],
		}),
	);
});

test('a demanded opaque prop produces a blocking capture diagnostic', async () => {
	const source = `
function Child({ formatter }: { formatter: { format(value: number): string } }) @{
	<button onClick={() => console.log(formatter.format(1))}>Format</button>
}

export function App() @{
	<Child formatter={makeFormatter()} />
}
`;
	const { captureAnalysis } = await compileCaptureArtifacts(source);

	expect(captureAnalysis.extractedSymbols.flatMap((symbol) => symbol.captureSlots)).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				propName: 'formatter',
				routes: [
					expect.objectContaining({
						kind: 'unsupported-opaque',
						componentEdgeId: 'component-edge:0',
						expression: 'makeFormatter()',
						sourceSpan: expect.objectContaining({ filename: 'src/CaptureSlots.tsrx' }),
					}),
				],
			}),
		]),
	);
	expect(captureAnalysis.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_CAPTURE_OPAQUE_PROP',
			severity: 'error',
			componentEdgeId: 'component-edge:0',
			componentName: 'Child',
			propName: 'formatter',
			source: 'makeFormatter()',
			primarySpan: expect.objectContaining({ filename: 'src/CaptureSlots.tsrx' }),
		}),
	]);
});

test('presentation-only opaque props do not demand a capture slot', async () => {
	const source = `
function Child({ formatter }: { formatter: { format(value: number): string } }) @{
	<p>{formatter.format(1)}</p>
}

export function App() @{
	<Child formatter={makeFormatter()} />
}
`;
	const { captureAnalysis } = await compileCaptureArtifacts(source);

	expect(captureAnalysis.extractedSymbols.flatMap((symbol) => symbol.captureSlots)).toEqual([]);
	expect(captureAnalysis.diagnostics).toEqual([]);
});
