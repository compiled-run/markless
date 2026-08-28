import { expect, test } from 'vitest';
import { deserializeGraphValueForClient } from '../../../serializer/src/value-decode-client.ts';
import type { SerializedGraphPayload } from '../../../serializer/src/value-decode-client.ts';
import { marklessSerializeGraphValue } from '../../src/fns/state-serialize.ts';

// The SSR runtime writes the served state cell with its own encoder, a second
// implementation of the same protocol the serializer package owns. A bare
// number slot prints `Infinity` as `null`, so an unfoldable seed field like
// `maxWidth: Number.POSITIVE_INFINITY` served a hole the resumed derive read.

test('the runtime slot encoder tags a non-finite object field', () => {
	const payload = marklessSerializeGraphValue({
		minWidth: 1,
		maxWidth: Number.POSITIVE_INFINITY,
		floor: Number.NEGATIVE_INFINITY,
		ratio: Number.NaN,
		width: 3,
	});

	const json = JSON.stringify(payload);
	expect(json).toContain('["minWidth",1]');
	expect(json).toContain('["maxWidth",{"$type":"number","value":"Infinity"}]');
	expect(json).toContain('["floor",{"$type":"number","value":"-Infinity"}]');
	expect(json).toContain('["ratio",{"$type":"number","value":"NaN"}]');
	expect(json).toContain('["width",3]');
});

test('the runtime slot encoder tags a non-finite root', () => {
	expect(JSON.stringify(marklessSerializeGraphValue(Number.POSITIVE_INFINITY))).toBe(
		'{"version":1,"root":{"$type":"number","value":"Infinity"},"records":[]}',
	);
});

// The tag is only reached on the non-finite branch, so a page that serves only
// finite numbers ships byte-identical payload scripts.
test.each([0, -0, 1, -7, 3.5, 1e21, Number.MAX_SAFE_INTEGER, Number.EPSILON])(
	'a finite number %p still encodes as a bare slot',
	(value) => {
		expect(JSON.stringify(marklessSerializeGraphValue(value))).toBe(
			`{"version":1,"root":${JSON.stringify(value)},"records":[]}`,
		);
	},
);

test('what the runtime encoder writes is what the serializer decoder reads', async () => {
	const payload = marklessSerializeGraphValue({
		maxWidth: Number.POSITIVE_INFINITY,
		floor: Number.NEGATIVE_INFINITY,
		ratio: Number.NaN,
		width: 3,
	}) as unknown as SerializedGraphPayload;

	expect(await deserializeGraphValueForClient(payload)).toEqual({
		maxWidth: Number.POSITIVE_INFINITY,
		floor: Number.NEGATIVE_INFINITY,
		ratio: Number.NaN,
		width: 3,
	});
});
