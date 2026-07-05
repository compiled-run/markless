import { isEventAttribute, normalizeEventName, parseModule } from '@tsrx/core';
import { deserializeGraphValue, type SerializedGraphPayload } from '@markless/serializer';
import type { PublicRenderModuleInput, SemanticModuleImport } from '../../artifacts.ts';
import { asNodes, childNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource } from '../../ast/source.ts';
import { getComponentFunction, getDynamicTagExpression, getElementTagName, isHostTagName } from '../../ast/tsrx.ts';
import type { ComponentEdge } from './types.ts';

export function isComponentRoot(root: AnyNode): boolean {
	const tagName = getElementTagName(root);
	return !!tagName && !isHostTagName(tagName);
}

export function callbackSymbolIds(input: PublicRenderModuleInput): ReadonlyMap<string, string> {
	return new Map(
		input.symbolResolver.symbols.flatMap((symbol) =>
			symbol.kind === 'callback-prop'
				? [[`${symbol.componentEdgeId}:${symbol.propName}`, symbol.id]]
				: [],
		),
	);
}

export function moduleScopeLines(source: string, filename: string): string[] {
	const ast = parseModule(source, filename) as unknown as AnyNode;
	return asNodes(ast.body).flatMap((statement) => {
		if (statement.type === 'ImportDeclaration' || getComponentFunction(statement)) return [];
		const declaration = statement.type === 'ExportNamedDeclaration' ? (statement.declaration as AnyNode | undefined) : statement;
		if (!declaration) return [];
		if (declaration.type !== 'VariableDeclaration' && declaration.type !== 'FunctionDeclaration' && declaration.type !== 'ClassDeclaration') return [];
		const sourceText = expressionSource(declaration, source);
		return sourceText ? [sourceText] : [];
	});
}

export function destructureProps(propNames: ReadonlyArray<string>): string | null {
	return propNames.length > 0 ? `	const { ${propNames.join(', ')} } = props ?? {};` : null;
}

export function staticHostLocators(input: PublicRenderModuleInput) {
	return input.publicRenderPlan.staticHostLocators.map((locator) => ({
		hostNodeId: locator.hostNodeId,
		tagName: locator.tagName,
		hostPath: locator.hostPath,
	}));
}

export type ComponentReference = {
	readonly componentName: string;
	readonly importSource?: string;
	readonly importKind?: ComponentEdge['importKind'];
	readonly importedName?: string;
	readonly localName: string;
};

export function componentReferences(
	componentEdges: PublicRenderModuleInput['semanticGraph']['componentEdges'],
	localPrefix: string,
): ComponentReference[] {
	const references: ComponentReference[] = [];

	for (const edge of componentEdges) {
		if (references.some((item) => item.componentName === edge.childComponentName)) continue;
		references.push({
			componentName: edge.childComponentName,
			...(edge.importSource ? { importSource: edge.importSource } : {}),
			importKind: edge.importKind,
			importedName: edge.importedName,
			localName: `${localPrefix}${references.length}`,
		});
	}

	return references;
}

export function emitComponentImport(imported: ComponentReference & { readonly importSource: string }): string {
	if (imported.importKind === 'named' && !isTsrxComponentImport(imported.importSource)) {
		return `import { ${imported.importedName ?? imported.componentName} as ${imported.localName} } from ${JSON.stringify(imported.importSource)};`;
	}
	return `import ${imported.localName} from ${JSON.stringify(imported.importSource)};`;
}

export function sameModuleComponentMap(ast: AnyNode): ReadonlyMap<string, AnyNode> {
	const components = new Map<string, AnyNode>();
	for (const statement of asNodes(ast.body)) {
		const component = getComponentFunction(statement);
		if (component) components.set(component.name, component.node);
	}
	return components;
}

export function componentEdgesFor(
	input: PublicRenderModuleInput,
	componentName: string,
): PublicRenderModuleInput['semanticGraph']['componentEdges'] {
	return input.semanticGraph.componentEdges.filter(
		(edge) => edge.parentComponentName === componentName,
	);
}

function isTsrxComponentImport(importSource: string): boolean {
	return /\.tsrx(?:[?#].*)?$/.test(importSource);
}

export function publicRenderValueImports(
	moduleImports: ReadonlyArray<SemanticModuleImport>,
	componentEdges: PublicRenderModuleInput['semanticGraph']['componentEdges'],
): ReadonlyArray<SemanticModuleImport> {
	const componentLocalNames = new Set(componentEdges.map((edge) => edge.childComponentName));
	return moduleImports.filter((moduleImport) => !componentLocalNames.has(moduleImport.localName));
}

export function emitValueImport(moduleImport: SemanticModuleImport): string {
	const source = JSON.stringify(moduleImport.source);
	if (moduleImport.kind === 'named') {
		const importedName = moduleImport.importedName ?? moduleImport.localName;
		return importedName === moduleImport.localName
			? `import { ${importedName} } from ${source};`
			: `import { ${importedName} as ${moduleImport.localName} } from ${source};`;
	}
	if (moduleImport.kind === 'namespace') {
		return `import * as ${moduleImport.localName} from ${source};`;
	}
	return `import ${moduleImport.localName} from ${source};`;
}

export function assignSsrHostIds(
	root: AnyNode,
	hostNodeIds: ReadonlyArray<string>,
): ReadonlyMap<AnyNode, string> {
	const hostIdByNode = new Map<AnyNode, string>();
	let index = 0;

	const visit = (node: AnyNode | null | undefined): void => {
		if (!node || typeof node !== 'object') return;

		if (node.type === 'Element' || node.type === 'JSXElement') {
			const tagName = getElementTagName(node);
			const isHost = tagName ? isHostTagName(tagName) : !!getDynamicTagExpression(node);
			if (isHost) {
				const hostNodeId = hostNodeIds[index++];
				if (hostNodeId) hostIdByNode.set(node, hostNodeId);
			}
		}

		for (const child of childNodes(node)) visit(child);
	};

	visit(root);
	return hostIdByNode;
}

export function stateEntries(input: PublicRenderModuleInput): string[] {
	return input.protocolState.cells.flatMap((cell) => {
		if (cell.value === undefined) return [];
		const value = deserializeGraphValue(cell.value as SerializedGraphPayload);
		return `	[${JSON.stringify(cell.graphNodeId)}, ${JSON.stringify(value)}]`;
	});
}

export function objectPropertyName(name: string): string {
	return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
}

export function joinSsrExpressions(parts: ReadonlyArray<string>): string {
	const filtered = parts.filter((part) => part !== '""' && part !== JSON.stringify(''));
	if (filtered.length === 0) return '""';
	return filtered.join(' + ');
}

export function componentPropNames(component: AnyNode): string[] {
	const param = asNodes(component.params)[0];
	if (!param) return [];
	if (param.type === 'Identifier') {
		const name = getIdentifierName(param);
		return name ? [name] : [];
	}
	if (param.type !== 'ObjectPattern') return [];

	return asNodes(param.properties).flatMap((property) => {
		const value = property.value as AnyNode | undefined;
		const key = property.key as AnyNode | undefined;
		const name = getIdentifierName(value) ?? getIdentifierName(key);
		return name ? [name] : [];
	});
}

export function isFragmentNode(node: AnyNode | undefined): boolean {
	return node?.type === 'Fragment' || node?.type === 'JSXFragment';
}
