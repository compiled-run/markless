import { expect, test } from 'vitest';
import {
	buildSemanticGraph,
	lowerStateAccess,
	planPayloadArena,
	planSymbolResolver,
} from '../src/index.ts';
import {
	analyzeCaptures,
	CAPTURE_ANALYSIS_PASS_ID,
	CAPTURE_ANALYSIS_PHASE,
	EVENT_HANDLER_EMIT_UNSUPPORTED_CODE,
} from '../src/passes/capture-analysis.ts';

const source = `
import { state } from '@markless/core';

export function App() @{
	let count = state(0);
	const menu = state({ open: true });

	<section>
		<button onClick={[() => count++, () => menu.open = false]}>{count}</button>
		<canvas attach={chart(menu)} />
	</section>
}
`;

test('analyzeCaptures records extracted symbol sources without re-walking source', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/App.tsrx',
		source,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena });

	const captureAnalysis = analyzeCaptures({
		semanticGraph,
		symbolResolver,
	});

	expect(captureAnalysis).toEqual({
		passId: 'capture-analysis',
		extractedSymbols: expect.arrayContaining([
			expect.objectContaining({
				symbolId: 'symbol:0',
				kind: 'event-handler',
				source: '() => count++',
			}),
			expect.objectContaining({
				symbolId: 'symbol:1',
				kind: 'event-handler',
				source: '() => menu.open = false',
			}),
			expect.objectContaining({
				kind: 'behavior',
				source: 'chart(menu)',
			}),
			expect.objectContaining({
				kind: 'dom-update',
				source: 'count',
			}),
		]),
		diagnostics: [],
	});
});

test('analyzeCaptures reports unsupported local function captures in lazy symbols', async () => {
	const invalidSource = `
import { state } from '@markless/core';

export function App() @{
	let count = state(0);
	const format = () => count + 1;

	<button onClick={() => format()}>{count}</button>
}
`;
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/App.tsrx',
		source: invalidSource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena });

	const captureAnalysis = analyzeCaptures({
		semanticGraph,
		symbolResolver,
	});

	expect(captureAnalysis.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED',
			severity: 'error',
			phase: 'capture-analysis',
			passId: 'capture-analysis',
			symbolId: 'symbol:0',
			source: '() => format()',
			suggestions: [
				{
					message:
						'Move the helper to module scope, inline the derivation, or represent durable data with state()/computed().',
				},
			],
		}),
	]);
});

test('analyzeCaptures reports unsupported local function aliases captured in lazy symbols', async () => {
	const invalidSource = `
import { state } from '@markless/core';

export function App() @{
	let count = state(0);
	const format = () => count + 1;
	const render = format;

	<button onClick={() => render()}>{count}</button>
}
`;
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/App.tsrx',
		source: invalidSource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena });

	const captureAnalysis = analyzeCaptures({
		semanticGraph,
		symbolResolver,
	});

	expect(semanticGraph.localBindings).toEqual([
		expect.objectContaining({
			name: 'format',
			kind: 'function',
		}),
		expect.objectContaining({
			name: 'render',
			kind: 'function',
		}),
	]);
	expect(captureAnalysis.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED',
			severity: 'error',
			phase: 'capture-analysis',
			passId: 'capture-analysis',
			symbolId: 'symbol:0',
			source: '() => render()',
		}),
	]);
});

test('analyzeCaptures reports non-serializable local constant captures in lazy symbols', async () => {
	const invalidSource = `
import { state } from '@markless/core';

export function App() @{
	let count = state(0);
	const helpers = { format: () => count + 1 };

	<button onClick={() => helpers.format()}>{count}</button>
}
`;
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/App.tsrx',
		source: invalidSource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena });

	const captureAnalysis = analyzeCaptures({
		semanticGraph,
		symbolResolver,
	});

	expect(semanticGraph.localBindings).toEqual([
		expect.objectContaining({
			name: 'helpers',
			kind: 'non-serializable-constant',
		}),
	]);
	expect(captureAnalysis.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED',
			severity: 'error',
			phase: 'capture-analysis',
			passId: 'capture-analysis',
			symbolId: 'symbol:0',
			source: '() => helpers.format()',
			suggestions: [
				{
					message:
						'Keep captured constants serializable, move functions to module scope, or represent durable data with state()/computed().',
				},
			],
		}),
	]);
});

test('analyzeCaptures allows serializable Date constants captured in lazy symbols', async () => {
	const validSource = `
import { state } from '@markless/core';

export function App() @{
	let count = state(0);
	const createdAt = new Date('2026-01-01T00:00:00.000Z');

	<button onClick={() => createdAt.toISOString()}>{count}</button>
}
`;
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/App.tsrx',
		source: validSource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena });

	const captureAnalysis = analyzeCaptures({
		semanticGraph,
		symbolResolver,
	});

	expect(semanticGraph.localBindings).toEqual([]);
	expect(captureAnalysis.diagnostics).toEqual([]);
});

test('analyzeCaptures reports non-serializable values inside serializable built-in constants', async () => {
	const invalidSource = `
import { state } from '@markless/core';

export function App() @{
	let count = state(0);
	const helpers = new Map([['format', () => count + 1]]);

	<button onClick={() => helpers.get('format')?.()}>{count}</button>
}
`;
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/App.tsrx',
		source: invalidSource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena });

	const captureAnalysis = analyzeCaptures({
		semanticGraph,
		symbolResolver,
	});

	expect(semanticGraph.localBindings).toEqual([
		expect.objectContaining({
			name: 'helpers',
			kind: 'non-serializable-constant',
		}),
	]);
	expect(captureAnalysis.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED',
			severity: 'error',
			phase: 'capture-analysis',
			passId: 'capture-analysis',
			symbolId: 'symbol:0',
			source: "() => helpers.get('format')?.()",
		}),
	]);
});

test('analyzeCaptures reports non-serializable local aliases inside serializable built-in constants', async () => {
	const invalidSource = `
import { state } from '@markless/core';

export function App() @{
	let count = state(0);
	const entries = [['format', () => count + 1]];
	const helpers = new Map(entries);

	<button onClick={() => helpers.get('format')?.()}>{count}</button>
}
`;
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/App.tsrx',
		source: invalidSource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena });

	const captureAnalysis = analyzeCaptures({
		semanticGraph,
		symbolResolver,
	});

	expect(semanticGraph.localBindings).toEqual([
		expect.objectContaining({
			name: 'entries',
			kind: 'non-serializable-constant',
		}),
		expect.objectContaining({
			name: 'helpers',
			kind: 'non-serializable-constant',
		}),
	]);
	expect(captureAnalysis.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED',
			severity: 'error',
			phase: 'capture-analysis',
			passId: 'capture-analysis',
			symbolId: 'symbol:0',
			source: "() => helpers.get('format')?.()",
		}),
	]);
});

test('analyzeCaptures reports non-serializable local constants copied through object spread', async () => {
	const invalidSource = `
import { state } from '@markless/core';

export function App() @{
	let count = state(0);
	const base = { format: () => count + 1 };
	const helpers = { ...base };

	<button onClick={() => helpers.format()}>{count}</button>
}
`;
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/App.tsrx',
		source: invalidSource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena });

	const captureAnalysis = analyzeCaptures({
		semanticGraph,
		symbolResolver,
	});

	expect(semanticGraph.localBindings).toEqual([
		expect.objectContaining({
			name: 'base',
			kind: 'non-serializable-constant',
		}),
		expect.objectContaining({
			name: 'helpers',
			kind: 'non-serializable-constant',
		}),
	]);
	expect(captureAnalysis.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED',
			severity: 'error',
			phase: 'capture-analysis',
			passId: 'capture-analysis',
			symbolId: 'symbol:0',
			source: '() => helpers.format()',
		}),
	]);
});

test('analyzeCaptures reports destructured non-serializable local constants captured in lazy symbols', async () => {
	const invalidSource = `
import { state } from '@markless/core';

export function App() @{
	let count = state(0);
	const helpers = { format: () => count + 1 };
	const { format } = helpers;

	<button onClick={() => format()}>{count}</button>
}
`;
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/App.tsrx',
		source: invalidSource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena });

	const captureAnalysis = analyzeCaptures({
		semanticGraph,
		symbolResolver,
	});

	expect(semanticGraph.localBindings).toEqual([
		expect.objectContaining({
			name: 'helpers',
			kind: 'non-serializable-constant',
		}),
		expect.objectContaining({
			name: 'format',
			kind: 'non-serializable-constant',
		}),
	]);
	expect(captureAnalysis.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED',
			severity: 'error',
			phase: 'capture-analysis',
			passId: 'capture-analysis',
			symbolId: 'symbol:0',
			source: '() => format()',
		}),
	]);
});

test('analyzeCaptures reports unsupported inline destructured values captured in lazy symbols', async () => {
	const invalidSource = `
import { state } from '@markless/core';

export function App() @{
	let count = state(0);
	const { format } = { format: () => count + 1 };

	<button onClick={() => format()}>{count}</button>
}
`;
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/App.tsrx',
		source: invalidSource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena });

	const captureAnalysis = analyzeCaptures({
		semanticGraph,
		symbolResolver,
	});

	expect(semanticGraph.localBindings).toEqual([
		expect.objectContaining({
			name: 'format',
			kind: 'function',
		}),
	]);
	expect(captureAnalysis.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED',
			severity: 'error',
			phase: 'capture-analysis',
			passId: 'capture-analysis',
			symbolId: 'symbol:0',
			source: '() => format()',
		}),
	]);
});

test('analyzeCaptures ignores unsupported local names that only appear in string literals', async () => {
	const validSource = `
import { state } from '@markless/core';

export function App() @{
	let count = state(0);
	const format = () => count + 1;

	<button onClick={() => console.log('format')}>{count}</button>
}
`;
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/App.tsrx',
		source: validSource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena });

	const captureAnalysis = analyzeCaptures({
		semanticGraph,
		symbolResolver,
	});

	expect(semanticGraph.localBindings).toEqual([
		expect.objectContaining({
			name: 'format',
			kind: 'function',
		}),
	]);
	expect(captureAnalysis.diagnostics).toEqual([]);
});

test('analyzeCaptures ignores unsupported local names that only appear as member properties', async () => {
	const validSource = `
import { state } from '@markless/core';

export function App() @{
	const data = state({ format: 'ready' });
	const format = () => data.format;

	<button onClick={() => data.format}>{data.format}</button>
}
`;
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/App.tsrx',
		source: validSource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena });

	const captureAnalysis = analyzeCaptures({
		semanticGraph,
		symbolResolver,
	});

	expect(semanticGraph.localBindings).toEqual([
		expect.objectContaining({
			name: 'format',
			kind: 'function',
		}),
	]);
	expect(captureAnalysis.diagnostics).toEqual([]);
});

test('analyzeCaptures ignores unsupported local names that only appear as object property keys', async () => {
	const validSource = `
import { state } from '@markless/core';

export function App() @{
	let count = state(0);
	const format = () => count + 1;

	<button onClick={() => ({ format: count })}>{count}</button>
}
`;
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/App.tsrx',
		source: validSource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena });

	const captureAnalysis = analyzeCaptures({
		semanticGraph,
		symbolResolver,
	});

	expect(semanticGraph.localBindings).toEqual([
		expect.objectContaining({
			name: 'format',
			kind: 'function',
		}),
	]);
	expect(captureAnalysis.diagnostics).toEqual([]);
});

test('analyzeCaptures ignores unsupported local names that only appear as object method keys', async () => {
	const validSource = `
import { state } from '@markless/core';

export function App() @{
	let count = state(0);
	const format = () => count + 1;

	<button onClick={() => ({ format() { return count; } })}>{count}</button>
}
`;
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/App.tsrx',
		source: validSource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena });

	const captureAnalysis = analyzeCaptures({
		semanticGraph,
		symbolResolver,
	});

	expect(semanticGraph.localBindings).toEqual([
		expect.objectContaining({
			name: 'format',
			kind: 'function',
		}),
	]);
	expect(captureAnalysis.diagnostics).toEqual([]);
});

test('analyzeCaptures ignores unsupported local names shadowed by lazy symbol parameters', async () => {
	const validSource = `
import { state } from '@markless/core';

export function App() @{
	let count = state(0);
	const format = () => count + 1;

	<button onClick={(format) => format.currentTarget}>{count}</button>
}
`;
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/App.tsrx',
		source: validSource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena });

	const captureAnalysis = analyzeCaptures({
		semanticGraph,
		symbolResolver,
	});

	expect(semanticGraph.localBindings).toEqual([
		expect.objectContaining({
			name: 'format',
			kind: 'function',
		}),
	]);
	expect(captureAnalysis.diagnostics).toEqual([]);
});

test('analyzeCaptures ignores unsupported local names shadowed by lazy symbol body declarations', async () => {
	const validSource = `
import { state } from '@markless/core';

export function App() @{
	let count = state(0);
	const format = () => count + 1;

	<button onClick={() => {
		const format = () => count;
		return format();
	}}>{count}</button>
}
`;
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/App.tsrx',
		source: validSource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena });

	const captureAnalysis = analyzeCaptures({
		semanticGraph,
		symbolResolver,
	});

	expect(semanticGraph.localBindings).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				name: 'format',
				kind: 'function',
			}),
		]),
	);
	expect(captureAnalysis.diagnostics).toEqual([]);
});

test('analyzeCaptures reports unsupported local class instance captures in lazy symbols', async () => {
	const invalidSource = `
import { state } from '@markless/core';

class Formatter {
	format(value) {
		return String(value);
	}
}

export function App() @{
	let count = state(0);
	const formatter = new Formatter();

	<button onClick={() => formatter.format(count)}>{count}</button>
}
`;
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/App.tsrx',
		source: invalidSource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena });

	const captureAnalysis = analyzeCaptures({
		semanticGraph,
		symbolResolver,
	});

	expect(semanticGraph.localBindings).toEqual([
		expect.objectContaining({
			name: 'formatter',
			kind: 'class-instance',
		}),
	]);
	expect(captureAnalysis.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED',
			severity: 'error',
			phase: 'capture-analysis',
			passId: 'capture-analysis',
			symbolId: 'symbol:0',
			source: '() => formatter.format(count)',
			suggestions: [
				{
					message:
						'Represent durable data with state()/computed(), hoist serializable helpers to module scope, or move DOM-backed setup into a host element behavior with attach.',
				},
			],
		}),
	]);
});

test('analyzeCaptures reports unsupported local DOM node captures in lazy symbols', async () => {
	const invalidSource = `
import { state } from '@markless/core';

export function App() @{
	let count = state(0);
	const panel = document.querySelector('#panel');

	<button onClick={() => panel?.scrollIntoView()}>{count}</button>
}
`;
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/App.tsrx',
		source: invalidSource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena });

	const captureAnalysis = analyzeCaptures({
		semanticGraph,
		symbolResolver,
	});

	expect(semanticGraph.localBindings).toEqual([
		expect.objectContaining({
			name: 'panel',
			kind: 'dom-node',
		}),
	]);
	expect(captureAnalysis.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED',
			severity: 'error',
			phase: 'capture-analysis',
			passId: 'capture-analysis',
			symbolId: 'symbol:0',
			source: '() => panel?.scrollIntoView()',
			suggestions: [
				{
					message:
						'Use element() with el={...} for DOM locators, or move DOM-backed setup into a host element behavior with attach.',
				},
			],
		}),
	]);
});

test('analyzeCaptures reports unsupported locally created DOM node captures in lazy symbols', async () => {
	const invalidSource = `
import { state } from '@markless/core';

export function App() @{
	let count = state(0);
	const panel = document.createElement('section');

	<button onClick={() => panel.remove()}>{count}</button>
}
`;
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/App.tsrx',
		source: invalidSource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena });

	const captureAnalysis = analyzeCaptures({
		semanticGraph,
		symbolResolver,
	});

	expect(semanticGraph.localBindings).toEqual([
		expect.objectContaining({
			name: 'panel',
			kind: 'dom-node',
		}),
	]);
	expect(captureAnalysis.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED',
			severity: 'error',
			phase: 'capture-analysis',
			passId: 'capture-analysis',
			symbolId: 'symbol:0',
			source: '() => panel.remove()',
			suggestions: [
				{
					message:
						'Use element() with el={...} for DOM locators, or move DOM-backed setup into a host element behavior with attach.',
				},
			],
		}),
	]);
});

test('B908 Unit B reports behavior factory captures with behavior emit diagnostic', async () => {
	const invalidSource = `
import { state } from '@markless/core';

export function App() @{
	let label = state('');
	const localFormatter = () => label;
	const installLabel = () => (element) => {
		element.textContent = localFormatter();
	};

	<canvas attach={installLabel()} />
}
`;
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/BehaviorCapture.tsrx',
		source: invalidSource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena });

	const captureAnalysis = analyzeCaptures({
		semanticGraph,
		symbolResolver,
	});

	expect(captureAnalysis.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_BEHAVIOR_SYMBOL_EMIT_UNSUPPORTED',
			severity: 'error',
			phase: 'capture-analysis',
			passId: 'capture-analysis',
			symbolId: 'symbol:0',
			source: 'installLabel()',
			message: expect.stringContaining('installLabel'),
		}),
	]);
});

// The capture substrate must answer "does this lazy symbol read the component
// local?" the way JavaScript scoping does. A handler that declares its own
// binding of the same name reads its own binding, so nothing crosses the
// resume boundary and no diagnostic is owed.
test('analyzeCaptures does not report a component local that the lazy symbol shadows', async () => {
	const shadowingSource = `
import { state } from '@markless/core';

export function App() @{
	let count = state(0);
	const format = (value) => value + 1;

	<section>
		<button onClick={(format) => format(count)}>{count}</button>
		<button onClick={() => { const format = (value) => value; format(count); }}>{count}</button>
	</section>
}
`;
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/Shadowed.tsrx',
		source: shadowingSource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena });

	expect(semanticGraph.localBindings).toEqual(
		expect.arrayContaining([expect.objectContaining({ name: 'format', kind: 'function' })]),
	);

	const captureAnalysis = analyzeCaptures({
		semanticGraph,
		symbolResolver,
	});

	expect(captureAnalysis.diagnostics).toEqual([]);
});

// Only real reference positions count. A component local's name appearing as
// string text, an object literal key, or a member property is not a read of
// that binding and must not produce a capture diagnostic.
test('analyzeCaptures ignores component local names that are not reference positions', async () => {
	const mentionSource = `
import { state } from '@markless/core';

export function App() @{
	let count = state(0);
	const format = (value) => value + 1;

	<button onClick={() => console.log('format', { format: 1 }, count.format, count)}>{count}</button>
}
`;
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/Mentions.tsrx',
		source: mentionSource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena });

	expect(semanticGraph.localBindings).toEqual([
		expect.objectContaining({ name: 'format', kind: 'function' }),
	]);

	const captureAnalysis = analyzeCaptures({
		semanticGraph,
		symbolResolver,
	});

	expect(captureAnalysis.diagnostics).toEqual([]);
});

// A non-empty source the analyzer cannot read yields no free names - the same
// empty answer a source that genuinely captures nothing yields. Reading that
// silence as "no captures" would emit a lazy symbol whose captures were never
// checked, so a failed reading has to refuse instead of proceed.
test('analyzeCaptures refuses a symbol whose non-empty source could not be analyzed', async () => {
	const analyzableSource = `
import { state } from '@markless/core';

export function App() @{
	let count = state(0);
	const format = () => count + 1;

	<button onClick={() => count++}>{count}</button>
}
`;
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/Unanalyzable.tsrx',
		source: analyzableSource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena });

	expect(semanticGraph.localBindings).toEqual([
		expect.objectContaining({ name: 'format', kind: 'function' }),
	]);
	// As authored the handler reads no component local, so it is clean.
	expect(analyzeCaptures({ semanticGraph, symbolResolver }).diagnostics).toEqual([]);

	// Same graph and same component local, but the symbol now carries a
	// non-empty source the analyzer cannot parse.
	const unanalyzable = {
		...symbolResolver,
		symbols: symbolResolver.symbols.map((symbol) =>
			symbol.id === 'symbol:0' ? { ...symbol, source: '() => format(' } : symbol,
		),
	};

	expect(analyzeCaptures({ semanticGraph, symbolResolver: unanalyzable }).diagnostics).toEqual([
		expect.objectContaining({
			code: EVENT_HANDLER_EMIT_UNSUPPORTED_CODE,
			severity: 'error',
			phase: CAPTURE_ANALYSIS_PHASE,
			passId: CAPTURE_ANALYSIS_PASS_ID,
			symbolId: 'symbol:0',
			source: '() => format(',
		}),
	]);
});

// The refusal cannot be spelled through component-local bindings: a component
// with no locals at all still has a source the analyzer could not read, and its
// captures are just as unknown. Reporting only when a local exists would let the
// same unreadable source pass silently in every component without one.
test('analyzeCaptures refuses an unanalyzable source in a component with no locals', async () => {
	const analyzableSource = `
import { state } from '@markless/core';

export function App() @{
	let count = state(0);

	<button onClick={() => count++}>{count}</button>
}
`;
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/NoLocals.tsrx',
		source: analyzableSource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena });

	expect(semanticGraph.localBindings).toEqual([]);
	expect(analyzeCaptures({ semanticGraph, symbolResolver }).diagnostics).toEqual([]);

	const unanalyzable = {
		...symbolResolver,
		symbols: symbolResolver.symbols.map((symbol) =>
			symbol.id === 'symbol:0' ? { ...symbol, source: '() => count++ (' } : symbol,
		),
	};

	expect(analyzeCaptures({ semanticGraph, symbolResolver: unanalyzable }).diagnostics).toEqual([
		expect.objectContaining({
			code: EVENT_HANDLER_EMIT_UNSUPPORTED_CODE,
			severity: 'error',
			phase: CAPTURE_ANALYSIS_PHASE,
			passId: CAPTURE_ANALYSIS_PASS_ID,
			symbolId: 'symbol:0',
			source: '() => count++ (',
		}),
	]);
});
