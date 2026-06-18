import { RB, type RegexBuilder } from '@gruhn/regex-utils';
import { describe, expect, test } from 'vitest';
import { pocSecretWarningTextPattern } from '../src/source-patterns.ts';

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

describe('POC compiler regex authoring', () => {
	test('secret warning text pattern matches lowercase independent keywords', () => {
		assertRegexEquivalent(
			'pocSecretWarningTextPattern',
			pocSecretWarningTextPattern,
			/secret|token|password|credential|apikey/,
		);

		expect(pocSecretWarningTextPattern.test('session apikey')).toBe(true);
		expect(pocSecretWarningTextPattern.test('public label')).toBe(false);
	});
});
