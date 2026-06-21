import { asNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import type { SemanticModuleImport } from '../../artifacts.ts';

export type FrameworkApiName = 'state' | 'computed' | 'element' | 'shared';

const frameworkApiNames = new Set<FrameworkApiName>(['state', 'computed', 'element', 'shared']);
const frameworkApiSources = new Set(['@arcade/core', '@arcade/arcade']);

// These imports make compiler-rewritten APIs explicit in user code.
// A bare state() call is not enough; it must resolve to an import from @arcade/core.
export function collectImports(
	statements: ReadonlyArray<AnyNode>,
): ReadonlyMap<string, FrameworkApiName> {
	const imports = new Map<string, FrameworkApiName>();

	for (const statement of statements) {
		if (statement.type !== 'ImportDeclaration') continue;
		if (!isFrameworkApiSource(importSource(statement))) continue;

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
): ReadonlyArray<SemanticModuleImport> {
	const imports: SemanticModuleImport[] = [];

	for (const statement of statements) {
		if (statement.type !== 'ImportDeclaration') continue;
		const source = importSource(statement);
		if (!source) continue;

		for (const specifier of asNodes(statement.specifiers)) {
			if (specifier.type === 'ImportSpecifier') {
				const importedName = getIdentifierName(specifier.imported as AnyNode | undefined);
				const localName = getIdentifierName(specifier.local as AnyNode | undefined);
				if (!importedName || !localName) continue;
				if (isFrameworkApiSource(source) && isFrameworkApiName(importedName)) continue;

				imports.push({
					localName,
					importedName,
					source,
					kind: 'named',
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
				});
			}
		}
	}

	return imports;
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

function isFrameworkApiSource(source: string | null): boolean {
	return !!source && frameworkApiSources.has(source);
}

function importSource(node: AnyNode): string | null {
	const source = node.source as AnyNode | undefined;
	const value = source?.value;
	return typeof value === 'string' ? value : null;
}
