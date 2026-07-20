import { expect, test } from 'vitest';
import {
	analyzeCaptures,
	buildSemanticGraph,
	lowerStateAccess,
	planPayloadArena,
	planSymbolResolver,
} from '../src/index.ts';
import type { PublicRenderModuleInput } from '../src/artifacts.ts';
import { createCompilerKnownConstantCaptureRoute } from '../src/passes/capture-analysis.ts';
import { callbackSymbolIds } from '../src/passes/public-render/shared.ts';
import { planBoundSymbolResolver } from '../src/passes/symbol-resolver.ts';

async function compileCaptureArtifacts(source: string) {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/CaptureSlots.tsrx',
		source,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena, stateLowering });
	const analyzedCaptures = analyzeCaptures({ semanticGraph, symbolResolver });
	const captureAnalysis = {
		...analyzedCaptures,
		boundResolverRows: planBoundSymbolResolver({
			semanticGraph,
			captureAnalysis: analyzedCaptures,
		}).rows,
	};
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

test('a named component-local arrow classifies as a callback and captures its body', async () => {
	const source = `
import { state } from '@markless/core';

function Child({ onSelect }) @{
	<button onClick={() => onSelect('cedar')}>Select</button>
}

export function App() @{
	let selected = state('');
	let prefix = state('song:');
	const onSelectOne = (song) => selected = prefix + song;
	<Child onSelect={onSelectOne} />
}
`;
	const { semanticGraph, symbolResolver, captureAnalysis } = await compileCaptureArtifacts(source);
	const declaration = semanticGraph.localDeclarations.find(
		(candidate) => candidate.componentName === 'App' && candidate.name === 'onSelectOne',
	);
	const callback = symbolResolver.symbols.find(
		(symbol) => symbol.kind === 'callback-prop' && symbol.propName === 'onSelect',
	);

	expect(declaration).toEqual(
		expect.objectContaining({
			bindingId: expect.stringMatching(/^binding:/),
			lexicalScopeId: expect.stringMatching(/^scope:/),
			declarationKind: 'const',
			writeCount: 1,
			initializer: expect.objectContaining({
				kind: 'arrow-function',
				parameters: ['song'],
			}),
		}),
	);
	expect(callback).toEqual(
		expect.objectContaining({
			source: '(song) => selected = prefix + song',
			parameters: ['song'],
			reads: [expect.objectContaining({ graphNodeId: 'state:prefix' })],
			writes: [expect.objectContaining({ graphNodeId: 'state:selected' })],
		}),
	);
	expect(captureAnalysis.extractedSymbols).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: 'callback-prop',
				captureSlots: [
					expect.objectContaining({
						routes: [expect.objectContaining({ graphNodeId: 'state:prefix' })],
					}),
				],
			}),
		]),
	);
	expect(captureAnalysis.diagnostics).toEqual([]);
});

test('a component-body function declaration classifies as a callback', async () => {
	const source = `
import { state } from '@markless/core';

function Child({ onSelect }) @{
	<button onClick={() => onSelect('birch')}>Select</button>
}

export function App() @{
	let selected = state('');
	function onSelectOne(song) {
		selected = song;
	}
	<Child onSelect={onSelectOne} />
}
`;
	const { semanticGraph, symbolResolver, captureAnalysis } = await compileCaptureArtifacts(source);
	const declaration = semanticGraph.localDeclarations.find(
		(candidate) => candidate.componentName === 'App' && candidate.name === 'onSelectOne',
	);
	const callback = symbolResolver.symbols.find(
		(symbol) => symbol.kind === 'callback-prop' && symbol.propName === 'onSelect',
	);

	expect(declaration).toEqual(
		expect.objectContaining({
			declarationKind: 'function',
			writeCount: 1,
			initializer: expect.objectContaining({
				kind: 'function-declaration',
				parameters: ['song'],
			}),
		}),
	);
	expect(callback).toEqual(
		expect.objectContaining({
			source: expect.stringContaining('function onSelectOne(song)'),
			parameters: ['song'],
			writes: [expect.objectContaining({ graphNodeId: 'state:selected' })],
		}),
	);
	expect(captureAnalysis.diagnostics).toEqual([]);
});

test('a reassigned component-local callback stays fail-closed opaque', async () => {
	const source = `
function Child({ onSelect }) @{
	<button onClick={() => onSelect('ash')}>Select</button>
}

export function App() @{
	let onSelectOne = (song) => console.log('first', song);
	onSelectOne = (song) => console.log('second', song);
	<Child onSelect={onSelectOne} />
}
`;
	const { semanticGraph, symbolResolver, captureAnalysis } = await compileCaptureArtifacts(source);
	const declaration = semanticGraph.localDeclarations.find(
		(candidate) => candidate.componentName === 'App' && candidate.name === 'onSelectOne',
	);

	expect(declaration).toEqual(expect.objectContaining({ declarationKind: 'let', writeCount: 2 }));
	expect(
		semanticGraph.componentEdges[0]?.props.find((prop) => prop.name === 'onSelect'),
	).toEqual(expect.objectContaining({ kind: 'opaque', source: 'onSelectOne' }));
	expect(symbolResolver.symbols.some((symbol) => symbol.kind === 'callback-prop')).toBe(false);
	expect(captureAnalysis.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_CAPTURE_OPAQUE_PROP',
			propName: 'onSelect',
			source: 'onSelectOne',
		}),
	]);
});

test('supported destructured callback parameters produce callback capture routes', async () => {
	const source = `
function Child({ onObject, onArray }) @{
	<button onClick={() => { onObject({ count: 1 }); onArray([2]); }}>Run</button>
}

export function App() @{
	<Child
		onObject={({ count: nextCount }) => console.log(nextCount)}
		onArray={([count]) => console.log(count)}
	/>
}
`;
	const { captureAnalysis } = await compileCaptureArtifacts(source);
	const handler = captureAnalysis.extractedSymbols.find(
		(symbol) => symbol.kind === 'event-handler' && symbol.owner?.componentName === 'Child',
	);

	expect(handler?.captureSlots).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				propName: 'onObject',
				routes: [expect.objectContaining({ kind: 'callback-route' })],
			}),
			expect.objectContaining({
				propName: 'onArray',
				routes: [expect.objectContaining({ kind: 'callback-route' })],
			}),
		]),
	);
	expect(captureAnalysis.diagnostics).toEqual([]);
});

test('a missing prop cannot construct a compiler-known constant route without a value', async () => {
	const source = `
function Child({ onTrace }) @{
	<button onClick={() => onTrace()}>Trace</button>
}

export function App() @{
	<Child />
}
`;

	const { captureAnalysis } = await compileCaptureArtifacts(source);
	const slot = captureAnalysis.extractedSymbols[0]?.captureSlots[0];

	expect(slot?.routes).toEqual([
		expect.objectContaining({
			kind: 'unsupported-opaque',
			expression: 'onTrace',
		}),
	]);
	expect(slot?.routes).not.toEqual(
		expect.arrayContaining([
			expect.objectContaining({ kind: 'compiler-known-constant' }),
		]),
	);
	expect(captureAnalysis.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_CAPTURE_OPAQUE_PROP',
			propName: 'onTrace',
		}),
	]);
});

test('compiler-known constant route construction rejects an undefined value', () => {
	expect(() =>
		createCompilerKnownConstantCaptureRoute('component-edge:missing', [], undefined),
	).toThrow(
		'Cannot construct compiler-known constant capture route without a materialized value',
	);
});

test('capture slots resolve forwarded callback, graph, and constant routes through two edges', async () => {
	const source = `
import { state } from '@markless/core';

function Child({ count, label, onForward }: { count: number; label: string; onForward: (value: number) => void }) @{
	<button onClick={() => { console.log(count, label.length); onForward(count); }}>Forward</button>
}

function Parent({ count, label, onForward }: { count: number; label: string; onForward: (value: number) => void }) @{
	<Child count={count} label={label} onForward={onForward} />
}

export function App() @{
	let count = state(1);
	let observed = state(0);
	<Parent count={count} label="stable" onForward={(value) => observed = value} />
}
`;
	const { captureAnalysis, symbolResolver } = await compileCaptureArtifacts(source);
	const childHandler = captureAnalysis.extractedSymbols.find(
		(symbol) => symbol.kind === 'event-handler' && symbol.owner?.componentName === 'Child',
	);
	const originCallback = symbolResolver.symbols.find(
		(symbol) => symbol.kind === 'callback-prop' && symbol.componentEdgeId === 'component-edge:1',
	);

	expect(childHandler?.captureSlots).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				propName: 'count',
				routes: [expect.objectContaining({
					kind: 'graph-reference',
					graphNodeId: 'state:count',
					path: [],
					componentEdgePath: ['component-edge:1', 'component-edge:0'],
				})],
			}),
			expect.objectContaining({
				propName: 'label',
				path: ['length'],
				routes: [expect.objectContaining({
					kind: 'compiler-known-constant',
					value: 'stable',
					componentEdgePath: ['component-edge:1', 'component-edge:0'],
				})],
			}),
			expect.objectContaining({
				propName: 'onForward',
				routes: [expect.objectContaining({
					kind: 'callback-route',
					callbackSymbolId: originCallback?.id,
					componentEdgePath: ['component-edge:1', 'component-edge:0'],
				})],
			}),
		]),
	);
	expect(captureAnalysis.diagnostics).toEqual([]);
});

test('nested forwarding keeps a bound row for each outer component-edge instance', async () => {
	const source = `
function Trigger({ label, onForward }) @{
	<button onClick={() => onForward(label)}>{label}</button>
}

function Relay({ label, onForward }) @{
	<Trigger label={label} onForward={onForward} />
}

export function App() @{
	<>
		<Relay label="elm" onForward={(value) => console.log('first', value)} />
		<Relay label="quartz" onForward={(value) => console.log('second', value)} />
	</>
}
`;
	const { semanticGraph, symbolResolver, captureAnalysis } = await compileCaptureArtifacts(source);
	const handler = captureAnalysis.extractedSymbols.find(
		(symbol) => symbol.kind === 'event-handler' && symbol.owner?.componentName === 'Trigger',
	);
	const rows = captureAnalysis.boundResolverRows.filter(
		(row) => row.baseSymbolId === handler?.symbolId,
	);
	const symbols = callbackSymbolIds({
		semanticGraph,
		symbolResolver,
		captureAnalysis,
	} as PublicRenderModuleInput);

	expect(rows.map((row) => row.componentEdgePath)).toEqual([
		['component-edge:1', 'component-edge:0'],
		['component-edge:2', 'component-edge:0'],
	]);
	expect(symbols.get(`bound:component-edge:1:${handler?.symbolId}`)).toBe(rows[0]?.id);
	expect(symbols.get(`bound:component-edge:2:${handler?.symbolId}`)).toBe(rows[1]?.id);
});

test('an unroutable forwarded prop chain stays fail-closed', async () => {
	const source = `
function Child({ formatter }: { formatter: { format(value: number): string } }) @{
	<button onClick={() => console.log(formatter.format(1))}>Format</button>
}

function Parent({ formatter }: { formatter: { format(value: number): string } }) @{
	<Child formatter={formatter} />
}

export function App() @{
	<Parent formatter={makeFormatter()} />
}
`;
	const { captureAnalysis } = await compileCaptureArtifacts(source);

	expect(captureAnalysis.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_CAPTURE_OPAQUE_PROP',
			componentName: 'Child',
			propName: 'formatter',
			source: 'makeFormatter()',
		}),
	]);
});

test('reading a callback-routed slot without calling it stays fail-closed', async () => {
	const source = `
function Child({ onForward }: { onForward: (value: number) => void }) @{
	<button onClick={() => console.log(onForward)}>Inspect</button>
}

export function App() @{
	<Child onForward={(value) => console.log(value)} />
}
`;
	const { captureAnalysis } = await compileCaptureArtifacts(source);

	expect(captureAnalysis.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_CAPTURE_OPAQUE_PROP',
			componentName: 'Child',
			propName: 'onForward',
			source: 'onForward',
		}),
	]);
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

test('callback parameter pattern bindings do not plan reads of same-named state', async () => {
	const source = `
import { state } from '@markless/core';

function Child({ onObject, onRenamed, onArray }) @{
	<button onClick={() => {
		onObject({ count: 1 });
		onRenamed({ count: 2 });
		onArray([3]);
	}}>Trace</button>
}

export function App() @{
	let count = state(99);
	let observed = state(0);
	<Child
		onObject={({ count }) => observed = count}
		onRenamed={({ count: nextCount }) => observed = nextCount}
		onArray={([count]) => observed = count}
	/>
}
`;
	const { symbolResolver } = await compileCaptureArtifacts(source);
	const callbacks = symbolResolver.symbols.filter((symbol) => symbol.kind === 'callback-prop');

	expect(callbacks).toHaveLength(3);
	for (const callback of callbacks) {
		expect(callback.reads).toEqual([]);
		expect(callback.writes).toEqual([
			expect.objectContaining({ graphNodeId: 'state:observed' }),
		]);
	}
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
