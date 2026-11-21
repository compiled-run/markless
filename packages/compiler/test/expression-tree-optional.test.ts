import { describe, expect, it } from 'vitest';
import type { AnyNode } from '../src/js-ast.ts';
import { parseModule } from '../src/js-ast.ts';
import { expressionTreeOf } from '../src/passes/semantic-graph/expression-tree.ts';

const tree = (text: string) => {
	const program = parseModule(`(${text});`, 'expression.ts') as unknown as {
		body: Array<{ expression: AnyNode }>;
	};
	return expressionTreeOf(program.body[0]!.expression);
};
const read = (name: string) => ({ kind: 'read', name });

describe('optional chains in the expression tree', () => {
	it('marks the `?.` link and every link after it in its chain, as JavaScript ends the whole chain there', () => {
		expect(tree('user?.home.city')).toEqual({
			kind: 'member',
			object: { kind: 'member', object: read('user'), property: 'home', optional: true },
			property: 'city',
			optional: true,
		});
	});

	it('leaves the links before the `?.` and a parenthesized chain\'s outer reads plain', () => {
		expect(tree('user.home?.city')).toEqual({
			kind: 'member',
			object: { kind: 'member', object: read('user'), property: 'home' },
			property: 'city',
			optional: true,
		});
		expect(tree('(user?.home).city')).toEqual({
			kind: 'member',
			object: { kind: 'member', object: read('user'), property: 'home', optional: true },
			property: 'city',
		});
	});
});
