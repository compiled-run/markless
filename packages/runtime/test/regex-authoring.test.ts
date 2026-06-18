import { RB, type RegexBuilder } from '@gruhn/regex-utils';
import { describe, expect, test } from 'vitest';
import {
	runtimeBigIntStringPattern,
	runtimeInlineClosingScriptMatcher,
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

describe('runtime regex authoring', () => {
	test('bigint payload string pattern matches the independent integer spec', () => {
		assertRegexEquivalent(
			'runtimeBigIntStringPattern',
			runtimeBigIntStringPattern,
			/^-?(?:0|[1-9]\d*)$/,
		);

		expect(runtimeBigIntStringPattern.test('0')).toBe(true);
		expect(runtimeBigIntStringPattern.test('-42')).toBe(true);
		expect(runtimeBigIntStringPattern.test('01')).toBe(false);
		expect(runtimeBigIntStringPattern.test('1.5')).toBe(false);
	});

	test('inline closing script matcher matches case-insensitive closing script text', () => {
		assertRegexEquivalent(
			'runtimeInlineClosingScriptMatcher',
			runtimeInlineClosingScriptMatcher,
			/<\/[sS][cC][rR][iI][pP][tT]/g,
		);

		expect('</ScRiPt>'.replace(runtimeInlineClosingScriptMatcher, '<\\/script')).toBe(
			'<\\/script>',
		);
	});
});
