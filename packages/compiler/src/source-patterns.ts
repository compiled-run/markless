import {
	anyOf,
	char,
	charIn,
	charNotIn,
	createRegExp,
	digit,
	exactly,
	global as globalFlag,
	letter,
	oneOrMore,
	whitespace,
	wordChar,
} from 'magic-regexp';

const compilerIdentifierStart = letter.or(charIn('_$'));
const compilerIdentifierPart = wordChar.or(charIn('$'));
const compilerIdentifier = compilerIdentifierStart.and(compilerIdentifierPart.times.any());
const compilerIdentifierPath = compilerIdentifier.and(
	exactly('.').and(compilerIdentifier).times.any(),
);

const unsignedIntegerSource = oneOrMore(digit);
const unsignedDecimalSource = digit.times.any().and('.', oneOrMore(digit));
const unsignedNumberSource = anyOf(unsignedIntegerSource, unsignedDecimalSource);
const signedNumberSource = anyOf(unsignedNumberSource, charIn('+-').and(unsignedNumberSource));
const exponentSource = charIn('eE').and(charIn('+-').optionally(), oneOrMore(digit)).optionally();

const escapedSourceCharacter = exactly('\\').and(char);
const doubleQuotedStringLiteral = exactly(
	'"',
	anyOf(escapedSourceCharacter, charNotIn('"\\')).times.any(),
	'"',
);
const singleQuotedStringLiteral = exactly(
	"'",
	anyOf(escapedSourceCharacter, charNotIn("'\\")).times.any(),
	"'",
);
const compilerBinaryExpression = compilerIdentifierPath
	.groupedAs('leftSource')
	.and(
		whitespace.times.any(),
		charIn('+-*/').groupedAs('operator'),
		whitespace.times.any(),
		signedNumberSource.groupedAs('rightNumberSource'),
	);
const graphPathStringSegmentCharacters = charNotIn('\'"').and(charNotIn('\'"').times.any());
const graphPathIndexSegmentDigits = digit.and(digit.times.any());
const graphPathRoot = whitespace.times.any().and(compilerIdentifier.groupedAs('rootName'));
const identifierPartCharacters = '$0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
const nonIdentifierBoundaryCharacter = charNotIn(identifierPartCharacters);
const sourceStartBoundary = anyOf(exactly('').at.lineStart(), nonIdentifierBoundaryCharacter);
const sourceEndBoundary = anyOf(exactly('').at.lineEnd(), nonIdentifierBoundaryCharacter);

export const compilerIdentifierPattern = createRegExp(
	compilerIdentifier.at.lineStart().at.lineEnd(),
);
export const compilerIdentifierStartPattern = createRegExp(
	compilerIdentifierStart.at.lineStart().at.lineEnd(),
);
export const compilerIdentifierPartPattern = createRegExp(
	compilerIdentifierPart.at.lineStart().at.lineEnd(),
);
export const compilerIdentifierPathPattern = createRegExp(
	compilerIdentifierPath.at.lineStart().at.lineEnd(),
);
export const compilerNumericObjectKeyPattern = createRegExp(
	unsignedNumberSource.at.lineStart().at.lineEnd(),
);
export const compilerUnsignedIntegerPattern = createRegExp(
	unsignedIntegerSource.at.lineStart().at.lineEnd(),
);
export const compilerNumberLiteralPattern = createRegExp(
	signedNumberSource.and(exponentSource).at.lineStart().at.lineEnd(),
);
export const compilerDoubleQuotedStringLiteralPattern = createRegExp(
	doubleQuotedStringLiteral.at.lineStart().at.lineEnd(),
);
export const compilerSingleQuotedStringLiteralPattern = createRegExp(
	singleQuotedStringLiteral.at.lineStart().at.lineEnd(),
);
export const compilerQuotedStringLiteralPattern = createRegExp(
	anyOf(doubleQuotedStringLiteral, singleQuotedStringLiteral).at.lineStart().at.lineEnd(),
);
export const compilerPrimitiveLiteralPattern = createRegExp(
	anyOf('true', 'false', 'null', 'undefined').at.lineStart().at.lineEnd(),
);
export const compilerCompoundAssignmentOperatorPattern = createRegExp(
	anyOf(charIn('+-*/%&|^'), '>>>', '>>', '<<').and('=').at.lineStart().at.lineEnd(),
);
export const compilerGraphPathStringSegmentMatcher = createRegExp(
	exactly('[', charIn('\'"'), graphPathStringSegmentCharacters.grouped(), charIn('\'"'), ']'),
	[globalFlag],
);
export const compilerGraphPathIndexSegmentMatcher = createRegExp(
	exactly('[', graphPathIndexSegmentDigits.grouped(), ']'),
	[globalFlag],
);
export const compilerGraphPathRootMatcher = createRegExp(graphPathRoot.at.lineStart());
export const compilerBinaryExpressionMatcher = createRegExp(
	compilerBinaryExpression.at.lineStart().at.lineEnd(),
);

export function compilerEventAssignmentWriteMatcher(
	source: string,
	operator: string,
	valueSource: string,
): RegExp {
	return createRegExp(
		sourceStartBoundary,
		exactly(source),
		whitespace.times.any(),
		exactly(operator),
		whitespace.times.any(),
		exactly(valueSource),
		sourceEndBoundary,
	);
}

export function compilerEventPostfixUpdateWriteMatcher(source: string, operator: string): RegExp {
	return createRegExp(
		sourceStartBoundary,
		exactly(source),
		whitespace.times.any(),
		exactly(operator),
	);
}

export function compilerEventPrefixUpdateWriteMatcher(source: string, operator: string): RegExp {
	return createRegExp(
		exactly(operator),
		whitespace.times.any(),
		exactly(source),
		sourceEndBoundary,
	);
}

export function compilerEventDeleteWriteMatcher(source: string): RegExp {
	return createRegExp(
		exactly('delete'),
		oneOrMore(whitespace),
		exactly(source),
		sourceEndBoundary,
	);
}
