import { anyOf, charIn, createRegExp, digit, exactly, global as globalFlag } from 'magic-regexp';

const signedBigIntPrefix = exactly('-').optionally();
const nonZeroIntegerBody = charIn('123456789').and(digit.times.any());

export const runtimeBigIntStringPattern = createRegExp(
	signedBigIntPrefix.and(anyOf('0', nonZeroIntegerBody)).at.lineStart().at.lineEnd(),
);
export const runtimeInlineClosingScriptMatcher = createRegExp(
	exactly('</'),
	charIn('sS'),
	charIn('cC'),
	charIn('rR'),
	charIn('iI'),
	charIn('pP'),
	charIn('tT'),
	[globalFlag],
);
