import { RB, type RegexBuilder } from '@gruhn/regex-utils';
import { describe, expect, test } from 'vitest';
import {
	bundlerRuntimePackageChunkMatcher,
	bundlerSymbolVirtualModuleMatcher,
	bundlerTsrxSourceFileWithQueryMatcher,
	bundlerVitePreloadHelperMatcher,
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

const viteVirtualModuleNulEscape = '\\u0000';
const vitePreloadHelperSpecification = new RegExp(
	['^(?:', viteVirtualModuleNulEscape, ')?vite/preload-helper(?:\\.js)?$'].join(''),
);

describe('bundler regex authoring', () => {
	test('shared bundler matchers match independent specifications', () => {
		assertRegexEquivalent(
			'bundlerRuntimePackageChunkMatcher',
			bundlerRuntimePackageChunkMatcher,
			/[/\\]@arcadejs[/\\]runtime[/\\]/,
		);
		assertRegexEquivalent(
			'bundlerSymbolVirtualModuleMatcher',
			bundlerSymbolVirtualModuleMatcher,
			/virtual:arcade:symbol:/,
		);
		assertRegexEquivalent(
			'bundlerTsrxSourceFileWithQueryMatcher',
			bundlerTsrxSourceFileWithQueryMatcher,
			/\.tsrx(?:[?#].*)?$/,
		);
		assertRegexEquivalent(
			'bundlerVitePreloadHelperMatcher',
			bundlerVitePreloadHelperMatcher,
			vitePreloadHelperSpecification,
		);

		expect(bundlerRuntimePackageChunkMatcher.test('/repo/@arcadejs/runtime/index.js')).toBe(
			true,
		);
		expect(bundlerRuntimePackageChunkMatcher.test('/repo/@arcadejs/protocol/index.js')).toBe(
			false,
		);
		expect(bundlerTsrxSourceFileWithQueryMatcher.test('/src/root.tsrx?raw')).toBe(true);
		expect(bundlerTsrxSourceFileWithQueryMatcher.test('/src/root.ts')).toBe(false);
		expect(bundlerVitePreloadHelperMatcher.test('\0vite/preload-helper.js')).toBe(true);
		expect(bundlerVitePreloadHelperMatcher.test('vite/modulepreload-polyfill')).toBe(false);
	});
});
