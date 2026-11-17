// Writes Tests/MarklessCoreTests/Fixtures/expression-cases.json: what the reference evaluator gives for tricky expressions.
import { writeFileSync } from 'node:fs';
import type { NativeExpr, NativeScalar } from '@markless/serializer';
import { evaluateNativeExpr } from '../../../runtime.ts';

type Literal = NativeScalar | null;
const literal = (value: Literal): NativeExpr => ({ literal: value });
const notANumber: NativeExpr = { binary: '/', left: literal(0), right: literal(0) };
const call = (name: Extract<NativeExpr, { call: unknown }>['call'], ...args: NativeExpr[]): NativeExpr => ({ call: name, arguments: args });
const strings = ['', ' 12 ', '5x', '0x1F', '0b101', '0o17', '-0x1', '1e3', '.5', '5.', '1.e2', 'Infinity', '-Infinity', 'infinity', '  7 \n', '1_000', '+', '-.5e-2', 'abc', 'a', 'B', '10', '9', '1e400'];
const values: NativeExpr[] = [
	...[0, -0, 1, -1, 0.5, -0.5, 1.5, -1.5, 2.5, -2.5, 0.49999999999999994, 1e21, 123.456, 7, -7, 3, true, false, null, ...strings].map(literal),
	notANumber,
];
const cases: NativeExpr[] = [];
for (const value of values) {
	for (const name of ['Number', 'String', 'Boolean', 'Math.round', 'Math.floor', 'Math.abs'] as const) cases.push(call(name, value));
	for (const unary of ['-', '+', '!'] as const) cases.push({ unary, value });
}
const pairs: [NativeExpr, NativeExpr][] = (
	[[1, '2'], ['1', 2], [1, 2], [true, 1], [null, 1], ['a', 'B'], ['10', '9'], [10, '9'], ['5x', 1], [0, -0], [7, 3], [-7, 3], [7, -3], [5.5, 2], [1, 0], [-1, 0], [0, 0], [1, null], [null, null], ['', 0], [false, 0], [1e308, 10]] as [Literal, Literal][]
).map(([a, b]) => [literal(a), literal(b)]);
pairs.push([notANumber, literal(1)], [notANumber, notANumber], [{ binary: '/', left: literal(1), right: literal(0) }, literal(2)], [literal(2), { binary: '/', left: literal(1), right: literal(0) }]);
for (const [left, right] of pairs) {
	for (const binary of ['+', '-', '*', '/', '%', '===', '!==', '<', '<=', '>', '>='] as const) cases.push({ binary, left, right });
	for (const logical of ['&&', '||', '??'] as const) cases.push({ logical, left, right });
}
cases.push(
	call('Math.max'), call('Math.min'), call('Math.max', literal(-0), literal(0)), call('Math.min', literal(0), literal(-0)),
	call('Math.max', literal(1), literal('3'), literal(2)), call('Math.min', literal(1), literal('x')), call('String'), call('Number'), call('Boolean'),
	{ template: ['n=', literal(1.5), ', s=', literal(null), '!'] }, { member: literal('héllo 😀'), property: 'length' },
	{ if: literal(''), whenTrue: literal('yes'), whenFalse: literal('no') },
);
const written = cases.map((authored) => {
	const expr = JSON.parse(JSON.stringify(authored)) as NativeExpr;
	const value = evaluateNativeExpr(expr, (cell) => {
		throw new Error(`no cell ${cell}`);
	});
	return { expr, type: value === null ? 'null' : typeof value, text: String(value), negativeZero: Object.is(value, -0) };
});
writeFileSync(new URL('./MarklessCoreTests/Fixtures/expression-cases.json', import.meta.url), `${JSON.stringify(written)}\n`);
