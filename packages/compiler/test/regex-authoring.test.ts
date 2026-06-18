import { RB, type RegexBuilder } from '@gruhn/regex-utils';
import { describe, expect, test } from 'vitest';
import {
	compilerBinaryExpressionMatcher,
	compilerCompoundAssignmentOperatorPattern,
	compilerDoubleQuotedStringLiteralPattern,
	compilerEventAssignmentWriteMatcher,
	compilerEventDeleteWriteMatcher,
	compilerEventPostfixUpdateWriteMatcher,
	compilerEventPrefixUpdateWriteMatcher,
	compilerGraphPathIndexSegmentMatcher,
	compilerGraphPathRootMatcher,
	compilerGraphPathStringSegmentMatcher,
	compilerIdentifierPartPattern,
	compilerIdentifierPathPattern,
	compilerIdentifierPattern,
	compilerIdentifierStartPattern,
	compilerNumberLiteralPattern,
	compilerNumericObjectKeyPattern,
	compilerPrimitiveLiteralPattern,
	compilerQuotedStringLiteralPattern,
	compilerSingleQuotedStringLiteralPattern,
	compilerUnsignedIntegerPattern,
} from '../src/source-patterns.ts';

function assertRegexEquivalent(name: string, actual: RegExp, specification: RegExp): void {
	const actualLanguage = RB(actual);
	if (actualLanguage.isEquivalent(specification)) return;

	const onlyActual = actualLanguage.without(specification);
	const onlySpecification = RB(specification).without(actual);

	throw new Error(
		JSON.stringify(
			{
				error: 'REGEX_LANGUAGE_MISMATCH',
				name,
				actual: actual.toString(),
				specification: specification.toString(),
				falsePositives: samples(onlyActual),
				falseNegatives: samples(onlySpecification),
			},
			null,
			2,
		),
	);
}

function samples(builder: RegexBuilder): string[] {
	if (builder.isEmpty()) return [];

	const sample = builder.sample() as Generator<string> & {
		take(count: number): Iterable<string>;
	};
	return Array.from(sample.take(8));
}

describe('compiler regex authoring', () => {
	test('identifier regex matches the independent ASCII identifier specification', () => {
		assertRegexEquivalent(
			'compilerIdentifierPattern',
			compilerIdentifierPattern,
			/^[A-Za-z_$][A-Za-z0-9_$]*$/,
		);
	});

	test('identifier path regex matches dot-separated identifiers only', () => {
		assertRegexEquivalent(
			'compilerIdentifierPathPattern',
			compilerIdentifierPathPattern,
			/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/,
		);
	});

	test('identifier character regexes match the independent ASCII identifier specs', () => {
		assertRegexEquivalent(
			'compilerIdentifierStartPattern',
			compilerIdentifierStartPattern,
			/^[A-Za-z_$]$/,
		);
		assertRegexEquivalent(
			'compilerIdentifierPartPattern',
			compilerIdentifierPartPattern,
			/^[A-Za-z0-9_$]$/,
		);
	});

	test('identifier examples document intended boundaries', () => {
		expect(compilerIdentifierPattern.test('count')).toBe(true);
		expect(compilerIdentifierPattern.test('$state_1')).toBe(true);
		expect(compilerIdentifierPattern.test('1count')).toBe(false);
		expect(compilerIdentifierPattern.test('count.value')).toBe(false);

		expect(compilerIdentifierPathPattern.test('event.currentTarget.value')).toBe(true);
		expect(compilerIdentifierPathPattern.test('event.1value')).toBe(false);
		expect(compilerIdentifierPathPattern.test('event..value')).toBe(false);
	});

	test('numeric object key regex matches unsigned integer or decimal keys', () => {
		assertRegexEquivalent(
			'compilerNumericObjectKeyPattern',
			compilerNumericObjectKeyPattern,
			/^(?:\d+|\d*\.\d+)$/,
		);
	});

	test('unsigned integer regex matches digits only', () => {
		assertRegexEquivalent(
			'compilerUnsignedIntegerPattern',
			compilerUnsignedIntegerPattern,
			/^\d+$/,
		);
	});

	test('number literal regex matches compiler-supported signed decimal literals', () => {
		assertRegexEquivalent(
			'compilerNumberLiteralPattern',
			compilerNumberLiteralPattern,
			/^[+-]?(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?$/,
		);
	});

	test('quoted string regexes match the independent source literal specifications', () => {
		assertRegexEquivalent(
			'compilerDoubleQuotedStringLiteralPattern',
			compilerDoubleQuotedStringLiteralPattern,
			/^"(?:\\.|[^"\\])*"$/,
		);
		assertRegexEquivalent(
			'compilerSingleQuotedStringLiteralPattern',
			compilerSingleQuotedStringLiteralPattern,
			/^'(?:\\.|[^'\\])*'$/,
		);
		assertRegexEquivalent(
			'compilerQuotedStringLiteralPattern',
			compilerQuotedStringLiteralPattern,
			/^(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')$/,
		);
	});

	test('literal and compound assignment regexes match independent compiler specs', () => {
		assertRegexEquivalent(
			'compilerPrimitiveLiteralPattern',
			compilerPrimitiveLiteralPattern,
			/^(?:true|false|null|undefined)$/,
		);
		assertRegexEquivalent(
			'compilerCompoundAssignmentOperatorPattern',
			compilerCompoundAssignmentOperatorPattern,
			/^(?:[+\-*/%&|^]|<<|>>|>>>)=$/,
		);
	});

	test('graph path segment matchers preserve the compiler bracket path behavior', () => {
		assertRegexEquivalent(
			'compilerGraphPathStringSegmentMatcher',
			compilerGraphPathStringSegmentMatcher,
			/\[['"]([^'"]+)['"]\]/g,
		);
		assertRegexEquivalent(
			'compilerGraphPathIndexSegmentMatcher',
			compilerGraphPathIndexSegmentMatcher,
			/\[(\d+)\]/g,
		);

		expect("state['user'][0]".replace(compilerGraphPathStringSegmentMatcher, '.$1')).toBe(
			'state.user[0]',
		);
		expect('items[10]'.replace(compilerGraphPathIndexSegmentMatcher, '.$1')).toBe('items.10');
	});

	test('graph path root matcher captures the leading identifier after whitespace', () => {
		assertRegexEquivalent(
			'compilerGraphPathRootMatcher',
			compilerGraphPathRootMatcher,
			/^\s*([A-Za-z_$][A-Za-z0-9_$]*)/,
		);

		expect('  count.value'.match(compilerGraphPathRootMatcher)?.groups).toEqual({
			rootName: 'count',
		});
	});

	test('binary expression matcher captures path, operator, and number source', () => {
		assertRegexEquivalent(
			'compilerBinaryExpressionMatcher',
			compilerBinaryExpressionMatcher,
			/^([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)\s*([+\-*/])\s*([+-]?(?:\d+|\d*\.\d+))$/,
		);

		const binary = 'count.value + -1.5'.match(compilerBinaryExpressionMatcher);
		expect(binary?.groups).toEqual({
			leftSource: 'count.value',
			operator: '+',
			rightNumberSource: '-1.5',
		});
	});

	test('event write matchers escape dynamic source fragments and preserve boundaries', () => {
		const assignmentMatcher = compilerEventAssignmentWriteMatcher(
			'count.value',
			'=',
			'next + 1',
		);
		assertRegexEquivalent(
			'compilerEventAssignmentWriteMatcher',
			assignmentMatcher,
			/(?:^|[^$0-9A-Z_a-z])count\.value\s*=\s*next \+ 1(?:$|[^$0-9A-Z_a-z])/,
		);

		const postfixMatcher = compilerEventPostfixUpdateWriteMatcher('count.value', '++');
		assertRegexEquivalent(
			'compilerEventPostfixUpdateWriteMatcher',
			postfixMatcher,
			/(?:^|[^$0-9A-Z_a-z])count\.value\s*\+\+/,
		);

		const prefixMatcher = compilerEventPrefixUpdateWriteMatcher('count.value', '++');
		assertRegexEquivalent(
			'compilerEventPrefixUpdateWriteMatcher',
			prefixMatcher,
			/\+\+\s*count\.value(?:$|[^$0-9A-Z_a-z])/,
		);

		const deleteMatcher = compilerEventDeleteWriteMatcher('count.value');
		assertRegexEquivalent(
			'compilerEventDeleteWriteMatcher',
			deleteMatcher,
			/delete\s+count\.value(?:$|[^$0-9A-Z_a-z])/,
		);

		expect('(count.value = next + 1);'.match(assignmentMatcher)).not.toBeNull();
		expect('discount.value = next + 1'.match(assignmentMatcher)).toBeNull();
	});
});
