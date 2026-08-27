import { expect, test } from 'vitest';
import { marklessDecodeScalarCell } from '../../src/fns/scalar-specialized.ts';

const cell = (root: unknown) => ({
	graphNodeId: 'state:limit',
	valueKind: 'scalar',
	value: { version: 1, root, records: [] },
});

const decode = (root: unknown) =>
	marklessDecodeScalarCell(cell(root) as never, 'state:limit', 'markless/state cell[0]');

test.each([
	['Infinity', Number.POSITIVE_INFINITY],
	['-Infinity', Number.NEGATIVE_INFINITY],
	['NaN', Number.NaN],
])('the specialized scalar reader decodes the %s tag', (name, value) => {
	expect(decode({ $type: 'number', value: name })).toBe(value);
});

test('the specialized scalar reader still reads a bare finite number', () => {
	expect(decode(3.5)).toBe(3.5);
});

test('the specialized scalar reader still refuses an unknown tag', () => {
	expect(() => decode({ $type: 'complex', value: '1+2i' })).toThrow(
		expect.objectContaining({ code: 'MARKLESS_PAYLOAD_INVALID' }),
	);
});
