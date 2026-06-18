---
name: regex-authoring
description: Use whenever adding, editing, refactoring, reviewing, or testing regular expressions in Arcade. Requires regex-utils-first TDD, magic-regexp-first implementation for nontrivial regexes, junior-readable pattern names, and approval-gated exceptions for tiny literals or small parser helpers.
---

# Regex Authoring

Use this skill before adding, editing, refactoring, reviewing, or testing any
regular expression in this repo.

## Default Policy

- Write the regex behavior test first.
- Use `@gruhn/regex-utils` for regex language assertions whenever its syntax
  support can model the pattern.
- Author every nontrivial implementation regex with `magic-regexp`. This is the
  default even for ugly existing regexes; try the converter and named DSL pieces
  before considering another approach.
- Keep raw regex literals only when they are incredibly simple primitives, such
  as `/\s/`, `/\S/`, `/[\w$]/`, `/^\d+$/`, `/\.tsrx$/`, or one-character escape
  replacements.
- Name regex values for what they match or validate. Never abbreviate `RegExp`
  as `RE` in identifier names, and do not use suffixes such as `_RE`,
  `_REGEXP`, or a trailing `RE`; prefer junior-readable names like
  `identifierPattern`, `symbolVirtualStringMatcher`, or
  `eventFieldPathPattern`.
- Parser helpers are a last-resort exception, not the default alternative to
  regex. Use them only when `magic-regexp` cannot express the behavior clearly
  or safely, and only when the helper stays small and local.
- Do not treat `magic-regexp` as permission to parse source text. If the task
  touches generated JavaScript, TSRX, HTML, or manifest-like source, first look
  for a compiler artifact, build option, Vite/Rolldown hook, or real parser/AST.
- If a regex/parser workaround starts growing into a local mechanism, especially
  around an upstream tool or generated output, stop and use grep MCP
  (`mcp__grep.searchGitHub`) before implementing. This is mandatory well before
  the workaround reaches 200-300 LOC; treat roughly 80+ lines, generated/source
  text parsing, several cooperating helpers, or duplicated upstream behavior as
  the checkpoint. Search literal emitted markers, helper names, virtual module
  IDs, option names, and error strings; prefer well-regarded upstream or
  adjacent repository patterns, then record the examples and selected fix in the
  GoalBuddy receipt or final notes.
- Before migrating an existing generated-source cleanup to `magic-regexp`, prove
  with a current fixture that the cleanup is still needed. If the fixture no
  longer emits the unwanted construct, delete the cleanup and keep the
  fixture/build assertion as the guard.
- Stop and ask before replacing a regex with a bespoke parser if the helper
  would exceed roughly 40 lines, parse JavaScript/TSRX/source text, track nested
  balanced structures, decode string escapes, or require several cooperating
  helper functions. Prefer a real parser/library, build-pipeline fix, or a
  smaller magic-regexp migration instead.
- Do not add `eslint-plugin-regexp` as a substitute for regex behavior tests.

## TDD Loop

1. Add the focused failing test before changing the implementation regex.
2. In that test, define an independent specification with `@gruhn/regex-utils`.
3. Compare the implementation regex to the independent specification with
   equivalence, subset, superset, disjointness, or difference checks.
4. Include false-positive and false-negative samples in failures so agents get
   concrete counterexamples.
5. Run the narrow test and confirm it fails for the expected reason.
6. Implement the smallest regex change with `magic-regexp` unless an approved
   exception applies.
7. Rerun the focused test.
8. Broaden to `vp check` and related package tests when the regex affects shared
   compiler, runtime, serializer, or bundler behavior.

## Regex-Utils Pattern

Use this shape for important regexes:

```ts
import { RB, type RegexBuilder } from '@gruhn/regex-utils';

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
```

Build the specification independently. Do not use `magic-regexp` to generate
both the implementation and the test oracle.

## Magic-RegExp Pattern

Prefer named pieces over dense inline chains:

```ts
import { charIn, createRegExp, exactly, letter, oneOrMore, wordChar } from 'magic-regexp';

const identifierStart = letter.or(charIn('_$'));
const identifierPart = wordChar.or(charIn('$'));
const identifier = identifierStart.and(oneOrMore(identifierPart).optionally());

export const identifierPattern = createRegExp(identifier.at.lineStart().at.lineEnd());
export const identifierPathPattern = createRegExp(
	identifier.and(exactly('.').and(identifier).times.any()).at.lineStart().at.lineEnd(),
);
```

For existing regexes, it is fine to use `magic-regexp/converter` as a first
draft, then clean up the result into named pieces. Use raw string fragments only
for regex syntax that `magic-regexp` does not express clearly in the installed
version. Keep those fragments small and covered by `@gruhn/regex-utils`.

## Exceptions

If `@gruhn/regex-utils` throws `UnsupportedSyntaxError` or cannot model the
needed ECMAScript feature, record that in the test or task receipt and use one
of these instead:

- a focused table-driven behavior test;
- a small parser-helper test only after the parser-helper exception above is
  satisfied;
- an independent predicate test for business rules.

Do not silently skip the regex-utils step. The exception must be visible in the
test, code comment, or GoalBuddy receipt.
