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
const array = (...values: NativeExpr[]): NativeExpr => ({ array: values.map((value) => ({ spread: false, value })) });
const method = (name: Extract<NativeExpr, { method: unknown }>['method'], target: NativeExpr, ...args: NativeExpr[]): NativeExpr => ({ method: name, target, arguments: args });
const lambda = (parameters: string[], body: NativeExpr): NativeExpr => ({ lambda: parameters, body });
const local = (name: string): NativeExpr => ({ local: name });
const numbers = array(literal(3), literal(1), notANumber, literal(-0), literal(null), literal('2'));
const words = literal('  Héllo Wörld ß ');
const fruit = (id: string): NativeExpr => ({ object: [['id', literal(id)], ['name', literal(id.toUpperCase())]] });
const fruits = array(fruit('apple'), fruit('pear'), fruit('plum'));
for (const target of [numbers, array(), array(array(literal(1), literal(2)), literal(null), fruit('x'))]) {
	cases.push(target, { binary: '+', left: target, right: literal(1) }, { unary: '+', value: target }, { unary: '!', value: target });
	cases.push({ member: target, property: 'length' }, method('join', target), method('join', target, literal(' - ')), method('toReversed', target));
	for (const index of [literal(0), literal(1), literal(-1), literal(-10), literal(10), literal(1.7), literal('1'), notANumber]) {
		cases.push(method('slice', target, index), method('slice', target, index, literal(-1)));
		cases.push(method('includes', target, literal(1), index), method('indexOf', target, literal(1), index));
	}
	for (const search of [literal(3), literal('2'), notANumber, literal(0), literal(null)]) cases.push(method('includes', target, search), method('indexOf', target, search));
	cases.push(method('concat', target, array(literal('a')), literal(5), array(array(literal(9)))));
	cases.push(method('map', target, lambda(['value', 'index'], { template: [local('index'), ':', local('value')] })));
	cases.push(method('filter', target, lambda(['value'], local('value'))), method('findIndex', target, lambda(['value'], { binary: '===', left: local('value'), right: literal(1) })));
	cases.push(method('some', target, lambda(['value'], { binary: '>', left: local('value'), right: literal(2) })), method('every', target, lambda(['value'], local('value'))));
	cases.push(method('map', target, lambda(['value', 'index', 'all'], { member: local('all'), property: 'length' })));
	cases.push(method('reverse', { array: [{ spread: true, value: target }] }));
}
cases.push({ binary: '===', left: array(), right: array() }, { binary: '!==', left: array(), right: array() });
cases.push({ member: fruit('kiwi'), property: 'name' }, { template: ['x', fruit('kiwi'), fruits] }, { binary: '+', left: fruit('kiwi'), right: literal(1) });
cases.push(method('map', fruits, lambda(['fruit'], { member: local('fruit'), property: 'name' })), method('findIndex', fruits, lambda(['fruit'], { binary: '===', left: { member: local('fruit'), property: 'id' }, right: literal('pear') })));
for (const text of [words, literal(''), literal('abcabc')]) {
	cases.push(method('trim', text), method('toUpperCase', text), method('toLowerCase', text), method('concat', text, literal(1), literal(null)));
	for (const search of [literal('l'), literal(''), literal('bc'), literal('zz')]) {
		cases.push(method('includes', text, search), method('indexOf', text, search), method('indexOf', text, search, literal(3)), method('includes', text, search, literal(-2)));
	}
	cases.push(method('slice', text, literal(2)), method('slice', text, literal(-3), literal(-1)), method('slice', text, literal(5), literal(1)));
}
cases.push(method('slice', literal('😀ab'), literal(2)), { member: literal('😀'), property: 'length' }, method('includes', literal('a undefined'), ));
const written = cases.map((authored) => {
	const expr = JSON.parse(JSON.stringify(authored)) as NativeExpr;
	const value = evaluateNativeExpr(expr, (cell) => {
		throw new Error(`no cell ${cell}`);
	});
	return { expr, type: value === null ? 'null' : typeof value, text: String(value), json: JSON.stringify(value), negativeZero: Object.is(value, -0) };
});
writeFileSync(new URL('./MarklessCoreTests/Fixtures/expression-cases.json', import.meta.url), `${JSON.stringify(written)}\n`);
