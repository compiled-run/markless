import { parseModule } from '../../js-ast.ts';
import { createSourceMemo, ownedModuleAst } from '../semantic-graph/shared-ast.ts';
import { deserializeGraphValue, type SerializedGraphPayload } from '@markless/serializer';
import type { PublicRenderModuleInput, SemanticModuleImport } from '../../artifacts.ts';
import { asNodes, childNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource } from '../../ast/source.ts';
import {
	getComponentFunction,
	getDynamicTagExpression,
	getElementTagName,
	isHostTagName,
	isMemberTagName,
	memberTagPropertyPath,
	memberTagRootName,
} from '../../ast/tsrx.ts';
import type { ComponentEdge } from './types.ts';
import { widgetRootComponents } from './shared-seed-pass.ts';

export { componentEdgeInstanceSegment } from '../../component-edge-instance.ts';

/**
 * The prop a component edge hands its child the ids of the symbols its callback
 * props were compiled into. `marklessSsrCallbackSymbol` in `@markless/web` reads
 * it back; every emitter that writes or reads it spells it from here.
 */
export const SSR_CALLBACKS_PROP_NAME = '__marklessSsrCallbacks';

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

export type ModuleScopeDeclaration = {
	readonly names: ReadonlyArray<string>;
	readonly source: string;
};

// Asked once per emitted symbol module and once per residue read, all from the
// same source text; the answer is plain strings, so it is memoized whole.
const moduleScopeDeclarationsMemo = createSourceMemo<ReadonlyArray<ModuleScopeDeclaration>>();

export function moduleScopeDeclarations(
	source: string,
	filename: string,
): ReadonlyArray<ModuleScopeDeclaration> {
	return moduleScopeDeclarationsMemo(filename, source, () =>
		collectModuleScopeDeclarations(source, filename),
	);
}

function collectModuleScopeDeclarations(
	source: string,
	filename: string,
): ReadonlyArray<ModuleScopeDeclaration> {
	const ast = parseModule(source, filename) as unknown as AnyNode;
	const storageImports = frameworkApiImportNames(ast, 'storage');
	const sharedImports = frameworkApiImportNames(ast, 'shared');
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
		// A shared() definition is graph data, not module code: its factory ships
		// as payload nodes, so the authored call never reaches emitted source.
		if (isSharedDefinitionDeclaration(declaration, sharedImports)) return [];
		const sourceText = lowerModuleStorageDeclaration(declaration, source, storageImports);
		return sourceText ? [{ names: declaredNames(declaration), source: sourceText }] : [];
	});
}

/**
 * Module-level exported functions whose body resolves a shared() definition this
 * file declares.
 *
 * `moduleScopeDeclarations` carries such a function into the emitted symbol
 * modules with its `export` keyword removed, which is right for an ordinary
 * helper and wrong here twice over. The export is what a consumer imports, and
 * dropping it silently changes what this module publishes; and the copy that
 * does survive could not run anyway, because the shared() declaration it calls
 * is excluded from the carry (its factory ships as payload nodes, not as code)
 * and the runtime resolves only graph-kind properties. So the carried function
 * names a resolver that is not there.
 *
 * Reported rather than repaired: which of the two the author meant — a part the
 * family publishes, or a plain helper that takes the instance as an argument —
 * is not something this seam can decide.
 */
export type ExportedSharedResolvingFunction = {
	readonly name: string;
	readonly definitionName: string;
};

const exportedSharedResolvingFunctionsMemo =
	createSourceMemo<ReadonlyArray<ExportedSharedResolvingFunction>>();

export function exportedSharedResolvingFunctions(
	source: string,
	filename: string,
): ReadonlyArray<ExportedSharedResolvingFunction> {
	return exportedSharedResolvingFunctionsMemo(filename, source, () =>
		collectExportedSharedResolvingFunctions(source, filename),
	);
}

function collectExportedSharedResolvingFunctions(
	source: string,
	filename: string,
): ReadonlyArray<ExportedSharedResolvingFunction> {
	const ast = parseModule(source, filename) as unknown as AnyNode;
	const sharedImports = frameworkApiImportNames(ast, 'shared');
	if (sharedImports.size === 0) return [];

	const definitionNames = new Set<string>();
	for (const statement of asNodes(ast.body)) {
		const declaration =
			statement.type === 'ExportNamedDeclaration'
				? (statement.declaration as AnyNode | undefined)
				: statement;
		if (!declaration) continue;
		if (isSharedDefinitionDeclaration(declaration, sharedImports)) {
			for (const name of declaredNames(declaration)) definitionNames.add(name);
		}
	}
	if (definitionNames.size === 0) return [];

	return asNodes(ast.body).flatMap((statement) => {
		// A component is not a plain function: its body is where resolving a
		// shared() definition is the supported, working shape.
		if (statement.type !== 'ExportNamedDeclaration' || getComponentFunction(statement)) return [];
		const declaration = statement.declaration as AnyNode | undefined;
		if (!declaration) return [];
		const bodies = functionBodiesOf(declaration);
		if (bodies.length === 0) return [];

		const names = declaredNames(declaration);
		return bodies.flatMap((body) => {
			const definitionName = resolvedSharedDefinitionName(body, definitionNames);
			return definitionName && names[0] ? [{ name: names[0], definitionName }] : [];
		});
	});
}

/** The function bodies an exported declaration introduces, if it introduces any. */
function functionBodiesOf(declaration: AnyNode): ReadonlyArray<AnyNode> {
	if (declaration.type === 'FunctionDeclaration') {
		const body = declaration.body as AnyNode | undefined;
		return body ? [body] : [];
	}
	if (declaration.type !== 'VariableDeclaration') return [];
	return asNodes(declaration.declarations).flatMap((declarator) => {
		const init = declarator.init as AnyNode | undefined;
		if (init?.type !== 'ArrowFunctionExpression' && init?.type !== 'FunctionExpression') return [];
		const body = init.body as AnyNode | undefined;
		return body ? [body] : [];
	});
}

/** The first shared() definition this body calls to resolve an instance. */
function resolvedSharedDefinitionName(
	body: AnyNode,
	definitionNames: ReadonlySet<string>,
): string | null {
	let found: string | null = null;
	const visit = (node: AnyNode | null | undefined): void => {
		if (found || !node || typeof node !== 'object') return;
		if (node.type === 'CallExpression') {
			const callName = getIdentifierName(node.callee as AnyNode | undefined);
			if (callName && definitionNames.has(callName)) {
				found = callName;
				return;
			}
		}
		for (const child of childNodes(node)) visit(child);
	};
	visit(body);
	return found;
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

function frameworkApiImportNames(ast: AnyNode, apiName: string): ReadonlySet<string> {
	const names = new Set<string>();
	for (const statement of asNodes(ast.body)) {
		if (statement.type !== 'ImportDeclaration') continue;
		const importSource = (statement.source as AnyNode | undefined)?.value;
		if (importSource !== '@markless/core') continue;
		for (const specifier of asNodes(statement.specifiers)) {
			if (specifier.type !== 'ImportSpecifier') continue;
			if (getIdentifierName(specifier.imported as AnyNode | undefined) !== apiName) continue;
			const localName = getIdentifierName(specifier.local as AnyNode | undefined);
			if (localName) names.add(localName);
		}
	}
	return names;
}

function isSharedDefinitionDeclaration(
	declaration: AnyNode,
	sharedImports: ReadonlySet<string>,
): boolean {
	if (declaration.type !== 'VariableDeclaration' || sharedImports.size === 0) return false;
	const declarators = asNodes(declaration.declarations);
	if (declarators.length === 0) return false;
	return declarators.every((declarator) => {
		const init = declarator.init as AnyNode | undefined;
		if (init?.type !== 'CallExpression') return false;
		const callName = getIdentifierName(init.callee as AnyNode | undefined);
		return !!callName && sharedImports.has(callName);
	});
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
	component: AnyNode | undefined,
	source: string,
): string | null {
	if (propNames.length === 0) return null;
	const param = component ? asNodes(component.params)[0] : undefined;
	if (param?.type !== 'ObjectPattern') {
		return `	const { ${propNames.join(', ')} } = props ?? {};`;
	}

	const bindings = asNodes(param.properties).flatMap((property) => {
		if (property.type === 'RestElement') {
			const restName = getIdentifierName(property.argument as AnyNode | undefined);
			return restName ? [`...${restName}`] : [];
		}
		const key = property.key as AnyNode | undefined;
		const value = property.value as AnyNode | undefined;
		// The authored default is re-emitted here, so the body local means what
		// JavaScript says it means for an omitted or explicitly undefined prop.
		const pattern = value?.type === 'AssignmentPattern' ? value : undefined;
		const local = pattern ? (pattern.left as AnyNode | undefined) : value;
		const fallback = getIdentifierName(local) ?? getIdentifierName(key);
		if (!fallback) return [];
		const defaultSource = pattern?.right
			? ` = ${expressionSource(pattern.right as AnyNode, source)}`
			: '';
		if (
			property.type === 'Property' &&
			!property.computed &&
			key?.type === 'Identifier' &&
			local?.type === 'Identifier'
		) {
			const authoredName = getIdentifierName(key);
			const localName = getIdentifierName(local);
			if (authoredName && localName && authoredName !== localName) {
				return [`${authoredName}: ${localName}${defaultSource}`];
			}
		}
		return [`${fallback}${defaultSource}`];
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

// The prop cells a browser flip reads to rebuild this component's arms — an arm
// showing projected `children` is the common one. `keys` names the properties
// the bag cell must hold; `null` marks a cell that IS one destructured prop.
export function armRebuildPropCells(
	input: PublicRenderModuleInput,
	component: AnyNode | undefined,
	componentName: string,
): ReadonlyArray<{ readonly graphNodeId: string; readonly keys: ReadonlyArray<string> | null }> {
	const bagCellId = component ? componentPropCellId(component) : null;
	const keysByCell = new Map<string, Set<string> | null>();
	for (const chunk of input.renderData.chunks) {
		if (chunk.componentName !== componentName) continue;
		if (chunk.kind !== 'branch-arm' && chunk.kind !== 'async-arm') continue;
		for (const slot of chunk.slots) {
			if (slot.kind !== 'text' || slot.residue.kind !== 'graph-read') continue;
			const { graphNodeId, path } = slot.residue;
			if (!graphNodeId.startsWith('prop:')) continue;
			if (graphNodeId === 'prop:props' || graphNodeId === bagCellId) {
				const keys = keysByCell.get(graphNodeId) ?? new Set<string>();
				if (path[0]) keys.add(path[0]);
				keysByCell.set(graphNodeId, keys);
			} else keysByCell.set(graphNodeId, null);
		}
	}
	return [...keysByCell].flatMap(([graphNodeId, keys]) =>
		keys && keys.size === 0 ? [] : [{ graphNodeId, keys: keys ? [...keys] : null }],
	);
}

// The composed state a server-rendered component returns, plus the prop cells
// its own arm flips read back.
export function ssrComposeStateExpression(
	input: PublicRenderModuleInput,
	component: AnyNode | undefined,
	componentName: string,
): string {
	const composed = 'marklessSsrComposeState(marklessSsrPayloadState, marklessSsrChildren)';
	const cells = armRebuildPropCells(input, component, componentName);
	return cells.length === 0
		? composed
		: `marklessSsrSeedPropCells(${composed}, props, ${JSON.stringify(cells)})`;
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
		hostPath:
			host.coordinate.path[0] === 0 ? host.coordinate.path.slice(1) : host.coordinate.path,
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

// Where a member tag's part sits relative to the module SURFACE (a compiled
// .tsrx module's default export). A namespace or default import already names
// that surface, so only the authored dots remain; a named import spends its
// first segment on the imported name.
function memberTagSurfacePath(
	componentName: string,
	importKind: string | undefined,
	importedName: string | undefined,
): ReadonlyArray<string> {
	const property = memberTagPropertyPath(componentName);
	return importKind === 'named'
		? [importedName ?? memberTagRootName(componentName), ...property]
		: property;
}

export function emitComponentImport(
	imported: ComponentReference & { readonly importSource: string },
): string {
	const source = JSON.stringify(imported.importSource);
	if (isMemberTagName(imported.componentName)) {
		// A compiled .tsrx module publishes no ES named exports: its components
		// hang off the default export, so reading the authored path off a
		// namespace or named binding resolves to nothing (MISSING_EXPORT for the
		// named shape). Import the surface and let the edge's declared part name
		// take the last segment through the same lookup the linked case uses.
		if (isTsrxComponentImport(imported.importSource)) {
			const enclosing = memberTagSurfacePath(
				imported.componentName,
				imported.importKind,
				imported.importedName,
			).slice(0, -1);
			if (enclosing.length === 0) return `import ${imported.localName} from ${source};`;
			const holder = `${imported.localName}Holder`;
			return `import ${holder} from ${source};\nconst ${imported.localName} = ${holder}.${enclosing.join('.')};`;
		}
		// A plain module really does publish the object the tag reads off.
		const holder = `${imported.localName}Holder`;
		const property = memberTagPropertyPath(imported.componentName).join('.');
		const binding =
			imported.importKind === 'namespace'
				? `import * as ${holder} from ${source};`
				: imported.importKind === 'named'
					? `import { ${imported.importedName ?? memberTagRootName(imported.componentName)} as ${holder} } from ${source};`
					: `import ${holder} from ${source};`;
		return `${binding}\nconst ${imported.localName} = ${holder}.${property};`;
	}
	if (imported.importKind === 'named' && !isTsrxComponentImport(imported.importSource)) {
		return `import { ${imported.importedName ?? imported.componentName} as ${imported.localName} } from ${source};`;
	}
	return `import ${imported.localName} from ${source};`;
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

export function isTsrxComponentImport(importSource: string): boolean {
	return /\.tsrx(?:[?#].*)?$/.test(importSource);
}

// WHICH component of an imported .tsrx module's surface composes at this edge.
// A named import says it outright. A namespace member tag (<parts.Card />) asks
// the same question with different spelling, and the linker already answered it
// by resolving the dotted tag to a concrete component — without this the edge
// falls back to the module's root, so <parts.Badge /> silently renders <Card />.
// A tag still spelled dotted was never linked, so nothing resolved it for us -
// but the surface it composes is still a compiled .tsrx module, whose parts live
// on the default export's component map rather than on ES named exports. Naming
// its last segment here is what turns the deferred tag into the same lookup the
// linked case makes; the import binding takes only the segments enclosing it.
// Undefined means "this module's own root", which is what a default import composes.
export function edgeDeclaredComponentName(edge: {
	readonly childComponentName: string;
	readonly importKind?: string;
	readonly importSource?: string;
	readonly importedName?: string;
}): string | undefined {
	if (!edge.importSource || !isTsrxComponentImport(edge.importSource)) return undefined;
	if (isMemberTagName(edge.childComponentName))
		return (
			memberTagSurfacePath(
				edge.childComponentName,
				edge.importKind,
				edge.importedName,
			).at(-1) ?? undefined
		);
	if (edge.importKind !== 'named' && edge.importKind !== 'namespace') return undefined;
	return edge.importedName ?? edge.childComponentName;
}

export function publicRenderValueImports(
	moduleImports: ReadonlyArray<SemanticModuleImport>,
	componentEdges: PublicRenderModuleInput['semanticGraph']['componentEdges'],
	// Surviving module scope may still name a component import (a parts object).
	moduleScopeSource = '',
): ReadonlyArray<SemanticModuleImport> {
	const componentLocalNames = new Set(componentEdges.map((edge) => edge.childComponentName));
	return moduleImports.filter(
		(moduleImport) =>
			!componentLocalNames.has(moduleImport.localName) ||
			referencesIdentifier(moduleScopeSource, moduleImport.localName),
	);
}

export function referencesIdentifier(text: string, name: string): boolean {
	if (!/^[A-Za-z_$][\w$]*$/.test(name)) return false;
	return new RegExp(`(^|[^\\w$.])${name}([^\\w$]|$)`).test(text);
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

export function stateEntries(
	input: PublicRenderModuleInput,
	cellIndexes?: ReadonlyArray<number>,
): string[] {
	return input.protocolState.cells.flatMap((cell, index) => {
		if (cell.value === undefined) return [];
		if (cellIndexes && !cellIndexes.includes(index)) return [];
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
		// A rest binding names the remaining props, so it is a render-scope name too.
		const name =
			property.type === 'RestElement'
				? getIdentifierName(property.argument as AnyNode | undefined)
				: (getIdentifierName(value) ?? getIdentifierName(key));
		return name ? [name] : [];
	});
}

export function isFragmentNode(node: AnyNode | undefined): boolean {
	return node?.type === 'Fragment' || node?.type === 'JSXFragment';
}

// A shared() graph and a persisted storage slot are page-space by design: they
// belong to the page, never to one composed component instance.
function isPageSpaceGraphNodeId(graphNodeId: string): boolean {
	return graphNodeId.startsWith('shared:') || graphNodeId.startsWith('storage:');
}

/**
 * The collection every `@for` in a set of chunks reads.
 *
 * A repeat slot carries no residue - it names the repeat, and the repeat record
 * names the node - so a component whose only read of a cell is through a `@for`
 * collection is invisible to the slot walk above. It seeds nothing, and the
 * collection derives from an undefined cell on the served page.
 */
export function repeatCollectionGraphNodeIds(
	chunks: PublicRenderModuleInput['renderData']['chunks'],
	repeats: PublicRenderModuleInput['renderData']['repeats'],
): ReadonlyArray<string> {
	return chunks.flatMap((chunk) =>
		chunk.slots.flatMap((slot) => {
			if (slot.kind !== 'repeat') return [];
			const collection = repeats.find(
				(candidate) => candidate.repeatId === slot.repeatId,
			)?.collectionGraphNodeId;
			return collection ? [collection] : [];
		}),
	);
}

function chunkGraphNodeIds(
	chunks: PublicRenderModuleInput['renderData']['chunks'],
): ReadonlyArray<string> {
	return chunks.flatMap((chunk) =>
		chunk.slots.flatMap((slot) => {
			const residueIds =
				'residue' in slot && slot.residue.kind === 'graph-read'
					? [slot.residue.graphNodeId]
					: [];
			return slot.kind === 'dynamic-host'
				? [
						...residueIds,
						...slot.attributeSlots.flatMap((attribute) =>
							attribute.residue.kind === 'graph-read'
								? [attribute.residue.graphNodeId]
								: [],
						),
					]
				: residueIds;
		}),
	);
}

// The initial values one component seeds its render from. An id only one
// binding spells stays available to every component of the module; an id two
// same-module components both spell resolves positionally, so each component
// seeds the initial value it actually declared.
export function componentOwnedInitialValues(
	input: PublicRenderModuleInput,
	componentName: string,
	rootComponentName: string,
): PublicRenderModuleInput['renderData']['initialValues'] {
	const declaringOwners = new Map<string, string[]>();
	for (const binding of input.semanticGraph.graphBindings) {
		if (!binding.componentName) continue;
		const owners = declaringOwners.get(binding.id);
		if (owners) owners.push(binding.componentName);
		else declaringOwners.set(binding.id, [binding.componentName]);
	}
	const spellings = new Map<string, number>();
	for (const initial of input.renderData.initialValues) {
		spellings.set(initial.graphNodeId, (spellings.get(initial.graphNodeId) ?? 0) + 1);
	}
	const position = new Map<string, number>();
	return input.renderData.initialValues.filter((initial) => {
		const index = position.get(initial.graphNodeId) ?? 0;
		position.set(initial.graphNodeId, index + 1);
		if ((spellings.get(initial.graphNodeId) ?? 0) < 2) return true;
		const owners = declaringOwners.get(initial.graphNodeId);
		return (owners?.[index] ?? rootComponentName) === componentName;
	});
}

// Every payload node one component declares: its own state()/computed()
// bindings, the props cell it destructures, and the template expressions its
// own chunks read. The page root additionally keeps page-space nodes and any
// node no same-module component claimed, so nothing is dropped. Positions, not
// ids: two components of one module may each declare the same state name.
export function componentOwnedStateNodes(
	input: PublicRenderModuleInput,
	componentName: string,
	rootComponentName: string,
): {
	readonly cellIndexes: ReadonlyArray<number>;
	readonly computedIndexes: ReadonlyArray<number>;
	readonly seedCellIndexes: ReadonlyArray<number>;
} {
	const owner = payloadNodeOwners(input, rootComponentName);
	const cellIndexes = input.protocolState.cells.flatMap((_cell, index) =>
		owner.cells[index] === componentName ? [index] : [],
	);
	// A page-space node the component only reads stays owned by the page, but its
	// value must still seed this component's render — including a node it reaches
	// only through a shared computed it derives.
	const ownChunks = input.renderData.chunks.filter(
		(chunk) => chunk.componentName === componentName,
	);
	const readGraphNodeIds = graphReadClosure(
		[
			...chunkGraphNodeIds(ownChunks),
			...repeatCollectionGraphNodeIds(ownChunks, input.renderData.repeats),
		],
		input.semanticGraph,
	);
	return {
		cellIndexes,
		computedIndexes: input.protocolState.computed.flatMap((_computed, index) =>
			owner.computed[index] === componentName ? [index] : [],
		),
		seedCellIndexes: input.protocolState.cells.flatMap((cell, index) =>
			cellIndexes.includes(index) ||
			(isPageSpaceGraphNodeId(cell.graphNodeId) && readGraphNodeIds.has(cell.graphNodeId))
				? [index]
				: [],
		),
	};
}

// Every graph node a set of reads reaches, following each computed to what it
// derives from. A component that renders a computed must seed the cells that
// computed reads, even when its own markup never names them.
function graphReadClosure(
	graphNodeIds: ReadonlyArray<string>,
	semanticGraph: PublicRenderModuleInput['semanticGraph'],
): ReadonlySet<string> {
	const reached = new Set<string>();
	const queue = [...graphNodeIds];
	while (queue.length > 0) {
		const graphNodeId = queue.pop();
		if (graphNodeId === undefined || reached.has(graphNodeId)) continue;
		reached.add(graphNodeId);
		const binding = semanticGraph.graphBindings.find((candidate) => candidate.id === graphNodeId);
		for (const dependency of binding?.dependencies ?? []) queue.push(dependency.graphNodeId);
	}
	return reached;
}

// The declaring component of every payload node, aligned with the payload's own
// cell and computed order. A duplicated id is resolved positionally: the Nth
// binding spelling that id owns the Nth node spelling it.
type PayloadNodeOwners = {
	readonly cells: ReadonlyArray<string>;
	readonly computed: ReadonlyArray<string>;
};

// `componentOwnedStateNodes` asks this once per component from three emit sites,
// and the answer does not depend on which component asked. Held against the
// input so it cannot outlive the compile it describes.
const payloadNodeOwnersByInput = new WeakMap<
	PublicRenderModuleInput,
	Map<string, PayloadNodeOwners>
>();

function payloadNodeOwners(
	input: PublicRenderModuleInput,
	rootComponentName: string,
): PayloadNodeOwners {
	let byRoot = payloadNodeOwnersByInput.get(input);
	if (!byRoot) {
		byRoot = new Map<string, PayloadNodeOwners>();
		payloadNodeOwnersByInput.set(input, byRoot);
	}
	const memoized = byRoot.get(rootComponentName);
	if (memoized) return memoized;
	const owners = resolvePayloadNodeOwners(input, rootComponentName);
	byRoot.set(rootComponentName, owners);
	return owners;
}

function resolvePayloadNodeOwners(
	input: PublicRenderModuleInput,
	rootComponentName: string,
): PayloadNodeOwners {
	const ast = ownedModuleAst(input, input.source.source, input.source.filename);
	const componentMap = sameModuleComponentMap(ast);
	const chunkOwner = new Map<string, string>();
	for (const component of input.semanticGraph.components) {
		const propCell = componentMap.get(component.name);
		const propCellId = propCell ? componentPropCellId(propCell) : null;
		if (propCellId && !chunkOwner.has(propCellId)) chunkOwner.set(propCellId, component.name);
		for (const graphNodeId of chunkGraphNodeIds(
			input.renderData.chunks.filter((chunk) => chunk.componentName === component.name),
		)) {
			if (!chunkOwner.has(graphNodeId)) chunkOwner.set(graphNodeId, component.name);
		}
	}
	// Rebuilt per pass: the cells and the computed each resolve duplicate ids from
	// a full queue, so a cell spelling an id a computed also spells cannot drain
	// the declarations the computed pass still needs.
	const declaringComponents = (): Map<string, string[]> => {
		const pending = new Map<string, string[]>();
		for (const binding of input.semanticGraph.graphBindings) {
			if (!binding.componentName) continue;
			const queue = pending.get(binding.id);
			if (queue) queue.push(binding.componentName);
			else pending.set(binding.id, [binding.componentName]);
		}
		return pending;
	};
	// A branch-condition computed is read by the branch record, not by any chunk
	// slot, so chunk ownership cannot see it. The component whose arms the branch
	// decides declares it.
	const branchOwner = new Map<string, string>();
	for (const branch of input.renderData.branches) {
		const graphNodeId = branch.testComputedGraphNodeId;
		if (graphNodeId === undefined || branchOwner.has(graphNodeId)) continue;
		const armChunk = input.renderData.chunks.find((chunk) =>
			branch.armChunkIds.includes(chunk.id),
		);
		if (armChunk) branchOwner.set(graphNodeId, armChunk.componentName);
	}
	// A widget-scoped shared() graph is one instance per rendered widget, so its
	// nodes belong to the widget root, not the module root: that component's
	// composed instance path is the widget root.
	const widgetOwner = widgetRootComponents(input);
	const resolveOwners = (graphNodeIds: ReadonlyArray<string>): ReadonlyArray<string> => {
		const pending = declaringComponents();
		return graphNodeIds.map((graphNodeId) => {
			if (isPageSpaceGraphNodeId(graphNodeId))
				return (
					widgetOwner.get(graphNodeId.slice(0, graphNodeId.lastIndexOf('/'))) ?? rootComponentName
				);
			const queue = pending.get(graphNodeId);
			const declared = queue && queue.length > 1 ? queue.shift() : queue?.[0];
			return (
				declared ?? chunkOwner.get(graphNodeId) ?? branchOwner.get(graphNodeId) ?? rootComponentName
			);
		});
	};
	return {
		cells: resolveOwners(input.protocolState.cells.map((cell) => cell.graphNodeId)),
		computed: resolveOwners(input.protocolState.computed.map((computed) => computed.graphNodeId)),
	};
}
