import { expect, test } from 'vitest';
import { marklessDecodeScalarCell } from '../src/fns/scalar-specialized.ts';

const dateCell = (value: string) => ({
	graphNodeId: 'state:created',
	valueKind: 'scalar',
	value: { version: 1, root: { $type: 'date', value }, records: [] },
});

test('specialized scalar payload decoder accepts Date scalar slots', () => {
	const value = marklessDecodeScalarCell(dateCell('2026-06-16T12:00:00.000Z'), 'state:created', 'markless/state cell[0]');
	expect(value).toBeInstanceOf(Date);
	expect((value as Date).toISOString()).toBe('2026-06-16T12:00:00.000Z');
});

test('specialized scalar payload decoder rejects invalid Date scalar slots', () => {
	expect(() => marklessDecodeScalarCell(dateCell('not-a-date'), 'state:created', 'markless/state cell[0]')).toThrow(expect.objectContaining({
		code: 'MARKLESS_PAYLOAD_INVALID',
		site: 'markless/state cell[0]',
	}));
});
