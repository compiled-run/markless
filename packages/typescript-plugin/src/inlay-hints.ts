import { compileTsrxForTypeService } from '@markless/compiler/type-service';
import type * as ts from 'typescript';
import { isMarklessTsrxFile, mapMarklessSourcePositionToGenerated } from './language.ts';

type TypeScript = typeof ts;

type AstNode = {
	readonly type: string;
	readonly start?: number;
	readonly end?: number;
	readonly [key: string]: unknown;
};

/** Where a part tag's hint goes, and which identifier names the part. */
type PartTagAnchor = {
	/** Authored offset of the identifier whose symbol carries the part's props type. */
	readonly symbolOffset: number;
	/** Authored offset immediately past the whole tag name - where the hint is painted. */
	readonly hintOffset: number;
};

type PartHintConfiguration = { partHints?: unknown; inlayHints?: unknown };

// tsserver's `configurePlugin` command is addressed to a plugin, not to a project, and it
// broadcasts to every project that loaded it. One process-wide value therefore matches the
// command's own scope, and it takes precedence over the per-project tsconfig entry because
// it is the switch the user just flipped.
let configuredPartHints: PartHintConfiguration | undefined;

/** Receives the configuration tsserver's `configurePlugin` command carries. */
export function setMarklessInlayHintConfiguration(configuration: unknown): void {
	configuredPartHints = configuration as PartHintConfiguration | undefined;
}

/**
 * The plugin only paints hints it owns; every native inlay preference keeps flowing to the
 * inner service untouched, so a user who turns TypeScript's own hints off still sees the
 * part hints and vice versa. The extension's own switch arrives as plugin configuration -
 * `markless.inlayHints.parts.enabled` forwarded with `configurePlugin`.
 */
function partHintsEnabled(configuration: PartHintConfiguration | undefined): boolean {
	if (!configuration) return true;
	if (configuration.partHints === false) return false;
	const inlayHints = configuration.inlayHints;
	if (typeof inlayHints === 'object' && inlayHints !== null) {
		const parts = (inlayHints as { parts?: unknown }).parts;
		if (parts === false) return false;
		if (typeof parts === 'object' && parts !== null) {
			if ((parts as { enabled?: unknown }).enabled === false) return false;
		}
	}
	return true;
}

/**
 * Decorate `provideInlayHints` with one hint per part tag, naming the element the part's
 * own props land on.
 *
 * The fact comes from the part's props type, never from the part's markup: a part whose
 * props are `PropsOf<'input'>` may well render that `<input>` inside a wrapper element, and
 * a markup reader would name the wrapper. Reading the props type says which element the
 * consumer's attributes actually reach.
 *
 * This wrapper sits outside the Volar proxy, so the hints it adds already carry authored
 * offsets and are never mapped on the way out; only the inner service's native hints go
 * through Volar's mapping.
 */
export function installMarklessInlayHints(
	typeScript: TypeScript,
	info: ts.server.PluginCreateInfo,
	languageService: ts.LanguageService,
	getSourceSnapshot: (fileName: string) => ts.IScriptSnapshot | undefined,
): void {
	const provideInlayHints = languageService.provideInlayHints?.bind(languageService);
	const projectConfiguration = info.config as PartHintConfiguration | undefined;
	if (!provideInlayHints) return;

	languageService.provideInlayHints = (fileName, span, preferences) => {
		// Native hints keep every one of TypeScript's own inlay preferences: they are handed
		// to the inner service exactly as the editor sent them.
		const base = provideInlayHints(fileName, span, preferences) ?? [];
		const configuration = configuredPartHints ?? projectConfiguration;
		if (!isMarklessTsrxFile(fileName) || !partHintsEnabled(configuration)) return base;
		const snapshot =
			getSourceSnapshot(fileName) ?? info.project.getScriptInfo(fileName)?.getSnapshot();
		if (!snapshot) return base;
		const hints = partTagHints(typeScript, languageService, info, fileName, snapshot, span);
		return hints.length === 0 ? base : [...base, ...hints];
	};
}

// The authored parse is re-used across the many requests an editor makes while scrolling
// one unchanged file. Keyed on the script version so an edit invalidates it immediately.
const authoredAstCache = new Map<string, { readonly version: string; readonly ast: AstNode }>();

function partTagHints(
	typeScript: TypeScript,
	languageService: ts.LanguageService,
	info: ts.server.PluginCreateInfo,
	fileName: string,
	snapshot: ts.IScriptSnapshot,
	span: ts.TextSpan,
): ts.InlayHint[] {
	const program = languageService.getProgram?.();
	const generatedFile = program?.getSourceFile(fileName);
	if (!program || !generatedFile) return [];
	const authoredAst = authoredTsrxAst(info, fileName, snapshot);
	if (!authoredAst) return [];

	const checker = program.getTypeChecker();
	const tagsBySymbol = tagCacheForProgram(program);
	const sourceLength = snapshot.getLength();
	const spanEnd = span.start + span.length;
	const hints: ts.InlayHint[] = [];

	visitAst(authoredAst, (node) => {
		// Opening tags only. Painting the closing tag as well would label every element twice.
		if (node.type !== 'JSXOpeningElement') return;
		const anchor = partTagAnchor(node);
		if (!anchor || anchor.hintOffset < span.start || anchor.symbolOffset > spanEnd) return;
		const tag = partTagName(
			typeScript,
			checker,
			generatedFile,
			fileName,
			snapshot,
			sourceLength,
			anchor.symbolOffset,
			tagsBySymbol,
		);
		if (!tag) return;
		hints.push({
			text: `: ${tag}`,
			position: anchor.hintOffset,
			kind: typeScript.InlayHintKind.Type,
			whitespaceBefore: false,
			whitespaceAfter: false,
		});
	});
	return hints;
}

function authoredTsrxAst(
	info: ts.server.PluginCreateInfo,
	fileName: string,
	snapshot: ts.IScriptSnapshot,
): AstNode | undefined {
	const source = snapshot.getText(0, snapshot.getLength());
	const version = info.languageServiceHost.getScriptVersion?.(fileName) ?? source;
	const cached = authoredAstCache.get(fileName);
	if (cached?.version === version) return cached.ast;
	try {
		const compiled = compileTsrxForTypeService(source, fileName, { loose: true });
		if (!isAstNode(compiled.sourceAst)) return undefined;
		authoredAstCache.set(fileName, { version, ast: compiled.sourceAst });
		if (authoredAstCache.size > 50) {
			authoredAstCache.delete(authoredAstCache.keys().next().value!);
		}
		return compiled.sourceAst;
	} catch {
		return undefined;
	}
}

/**
 * A part tag is a member tag (`<modal.root>`) or a capitalized component tag (`<Trigger>`).
 * A bare lowercase tag is an intrinsic element - its own markup already names the element,
 * so it gets no hint.
 */
function partTagAnchor(openingElement: AstNode): PartTagAnchor | undefined {
	const name = openingElement.name;
	if (!isAstNode(name) || name.end === undefined) return undefined;
	if (name.type === 'JSXMemberExpression') {
		const property = name.property;
		if (!isAstNode(property) || property.start === undefined) return undefined;
		return { symbolOffset: property.start, hintOffset: name.end };
	}
	if (name.type !== 'JSXIdentifier' || name.start === undefined) return undefined;
	if (typeof name.name !== 'string' || !/^[A-Z]/.test(name.name)) return undefined;
	return { symbolOffset: name.start, hintOffset: name.end };
}

function partTagName(
	typeScript: TypeScript,
	checker: ts.TypeChecker,
	generatedFile: ts.SourceFile,
	fileName: string,
	snapshot: ts.IScriptSnapshot,
	sourceLength: number,
	authoredOffset: number,
	tagsBySymbol: Map<ts.Symbol, string | undefined>,
): string | undefined {
	const generatedOffset = mapMarklessSourcePositionToGenerated(fileName, snapshot, authoredOffset);
	if (generatedOffset === undefined) return undefined;
	const token = nodeAtPosition(typeScript, generatedFile, sourceLength + generatedOffset);
	if (!token) return undefined;
	const symbol = resolveAlias(typeScript, checker, checker.getSymbolAtLocation(token));
	if (!symbol) return undefined;
	if (tagsBySymbol.has(symbol)) return tagsBySymbol.get(symbol);
	const tag = tagFromPartSymbol(typeScript, checker, symbol, token);
	tagsBySymbol.set(symbol, tag);
	return tag;
}

/**
 * `PropsOf<'button'>` resolves to a purely structural type - the tag string is gone by the
 * time the checker is done with it. So the tag is read off the props type's *declaration*
 * rather than off the resolved type.
 */
function tagFromPartSymbol(
	typeScript: TypeScript,
	checker: ts.TypeChecker,
	symbol: ts.Symbol,
	location: ts.Node,
): string | undefined {
	const signature = checker.getTypeOfSymbolAtLocation(symbol, location).getCallSignatures()[0];
	const parameter = signature?.parameters[0];
	if (!parameter) return undefined;
	const declaration = parameter.valueDeclaration ?? parameter.declarations?.[0];
	if (declaration && typeScript.isParameter(declaration) && declaration.type) {
		const tag = tagFromTypeNode(typeScript, checker, declaration.type, new Set(), 0);
		if (tag) return tag;
	}
	// A part whose props parameter carries no annotation still reaches its alias through the
	// resolved type when TypeScript kept one.
	const parameterType = checker.getTypeOfSymbolAtLocation(parameter, declaration ?? location);
	return tagFromAliasSymbol(typeScript, checker, parameterType, new Set(), 0);
}

function tagFromAliasSymbol(
	typeScript: TypeScript,
	checker: ts.TypeChecker,
	type: ts.Type,
	seen: Set<ts.Declaration>,
	depth: number,
): string | undefined {
	const aliasSymbol = type.aliasSymbol;
	if (!aliasSymbol) return undefined;
	if (aliasSymbol.name === 'PropsOf') {
		const argument = type.aliasTypeArguments?.[0];
		if (argument?.isStringLiteral()) return argument.value;
	}
	for (const declaration of aliasSymbol.declarations ?? []) {
		if (!typeScript.isTypeAliasDeclaration(declaration) || seen.has(declaration)) continue;
		seen.add(declaration);
		const tag = tagFromTypeNode(typeScript, checker, declaration.type, seen, depth + 1);
		if (tag) return tag;
	}
	return undefined;
}

/**
 * Find the tag a props type is built from. `Omit`, `Pick` and `&` are handled by descending
 * into type arguments and intersection members rather than by unwrapping the type algebra,
 * which is what lets a part alias any of them and still name its element. A named alias is
 * followed one hop at a time through its declaration.
 */
function tagFromTypeNode(
	typeScript: TypeScript,
	checker: ts.TypeChecker,
	node: ts.TypeNode,
	seen: Set<ts.Declaration>,
	depth: number,
): string | undefined {
	if (depth > 8) return undefined;
	if (typeScript.isParenthesizedTypeNode(node)) {
		return tagFromTypeNode(typeScript, checker, node.type, seen, depth + 1);
	}
	if (typeScript.isIntersectionTypeNode(node) || typeScript.isUnionTypeNode(node)) {
		for (const member of node.types) {
			const tag = tagFromTypeNode(typeScript, checker, member, seen, depth + 1);
			if (tag) return tag;
		}
		return undefined;
	}
	if (!typeScript.isTypeReferenceNode(node)) return undefined;

	const identifier = typeScript.isIdentifier(node.typeName)
		? node.typeName
		: node.typeName.right;
	if (identifier.text === 'PropsOf') {
		const argument = node.typeArguments?.[0];
		if (
			argument &&
			typeScript.isLiteralTypeNode(argument) &&
			typeScript.isStringLiteral(argument.literal)
		) {
			return argument.literal.text;
		}
	}
	for (const argument of node.typeArguments ?? []) {
		const tag = tagFromTypeNode(typeScript, checker, argument, seen, depth + 1);
		if (tag) return tag;
	}
	const alias = resolveAlias(typeScript, checker, checker.getSymbolAtLocation(identifier));
	for (const declaration of alias?.declarations ?? []) {
		if (!typeScript.isTypeAliasDeclaration(declaration) || seen.has(declaration)) continue;
		seen.add(declaration);
		const tag = tagFromTypeNode(typeScript, checker, declaration.type, seen, depth + 1);
		if (tag) return tag;
	}
	return undefined;
}

function resolveAlias(
	typeScript: TypeScript,
	checker: ts.TypeChecker,
	symbol: ts.Symbol | undefined,
): ts.Symbol | undefined {
	if (!symbol) return undefined;
	return symbol.flags & typeScript.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

function nodeAtPosition(
	typeScript: TypeScript,
	sourceFile: ts.SourceFile,
	position: number,
): ts.Node | undefined {
	if (position < 0 || position >= sourceFile.end) return undefined;
	let current: ts.Node = sourceFile;
	for (;;) {
		let child: ts.Node | undefined;
		typeScript.forEachChild(current, (candidate) => {
			if (candidate.getStart(sourceFile) <= position && position < candidate.getEnd()) {
				child = candidate;
				return true;
			}
			return undefined;
		});
		if (!child) return current === sourceFile ? undefined : current;
		current = child;
	}
}

// Symbols belong to one program, so a per-program table needs no other invalidation: the
// next program brings new symbols and an empty table.
const tagCaches = new WeakMap<ts.Program, Map<ts.Symbol, string | undefined>>();

function tagCacheForProgram(program: ts.Program): Map<ts.Symbol, string | undefined> {
	const existing = tagCaches.get(program);
	if (existing) return existing;
	const created = new Map<ts.Symbol, string | undefined>();
	tagCaches.set(program, created);
	return created;
}

function visitAst(node: AstNode, visit: (node: AstNode) => void): void {
	visit(node);
	for (const value of Object.values(node)) {
		for (const child of Array.isArray(value) ? value : [value]) {
			if (isAstNode(child)) visitAst(child, visit);
		}
	}
}

function isAstNode(value: unknown): value is AstNode {
	return (
		typeof value === 'object' && value !== null && typeof (value as AstNode).type === 'string'
	);
}
