import { RB, type RegexBuilder } from '@gruhn/regex-utils';
import { describe, expect, test } from 'vitest';
import {
	pocSecretKeyPrefixPattern,
	pocSecretPathPattern,
	pocSecretValuePattern,
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

describe('POC serializer regex authoring', () => {
	test('secret detection patterns match independent lowercase keyword specs', () => {
		assertRegexEquivalent(
			'pocSecretKeyPrefixPattern',
			pocSecretKeyPrefixPattern,
			/^(?:sk|pk)_(?:live|test)_/,
		);
		assertRegexEquivalent('pocSecretValuePattern', pocSecretValuePattern, /secret|token/);
		assertRegexEquivalent(
			'pocSecretPathPattern',
			pocSecretPathPattern,
			/secret|token|password|credential/,
		);

		expect(pocSecretKeyPrefixPattern.test('sk_live_123')).toBe(true);
		expect(pocSecretValuePattern.test('token preview')).toBe(true);
		expect(pocSecretPathPattern.test('user.password')).toBe(true);
		expect(pocSecretPathPattern.test('user.name')).toBe(false);
	});
});
