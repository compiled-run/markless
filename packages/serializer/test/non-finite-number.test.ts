import { expect, test } from 'vitest';
import {
	createProtocolStatePayload,
	deserializeGraphValue,
	serializeGraphValue,
} from '../src/index.ts';
import { deserializeGraphValueForClient } from '../src/value-decode-client.ts';
import { assertProtocolStatePayload } from '../src/protocol-validation.ts';

// JSON has no form for Infinity or NaN: a bare number slot prints as `null`, so
// a seed of Number.POSITIVE_INFINITY silently became nothing on the resumed page.
// The tag is a slot, not a record, so it costs nothing for finite numbers.

function wire(value: unknown) {
	const result = serializeGraphValue(value);
	expect(result.ok).toBe(true);
	if (!result.ok) throw new Error('refused');
	return JSON.parse(JSON.stringify(result.payload));
}

for (const [label, value] of [
	['positive infinity', Number.POSITIVE_INFINITY],
	['negative infinity', Number.NEGATIVE_INFINITY],
	['NaN', Number.NaN],
] as const) {
	test(`${label} survives JSON as a graph value root`, () => {
		expect(deserializeGraphValue(wire(value))).toBe(value);
	});

	test(`${label} survives JSON inside an object field`, () => {
		expect(deserializeGraphValue(wire({ limit: value }))).toEqual({ limit: value });
	});

	test(`${label} survives JSON on the client decoder`, async () => {
		await expect(deserializeGraphValueForClient(wire({ limit: value }))).resolves.toEqual({
			limit: value,
		});
	});
}

test('the encoding names the value rather than printing a number', () => {
	expect(wire(Number.POSITIVE_INFINITY)).toEqual({
		version: 1,
		root: { $type: 'number', value: 'Infinity' },
		records: [],
	});
	expect(wire(Number.NEGATIVE_INFINITY).root).toEqual({ $type: 'number', value: '-Infinity' });
	expect(wire(Number.NaN).root).toEqual({ $type: 'number', value: 'NaN' });
});

test('finite numbers keep their bare-number bytes', () => {
	for (const finite of [0, -0, 1, -7, 3.5, 1e21, Number.MAX_SAFE_INTEGER, Number.EPSILON]) {
		const result = serializeGraphValue({ n: finite });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(JSON.stringify(result.payload)).toBe(
			JSON.stringify({
				version: 1,
				root: { $ref: 0 },
				records: [{ id: 0, type: 'object', fields: [['n', finite]] }],
			}),
		);
	}
});

test('a served cell carrying a non-finite number validates as a protocol payload', () => {
	const payload = createProtocolStatePayload({
		cells: [
			{
				graphNodeId: 'state:gate',
				name: 'gate',
				valueKind: 'object',
				value: { maxWidth: Number.POSITIVE_INFINITY },
			},
		],
	});

	expect(() =>
		assertProtocolStatePayload(JSON.parse(JSON.stringify(payload))),
	).not.toThrow();
});

test('a number tag naming something other than a non-finite value is refused', () => {
	const payload = createProtocolStatePayload({
		cells: [{ graphNodeId: 'state:gate', name: 'gate', valueKind: 'scalar', value: 1 }],
	});
	const tampered = JSON.parse(JSON.stringify(payload));
	tampered.cells[0].value.root = { $type: 'number', value: '12' };

	expect(() => assertProtocolStatePayload(tampered)).toThrow();
});
