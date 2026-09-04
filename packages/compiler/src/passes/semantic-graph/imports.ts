import { asNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import type { SemanticGraphDiagnostic, SemanticModuleImport } from '../../artifacts.ts';
import { uiImportShapeDiagnostic } from './diagnostics.ts';

export type FrameworkApiName =
	| 'state'
	| 'computed'
	| 'element'
	| 'shared'
	| 'storage';

const frameworkApiNames = new Set<FrameworkApiName>([
	'state',
	'computed',
	'element',
	'shared',
	'storage',
]);

export function frameworkApiSources(
	additionalSources: readonly string[] = [],
): ReadonlySet<string> {
	return new Set(['@markless/core', ...additionalSources]);
}

// These imports make compiler-rewritten APIs explicit in user code.
// A bare state() call is not enough; it must resolve to an import from markless.
export function collectImports(
	statements: ReadonlyArray<AnyNode>,
	sources: ReadonlySet<string> = frameworkApiSources(),
): ReadonlyMap<string, FrameworkApiName> {
	const imports = new Map<string, FrameworkApiName>();

	for (const statement of statements) {
		if (statement.type !== 'ImportDeclaration') continue;
		if (!isFrameworkApiSource(importSource(statement), sources)) continue;

		for (const specifier of asNodes(statement.specifiers)) {
			if (specifier.type !== 'ImportSpecifier') continue;

			const imported = getIdentifierName(specifier.imported as AnyNode | undefined);
			const local = getIdentifierName(specifier.local as AnyNode | undefined);
			if (!imported || !local || !isFrameworkApiName(imported)) continue;

			imports.set(local, imported);
		}
	}

	return imports;
}

export function collectModuleImports(
	statements: ReadonlyArray<AnyNode>,
	sources: ReadonlySet<string> = frameworkApiSources(),
): ReadonlyArray<SemanticModuleImport> {
	const imports: SemanticModuleImport[] = [];

	for (const statement of statements) {
		if (statement.type !== 'ImportDeclaration') continue;
		const source = importSource(statement);
		if (!source) continue;
		const declarationIsTypeOnly = statement.importKind === 'type';

		for (const specifier of asNodes(statement.specifiers)) {
			const typeOnly = declarationIsTypeOnly || specifier.importKind === 'type';
			const typeOnlyField = typeOnly ? { typeOnly: true as const } : {};

			if (specifier.type === 'ImportSpecifier') {
				const importedName = getIdentifierName(specifier.imported as AnyNode | undefined);
				const localName = getIdentifierName(specifier.local as AnyNode | undefined);
				if (!importedName || !localName) continue;
				if (isFrameworkApiSource(source, sources) && isFrameworkApiName(importedName))
					continue;

				imports.push({
					localName,
					importedName,
					source,
					kind: 'named',
					...typeOnlyField,
				});
				continue;
			}

			if (specifier.type === 'ImportDefaultSpecifier') {
				const localName = getIdentifierName(specifier.local as AnyNode | undefined);
				if (!localName) continue;

				imports.push({
					localName,
					source,
					kind: 'default',
					...typeOnlyField,
				});
				continue;
			}

			if (specifier.type === 'ImportNamespaceSpecifier') {
				const localName = getIdentifierName(specifier.local as AnyNode | undefined);
				if (!localName) continue;

				imports.push({
					localName,
					source,
					kind: 'namespace',
					...typeOnlyField,
				});
			}
		}
	}

	return imports;
}

export function collectUiImportShapeDiagnostics(input: {
	readonly statements: ReadonlyArray<AnyNode>;
	readonly source: string;
	readonly filename: string;
}): ReadonlyArray<SemanticGraphDiagnostic> {
	const diagnostics: SemanticGraphDiagnostic[] = [];

	for (const statement of input.statements) {
		if (statement.type !== 'ImportDeclaration' || statement.importKind === 'type') continue;
		const source = importSource(statement);
		if (!source) continue;
		const specifiers = asNodes(statement.specifiers);

		if (source.startsWith('@markless/ui/')) {
			if (specifiers.length > 0 && specifiers.every((specifier) => specifier.importKind === 'type'))
				continue;
			const name = source.slice('@markless/ui/'.length).split('/')[0];
			if (!name) continue;
			diagnostics.push(
				uiImportShapeDiagnostic({
					statement,
					filename: input.filename,
					source: input.source,
					importSource: source,
					name,
				}),
			);
			continue;
		}

		if (source !== '@markless/ui') continue;
		const namespace = specifiers.find(
			(specifier) => specifier.type === 'ImportNamespaceSpecifier',
		);
		const name = getIdentifierName(namespace?.local as AnyNode | undefined);
		if (!namespace || !name) continue;
		diagnostics.push(
			uiImportShapeDiagnostic({
				statement,
				filename: input.filename,
				source: input.source,
				importSource: source,
				name,
			}),
		);
	}

	return diagnostics;
}

/**
 * The imports an emitted module may carry. A type-only binding is erased before
 * anything runs, so carrying one emits a value import for a specifier the source
 * module may not export at all — a throw at module load rather than at first use.
 */
export function valueModuleImports<T extends { readonly typeOnly?: boolean }>(
	moduleImports: ReadonlyArray<T>,
): ReadonlyArray<T> {
	return moduleImports.filter((moduleImport) => moduleImport.typeOnly !== true);
}

export function getFrameworkApiForCall(
	node: AnyNode | undefined | null,
	imports: ReadonlyMap<string, FrameworkApiName>,
): FrameworkApiName | null {
	const callName = getCallName(node);
	if (!callName) return null;

	return imports.get(callName) ?? null;
}

export function getCallName(node: AnyNode | undefined | null): string | null {
	if (node?.type !== 'CallExpression') return null;

	return getIdentifierName(node.callee as AnyNode | undefined);
}

export function isFrameworkApiName(name: string | null): name is FrameworkApiName {
	return frameworkApiNames.has(name as FrameworkApiName);
}

function isFrameworkApiSource(source: string | null, sources: ReadonlySet<string>): boolean {
	return !!source && sources.has(source);
}

function importSource(node: AnyNode): string | null {
	const source = node.source as AnyNode | undefined;
	const value = source?.value;
	return typeof value === 'string' ? value : null;
}
