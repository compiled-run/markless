import { compileTsrxForTypeService } from '@markless/compiler/type-service';
import type * as ts from 'typescript';

type TypeScript = typeof ts;

type ConstructContext =
	| 'module'
	| 'statement'
	| 'children'
	| 'after-if'
	| 'after-for'
	| 'after-try'
	| 'switch'
	| 'none';

type CatalogItem = {
	readonly name: string;
	readonly filterText?: string;
	readonly insertText: string;
	readonly context:
		| Exclude<ConstructContext, 'none'>
		| readonly Exclude<ConstructContext, 'none'>[];
	readonly description?: string;
};

const baseConstructContexts = ['statement', 'children'] as const;

const snippetCatalog: readonly CatalogItem[] = [
	{
		name: 'function Component(props) @{ }',
		filterText: '@component',
		insertText: 'export function ${1:ComponentName}(${2:props}) @{\n\t$0\n}',
		context: 'module',
		description: 'Markless component function',
	},
	{
		name: 'function Component(props) @{ }',
		filterText: '@component',
		insertText: 'function ${1:ComponentName}(${2:props}) @{\n\t$0\n}',
		context: 'statement',
		description: 'Markless component function',
	},
	{ name: '@{}', insertText: '@{\n\t$0\n}', context: baseConstructContexts },
	{ name: '@{', insertText: '@{\n\t$0\n}', context: baseConstructContexts },
	{ name: '@if', insertText: '@if (${1:condition}) {\n\t$0\n}', context: baseConstructContexts },
	{
		name: '@if-@else',
		insertText: '@if (${1:condition}) {\n\t$2\n} @else {\n\t$3\n}',
		context: baseConstructContexts,
	},
	{
		name: '@for-of',
		insertText: '@for (const ${1:item} of ${2:items}) {\n\t$0\n}',
		context: baseConstructContexts,
	},
	{
		name: '@for',
		insertText: '@for (const ${1:item} of ${2:items}) {\n\t$0\n}',
		context: baseConstructContexts,
	},
	{
		name: '@for-index',
		insertText: '@for (const ${1:item} of ${2:items}; index ${3:i}) {\n\t$0\n}',
		context: baseConstructContexts,
	},
	{
		name: '@for-key',
		insertText: '@for (const ${1:item} of ${2:items}; key ${1:item}.${3:id}) {\n\t$0\n}',
		context: baseConstructContexts,
	},
	{
		name: '@for-index-key',
		insertText:
			'@for (const ${1:item} of ${2:items}; index ${3:i}; key ${1:item}.${4:id}) {\n\t$0\n}',
		context: baseConstructContexts,
	},
	{
		name: '@for-@empty',
		insertText: '@for (const ${1:item} of ${2:items}) {\n\t$2\n} @empty {\n\t$0\n}',
		context: baseConstructContexts,
	},
	{
		name: '@switch-@case',
		insertText: '@switch (${1:value}) {\n\t@case ${2:match}: {\n\t\t$0\n\t}\n}',
		context: baseConstructContexts,
	},
	{
		name: '@switch',
		insertText: '@switch ($1) {\n\t$0\n}',
		context: baseConstructContexts,
	},
	{
		name: '@try-@pending',
		insertText: '@try {\n\t$1\n} @pending {\n\t$0\n}',
		context: baseConstructContexts,
	},
	{
		name: '@try-@pending-@catch',
		insertText: '@try {\n\t$1\n} @pending {\n\t$2\n} @catch (${3:e}) {\n\t$0\n}',
		context: baseConstructContexts,
	},
	{ name: '@try', insertText: '@try {\n\t$0\n}', context: baseConstructContexts },
	{ name: '@else', insertText: '@else {\n\t$0\n}', context: 'after-if' },
	{
		name: '@else if',
		insertText: '@else if (${1:condition}) {\n\t$0\n}',
		context: 'after-if',
	},
	{ name: '@empty', insertText: '@empty {\n\t$0\n}', context: 'after-for' },
	{ name: '@case', insertText: '@case $1: {\n\t$0\n}', context: 'switch' },
	{ name: '@default', insertText: '@default: {\n\t$0\n}', context: 'switch' },
	{ name: '@pending', insertText: '@pending {\n\t$0\n}', context: 'after-try' },
	{ name: '@catch', insertText: '@catch (${1:error}) {\n\t$0\n}', context: 'after-try' },
];

const catalogNames = new Set(snippetCatalog.map((item) => item.name));
const validationCache = new Map<string, ConstructContext>();
const placeholderName = '__markless_at__';

export function installMarklessCompletions(
	typeScript: TypeScript,
	info: ts.server.PluginCreateInfo,
	languageService: ts.LanguageService,
	getSourceSnapshot: (fileName: string) => ts.IScriptSnapshot | undefined,
): void {
	const getCompletions = languageService.getCompletionsAtPosition.bind(languageService);
	const getDetails = languageService.getCompletionEntryDetails.bind(languageService);
	const getDefinitionAndBoundSpan =
		languageService.getDefinitionAndBoundSpan.bind(languageService);

	languageService.getCompletionsAtPosition = (
		fileName,
		position,
		options,
		formattingSettings,
	) => {
		if (!fileName.endsWith('.tsrx')) {
			return getCompletions(fileName, position, options, formattingSettings);
		}
		const base = getCompletions(fileName, position, options, formattingSettings);
		const snapshot =
			getSourceSnapshot(fileName) ?? info.project.getScriptInfo(fileName)?.getSnapshot();
		if (!snapshot) return base;
		const source = snapshot.getText(0, snapshot.getLength());
		const importEntries = completionEntriesForImport(
			typeScript,
			languageService,
			fileName,
			position,
			source,
			getSourceSnapshot,
		);
		const prefix = source.slice(0, position).match(/@\w*$/)?.[0];
		if (!prefix) return withAdditionalEntries(base, importEntries);

		const context = validConstructContext(source, fileName, position, prefix.length, info);
		if (context === 'none') return withoutSyntheticEntries(base);
		const replacementSpan = { start: position - prefix.length, length: prefix.length };
		const entries = snippetCatalog
			.filter((item) => isCatalogItemValidInContext(item, context))
			.map(
				(item, index): ts.CompletionEntry => ({
					name: item.name,
					kind: typeScript.ScriptElementKind.string,
					kindModifiers: '',
					sortText: `0-markless-${String(index).padStart(2, '0')}`,
					...(item.filterText ? { filterText: item.filterText } : undefined),
					insertText: item.insertText,
					isSnippet: true,
					replacementSpan,
					...(item.description
						? { labelDetails: { description: item.description } }
						: undefined),
				}),
			);
		const existing = base?.entries.filter((entry) => !entry.name.startsWith('@')) ?? [];
		return {
			...(base ?? emptyCompletionInfo()),
			entries: [...entries, ...existing],
		};
	};

	languageService.getCompletionEntryDetails = (
		fileName,
		position,
		name,
		formatOptions,
		source,
		preferences,
		_data,
	) => {
		if (fileName.endsWith('.tsrx') && catalogNames.has(name)) {
			return {
				name,
				kind: typeScript.ScriptElementKind.string,
				kindModifiers: '',
				displayParts: [{ text: name, kind: 'text' }],
				documentation: [{ text: 'Markless TSRX construct', kind: 'text' }],
			};
		}
		return getDetails(fileName, position, name, formatOptions, source, preferences, _data);
	};

	languageService.getDefinitionAndBoundSpan = (fileName, position) => {
		const base = getDefinitionAndBoundSpan(fileName, position);
		if (!fileName.endsWith('.tsrx') || base?.definitions?.length) return base;
		const snapshot =
			getSourceSnapshot(fileName) ?? info.project.getScriptInfo(fileName)?.getSnapshot();
		if (!snapshot) return base;
		const source = snapshot.getText(0, snapshot.getLength());
		return (
			componentImportDefinition(typeScript, fileName, position, source, getSourceSnapshot) ??
			base
		);
	};
}

function validConstructContext(
	source: string,
	fileName: string,
	position: number,
	prefixLength: number,
	info: ts.server.PluginCreateInfo,
): ConstructContext {
	const version = info.languageServiceHost.getScriptVersion?.(fileName) ?? source;
	const key = `${fileName}\0${version}\0${position}\0${prefixLength}`;
	const cached = validationCache.get(key);
	if (cached !== undefined) return cached;

	const prefixStart = position - prefixLength;
	const valid = classifyConstructContext(source, fileName, prefixStart, position);
	validationCache.set(key, valid);
	if (validationCache.size > 200) validationCache.delete(validationCache.keys().next().value!);
	return valid;
}

type AstNode = {
	readonly type: string;
	readonly start?: number;
	readonly end?: number;
	readonly name?: string;
	readonly [key: string]: unknown;
};

type AstLocation = {
	readonly node: AstNode;
	readonly ancestors: readonly AstNode[];
};

function classifyConstructContext(
	source: string,
	fileName: string,
	prefixStart: number,
	position: number,
): ConstructContext {
	const replacements = [
		placeholderName,
		`{${placeholderName}}`,
		`@case ${placeholderName}: {}`,
		`@pending {} ${placeholderName};`,
	];
	for (const replacement of replacements) {
		const candidate = buildClassifierCandidate(source, prefixStart, position, replacement);
		try {
			const compiled = compileTsrxForTypeService(candidate.source, fileName, { loose: true });
			const location = findAstNodeAt(
				compiled.sourceAst as AstNode,
				candidate.placeholderOffset,
				(node) => node.type === 'Identifier' && node.name === placeholderName,
			);
			if (!location) continue;
			const classified = classifyPlaceholder(location);
			if (classified) return classified;
		} catch {
			// Try the recovery shape for the next structural context.
		}
	}
	return 'none';
}

function classifyPlaceholder(location: AstLocation): ConstructContext | undefined {
	const { node, ancestors } = location;
	const parent = ancestors.at(-1);
	if (!parent) return 'none';

	if (parent.type === 'JSXExpressionContainer' && parent.expression === node) {
		const childrenParent = ancestors.at(-2);
		if (
			(childrenParent?.type !== 'JSXElement' && childrenParent?.type !== 'JSXFragment') ||
			!Array.isArray(childrenParent.children)
		) {
			return 'none';
		}
		const childIndex = childrenParent.children.indexOf(parent);
		if (childIndex < 0) return 'none';
		const previous = childrenParent.children[childIndex - 1] as AstNode | undefined;
		if (previous?.type === 'JSXIfExpression') return 'after-if';
		if (previous?.type === 'JSXForExpression') return 'after-for';
		return 'children';
	}

	if (ancestors.some((ancestor) => ancestor.type === 'JSXSwitchExpression')) {
		return ancestors.some((ancestor) => ancestor.type === 'SwitchCase') ? 'switch' : 'none';
	}
	if (parent.type !== 'ExpressionStatement' || parent.expression !== node) return 'none';

	const block = ancestors.at(-2);
	if (block?.type === 'Program' && Array.isArray(block.body)) {
		return block.body.includes(parent) ? 'module' : 'none';
	}
	if (block?.type !== 'JSXCodeBlock' || !Array.isArray(block.body)) return 'none';
	const statementIndex = block.body.indexOf(parent);
	if (statementIndex < 0) return 'none';
	const previous = block.body[statementIndex - 1] as AstNode | undefined;
	if (previous?.type === 'JSXTryExpression') return 'after-try';
	if (previous?.type === 'JSXIfExpression') return 'after-if';
	if (previous?.type === 'JSXForExpression') return 'after-for';
	return 'statement';
}

function isCatalogItemValidInContext(
	item: CatalogItem,
	context: Exclude<ConstructContext, 'none'>,
): boolean {
	const itemContexts = Array.isArray(item.context) ? item.context : [item.context];
	return (
		itemContexts.includes(context) ||
		(item.context === baseConstructContexts &&
			(context === 'after-if' || context === 'after-for'))
	);
}

function buildClassifierCandidate(
	source: string,
	prefixStart: number,
	position: number,
	targetReplacement: string,
): { readonly source: string; readonly placeholderOffset: number } {
	const edits: Array<{ readonly offset: number; readonly replacement: string }> = [];
	for (const match of source.matchAll(/@(?![\w{])/g)) {
		const offset = match.index;
		if (offset >= prefixStart && offset < position) continue;
		const lineStart = source.lastIndexOf('\n', offset - 1) + 1;
		const lineBefore = source.slice(lineStart, offset);
		const before = source.slice(Math.max(0, offset - 96), offset).trimEnd();
		let replacement = '@{}';
		if (lineStart === offset || '=+-*/%?:,('.includes(before.at(-1) ?? '')) replacement = '0';
		else if (/@try\b/.test(lineBefore)) replacement = '@pending {}';
		else if (/@switch\b/.test(lineBefore)) replacement = '@default: {}';
		edits.push({ offset, replacement });
	}

	let candidate = source;
	for (const edit of edits.toReversed()) {
		candidate = `${candidate.slice(0, edit.offset)}${edit.replacement}${candidate.slice(edit.offset + 1)}`;
	}
	const adjustedPrefixStart =
		prefixStart +
		edits
			.filter((edit) => edit.offset < prefixStart)
			.reduce((total, edit) => total + edit.replacement.length - 1, 0);
	const adjustedPosition = adjustedPrefixStart + (position - prefixStart);
	candidate = `${candidate.slice(0, adjustedPrefixStart)}${targetReplacement}${candidate.slice(adjustedPosition)}`;
	return {
		source: candidate,
		placeholderOffset: adjustedPrefixStart + targetReplacement.indexOf(placeholderName),
	};
}

function findAstNodeAt(
	node: AstNode,
	offset: number,
	predicate: (candidate: AstNode) => boolean,
	ancestors: readonly AstNode[] = [],
): AstLocation | undefined {
	if (
		node.start !== undefined &&
		node.end !== undefined &&
		(offset < node.start || offset >= node.end)
	) {
		return undefined;
	}
	if (predicate(node) && node.start === offset) return { node, ancestors };

	for (const value of Object.values(node)) {
		if (Array.isArray(value)) {
			for (const child of value) {
				if (!isAstNode(child)) continue;
				const found = findAstNodeAt(child, offset, predicate, [...ancestors, node]);
				if (found) return found;
			}
		} else if (isAstNode(value)) {
			const found = findAstNodeAt(value, offset, predicate, [...ancestors, node]);
			if (found) return found;
		}
	}
	return undefined;
}

function isAstNode(value: unknown): value is AstNode {
	return (
		typeof value === 'object' && value !== null && typeof (value as AstNode).type === 'string'
	);
}

function componentImportDefinition(
	typeScript: TypeScript,
	fileName: string,
	position: number,
	source: string,
	getSourceSnapshot: (fileName: string) => ts.IScriptSnapshot | undefined,
): ts.DefinitionInfoAndBoundSpan | undefined {
	let compiled: ReturnType<typeof compileTsrxForTypeService>;
	try {
		compiled = compileTsrxForTypeService(source, fileName, { loose: true });
	} catch {
		return undefined;
	}
	const program = compiled.sourceAst as AstNode;
	const usage = findSmallestAstNode(program, (node) => {
		return (
			(node.type === 'JSXIdentifier' || node.type === 'Identifier') &&
			typeof node.name === 'string' &&
			node.start !== undefined &&
			node.end !== undefined &&
			position > node.start &&
			position <= node.end
		);
	});
	if (!usage?.name || usage.start === undefined || usage.end === undefined) return undefined;

	const body = Array.isArray(program.body) ? (program.body as AstNode[]) : [];
	let moduleName: string | undefined;
	for (const statement of body) {
		if (statement.type !== 'ImportDeclaration' || !Array.isArray(statement.specifiers))
			continue;
		const importsUsage = (statement.specifiers as AstNode[]).some((specifier) => {
			const local = specifier.local as AstNode | undefined;
			return local?.name === usage.name;
		});
		const moduleSource = statement.source as { readonly value?: unknown } | undefined;
		if (importsUsage && typeof moduleSource?.value === 'string') {
			moduleName = moduleSource.value;
			break;
		}
	}
	if (!moduleName?.endsWith('.tsrx') || !/^\.\.?\//.test(moduleName)) return undefined;

	const normalizedFileName = fileName.replace(/\\/g, '/');
	const containingDirectory = normalizedFileName.slice(0, normalizedFileName.lastIndexOf('/'));
	const targetFileName = typeScript.sys.resolvePath(`${containingDirectory}/${moduleName}`);
	const targetSnapshot = getSourceSnapshot(targetFileName);
	if (!targetSnapshot) return undefined;
	const targetSource = targetSnapshot.getText(0, targetSnapshot.getLength());
	let targetProgram: AstNode;
	try {
		targetProgram = compileTsrxForTypeService(targetSource, targetFileName, { loose: true })
			.sourceAst as AstNode;
	} catch {
		return undefined;
	}
	const target = exportedIdentifier(targetProgram, usage.name);
	if (target?.start === undefined || target.end === undefined) return undefined;

	return {
		textSpan: { start: usage.start, length: usage.end - usage.start },
		definitions: [
			{
				fileName: targetFileName,
				textSpan: { start: target.start, length: target.end - target.start },
				kind: typeScript.ScriptElementKind.functionElement,
				name: usage.name,
				containerKind: typeScript.ScriptElementKind.unknown,
				containerName: '',
			},
		],
	};
}

function exportedIdentifier(program: AstNode, name: string): AstNode | undefined {
	const body = Array.isArray(program.body) ? (program.body as AstNode[]) : [];
	for (const statement of body) {
		if (statement.type !== 'ExportNamedDeclaration') continue;
		const declaration = statement.declaration as AstNode | undefined;
		const identifier = declaration?.id as AstNode | undefined;
		if (identifier?.type === 'Identifier' && identifier.name === name) return identifier;
		if (!Array.isArray(statement.specifiers)) continue;
		for (const specifier of statement.specifiers as AstNode[]) {
			const exported = specifier.exported as AstNode | undefined;
			const local = specifier.local as AstNode | undefined;
			if (exported?.name === name && local?.type === 'Identifier') return local;
		}
	}
	return undefined;
}

function findSmallestAstNode(
	node: AstNode,
	predicate: (candidate: AstNode) => boolean,
): AstNode | undefined {
	let found = predicate(node) ? node : undefined;
	for (const value of Object.values(node)) {
		const children = Array.isArray(value) ? value : [value];
		for (const child of children) {
			if (!isAstNode(child)) continue;
			const candidate = findSmallestAstNode(child, predicate);
			if (!candidate) continue;
			if (!found || candidate.end! - candidate.start! < found.end! - found.start!) {
				found = candidate;
			}
		}
	}
	return found;
}

function completionEntriesForImport(
	typeScript: TypeScript,
	languageService: ts.LanguageService,
	fileName: string,
	position: number,
	source: string,
	getSourceSnapshot: (fileName: string) => ts.IScriptSnapshot | undefined,
): ts.CompletionEntry[] {
	const program = languageService.getProgram?.();
	if (!program) return [];
	const sourceFile = typeScript.createSourceFile(
		fileName,
		source,
		typeScript.ScriptTarget.Latest,
		true,
		typeScript.ScriptKind.TS,
	);
	const declaration = sourceFile.statements.find(
		(statement): statement is ts.ImportDeclaration =>
			typeScript.isImportDeclaration(statement) &&
			statement.importClause !== undefined &&
			position >= statement.importClause.getStart(sourceFile) &&
			position <= statement.importClause.getEnd(),
	);
	if (!declaration) return [];
	const moduleName = declaration.moduleSpecifier.getText(sourceFile).slice(1, -1);
	const resolvedByTypeScript = typeScript.resolveModuleName(
		moduleName,
		fileName,
		program.getCompilerOptions(),
		typeScript.sys,
	).resolvedModule?.resolvedFileName;
	const normalizedFileName = fileName.replace(/\\/g, '/');
	const containingDirectory = normalizedFileName.slice(0, normalizedFileName.lastIndexOf('/'));
	const resolved =
		resolvedByTypeScript ??
		(moduleName.endsWith('.tsrx') && /^\.\.?\//.test(moduleName)
			? typeScript.sys.resolvePath(`${containingDirectory}/${moduleName}`)
			: undefined);
	const moduleFile = resolved ? program.getSourceFile(resolved) : undefined;
	const symbol =
		program.getTypeChecker().getSymbolAtLocation(declaration.moduleSpecifier) ??
		(moduleFile ? program.getTypeChecker().getSymbolAtLocation(moduleFile) : undefined);
	const entries = symbol
		? program
				.getTypeChecker()
				.getExportsOfModule(symbol)
				.map(
					(exported): ts.CompletionEntry => ({
						name: exported.name,
						kind: typeScript.ScriptElementKind.alias,
						kindModifiers: '',
						sortText: '0-markless-import',
					}),
				)
		: [];

	if (resolved?.endsWith('.tsrx')) {
		const snapshot = getSourceSnapshot(resolved);
		if (snapshot) {
			const targetSource = snapshot.getText(0, snapshot.getLength());
			try {
				const compiled = compileTsrxForTypeService(targetSource, resolved, { loose: true });
				const generatedFile = typeScript.createSourceFile(
					`${resolved}.ts`,
					compiled.code,
					typeScript.ScriptTarget.Latest,
					true,
					typeScript.ScriptKind.TS,
				);
				for (const name of exportedDeclarationNames(typeScript, generatedFile)) {
					if (entries.some((entry) => entry.name === name)) continue;
					entries.push({
						name,
						kind: typeScript.ScriptElementKind.alias,
						kindModifiers: '',
						sortText: '0-markless-import',
					});
				}
			} catch {
				// The program-derived exports remain available while the target is incomplete.
			}
		}
	}
	return entries;
}

function exportedDeclarationNames(typeScript: TypeScript, sourceFile: ts.SourceFile): string[] {
	const names: string[] = [];
	for (const statement of sourceFile.statements) {
		if (
			!statement.modifiers?.some(
				(modifier) => modifier.kind === typeScript.SyntaxKind.ExportKeyword,
			)
		) {
			continue;
		}
		if (
			(typeScript.isFunctionDeclaration(statement) ||
				typeScript.isClassDeclaration(statement) ||
				typeScript.isInterfaceDeclaration(statement) ||
				typeScript.isTypeAliasDeclaration(statement) ||
				typeScript.isEnumDeclaration(statement)) &&
			statement.name
		) {
			names.push(statement.name.text);
		} else if (typeScript.isVariableStatement(statement)) {
			for (const declaration of statement.declarationList.declarations) {
				collectBindingNames(typeScript, declaration.name, names);
			}
		}
	}
	return names;
}

function collectBindingNames(typeScript: TypeScript, name: ts.BindingName, names: string[]): void {
	if (typeScript.isIdentifier(name)) {
		names.push(name.text);
		return;
	}
	for (const element of name.elements) {
		if (!typeScript.isOmittedExpression(element))
			collectBindingNames(typeScript, element.name, names);
	}
}

function withAdditionalEntries(
	base: ts.CompletionInfo | undefined,
	additional: readonly ts.CompletionEntry[],
): ts.CompletionInfo | undefined {
	if (additional.length === 0) return base;
	const names = new Set(additional.map((entry) => entry.name));
	return {
		...(base ?? emptyCompletionInfo()),
		entries: [
			...additional,
			...(base?.entries.filter((entry) => !names.has(entry.name)) ?? []),
		],
	};
}

function withoutSyntheticEntries(
	base: ts.CompletionInfo | undefined,
): ts.CompletionInfo | undefined {
	if (!base) return undefined;
	return { ...base, entries: base.entries.filter((entry) => !catalogNames.has(entry.name)) };
}

function emptyCompletionInfo(): ts.CompletionInfo {
	return {
		isGlobalCompletion: false,
		isMemberCompletion: false,
		isNewIdentifierLocation: false,
		entries: [],
	};
}
