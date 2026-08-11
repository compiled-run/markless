import { parseModule } from '@tsrx/core';
import { deserializeGraphValue, type SerializedGraphPayload } from '@markless/serializer';
import type { PublicRenderModuleInput, SemanticModuleImport } from '../../artifacts.ts';
import { asNodes, childNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource } from '../../ast/source.ts';
import {
	getComponentFunction,
	getDynamicTagExpression,
	getElementTagName,
	isHostTagName,
} from '../../ast/tsrx.ts';
import type { ComponentEdge } from './types.ts';

export function isComponentRoot(root: AnyNode): boolean {
	const tagName = getElementTagName(root);
	return !!tagName && !isHostTagName(tagName);
}

export function callbackSymbolIds(input: PublicRenderModuleInput): ReadonlyMap<string, string> {
	return new Map([
		...input.symbolResolver.symbols.flatMap((symbol) =>
			symbol.kind === 'callback-prop'
				? [[`${symbol.componentEdgeId}:${symbol.propName}`, symbol.id] as const]
				: [],
		),
		...(input.captureAnalysis.boundResolverRows ?? []).flatMap((row) =>
			row.componentEdgePath.flatMap((edgeId) => {
				const childSymbolId = row.loaderSymbolId
					? input.captureAnalysis.extractedSymbols.find(
							(symbol) => symbol.loaderSymbolId === row.loaderSymbolId,
						)?.symbolId
					: row.baseSymbolId;
				return childSymbolId ? [[`bound:${edgeId}:${childSymbolId}`, row.id] as const] : [];
			}),
		),
	]);
}

export function moduleScopeLines(source: string, filename: string): string[] {
	return moduleScopeDeclarations(source, filename).map((declaration) => declaration.source);
}

export function moduleScopeDeclarations(
	source: string,
	filename: string,
): ReadonlyArray<{ readonly names: ReadonlyArray<string>; readonly source: string }> {
	const ast = parseModule(source, filename) as unknown as AnyNode;
	const storageImports = storageImportNames(ast);
	return asNodes(ast.body).flatMap((statement) => {
		if (statement.type === 'ImportDeclaration' || getComponentFunction(statement)) return [];
		const declaration =
			statement.type === 'ExportNamedDeclaration'
				? (statement.declaration as AnyNode | undefined)
				: statement;
		if (!declaration) return [];
		if (
			declaration.type !== 'VariableDeclaration' &&
			declaration.type !== 'FunctionDeclaration' &&
			declaration.type !== 'ClassDeclaration'
		)
			return [];
		const sourceText = lowerModuleStorageDeclaration(declaration, source, storageImports);
		return sourceText ? [{ names: declaredNames(declaration), source: sourceText }] : [];
	});
}

function declaredNames(declaration: AnyNode): ReadonlyArray<string> {
	if (declaration.type === 'VariableDeclaration') {
		return asNodes(declaration.declarations).flatMap((declarator) => {
			const name = getIdentifierName(declarator.id as AnyNode | undefined);
			return name ? [name] : [];
		});
	}
	const name = getIdentifierName(declaration.id as AnyNode | undefined);
	return name ? [name] : [];
}

function storageImportNames(ast: AnyNode): ReadonlySet<string> {
	const names = new Set<string>();
	for (const statement of asNodes(ast.body)) {
		if (statement.type !== 'ImportDeclaration') continue;
		const importSource = (statement.source as AnyNode | undefined)?.value;
		if (importSource !== '@markless/core') continue;
		for (const specifier of asNodes(statement.specifiers)) {
			if (specifier.type !== 'ImportSpecifier') continue;
			if (getIdentifierName(specifier.imported as AnyNode | undefined) !== 'storage')
				continue;
			const localName = getIdentifierName(specifier.local as AnyNode | undefined);
			if (localName) names.add(localName);
		}
	}
	return names;
}

function lowerModuleStorageDeclaration(
	declaration: AnyNode,
	source: string,
	storageImports: ReadonlySet<string>,
): string {
	const declarationSource = expressionSource(declaration, source);
	if (
		declaration.type !== 'VariableDeclaration' ||
		(declaration.kind !== 'const' && declaration.kind !== 'let')
	) {
		return declarationSource;
	}
	if (typeof declaration.start !== 'number') return declarationSource;

	const replacements = asNodes(declaration.declarations).flatMap((declarator) => {
		const init = declarator.init as AnyNode | undefined;
		if (init?.type !== 'CallExpression') return [];
		const callName = getIdentifierName(init.callee as AnyNode | undefined);
		if (!callName || !storageImports.has(callName)) return [];
		// storage(fallback) — derived key, single arg is the fallback.
		// storage(key, fallback) — explicit verbatim key, second arg is the fallback.
		const args = asNodes(init.arguments);
		const explicit = args.length >= 2;
		const key = explicit ? args[0] : undefined;
		const fallback = explicit ? args[1] : args[0];
		if (
			(explicit && (key?.type !== 'Literal' || typeof key.value !== 'string')) ||
			fallback?.type !== 'Literal' ||
			typeof fallback.value !== 'string' ||
			typeof init.start !== 'number' ||
			typeof init.end !== 'number'
		) {
			return [];
		}
		return [
			{
				start: init.start - declaration.start!,
				end: init.end - declaration.start!,
				value: expressionSource(fallback, source),
			},
		];
	});

	return replacements
		.sort((left, right) => right.start - left.start)
		.reduce(
			(text, replacement) =>
				`${text.slice(0, replacement.start)}${replacement.value}${text.slice(replacement.end)}`,
			declarationSource,
		);
}

export function destructureProps(
	propNames: ReadonlyArray<string>,
	component?: AnyNode,
): string | null {
	if (propNames.length === 0) return null;
	const param = component ? asNodes(component.params)[0] : undefined;
	if (param?.type !== 'ObjectPattern') {
		return `	const { ${propNames.join(', ')} } = props ?? {};`;
	}

	const bindings = asNodes(param.properties).flatMap((property) => {
		const key = property.key as AnyNode | undefined;
		const value = property.value as AnyNode | undefined;
		const fallback = getIdentifierName(value) ?? getIdentifierName(key);
		if (!fallback) return [];
		if (
			property.type === 'Property' &&
			!property.computed &&
			key?.type === 'Identifier' &&
			value?.type === 'Identifier'
		) {
			const authoredName = getIdentifierName(key);
			const localName = getIdentifierName(value);
			if (authoredName && localName && authoredName !== localName) {
				return [`${authoredName}: ${localName}`];
			}
		}
		return [fallback];
	});
	return `	const { ${bindings.join(', ')} } = props ?? {};`;
}

// Page props live in the runtime graph under one cell: `prop:props` for a
// destructured parameter, `prop:<name>` for a whole-object parameter. Lazy
// symbol modules (async computed runners, event handlers) read captured props
// through that cell, so CSR mounts must seed it from the render props — during
// server render the runners run inline with props in closure scope instead.
export function componentPropCellId(component: AnyNode): string | null {
	const param = asNodes(component.params)[0];
	if (!param) return null;
	if (param.type === 'Identifier') {
		const name = getIdentifierName(param);
		return name ? `prop:${name}` : null;
	}
	return param.type === 'ObjectPattern' ? 'prop:props' : null;
}

export function hasPropDependentComputed(input: PublicRenderModuleInput): boolean {
	return input.protocolState.computed.some((computed) =>
		computed.dependencies?.some((dependency) => dependency.graphNodeId.startsWith('prop:')),
	);
}

export function composedGraphProps(input: PublicRenderModuleInput) {
	return input.semanticGraph.componentEdges.flatMap((edge) =>
		componentEdgeWithCaptureRouteHandoff(input, edge).props.flatMap((prop) =>
			prop.kind === 'graph-reference'
				? [{ name: prop.name, graphNodeId: prop.graphNodeId, path: prop.path }]
				: [],
		),
	);
}

export function staticHostLocators(input: PublicRenderModuleInput) {
	const rootChunkId = input.renderData.root?.templateId;
	const rootChunk = input.renderData.chunks.find((chunk) => chunk.id === rootChunkId);
	return (rootChunk?.hosts ?? []).map((host) => ({
		hostNodeId: host.hostNodeId,
		tagName: host.tagName,
		hostPath: host.coordinate.path[0] === 0
			? host.coordinate.path.slice(1)
			: host.coordinate.path,
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

export function hasComponentImportSource(
	reference: ComponentReference,
): reference is ComponentReference & { readonly importSource: string } {
	return !!reference.importSource;
}

export function emitComponentImport(
	imported: ComponentReference & { readonly importSource: string },
): string {
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
	return input.semanticGraph.componentEdges
		.filter((edge) => edge.parentComponentName === componentName)
		.map((edge) => componentEdgeWithCaptureRouteHandoff(input, edge));
}

// Capture analysis resolves a child prop through its concrete component edge.
// Hand that route back to public rendering when the legacy semantic edge still
// points at the child's whole-props cell, so CSR and SSR compose the instance
// against the parent's live graph node.
function componentEdgeWithCaptureRouteHandoff(
	input: PublicRenderModuleInput,
	edge: ComponentEdge,
): ComponentEdge {
	return {
		...edge,
		props: edge.props.map((prop) => {
			if (prop.kind !== 'graph-reference') return prop;
			for (const symbol of input.captureAnalysis.extractedSymbols) {
				for (const slot of symbol.captureSlots) {
					if (
						slot.owner.componentName !== edge.childComponentName ||
						slot.propName !== prop.name
					)
						continue;
					const route = slot.routes.find(
						(candidate) =>
							candidate.kind === 'graph-reference' &&
							candidate.componentEdgeId === edge.id,
					);
					if (!route || route.kind !== 'graph-reference') continue;
					const pathLength = Math.max(0, route.path.length - slot.path.length);
					return {
						...prop,
						graphNodeId: route.graphNodeId,
						path: route.path.slice(0, pathLength),
					};
				}
			}
			return prop;
		}),
	};
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

export function componentPropNames(component: AnyNode | undefined): string[] {
	const param = asNodes(component?.params)[0];
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
