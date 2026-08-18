import { expect, test } from 'vitest';
import {
	ASYNC_PROTOCOL_VERSION,
	createProtocolStatePayload,
	deserializeGraphValue,
	ProtocolStateSerializationError,
	protocolStateVersion,
	serializeRuntimeStateCells,
	STORAGE_PROTOCOL_VERSION,
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

test('storage-free protocol state remains version 1 byte-identical', () => {
	const payload = createProtocolStatePayload({ cells: [] });

	expect(JSON.stringify(payload)).toBe('{"version":1,"cells":[],"computed":[]}');
});

test('storage protocol state emits version 2 records beside fallback cells', () => {
	const payload = createProtocolStatePayload({
		cells: [
			{
				graphNodeId: 'storage:src/App.tsrx#theme-mode',
				name: 'theme',
				valueKind: 'scalar',
				value: 'light',
			},
		],
		storage: [
			{
				graphNodeId: 'storage:src/App.tsrx#theme-mode',
				key: 'theme-mode',
			},
		],
	});

	expect(payload.version).toBe(2);
	expect(payload.storage).toEqual([
		{
			graphNodeId: 'storage:src/App.tsrx#theme-mode',
			key: 'theme-mode',
		},
	]);
	expect(deserializeGraphValue(payload.cells[0]?.value as never)).toBe('light');
});

// Other payload composers (the router's MDX route) stamp the version themselves;
// a stamp that disagreed with the records shipped a payload the client refuses.
test('protocolStateVersion is the one rule createProtocolStatePayload stamps with', () => {
	expect(protocolStateVersion(undefined)).toBe(ASYNC_PROTOCOL_VERSION);
	expect(protocolStateVersion([])).toBe(ASYNC_PROTOCOL_VERSION);
	expect(protocolStateVersion([{ graphNodeId: 'storage:a#k', key: 'k' }])).toBe(
		STORAGE_PROTOCOL_VERSION,
	);
	expect(createProtocolStatePayload({ cells: [] }).version).toBe(protocolStateVersion([]));
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

test('serializeRuntimeStateCells envelope-encodes live directValue cells for served payloads', () => {
	const encoded = createProtocolStatePayload({
		cells: [{ graphNodeId: 'state:count', name: 'count', valueKind: 'scalar', value: 3 }],
	}).cells[0]!;
	const cells = serializeRuntimeStateCells([
		encoded,
		{
			graphNodeId: 'prop:props',
			name: 'props',
			valueKind: 'object',
			directValue: { params: { owner: 'ada' }, status: 200 },
		},
	]);

	// Already-encoded cells pass through untouched.
	expect(cells[0]).toBe(encoded);
	const propCell = cells[1]!;
	expect('directValue' in propCell).toBe(false);
	expect(propCell).toMatchObject({
		graphNodeId: 'prop:props',
		name: 'props',
		valueKind: 'object',
	});
	expect(deserializeGraphValue(propCell.value as never)).toEqual({
		params: { owner: 'ada' },
		status: 200,
	});
});

test('serializeRuntimeStateCells fills durable defaults for bare live cells (CSR seed shape)', () => {
	const cells = serializeRuntimeStateCells([
		{ graphNodeId: 'prop:props', directValue: { owner: 'ada' } } as never,
	]);

	expect(cells[0]).toMatchObject({ graphNodeId: 'prop:props', name: '', valueKind: 'unknown' });
	expect(deserializeGraphValue((cells[0] as { value: never }).value)).toEqual({ owner: 'ada' });
});

test('serializeRuntimeStateCells keeps the durable diagnostic shape for unsupported live values', () => {
	const error = captureThrown(() =>
		serializeRuntimeStateCells([
			{
				graphNodeId: 'prop:props',
				name: 'props',
				valueKind: 'object',
				directValue: { socket: () => undefined },
			},
		]),
	);

	expect(error).toBeInstanceOf(ProtocolStateSerializationError);
	expect(error).toMatchObject({
		code: 'MARKLESS_SERIALIZE_UNSUPPORTED_VALUE',
		graphNodeId: 'prop:props',
		cellName: 'props',
		statePath: 'props.socket',
		valueKind: 'function',
	});
});

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
