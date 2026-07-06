import { expect, test, vi } from 'vitest';
import { marklessCreateScalarCoreGraph } from '../src/fns/scalar-core-graph.ts';
import { marklessUpdateText } from '../src/fns/update-text.ts';
import { marklessWriteScalar } from '../src/fns/write-scalar.ts';
import { enrichRuntimeErrorForReporting } from '../src/runtime-error-reporting.ts';

test('scalar write leaf fails loudly when no graph is available', () => {
	expect(() =>
		marklessWriteScalar({}, { graphNodeId: 'state:count', value: 1 }),
	).toThrowError(
		expect.objectContaining({
			message: 'MARKLESS_SCALAR_WRITE_GRAPH_MISSING',
			code: 'MARKLESS_SCALAR_WRITE_GRAPH_MISSING',
			site: 'write-graph',
		}),
	);
});

test('scalar write leaf rejects non-scalar path writes', () => {
	expect(() =>
		marklessWriteScalar({
			graph: {
				read: vi.fn(),
				write: vi.fn(),
				update: vi.fn(),
			},
		}, { graphNodeId: 'state:count', path: ['nested'], value: 1 }),
	).toThrowError(expect.objectContaining({
		message: 'MARKLESS_SCALAR_WRITE_SHAPE',
		code: 'MARKLESS_SCALAR_WRITE_SHAPE',
		site: 'write-path',
	}));
});

test('scalar write leaf fails loudly when the graph reports a missing cell', () => {
	expect(() =>
		marklessWriteScalar({
			graph: {
				hasCell: () => false,
				read: vi.fn(),
				write: vi.fn(),
				update: vi.fn(),
			},
		}, { graphNodeId: 'state:missing', value: 1 }),
	).toThrowError(
		expect.objectContaining({
			message: 'MARKLESS_SCALAR_WRITE_CELL_MISSING',
			code: 'MARKLESS_SCALAR_WRITE_CELL_MISSING',
			site: 'write-cell',
		}),
	);
});

test('text update leaf fails loudly when no record or fallback locator exists', () => {
	try {
		marklessUpdateText({}, '');
		throw new Error('Expected marklessUpdateText to throw.');
	} catch (error) {
		expect(error).toMatchObject({
			message: 'MARKLESS_TEXT_UPDATE_RECORD_MISSING',
			code: 'MARKLESS_TEXT_UPDATE_RECORD_MISSING',
			site: 'text-record',
		});
		expect(error).not.toHaveProperty('docsUrl');
		expect(error).not.toHaveProperty('severity');
		expect(error).not.toHaveProperty('phase');
	}
});

test('lean scalar escalation errors keep site tags without report-only fields', () => {
	const graph = marklessCreateScalarCoreGraph({ cells: [], domUpdates: [] }, new Map(), vi.fn());
	expect(() => graph.write({ graphNodeId: 'state:count', path: ['nested'], value: 1 })).toThrowError(
		expect.objectContaining({
			message: 'MARKLESS_SCALAR_LEAN_ESCALATE',
			code: 'MARKLESS_SCALAR_LEAN_ESCALATE',
			site: 'write-path',
		}),
	);
});

test('runtime reporting helper enriches slim leaf errors once', () => {
	const error = Object.assign(new Error('MARKLESS_SCALAR_WRITE_GRAPH_MISSING'), {
		code: 'MARKLESS_SCALAR_WRITE_GRAPH_MISSING',
		site: 'write-scalar',
	});

	const enriched = enrichRuntimeErrorForReporting(error, {
		phase: 'event',
		hostNodeId: 'h1',
		symbolId: 'symbol:click',
		graphNodeId: 'state:count',
	} as never);

	expect(enriched).toMatchObject({
		code: 'MARKLESS_SCALAR_WRITE_GRAPH_MISSING',
		site: 'write-scalar',
		severity: 'error',
		phase: 'runtime',
		docsUrl: 'https://markless.dev/errors/MARKLESS_SCALAR_WRITE_GRAPH_MISSING',
		hostNodeId: 'h1',
		graphNodeId: 'state:count',
		symbolId: 'symbol:click',
	});
});
