import {
	isEventAttribute,
	normalizeEventName,
	parseModule as parseYukuModule,
	type Comment,
	type Diagnostic,
	type ParseModuleOptions,
	type Program,
} from 'yuku-tsrx';

export { isEventAttribute, normalizeEventName };
export type { Program };

export type MarklessSourcePosition = {
	readonly line: number;
	readonly column: number;
};

export type MarklessSourceLocation = {
	readonly start: MarklessSourcePosition;
	readonly end: MarklessSourcePosition;
};

export interface MarklessCompileError extends SyntaxError {
	code: string | undefined;
	pos: number | undefined;
	raisedAt: number | undefined;
	end: number | undefined;
	loc: MarklessSourceLocation | undefined;
	fileName: string | null;
	type: 'fatal' | 'usage';
}

export type MarklessParserComment = Comment & {
	readonly loc: MarklessSourceLocation;
};

export type MarklessParseOptions = Omit<ParseModuleOptions, 'errors' | 'comments'> & {
	errors?: MarklessCompileError[];
	comments?: MarklessParserComment[];
};

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

export function parseModule(
	source: string,
	filename = 'module.tsrx',
	options: MarklessParseOptions = {},
): Program {
	const diagnostics: Diagnostic[] = [];
	const comments: Comment[] = [];
	const {
		errors,
		comments: outputComments,
		collect = false,
		loose = false,
		...parserOptions
	} = options;
	const program = parseYukuModule(source, filename, {
		...parserOptions,
		collect: true,
		loose,
		errors: diagnostics,
		comments,
	});
	const compileErrors = [
		...diagnostics.map((diagnostic) =>
			toMarklessCompileError(diagnostic, source, filename, 'fatal'),
		),
		...duplicateBindingDiagnostics(program, source).map((diagnostic) =>
			toMarklessCompileError(diagnostic, source, filename, 'usage'),
		),
	];
	errors?.push(...compileErrors);
	outputComments?.push(
		...comments.map((comment) => ({
			...comment,
			loc: sourceLocation(source, comment.start, comment.end),
		})),
	);
	if (!collect && !loose) {
		const fatal = compileErrors.find((error) => error.type === 'fatal');
		if (fatal) throw fatal;
	}
	return decorateProgram(program);
}

type AstRecord = Record<string, unknown> & { readonly type?: unknown };

const wrapperAliases = {
	JSXForExpression: ['left', 'right', 'body', 'index', 'key', 'await'],
	JSXSwitchExpression: ['discriminant', 'cases'],
	JSXTryExpression: ['block', 'handler', 'finalizer'],
} as const;

function decorateProgram(program: Program): Program {
	const visited = new Set<object>();
	const visit = (value: unknown): void => {
		if (!value || typeof value !== 'object' || visited.has(value)) return;
		visited.add(value);
		if (Array.isArray(value)) {
			for (const item of value) visit(item);
			return;
		}

		const node = value as AstRecord;
		blankMarklessAllowDirective(node);
		const aliases =
			typeof node.type === 'string'
				? wrapperAliases[node.type as keyof typeof wrapperAliases]
				: undefined;
		const statement = node.statement;
		if (aliases && statement && typeof statement === 'object') {
			const statementNode = statement as AstRecord;
			for (const name of aliases) {
				if (Object.hasOwn(node, name)) continue;
				Object.defineProperty(node, name, {
					configurable: true,
					enumerable: false,
					value: statementNode[name],
					writable: true,
				});
			}
		}

		for (const child of Object.values(node)) visit(child);
	};
	visit(program);
	return program;
}

const marklessAllowDirective = /^\/\/\s*markless-allow\s+[A-Z0-9_]+:\s*\S(?:.*\S)?$/;

function blankMarklessAllowDirective(node: AstRecord): void {
	if (node.type !== 'JSXText' || typeof node.value !== 'string') return;
	if (!marklessAllowDirective.test(node.value.trim())) return;
	node.value = node.value.replace(/[^\r\n]/g, ' ');
}

function toMarklessCompileError(
	diagnostic: Diagnostic,
	source: string,
	filename: string,
	type: MarklessCompileError['type'],
): MarklessCompileError {
	const { start, end } = authoredDiagnosticSpan(diagnostic, source);
	const error = new SyntaxError(diagnostic.message) as MarklessCompileError;
	error.code = undefined;
	error.pos = start;
	error.raisedAt = end;
	error.end = end;
	error.loc = sourceLocation(source, start, end);
	error.fileName = filename;
	error.type = type;
	return error;
}

function authoredDiagnosticSpan(
	diagnostic: Diagnostic,
	source: string,
): { start: number; end: number } {
	const start = Math.max(0, Math.min(source.length, diagnostic.start));
	const end = Math.max(start, Math.min(source.length, diagnostic.end));
	if (source.slice(start - 2, start) === '</') return { start: start - 2, end };

	const prefix = source.slice(0, start);
	const extraClosingAngle = prefix.match(/<\/[^<>\s]+>>\s*$/)?.[0].lastIndexOf('>');
	if (extraClosingAngle !== undefined) {
		return {
			start: prefix.length - (prefix.match(/<\/[^<>\s]+>>\s*$/)?.[0].length ?? 0) + extraClosingAngle,
			end,
		};
	}
	return { start, end };
}

type Binding = { readonly name: string; readonly start: number; readonly end: number };

function duplicateBindingDiagnostics(program: Program, source: string): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];
	const visited = new Set<object>();
	const visit = (value: unknown): void => {
		if (!value || typeof value !== 'object' || visited.has(value)) return;
		visited.add(value);
		if (Array.isArray(value)) {
			for (const item of value) visit(item);
			return;
		}

		const node = value as AstRecord;
		if (
			node.type === 'Program' ||
			node.type === 'BlockStatement' ||
			node.type === 'JSXCodeBlock' ||
			node.type === 'StaticBlock' ||
			node.type === 'TSModuleBlock'
		) {
			collectStatementListDuplicates(node.body, diagnostics, source);
		}
		for (const child of Object.values(node)) visit(child);
	};
	visit(program);
	return diagnostics;
}

function collectStatementListDuplicates(
	body: unknown,
	diagnostics: Diagnostic[],
	source: string,
): void {
	if (!Array.isArray(body)) return;
	const declarations = new Map<string, Binding & { readonly kind: string }>();
	for (const statement of body) {
		if (!statement || typeof statement !== 'object') continue;
		const declaration = statement as AstRecord;
		if (declaration.type !== 'VariableDeclaration' || !Array.isArray(declaration.declarations)) {
			continue;
		}
		const kind = typeof declaration.kind === 'string' ? declaration.kind : '';
		for (const declarator of declaration.declarations) {
			if (!declarator || typeof declarator !== 'object') continue;
			for (const binding of bindingIdentifiers((declarator as AstRecord).id, source)) {
				const existing = declarations.get(binding.name);
				if (!existing) {
					declarations.set(binding.name, { ...binding, kind });
					continue;
				}
				if (kind === 'var' && existing.kind === 'var') continue;
				diagnostics.push({
					severity: 'error',
					message: `Identifier '${binding.name}' has already been declared`,
					start: binding.start,
					end: binding.end,
					help: `Consider removing or renaming this declaration of '${binding.name}'`,
					labels: [
						{ start: existing.start, end: existing.end },
						{ start: binding.start, end: binding.end },
					],
				});
			}
		}
	}
}

function bindingIdentifiers(value: unknown, source: string): Binding[] {
	if (!value || typeof value !== 'object') return [];
	const node = value as AstRecord;
	if (
		node.type === 'Identifier' &&
		typeof node.start === 'number' &&
		typeof node.end === 'number'
	) {
		return [{ name: source.slice(node.start, node.end), start: node.start, end: node.end }];
	}
	if (node.type === 'RestElement') return bindingIdentifiers(node.argument, source);
	if (node.type === 'AssignmentPattern') return bindingIdentifiers(node.left, source);
	if (node.type === 'TSParameterProperty') return bindingIdentifiers(node.parameter, source);
	if (node.type === 'ArrayPattern' && Array.isArray(node.elements)) {
		return node.elements.flatMap((item) => bindingIdentifiers(item, source));
	}
	if (node.type === 'ObjectPattern' && Array.isArray(node.properties)) {
		return node.properties.flatMap((property) => {
			if (!property || typeof property !== 'object') return [];
			const propertyNode = property as AstRecord;
			return bindingIdentifiers(
				propertyNode.type === 'Property' ? propertyNode.value : propertyNode,
				source,
			);
		});
	}
	return [];
}

function sourceLocation(source: string, start: number, end: number): MarklessSourceLocation {
	return {
		start: sourcePosition(source, start),
		end: sourcePosition(source, end),
	};
}

function sourcePosition(source: string, offset: number): MarklessSourcePosition {
	const bounded = Math.max(0, Math.min(source.length, offset));
	const prefix = source.slice(0, bounded);
	const lineStart = prefix.lastIndexOf('\n');
	return {
		line: prefix.split('\n').length,
		column: lineStart === -1 ? bounded : bounded - lineStart - 1,
	};
}
