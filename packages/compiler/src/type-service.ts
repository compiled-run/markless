import type { Program } from 'yuku-tsrx';
import {
	parseModule,
	type MarklessCompileError,
	type MarklessParseOptions,
	type MarklessParserComment,
} from './js-ast.ts';

export interface MarklessMappingData {
	verification: boolean;
	completion: boolean;
	semantic: boolean;
	navigation: boolean;
	structure: boolean;
	format: boolean;
	customData: {
		embeddedId?: string;
		content?: string;
		readonly [key: string]: unknown;
	};
	readonly [key: string]: unknown;
}

export interface MarklessCodeMapping {
	sourceOffsets: number[];
	generatedOffsets: number[];
	lengths: number[];
	generatedLengths: number[];
	data: MarklessMappingData;
}

export interface MarklessVolarMappingsResult {
	code: string;
	mappings: MarklessCodeMapping[];
	cssMappings: MarklessCodeMapping[];
	/**
	 * Reserved for mappings of `<script>` regions. The yuku parser does not surface them
	 * yet, so the type service emits an empty array to keep the result shape stable for
	 * editor hosts that already read this field.
	 */
	scriptMappings: MarklessCodeMapping[];
	errors: MarklessCompileError[];
	sourceAst: Program;
}

export type TsrxTypeServiceOptions = MarklessParseOptions & {
	readonly [key: string]: unknown;
};

export type TsrxAstNode = {
	readonly type: string;
	readonly start?: number;
	readonly end?: number;
	readonly [key: string]: unknown;
};

type SourceTextSpan = {
	readonly sourceOffset: number;
	readonly text: string;
};

export type TsrxCodeMapping = MarklessCodeMapping;

export type MarklessTsrxTypeServiceResult = MarklessVolarMappingsResult;

const fullMappingData: MarklessMappingData = {
	verification: true,
	completion: true,
	semantic: true,
	navigation: true,
	structure: true,
	format: false,
	customData: {},
};
const valueMappingData: MarklessMappingData = {
	...fullMappingData,
	structure: false,
};
const gapMappingData: MarklessMappingData = {
	...fullMappingData,
	verification: false,
	semantic: false,
	navigation: false,
};
const structureMappingData: MarklessMappingData = {
	verification: false,
	completion: false,
	semantic: false,
	navigation: false,
	structure: true,
	format: false,
	customData: {},
};
type MappingProfile = 'full' | 'value' | 'gap' | 'structure';
const mappingProfiles: Record<MappingProfile, MarklessMappingData> = {
	full: fullMappingData,
	value: valueMappingData,
	gap: gapMappingData,
	structure: structureMappingData,
};
const mapStart = '\0markless-map:';
const mapSeparator = '\0';
const mapEnd = '\0/markless-map\0';

export function compileTsrxForTypeService(
	source: string,
	filename = 'module.tsrx',
	options: TsrxTypeServiceOptions = {},
): MarklessTsrxTypeServiceResult {
	const errors: MarklessCompileError[] = [];
	const comments: MarklessParserComment[] = [];
	const sourceAst = parseModule(source, filename, {
		...options,
		collect: true,
		loose: !!options?.loose,
		errors,
		comments,
	}) as Program;
	const emittedCode = emitProgramForTypeService(sourceAst, source);
	const generated = finalizeSourceMapMarkers(emittedCode);
	addImportInsertionMappings(sourceAst, source, generated.mappings);

	return {
		code: generated.code,
		mappings: generated.mappings,
		cssMappings: collectCssMappings(sourceAst, source),
		scriptMappings: [],
		errors,
		sourceAst,
	};
}

export const compile_to_volar_mappings = compileTsrxForTypeService;

function emitProgramForTypeService(program: Program, source: string): string {
	const statements = asNodes(program.body);
	const body = statements
		.map((statement) => emitTopLevelStatement(statement, source))
		.filter(Boolean)
		.join('\n');
	return `/** @jsxImportSource @markless/typescript-plugin */\n${body}`;
}

function emitTopLevelStatement(statement: TsrxAstNode, source: string): string {
	if (statement.type === 'ExportNamedDeclaration' && isNode(statement.declaration)) {
		return `${sourcePrefixBefore(statement, statement.declaration, source)}${emitTopLevelStatement(
			statement.declaration,
			source,
		)}`;
	}

	if (statement.type === 'ExportDefaultDeclaration' && isNode(statement.declaration)) {
		return `${sourcePrefixBefore(statement, statement.declaration, source)}${emitTopLevelStatement(
			statement.declaration,
			source,
		)}`;
	}

	if (isFunctionWithTsrxBody(statement)) {
		return emitFunctionWithTsrxBody(statement, source);
	}

	return emitPlainStatement(statement, source);
}

function emitFunctionWithTsrxBody(node: TsrxAstNode, source: string): string {
	const body = node.body;
	if (!isNode(body)) return sourceSlice(node, source);
	const prefix = sourcePrefixBefore(node, body, source);
	if (!prefix) return sourceSlice(node, source);
	return `${prefix}${emitTsrxCodeBlock(body, source)}`;
}

function emitTsrxCodeBlock(block: TsrxAstNode, source: string): string {
	const statements = asNodes(block.body).map((statement) =>
		emitPlainStatement(statement, source),
	);
	const render = block.render ? emitTemplateNode(block.render, source) : '';
	const renderStatement = render ? `return ${render};` : '';
	return ['{', ...statements, renderStatement, '}'].filter(Boolean).join('\n');
}

function emitPlainStatement(statement: TsrxAstNode, source: string): string {
	const statementSpan = sourceSpan(statement);
	if (!statementSpan) return sourceSlice(statement, source);
	const replacements: Array<{
		readonly start: number;
		readonly end: number;
		readonly text: string;
	}> = [];
	collectPlainStatementTemplateReplacements(statement, source, replacements);
	if (replacements.length === 0) return sourceSlice(statement, source);

	let text = '';
	let cursor = statementSpan.start;
	for (const replacement of replacements.sort((left, right) => left.start - right.start)) {
		text += sourceSliceRange(statement, source, cursor, replacement.start);
		text += replacement.text;
		cursor = replacement.end;
	}
	text += sourceSliceRange(statement, source, cursor, statementSpan.end);
	return text.trim();
}

function emitTemplateNode(node: unknown, source: string): string {
	if (!isNode(node)) return '';

	switch (node.type) {
		case 'JSXElement':
		case 'Element':
			return emitElement(node, source);
		case 'JSXStyleElement':
			return '';
		case 'JSXFragment':
		case 'Fragment':
			return emitFragment(node, source);
		case 'JSXExpressionContainer':
		case 'TSRXExpression':
			return emitExpressionContainer(node, source);
		case 'JSXIfExpression':
		case 'JSXForExpression':
		case 'JSXTryExpression':
		case 'SwitchStatement':
		case 'JSXSwitchExpression':
			return emitDeferredConstruct(node, source);
		case 'JSXCodeBlock':
			return emitChildCodeBlock(node, source);
		case 'BlockStatement':
			return emitTemplateBlock(node, source);
		case 'JSXText':
		case 'Literal':
			return emitText(node, source);
		default:
			return sourceSlice(node, source);
	}
}

function emitElement(node: TsrxAstNode, source: string): string {
	const opening = isNode(node.openingElement) ? node.openingElement : undefined;
	if (!opening) return '';
	const openingName = isNode(opening.name) ? opening.name : undefined;
	if (openingName?.type === 'JSXExpressionContainer' || openingName?.type === 'TSRXExpression') {
		return emitDynamicElement(node, opening, openingName, source);
	}
	let output = emitOpeningElement(opening, source);
	if (opening.selfClosing) return output;
	output += emitTemplateChildren(node.children, source);
	if (isNode(node.closingElement)) output += emitClosingElement(node.closingElement, source);
	return output;
}

function emitOpeningElement(node: TsrxAstNode, source: string): string {
	const span = sourceSpan(node);
	const name = isNode(node.name) ? node.name : undefined;
	if (!span || !name) return '';
	let output = markSourceText(span.start, source.slice(span.start, name.start), 'gap');
	output += markNodeText(name, source, 'full');
	let cursor = name.end ?? span.start;
	for (const attribute of getElementAttributes({ ...node, openingElement: node })) {
		const attributeSpan = sourceSpan(attribute);
		if (!attributeSpan) continue;
		output += markSourceText(cursor, source.slice(cursor, attributeSpan.start), 'gap');
		output += emitAttribute(attribute, source);
		cursor = attributeSpan.end;
	}
	output += markSourceText(cursor, source.slice(cursor, span.end), 'gap');
	return output;
}

function emitClosingElement(node: TsrxAstNode, source: string): string {
	const span = sourceSpan(node);
	const name = isNode(node.name) ? node.name : undefined;
	if (!span || !name) return '';
	return `${markSourceText(span.start, source.slice(span.start, name.start), 'gap')}${markNodeText(name, source, 'full')}${markSourceText(name.end ?? span.end, source.slice(name.end ?? span.end, span.end), 'gap')}`;
}

function emitAttribute(attribute: TsrxAstNode, source: string): string {
	const span = sourceSpan(attribute);
	if (!span) return '';
	if (attribute.type === 'JSXSpreadAttribute' && isNode(attribute.argument)) {
		return `${markSourceText(span.start, source.slice(span.start, attribute.argument.start), 'gap')}${sourceSliceRange(attribute.argument, source, attribute.argument.start ?? span.start, attribute.argument.end ?? span.end, 'value')}${markSourceText(attribute.argument.end ?? span.end, source.slice(attribute.argument.end ?? span.end, span.end), 'gap')}`;
	}
	const name = isNode(attribute.name) ? attribute.name : undefined;
	if (!name) return source.slice(span.start, span.end);
	let output = markNodeText(name, source, 'full');
	if (!isNode(attribute.value)) return output;
	output += markSourceText(
		name.end ?? span.start,
		source.slice(name.end ?? span.start, attribute.value.start),
		'gap',
	);
	if (attribute.value.type === 'Literal') {
		const raw = source.slice(attribute.value.start ?? 0, attribute.value.end ?? 0);
		output += markNodeText(attribute.value, source, 'value');
		if ((raw.startsWith('"') || raw.startsWith("'")) && raw.length >= 2) {
			output += markOverlay(
				(attribute.value.start ?? 0) + 1,
				raw.length - 2,
				raw.length - 1,
				raw.length - 2,
				'value',
			);
		}
		return output;
	}
	if (
		attribute.value.type === 'JSXExpressionContainer' ||
		attribute.value.type === 'TSRXExpression'
	) {
		output += emitExpressionContainer(attribute.value, source);
		return output;
	}
	return output + markNodeText(attribute.value, source, 'value');
}

function emitExpressionContainer(node: TsrxAstNode, source: string): string {
	const span = sourceSpan(node);
	const expression = isNode(node.expression) ? node.expression : undefined;
	if (!span) return '';
	if (!expression || expression.type === 'JSXEmptyExpression') {
		return markSourceText(span.start, source.slice(span.start, span.end), 'gap');
	}
	return `${markSourceText(span.start, source.slice(span.start, expression.start), 'gap')}${sourceSliceRange(expression, source, expression.start ?? span.start, expression.end ?? span.end, 'value')}${markSourceText(expression.end ?? span.end, source.slice(expression.end ?? span.end, span.end), 'gap')}`;
}

function emitFragment(node: TsrxAstNode, source: string): string {
	const span = sourceSpan(node);
	if (!span) return '<></>';
	const children = asNodes(node.children);
	const first = children[0];
	const last = children.at(-1);
	const openingEnd = first?.start ?? source.indexOf('>', span.start) + 1;
	const closingStart = last?.end ?? source.lastIndexOf('</', span.end);
	return `${markSourceText(span.start, source.slice(span.start, openingEnd), 'gap')}${emitTemplateChildren(children, source)}${markSourceText(closingStart, source.slice(closingStart, span.end), 'gap')}`;
}

function emitText(node: TsrxAstNode, source: string): string {
	const span = sourceSpan(node);
	return span ? markSourceText(span.start, source.slice(span.start, span.end), 'value') : '';
}

function emitDynamicElement(
	node: TsrxAstNode,
	opening: TsrxAstNode,
	openingName: TsrxAstNode,
	source: string,
): string {
	const expression = isNode(openingName.expression) ? openingName.expression : undefined;
	if (!expression) return '';
	let attributes = '';
	let cursor = openingName.end ?? opening.start ?? 0;
	for (const attribute of getElementAttributes(node)) {
		const attributeSpan = sourceSpan(attribute);
		if (!attributeSpan) continue;
		attributes += markSourceText(cursor, source.slice(cursor, attributeSpan.start), 'gap');
		attributes += emitAttribute(attribute, source);
		cursor = attributeSpan.end;
	}
	const openingSpan = sourceSpan(opening);
	if (openingSpan)
		attributes += markSourceText(cursor, source.slice(cursor, openingSpan.end), 'gap');
	const children = emitTemplateChildren(node.children, source);
	const tagUse = sourceSliceRange(
		expression,
		source,
		expression.start ?? 0,
		expression.end ?? 0,
		'value',
	);
	return (
		`{((__Tag) => <__Tag${attributes}${opening.selfClosing ? '' : `${children}</__Tag>`})(` +
		tagUse +
		')}'
	);
}

function emitChildCodeBlock(node: TsrxAstNode, source: string): string {
	return `{${emitChildCodeBlockExpression(node, source)}}`;
}

function emitChildCodeBlockExpression(node: TsrxAstNode, source: string): string {
	const statements = asNodes(node.body).map((statement) => emitPlainStatement(statement, source));
	const render = node.render ? emitTemplateNode(node.render, source) : '';
	if (statements.length === 0 && !render) {
		const span = sourceSpan(node);
		return span ? markSourceReplacement(span.start, 1, 'null', 'value') : 'null';
	}
	return `(() => {${statements.join('\n')}${render ? `\nreturn <>${render}</>;` : '\nreturn null;'}})()`;
}

function emitDeferredConstruct(node: TsrxAstNode, source: string): string {
	return `{${emitConstructExpression(node, source)}}`;
}

function emitConstructExpression(node: TsrxAstNode, source: string): string {
	switch (node.type) {
		case 'JSXIfExpression':
			return emitIfExpression(node, source);
		case 'JSXForExpression':
			return emitForExpression(node, source);
		case 'JSXTryExpression':
			return emitTryExpression(node, source);
		default:
			return emitSwitchExpression(node, source);
	}
}

function emitIfExpression(node: TsrxAstNode, source: string): string {
	return `(() => {\n${emitIfChain(node, source)}\n})()`;
}

function emitIfChain(node: TsrxAstNode, source: string): string {
	const keyword = emitKeywordAt(node.start, '@if', 'if', source);
	const consequent = emitConditionalReturningArm(node.consequent, source);
	let output = `${keyword} (${emitValue(node.test, source)}) ${consequent}`;
	if (!isNode(node.alternate)) return `${output}\nreturn null;`;

	const elseOffset = findKeywordBefore('@else', node.alternate.start, node.consequent, source);
	const elseKeyword = emitKeywordAt(elseOffset, '@else', 'else', source);
	if (node.alternate.type === 'IfStatement' || node.alternate.type === 'JSXIfExpression') {
		const ifKeyword = emitKeywordAt(node.alternate.start, 'if', 'if', source);
		output += `\n${elseKeyword} ${emitIfChainWithKeyword(node.alternate, source, ifKeyword)}`;
	} else {
		output += `\n${elseKeyword} ${emitConditionalReturningArm(node.alternate, source)}`;
	}
	return output;
}

function emitIfChainWithKeyword(node: TsrxAstNode, source: string, ifKeyword: string): string {
	let output = `${ifKeyword} (${emitValue(node.test, source)}) ${emitConditionalReturningArm(node.consequent, source)}`;
	if (!isNode(node.alternate)) return `${output}\nreturn null;`;
	const elseOffset = findKeywordBefore('@else', node.alternate.start, node.consequent, source);
	const elseKeyword = emitKeywordAt(elseOffset, '@else', 'else', source);
	if (node.alternate.type === 'IfStatement' || node.alternate.type === 'JSXIfExpression') {
		output += `\n${elseKeyword} ${emitIfChainWithKeyword(
			node.alternate,
			source,
			emitKeywordAt(node.alternate.start, 'if', 'if', source),
		)}`;
	} else {
		output += `\n${elseKeyword} ${emitConditionalReturningArm(node.alternate, source)}`;
	}
	return output;
}

function emitForExpression(node: TsrxAstNode, source: string): string {
	const index = isNode(node.index) ? node.index : undefined;
	const key = isNode(node.key) ? node.key : undefined;
	const body = emitArmParts(node.body, source);
	const left =
		isNode(node.left) && node.left.type === 'VariableDeclaration'
			? emitValue(node.left, source)
			: `const ${emitValue(node.left, source)}`;
	const setup = index ? `\nlet ${emitValue(index, source)} = 0;` : '';
	const keyCheck = key ? `\nvoid (${emitValue(key, source)});` : '';
	const increment = index ? `\n${rawSourceSlice(index, source)} += 1;` : '';
	let empty = '';
	if (isNode(node.empty)) {
		const emptyKeywordOffset = findKeywordBefore('@empty', node.empty.start, node.body, source);
		const emptyKeyword = emitKeywordAt(emptyKeywordOffset, '@empty', 'if', source);
		const emptyArm = emitArmParts(node.empty, source);
		if (emptyArm.statements.length === 0) {
			empty = `\n${emptyKeyword} (__rows.length === 0) __rows.push(<>${emptyArm.render}</>);`;
		} else {
			empty = `\n${emptyKeyword} (__rows.length === 0) {\n${emptyArm.statements.join('\n')}\n__rows.push(<>${emptyArm.render}</>);\n}`;
		}
	}
	return `(() => {\nconst __rows: Array<__MarklessTypeService.Element> = [];${setup}\n${emitKeywordAt(node.start, '@for', 'for', source)} (${left} of ${emitValue(node.right, source)}) {${keyCheck}\n${body.statements.join('\n')}\n__rows.push(<>${body.render}</>);${increment}\n}${empty}\nreturn __rows;\n})()`;
}

function emitTryExpression(node: TsrxAstNode, source: string): string {
	const handler = isNode(node.handler) ? node.handler : undefined;
	const pending = isNode(node.pending) ? node.pending : undefined;
	const tryBlock = `${emitKeywordAt(node.start, '@try', 'try', source)} ${emitReturningArm(node.block, source)}`;
	let catchBlock: string;
	if (handler) {
		const catchKeyword = emitKeywordAt(handler.start, '@catch', 'catch', source);
		const declaration = isNode(handler.param)
			? `const ${emitValue(handler.param, source)}: any = __caught;\n`
			: '';
		const arm = emitArmParts(handler.body, source);
		catchBlock = `${catchKeyword} (__caught) {\n${declaration}${arm.statements.join('\n')}\nreturn <>${arm.render}</>;\n}`;
	} else {
		catchBlock = 'catch (__caught) {\nreturn null;\n}';
	}
	const tryAndCatch = `${tryBlock} ${catchBlock}`;
	if (!pending) return `(() => {\n${tryAndCatch}\n})()`;

	const pendingKeywordOffset = findKeywordBefore('@pending', pending.start, node.block, source);
	const pendingKeyword = emitKeywordAt(pendingKeywordOffset, '@pending', 'if', source);
	return `((__pending: boolean) => {\n${pendingKeyword} (__pending) ${emitConditionalReturningArm(pending, source)}\n${tryAndCatch}\n})(false as boolean)`;
}

function emitSwitchExpression(node: TsrxAstNode, source: string): string {
	const discriminant = node.discriminant ?? node.test;
	const cases = asNodes(node.cases).map((switchCase) => {
		const block = { type: 'BlockStatement', body: switchCase.consequent };
		if (isNode(switchCase.test)) {
			return `${emitKeywordAt(switchCase.start, '@case', 'case', source)} ${emitValue(switchCase.test, source)}: ${emitReturningArm(block, source, false)}`;
		}
		return `${emitKeywordAt(switchCase.start, '@default', 'default', source)}: ${emitReturningArm(block, source, false)}`;
	});
	return `(() => {\n${emitKeywordAt(node.start, '@switch', 'switch', source)} (${emitValue(discriminant, source)}) {\n${cases.join('\n')}\n}\nreturn null;\n})()`;
}

function emitReturningArm(block: unknown, source: string, braces = true): string {
	const arm = emitArmParts(block, source);
	const content = `${arm.statements.join('\n')}${arm.statements.length ? '\n' : ''}return <>${arm.render}</>;`;
	return braces ? `{\n${content}\n}` : content;
}

function emitConditionalReturningArm(block: unknown, source: string): string {
	const arm = emitArmParts(block, source);
	if (arm.statements.length === 0) return `return <>${arm.render}</>;`;
	return `{\n${arm.statements.join('\n')}\nreturn <>${arm.render}</>;\n}`;
}

function emitArmParts(
	block: unknown,
	source: string,
): { readonly statements: string[]; readonly render: string } {
	if (!isNode(block)) return { statements: [], render: '' };
	const statements: string[] = [];
	const rendered: string[] = [];
	for (const item of asNodes(block.body)) {
		if (isTemplateChildNode(item)) rendered.push(emitTemplateNode(item, source));
		else statements.push(emitPlainStatement(item, source));
	}
	return { statements, render: rendered.filter(Boolean).join('\n') };
}

function isTemplateChildNode(node: TsrxAstNode): boolean {
	return (
		isTsrxTemplateSyntaxNode(node) ||
		node.type === 'JSXExpressionContainer' ||
		node.type === 'TSRXExpression'
	);
}

function emitValue(node: unknown, source: string): string {
	const span = sourceSpan(node);
	return span && isNode(node)
		? sourceSliceRange(node, source, span.start, span.end, 'value')
		: '';
}

function rawSourceSlice(node: unknown, source: string): string {
	const span = sourceSpan(node);
	return span ? source.slice(span.start, span.end) : '';
}

function emitKeywordAt(
	offset: unknown,
	sourceKeyword: string,
	generatedKeyword: string,
	source: string,
): string {
	return typeof offset === 'number' &&
		source.slice(offset, offset + sourceKeyword.length) === sourceKeyword
		? markSourceReplacement(offset, sourceKeyword.length, generatedKeyword, 'structure')
		: generatedKeyword;
}

function findKeywordBefore(
	keyword: string,
	before: unknown,
	afterNode: unknown,
	source: string,
): number | undefined {
	if (typeof before !== 'number') return;
	const after = sourceSpan(afterNode)?.end ?? 0;
	const offset = source.lastIndexOf(keyword, before);
	return offset >= after ? offset : undefined;
}

function emitTemplateBlock(block: unknown, source: string): string {
	if (!isNode(block)) return '';
	return asNodes(block?.body)
		.map((statement) => emitTemplateNode(statement, source))
		.filter(Boolean)
		.join('\n');
}

function emitTemplateChildren(children: unknown, source: string): string {
	return asNodes(children)
		.map((child) => emitTemplateNode(child, source))
		.filter(Boolean)
		.join('\n');
}

function emitTemplateExpression(node: TsrxAstNode, source: string): string {
	if (node.type === 'JSXCodeBlock') return emitChildCodeBlockExpression(node, source);
	if (
		node.type === 'JSXIfExpression' ||
		node.type === 'JSXForExpression' ||
		node.type === 'JSXTryExpression' ||
		node.type === 'JSXSwitchExpression'
	) {
		return emitConstructExpression(node, source);
	}
	if (
		node.type === 'JSXElement' ||
		node.type === 'Element' ||
		node.type === 'JSXFragment' ||
		node.type === 'Fragment'
	) {
		return emitTemplateNode(node, source);
	}
	if (node.type === 'JSXStyleElement') return 'null';
	const expressions: string[] = [];
	collectTemplateExpressionSources(node, source, expressions);
	if (expressions.length === 0) return 'void 0';
	return `(${expressions.map((expression) => `void (${expression})`).join(', ')}, void 0)`;
}

function elementTagReference(node: TsrxAstNode, source: string): string | null {
	const name = (isNode(node.openingElement) ? node.openingElement.name : undefined) ?? node.id;
	if (!isNode(name)) return null;
	if (name.type === 'JSXIdentifier' || name.type === 'Identifier') {
		return typeof name.name === 'string' && /^[A-Z]/.test(name.name) ? name.name : null;
	}
	if (name.type === 'JSXExpressionContainer' || name.type === 'TSRXExpression') {
		return sourceSlice(name.expression, source);
	}
	if (name.type === 'JSXMemberExpression' || name.type === 'MemberExpression') {
		return sourceSlice(name, source);
	}
	return null;
}

function collectCssMappings(ast: unknown, source: string): TsrxCodeMapping[] {
	const mappings: TsrxCodeMapping[] = [];
	walkNode(ast, (node) => {
		if (node.type !== 'JSXStyleElement' || typeof node.css !== 'string') return;
		// A body that starts with `{` is an interpolation container, not CSS text -
		// no valid stylesheet opens with a bare block, and handing the expression
		// to the CSS service reports "at-rule or selector expected" on real code.
		if (node.css.trimStart().startsWith('{')) return;
		const span = sourceSpan(node);
		const cssStart = source.indexOf(node.css, span?.start ?? 0);
		const sourceOffset = cssStart === -1 ? (span?.start ?? 0) : cssStart;
		mappings.push({
			...createMapping(sourceOffset, node.css.length, 0, node.css.length),
			data: {
				...fullMappingData,
				customData: {
					content: node.css,
				},
			},
		});
	});
	return mappings;
}

function addImportInsertionMappings(
	program: Program,
	source: string,
	mappings: TsrxCodeMapping[],
): void {
	if (source.length === 0) return;
	mappings.push(createMapping(0, 1, 0, 1, gapMappingData));
	const imports = asNodes(program.body).filter(
		(statement) => statement.type === 'ImportDeclaration',
	);

	for (const declaration of imports) {
		const span = sourceSpan(declaration);
		if (!span || span.end <= span.start) continue;
		const authoredMapping = mappings.find((mapping) => {
			const mappingStart = mapping.sourceOffsets[0];
			return span.start <= mappingStart && mappingStart < span.end;
		});
		if (!authoredMapping) continue;
		const offsetDelta = authoredMapping.generatedOffsets[0] - authoredMapping.sourceOffsets[0];
		mappings.push(
			createMapping(span.end - 1, 1, span.end - 1 + offsetDelta, 1, gapMappingData),
		);
	}
}

function finalizeSourceMapMarkers(codeWithMarkers: string): {
	readonly code: string;
	readonly mappings: TsrxCodeMapping[];
} {
	let code = '';
	const mappings: TsrxCodeMapping[] = [];
	for (let index = 0; index < codeWithMarkers.length; ) {
		if (!codeWithMarkers.startsWith(mapStart, index)) {
			code += codeWithMarkers[index++];
			continue;
		}

		const headerEnd = codeWithMarkers.indexOf(mapSeparator, index + mapStart.length);
		const contentEnd = headerEnd === -1 ? -1 : codeWithMarkers.indexOf(mapEnd, headerEnd + 1);
		if (headerEnd === -1 || contentEnd === -1) {
			code += codeWithMarkers[index++];
			continue;
		}

		const [
			sourceOffsetText,
			sourceLengthText,
			profileText,
			markerKind,
			backText,
			generatedLengthText,
		] = codeWithMarkers.slice(index + mapStart.length, headerEnd).split(':');
		const text = codeWithMarkers.slice(headerEnd + mapSeparator.length, contentEnd);
		const sourceOffset = Number(sourceOffsetText);
		const sourceLength = Number(sourceLengthText);
		const profile = profileText as MappingProfile;
		const generatedOffset =
			markerKind === 'overlay' ? code.length - Number(backText) : code.length;
		code += text;

		if (Number.isFinite(sourceOffset) && Number.isFinite(sourceLength) && sourceLength > 0) {
			mappings.push(
				createMapping(
					sourceOffset,
					sourceLength,
					generatedOffset,
					markerKind === 'overlay' ? Number(generatedLengthText) : text.length,
					mappingProfiles[profile] ?? fullMappingData,
				),
			);
		}
		index = contentEnd + mapEnd.length;
	}
	return { code, mappings: dedupeMappings(mappings) };
}

function trimmedSourceSpan(node: TsrxAstNode, source: string): SourceTextSpan | undefined {
	if (typeof node.start !== 'number' || typeof node.end !== 'number' || node.end <= node.start) {
		return undefined;
	}
	if (isTsrxTemplateSyntaxNode(node)) return undefined;
	let start = node.start;
	let end = node.end;
	while (start < end && /\s/.test(source[start])) start += 1;
	while (end > start && /\s/.test(source[end - 1])) end -= 1;
	const text = source.slice(start, end);
	if (!text || text.startsWith('@')) return undefined;
	return { sourceOffset: start, text };
}

function collectPlainStatementTemplateReplacements(
	node: unknown,
	source: string,
	replacements: Array<{ readonly start: number; readonly end: number; readonly text: string }>,
): void {
	if (!isNode(node)) return;
	if (isExpressionPositionTemplateNode(node)) {
		const span = sourceSpan(node);
		if (!span) return;
		replacements.push({
			start: span.start,
			end: span.end,
			text: emitTemplateExpression(node, source),
		});
		return;
	}
	for (const child of childNodes(node)) {
		collectPlainStatementTemplateReplacements(child, source, replacements);
	}
}

function collectTemplateExpressionSources(
	node: unknown,
	source: string,
	expressions: string[],
): void {
	if (!isNode(node)) return;
	if (node.type === 'JSXExpressionContainer' || node.type === 'TSRXExpression') {
		if (isNode(node.expression) && node.expression.type !== 'JSXEmptyExpression') {
			expressions.push(sourceSlice(node.expression, source));
		}
		return;
	}
	if (node.type === 'JSXIfExpression') {
		if (node.test) expressions.push(sourceSlice(node.test, source));
	}
	if (node.type === 'JSXSwitchExpression') {
		const discriminant = node.discriminant ?? node.test;
		if (discriminant) expressions.push(sourceSlice(discriminant, source));
	}
	if (node.type === 'JSXForExpression') {
		if (node.right) expressions.push(sourceSlice(node.right, source));
		if (node.key) expressions.push(sourceSlice(node.key, source));
	}
	if (node.type === 'JSXElement' || node.type === 'Element') {
		const tagReference = elementTagReference(node, source);
		if (tagReference) expressions.push(tagReference);
		for (const attribute of getElementAttributes(node)) {
			const expression = getAttributeExpression(attribute);
			if (expression) expressions.push(sourceSlice(expression, source));
		}
	}
	for (const child of childNodes(node)) {
		collectTemplateExpressionSources(child, source, expressions);
	}
}

function getElementAttributes(node: TsrxAstNode): TsrxAstNode[] {
	if (Array.isArray(node.attributes)) return node.attributes.filter(isNode);
	const attributes = isNode(node.openingElement) ? node.openingElement.attributes : undefined;
	return Array.isArray(attributes) ? attributes.filter(isNode) : [];
}

function unwrapExpressionContainer(node: unknown): unknown {
	if (!isNode(node)) return undefined;
	if (node.type === 'JSXExpressionContainer' || node.type === 'TSRXExpression') {
		return node.expression;
	}
	return node;
}

function getAttributeExpression(attribute: TsrxAstNode): unknown {
	if (attribute.type === 'JSXSpreadAttribute') return attribute.argument;
	return unwrapExpressionContainer(attribute.value);
}

function createMapping(
	sourceOffset: number,
	sourceLength: number,
	generatedOffset: number,
	generatedLength: number,
	data: MarklessMappingData = fullMappingData,
): TsrxCodeMapping {
	return {
		sourceOffsets: [sourceOffset],
		generatedOffsets: [generatedOffset],
		lengths: [sourceLength],
		generatedLengths: [generatedLength],
		data,
	};
}

function sourcePrefixBefore(parent: unknown, child: unknown, source: string): string {
	const parentSpan = sourceSpan(parent);
	const childSpan = sourceSpan(child);
	return isNode(parent) && parentSpan && childSpan
		? sourceSliceRange(parent, source, parentSpan.start, childSpan.start)
		: '';
}

function sourceSpan(node: unknown): { readonly start: number; readonly end: number } | undefined {
	if (!isNode(node) || typeof node.start !== 'number' || typeof node.end !== 'number') return;
	if (node.end < node.start) return;
	return { start: node.start, end: node.end };
}

function markSourceText(
	sourceOffset: number,
	text: string,
	profile: MappingProfile = 'full',
): string {
	return `${mapStart}${sourceOffset}:${text.length}:${profile}:text${mapSeparator}${text}${mapEnd}`;
}

function markSourceReplacement(
	sourceOffset: number,
	sourceLength: number,
	text: string,
	profile: MappingProfile,
): string {
	return `${mapStart}${sourceOffset}:${sourceLength}:${profile}:text${mapSeparator}${text}${mapEnd}`;
}

function markOverlay(
	sourceOffset: number,
	sourceLength: number,
	generatedBack: number,
	generatedLength: number,
	profile: MappingProfile,
): string {
	return `${mapStart}${sourceOffset}:${sourceLength}:${profile}:overlay:${generatedBack}:${generatedLength}${mapSeparator}${mapEnd}`;
}

function markNodeText(node: TsrxAstNode, source: string, profile: MappingProfile): string {
	const span = sourceSpan(node);
	return span ? markSourceText(span.start, source.slice(span.start, span.end), profile) : '';
}

function markSourceSpans(
	source: string,
	start: number,
	end: number,
	spans: readonly SourceTextSpan[],
	profile: MappingProfile = 'full',
): string {
	const ordered = [...spans].sort((left, right) => left.sourceOffset - right.sourceOffset);
	let output = '';
	let cursor = start;
	for (const span of ordered) {
		const spanEnd = span.sourceOffset + span.text.length;
		if (span.sourceOffset < cursor || spanEnd > end) continue;
		output += source.slice(cursor, span.sourceOffset);
		output += markSourceText(span.sourceOffset, span.text, profile);
		cursor = spanEnd;
	}
	return `${output}${source.slice(cursor, end)}`;
}

function dedupeMappings(mappings: TsrxCodeMapping[]): TsrxCodeMapping[] {
	const seen = new Set<string>();
	return mappings.filter((mapping) => {
		const key = `${mapping.sourceOffsets[0]}:${mapping.lengths[0]}:${mapping.generatedOffsets[0]}:${mapping.generatedLengths[0]}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function walkNode(node: unknown, visit: (node: TsrxAstNode) => void): void {
	if (!isNode(node)) return;
	visit(node);
	for (const child of childNodes(node)) {
		walkNode(child, visit);
	}
}

function childNodes(node: TsrxAstNode): TsrxAstNode[] {
	const children: TsrxAstNode[] = [];
	for (const [key, value] of Object.entries(node)) {
		if (key === 'parent' || key === 'loc' || key === 'metadata') continue;
		if (Array.isArray(value)) children.push(...value.filter(isNode));
		else if (isNode(value)) children.push(value);
	}
	return children;
}

function asNodes(value: unknown): TsrxAstNode[] {
	return Array.isArray(value) ? value.filter(isNode) : [];
}

function isNode(value: unknown): value is TsrxAstNode {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as { readonly type?: unknown }).type === 'string'
	);
}

function isFunctionWithTsrxBody(node: TsrxAstNode): boolean {
	const body = node.body;
	return (
		(node.type === 'FunctionDeclaration' ||
			node.type === 'FunctionExpression' ||
			node.type === 'ArrowFunctionExpression') &&
		isNode(body) &&
		body.type === 'JSXCodeBlock'
	);
}

function isExpressionPositionTemplateNode(node: TsrxAstNode): boolean {
	return (
		node.type === 'JSXElement' ||
		node.type === 'Element' ||
		node.type === 'JSXFragment' ||
		node.type === 'Fragment' ||
		node.type === 'JSXCodeBlock' ||
		node.type === 'JSXIfExpression' ||
		node.type === 'JSXForExpression' ||
		node.type === 'JSXSwitchExpression' ||
		node.type === 'JSXTryExpression' ||
		node.type === 'JSXStyleElement'
	);
}

function isTsrxTemplateSyntaxNode(node: TsrxAstNode): boolean {
	return (
		node.type === 'JSXElement' ||
		node.type === 'Element' ||
		node.type === 'JSXFragment' ||
		node.type === 'Fragment' ||
		node.type === 'JSXCodeBlock' ||
		node.type === 'JSXIfExpression' ||
		node.type === 'JSXForExpression' ||
		node.type === 'JSXSwitchExpression' ||
		node.type === 'JSXTryExpression' ||
		node.type === 'JSXStyleElement' ||
		node.type === 'JSXText'
	);
}

function sourceSlice(node: unknown, source: string): string {
	if (!isNode(node)) return '';
	const span = trimmedSourceSpan(node, source);
	if (!span) return '';
	const start = span.sourceOffset;
	const end = start + span.text.length;
	return sourceSliceRange(node, source, start, end);
}

function sourceSliceRange(
	node: TsrxAstNode,
	source: string,
	start: number,
	end: number,
	profile: MappingProfile = 'full',
): string {
	if (end <= start) return '';
	const spans = collectSourceMappingSpans(node, source, start, end);
	return markSourceSpans(source, start, end, spans, profile);
}

function collectSourceMappingSpans(
	node: TsrxAstNode,
	source: string,
	start: number,
	end: number,
): SourceTextSpan[] {
	const span = trimmedSourceSpan(node, source);
	if (span && shouldMapWholeSourceNode(node)) {
		return span.sourceOffset >= start && span.sourceOffset + span.text.length <= end
			? [span]
			: [];
	}

	const spans: SourceTextSpan[] = [];
	for (const child of childNodes(node)) {
		const childSpan = trimmedSourceSpan(child, source);
		if (!childSpan) continue;
		const childEnd = childSpan.sourceOffset + childSpan.text.length;
		if (childEnd <= start || childSpan.sourceOffset >= end) continue;
		spans.push(...collectSourceMappingSpans(child, source, start, end));
	}
	return spans;
}

function shouldMapWholeSourceNode(node: TsrxAstNode): boolean {
	switch (node.type) {
		case 'Identifier':
		case 'JSXIdentifier':
		case 'Literal':
		case 'ThisExpression':
		case 'Super':
		case 'MetaProperty':
		case 'MemberExpression':
		case 'JSXMemberExpression':
		case 'CallExpression':
		case 'NewExpression':
		case 'UpdateExpression':
		case 'AssignmentExpression':
		case 'ConditionalExpression':
		case 'BinaryExpression':
		case 'LogicalExpression':
		case 'UnaryExpression':
		case 'AwaitExpression':
		case 'ChainExpression':
		case 'TemplateLiteral':
		case 'TaggedTemplateExpression':
		case 'ObjectExpression':
		case 'ArrayExpression':
		case 'TSAsExpression':
		case 'TSSatisfiesExpression':
		case 'TSNonNullExpression':
		case 'TSInstantiationExpression':
			return true;
		default:
			return false;
	}
}
