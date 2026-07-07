import { expect, test } from 'vitest';
import {
	createProtocolStatePayload,
	deserializeGraphValue,
	ProtocolStateSerializationError,
} from '../src/index.ts';

test('createProtocolStatePayload serializes async computed snapshot values', () => {
	const state = createProtocolStatePayload({
		cells: [],
		computed: [
			{
				graphNodeId: 'computed:details',
				name: 'details',
				async: true,
				dependencies: [{ graphNodeId: 'state:userId', path: [] }],
				snapshot: {
					status: 'fulfilled',
					version: 1,
					key: 'ada',
					value: { title: 'User ada' },
				},
			},
		],
	});
	const snapshot = state.computed[0]?.snapshot;

	expect(snapshot).toMatchObject({
		status: 'fulfilled',
		version: 1,
	});
	if (!snapshot || snapshot.status !== 'fulfilled') {
		throw new Error('Expected fulfilled snapshot.');
	}
	expect(deserializeGraphValue(snapshot.key)).toBe('ada');
	expect(deserializeGraphValue(snapshot.value)).toEqual({ title: 'User ada' });
});

test('createProtocolStatePayload preserves structured serialization diagnostics when a state cell fails', () => {
	const error = captureThrown(() =>
		createProtocolStatePayload({
			cells: [
				{
					graphNodeId: 'state:session',
					name: 'session',
					valueKind: 'object',
					value: {
						socket: () => undefined,
					},
				},
			],
		}),
	);

	expect(error).toBeInstanceOf(ProtocolStateSerializationError);
	expect(error).toMatchObject({
		code: 'MARKLESS_SERIALIZE_UNSUPPORTED_VALUE',
		severity: 'error',
		phase: 'serialization',
		title: 'Cannot serialize graph state value',
		graphNodeId: 'state:session',
		cellName: 'session',
		path: ['socket'],
		statePath: 'session.socket',
		valueKind: 'function',
		docsUrl: 'https://markless.dev/errors/MARKLESS_SERIALIZE_UNSUPPORTED_VALUE',
		suggestions: [
			{
				message: expect.stringContaining('attach={...}'),
			},
		],
	});
	expect(error).toMatchObject({
		message:
			'Cannot serialize value at session.socket because function values are not durable graph state.',
		why: expect.stringContaining('durable graph state'),
	});
});

function captureThrown(run: () => unknown): unknown {
	try {
		run();
	} catch (error) {
		return error;
	}

	throw new Error('Expected callback to throw.');
}

test('rejected async snapshots serialize a durable error shape instead of failing the render', () => {
	const payload = createProtocolStatePayload({
		cells: [],
		computed: [
			{
				graphNodeId: 'computed:model',
				name: 'model',
				async: true,
				dependencies: [],
				snapshot: {
					status: 'rejected',
					version: 1,
					key: undefined,
					error: new TypeError('fetch failed'),
				},
			},
		],
	} as never);

	const snapshot = (payload.computed[0] as { snapshot?: { error?: unknown } }).snapshot;
	expect(deserializeGraphValue(snapshot?.error as never)).toEqual({
		$type: 'error',
		name: 'TypeError',
		message: 'fetch failed',
	});
});
