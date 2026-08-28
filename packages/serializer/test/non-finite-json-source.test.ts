import { expect, test } from 'vitest';
import { jsonSourceWithNonFiniteNumbers, nonFiniteName } from '../src/index.ts';

// The emitted modules are JavaScript, so the printer is the serializer's own
// tag spoken as source: every emitter over a folded value shares this one copy.

test('a payload with no non-finite number is JSON byte for byte', () => {
	const payload = {
		text: 'a "quoted" line\nwith \\escapes and  ',
		rows: [1, null, -0, 1e308, { nested: [true, false] }],
		empty: {},
	};

	expect(jsonSourceWithNonFiniteNumbers(payload)).toBe(JSON.stringify(payload));
	expect(jsonSourceWithNonFiniteNumbers(undefined)).toBeUndefined();
	expect(jsonSourceWithNonFiniteNumbers(() => 1)).toBeUndefined();
});

test('each non-finite number prints as the name that denotes it', () => {
	expect(jsonSourceWithNonFiniteNumbers(Number.POSITIVE_INFINITY)).toBe('Infinity');
	expect(jsonSourceWithNonFiniteNumbers(Number.NEGATIVE_INFINITY)).toBe('-Infinity');
	expect(jsonSourceWithNonFiniteNumbers(Number.NaN)).toBe('NaN');
	expect(
		jsonSourceWithNonFiniteNumbers({
			cap: Number.POSITIVE_INFINITY,
			floor: Number.NEGATIVE_INFINITY,
			missing: Number.NaN,
			span: 3,
		}),
	).toBe(
		`{"cap":${nonFiniteName(Number.POSITIVE_INFINITY)},"floor":${nonFiniteName(
			Number.NEGATIVE_INFINITY,
		)},"missing":${nonFiniteName(Number.NaN)},"span":3}`,
	);
});

test('the printed source evaluates back to the value it was given', () => {
	const value = { cap: Number.POSITIVE_INFINITY, rows: [Number.NaN, 2], label: 'rows' };
	const source = jsonSourceWithNonFiniteNumbers(value);

	expect(source).toBeDefined();
	expect(new Function(`return (${String(source)});`)()).toEqual(value);
});

test('a payload spelling the printer marker keeps it as authored text', () => {
	const payload = { note: ' markless-non-finite0', cap: Number.POSITIVE_INFINITY };

	expect(jsonSourceWithNonFiniteNumbers(payload)).toBe(
		`{"note":" markless-non-finite0","cap":${nonFiniteName(Number.POSITIVE_INFINITY)}}`,
	);
});
