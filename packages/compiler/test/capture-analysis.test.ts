import { expect, test } from 'vitest';
import {
	buildSemanticGraph,
	lowerStateAccess,
	planPayloadArena,
	planSymbolResolver,
} from '../src/index.ts';
import { analyzeCaptures } from '../src/passes/capture-analysis.ts';

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
			code: 'MARKLESS_CAPTURE_UNSUPPORTED_VALUE',
			severity: 'error',
			phase: 'capture-analysis',
			passId: 'capture-analysis',
			symbolId: 'symbol:0',
			source: '() => format()',
			title: 'Cannot capture local function in lazy symbol',
			message:
				'Cannot capture "format" in lazy event-handler symbol "symbol:0" because local function values cannot cross a resume boundary.',
			why: 'Lazy symbols run after browser resume. Captures must be graph references, element handles, props/shared values, module imports, or serializable constants.',
			suggestions: [
				{
					message:
						'Move the helper to module scope, inline the derivation, or represent durable data with state()/computed().',
				},
			],
			docsUrl: 'https://markless.dev/errors/MARKLESS_CAPTURE_UNSUPPORTED_VALUE',
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
			code: 'MARKLESS_CAPTURE_UNSUPPORTED_VALUE',
			severity: 'error',
			phase: 'capture-analysis',
			passId: 'capture-analysis',
			symbolId: 'symbol:0',
			source: '() => render()',
			title: 'Cannot capture local function in lazy symbol',
			message:
				'Cannot capture "render" in lazy event-handler symbol "symbol:0" because local function values cannot cross a resume boundary.',
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
			code: 'MARKLESS_CAPTURE_UNSUPPORTED_VALUE',
			severity: 'error',
			phase: 'capture-analysis',
			passId: 'capture-analysis',
			symbolId: 'symbol:0',
			source: '() => helpers.format()',
			title: 'Cannot capture local non-serializable constant in lazy symbol',
			message:
				'Cannot capture "helpers" in lazy event-handler symbol "symbol:0" because local non-serializable constant values cannot cross a resume boundary.',
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
			code: 'MARKLESS_CAPTURE_UNSUPPORTED_VALUE',
			severity: 'error',
			phase: 'capture-analysis',
			passId: 'capture-analysis',
			symbolId: 'symbol:0',
			source: "() => helpers.get('format')?.()",
			title: 'Cannot capture local non-serializable constant in lazy symbol',
			message:
				'Cannot capture "helpers" in lazy event-handler symbol "symbol:0" because local non-serializable constant values cannot cross a resume boundary.',
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
			code: 'MARKLESS_CAPTURE_UNSUPPORTED_VALUE',
			severity: 'error',
			phase: 'capture-analysis',
			passId: 'capture-analysis',
			symbolId: 'symbol:0',
			source: "() => helpers.get('format')?.()",
			title: 'Cannot capture local non-serializable constant in lazy symbol',
			message:
				'Cannot capture "helpers" in lazy event-handler symbol "symbol:0" because local non-serializable constant values cannot cross a resume boundary.',
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
			code: 'MARKLESS_CAPTURE_UNSUPPORTED_VALUE',
			severity: 'error',
			phase: 'capture-analysis',
			passId: 'capture-analysis',
			symbolId: 'symbol:0',
			source: '() => helpers.format()',
			title: 'Cannot capture local non-serializable constant in lazy symbol',
			message:
				'Cannot capture "helpers" in lazy event-handler symbol "symbol:0" because local non-serializable constant values cannot cross a resume boundary.',
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
			code: 'MARKLESS_CAPTURE_UNSUPPORTED_VALUE',
			severity: 'error',
			phase: 'capture-analysis',
			passId: 'capture-analysis',
			symbolId: 'symbol:0',
			source: '() => format()',
			title: 'Cannot capture local non-serializable constant in lazy symbol',
			message:
				'Cannot capture "format" in lazy event-handler symbol "symbol:0" because local non-serializable constant values cannot cross a resume boundary.',
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
			code: 'MARKLESS_CAPTURE_UNSUPPORTED_VALUE',
			severity: 'error',
			phase: 'capture-analysis',
			passId: 'capture-analysis',
			symbolId: 'symbol:0',
			source: '() => format()',
			title: 'Cannot capture local function in lazy symbol',
			message:
				'Cannot capture "format" in lazy event-handler symbol "symbol:0" because local function values cannot cross a resume boundary.',
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
			code: 'MARKLESS_CAPTURE_UNSUPPORTED_VALUE',
			severity: 'error',
			phase: 'capture-analysis',
			passId: 'capture-analysis',
			symbolId: 'symbol:0',
			source: '() => formatter.format(count)',
			title: 'Cannot capture local class instance in lazy symbol',
			message:
				'Cannot capture "formatter" in lazy event-handler symbol "symbol:0" because local class instance values cannot cross a resume boundary.',
			why: 'Lazy symbols run after browser resume. Captures must be graph references, element handles, props/shared values, module imports, or serializable constants.',
			suggestions: [
				{
					message:
						'Represent durable data with state()/computed(), hoist serializable helpers to module scope, or move DOM-backed setup into a host element behavior with attach.',
				},
			],
			docsUrl: 'https://markless.dev/errors/MARKLESS_CAPTURE_UNSUPPORTED_VALUE',
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
			code: 'MARKLESS_CAPTURE_UNSUPPORTED_VALUE',
			severity: 'error',
			phase: 'capture-analysis',
			passId: 'capture-analysis',
			symbolId: 'symbol:0',
			source: '() => panel?.scrollIntoView()',
			title: 'Cannot capture local DOM node in lazy symbol',
			message:
				'Cannot capture "panel" in lazy event-handler symbol "symbol:0" because local DOM node values cannot cross a resume boundary.',
			why: 'Lazy symbols run after browser resume. Captures must be graph references, element handles, props/shared values, module imports, or serializable constants.',
			suggestions: [
				{
					message:
						'Use element() with el={...} for DOM locators, or move DOM-backed setup into a host element behavior with attach.',
				},
			],
			docsUrl: 'https://markless.dev/errors/MARKLESS_CAPTURE_UNSUPPORTED_VALUE',
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
			code: 'MARKLESS_CAPTURE_UNSUPPORTED_VALUE',
			severity: 'error',
			phase: 'capture-analysis',
			passId: 'capture-analysis',
			symbolId: 'symbol:0',
			source: '() => panel.remove()',
			title: 'Cannot capture local DOM node in lazy symbol',
			message:
				'Cannot capture "panel" in lazy event-handler symbol "symbol:0" because local DOM node values cannot cross a resume boundary.',
			why: 'Lazy symbols run after browser resume. Captures must be graph references, element handles, props/shared values, module imports, or serializable constants.',
			suggestions: [
				{
					message:
						'Use element() with el={...} for DOM locators, or move DOM-backed setup into a host element behavior with attach.',
				},
			],
			docsUrl: 'https://markless.dev/errors/MARKLESS_CAPTURE_UNSUPPORTED_VALUE',
		}),
	]);
});
