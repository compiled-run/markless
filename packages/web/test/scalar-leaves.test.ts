import { expect, test, vi } from 'vitest';
import { marklessDispatchScalar } from '../src/fns/dispatch-scalar.ts';
import { marklessUpdateText } from '../src/fns/update-text.ts';
import { marklessWriteScalar } from '../src/fns/write-scalar.ts';

test('scalar dispatch leaf delegates to the existing container dispatch flow', async () => {
	const dispatch = vi.fn(async () => undefined);
	const event = { type: 'click', target: null };
	const eventRecord = { hostNodeId: 'h1', eventName: 'click', symbolIds: ['symbol:click'] };

	await marklessDispatchScalar({
		container: { graph: {} as never, view: {} as never, dispatch, dispose: vi.fn() },
		event,
		eventRecord,
		syncPolicyAlreadyApplied: true,
	});

	expect(dispatch).toHaveBeenCalledWith(event, {
		element: undefined,
		eventRecord,
		syncPolicyAlreadyApplied: true,
	});
});

test('scalar dispatch leaf fails loudly when no event record was matched', async () => {
	await expect(
		marklessDispatchScalar({
			container: { graph: {} as never, view: {} as never, dispatch: vi.fn(), dispose: vi.fn() },
			event: { type: 'click', target: null },
		}),
	).rejects.toMatchObject({
		code: 'MARKLESS_SCALAR_DISPATCH_RECORD_MISSING',
		severity: 'error',
		phase: 'runtime',
	});
});

test('scalar write leaf fails loudly when no graph is available', () => {
	expect(() =>
		marklessWriteScalar({}, { graphNodeId: 'state:count', value: 1 }),
	).toThrowError(
		expect.objectContaining({
			code: 'MARKLESS_SCALAR_WRITE_GRAPH_MISSING',
			graphNodeId: 'state:count',
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
	).toThrowError(expect.objectContaining({ code: 'MARKLESS_SCALAR_WRITE_SHAPE' }));
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
			code: 'MARKLESS_SCALAR_WRITE_CELL_MISSING',
			graphNodeId: 'state:missing',
		}),
	);
});

test('text update leaf fails loudly when no record or fallback locator exists', () => {
	expect(() => marklessUpdateText({}, '')).toThrowError(
		expect.objectContaining({ code: 'MARKLESS_TEXT_UPDATE_RECORD_MISSING' }),
	);
});
