import { parseModule } from '@tsrx/core';
import type {
	CodeMapping,
	CompileError,
	MappingData,
	ParseOptions,
	VolarMappingsResult,
} from '@tsrx/core/types';
import type * as AST from '@tsrx/core/types/estree';

export type TsrxTypeServiceOptions = ParseOptions & {
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

export type TsrxCodeMapping = CodeMapping;

export type MarklessTsrxTypeServiceResult = VolarMappingsResult;

const mappingData: MappingData = {
	verification: true,
	completion: true,
	semantic: true,
	navigation: true,
	structure: true,
	format: false,
	customData: {},
};
const mapStart = '\0markless-map:';
const mapSeparator = '\0';
const mapEnd = '\0/markless-map\0';

export function compileTsrxForTypeService(
	source: string,
	filename = 'module.tsrx',
	options: TsrxTypeServiceOptions = {},
): MarklessTsrxTypeServiceResult {
	const errors: CompileError[] = [];
	const comments: AST.CommentWithLocation[] = [];
	const sourceAst = parseModule(source, filename, {
		...options,
		collect: true,
		loose: !!options?.loose,
		errors,
		comments,
	}) as AST.Program;
	const emittedCode = emitProgramForTypeService(sourceAst, source);
	const generated = finalizeSourceMapMarkers(emittedCode);

	return {
		code: generated.code,
		mappings: generated.mappings,
		cssMappings: collectCssMappings(sourceAst, source),
		errors,
		sourceAst,
	};
}

export const compile_to_volar_mappings = compileTsrxForTypeService;

function emitProgramForTypeService(program: AST.Program, source: string): string {
	return asNodes(program.body)
		.map((statement) => emitTopLevelStatement(statement, source))
		.filter(Boolean)
		.join('\n');
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
	const renderStatements = block.render ? emitTemplateNode(block.render, source) : '';
	return ['{', ...statements, renderStatements, '}'].filter(Boolean).join('\n');
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
			return emitTemplateChildren(node.children, source);
		case 'JSXExpressionContainer':
		case 'TSRXExpression':
			return emitExpressionStatement(node.expression, source);
		case 'JSXIfExpression':
			return emitIfExpression(node, source);
		case 'JSXForExpression':
			return emitForExpression(node, source);
		case 'JSXTryExpression':
			return emitTryExpression(node, source);
		case 'SwitchStatement':
		case 'JSXSwitchExpression':
			return emitSwitchExpression(node, source);
		case 'JSXCodeBlock':
			return emitTsrxCodeBlock(node, source);
		case 'BlockStatement':
			return emitTemplateBlock(node, source);
		case 'JSXText':
		case 'Literal':
			return '';
		default:
			return sourceSlice(node, source);
	}
}

function emitElement(node: TsrxAstNode, source: string): string {
	const statements: string[] = [];
	const tagReference = elementTagReference(node, source);
	if (tagReference) statements.push(`void (${tagReference});`);

	for (const attribute of getElementAttributes(node)) {
		const expression = getAttributeExpression(attribute);
		if (expression) statements.push(emitExpressionStatement(expression, source));
	}

	const children = emitTemplateChildren(node.children, source);
	if (children) statements.push(children);
	return statements.filter(Boolean).join('\n');
}

function emitIfExpression(node: TsrxAstNode, source: string): string {
	const consequent = emitTemplateBlock(node.consequent, source);
	if (!node.alternate) return `if (${sourceSlice(node.test, source)}) {\n${consequent}\n}`;

	const alternate = emitTemplateNode(node.alternate, source);
	if (isNode(node.alternate) && node.alternate.type === 'JSXIfExpression') {
		return `if (${sourceSlice(node.test, source)}) {\n${consequent}\n} else ${alternate}`;
	}
	return `if (${sourceSlice(node.test, source)}) {\n${consequent}\n} else {\n${alternate}\n}`;
}

function emitForExpression(node: TsrxAstNode, source: string): string {
	const setup: string[] = [];
	if (node.index) setup.push(`const ${sourceSlice(node.index, source)} = 0;`);
	if (node.key) setup.push(emitExpressionStatement(node.key, source));

	const body = [setup.join('\n'), emitTemplateBlock(node.body, source)]
		.filter(Boolean)
		.join('\n');
	const empty = node.empty ? `\n{\n${emitTemplateBlock(node.empty, source)}\n}` : '';
	return `for (${sourceSlice(node.left, source)} of ${sourceSlice(node.right, source)}) {\n${body}\n}${empty}`;
}

function emitTryExpression(node: TsrxAstNode, source: string): string {
	const handler = isNode(node.handler) ? node.handler : undefined;
	const param = handler?.param ? sourceSlice(handler.param, source) : 'error';
	const catchBody = handler?.body ? emitTemplateBlock(handler.body, source) : '';
	const pending = node.pending ? `\n{\n${emitTemplateBlock(node.pending, source)}\n}` : '';
	return `try {\n${emitTemplateBlock(node.block, source)}\n} catch (${param}) {\n${catchBody}\n}${pending}`;
}

function emitSwitchExpression(node: TsrxAstNode, source: string): string {
	const discriminant = node.discriminant ?? node.test;
	const cases = asNodes(node.cases).map((switchCase) => {
		const test = switchCase.test ? emitExpressionStatement(switchCase.test, source) : '';
		const consequent = emitTemplateChildren(switchCase.consequent, source);
		return [test, consequent].filter(Boolean).join('\n');
	});
	return [`void (${sourceSlice(discriminant, source)});`, ...cases].filter(Boolean).join('\n');
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

function emitExpressionStatement(expression: unknown, source: string): string {
	if (!isNode(expression) || expression.type === 'JSXEmptyExpression') return '';
	return `void (${sourceSlice(expression, source)});`;
}

function emitTemplateExpression(node: TsrxAstNode, source: string): string {
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
		const span = sourceSpan(node);
		const cssStart = source.indexOf(node.css, span?.start ?? 0);
		const sourceOffset = cssStart === -1 ? (span?.start ?? 0) : cssStart;
		mappings.push({
			...createMapping(sourceOffset, node.css.length, 0, node.css.length),
			data: {
				...mappingData,
				customData: {
					content: node.css,
				},
			},
		});
	});
	return mappings;
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

		const [sourceOffsetText, sourceLengthText] = codeWithMarkers
			.slice(index + mapStart.length, headerEnd)
			.split(':');
		const text = codeWithMarkers.slice(headerEnd + mapSeparator.length, contentEnd);
		const sourceOffset = Number(sourceOffsetText);
		const sourceLength = Number(sourceLengthText);
		const generatedOffset = code.length;
		code += text;

		if (Number.isFinite(sourceOffset) && Number.isFinite(sourceLength) && sourceLength > 0) {
			mappings.push(createMapping(sourceOffset, sourceLength, generatedOffset, text.length));
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
): TsrxCodeMapping {
	return {
		sourceOffsets: [sourceOffset],
		generatedOffsets: [generatedOffset],
		lengths: [sourceLength],
		generatedLengths: [generatedLength],
		data: mappingData,
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

function markSourceText(sourceOffset: number, text: string): string {
	return `${mapStart}${sourceOffset}:${text.length}${mapSeparator}${text}${mapEnd}`;
}

function markSourceSpans(
	source: string,
	start: number,
	end: number,
	spans: readonly SourceTextSpan[],
): string {
	const ordered = [...spans].sort((left, right) => left.sourceOffset - right.sourceOffset);
	let output = '';
	let cursor = start;
	for (const span of ordered) {
		const spanEnd = span.sourceOffset + span.text.length;
		if (span.sourceOffset < cursor || spanEnd > end) continue;
		output += source.slice(cursor, span.sourceOffset);
		output += markSourceText(span.sourceOffset, span.text);
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

function sourceSliceRange(node: TsrxAstNode, source: string, start: number, end: number): string {
	if (end <= start) return '';
	const spans = collectSourceMappingSpans(node, source, start, end);
	return markSourceSpans(source, start, end, spans);
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
