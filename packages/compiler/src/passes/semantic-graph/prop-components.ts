import type {
	ModuleGraphInterfaceArtifact,
	SemanticComponentEdge,
	SemanticGraphArtifact,
	SemanticPropComponent,
} from '../../artifacts.ts';
import type { AnyNode } from '../../ast/nodes.ts';
import { importedEdgeComponent } from '../link/component-target.ts';
import { sourceBindingId } from './collect-aliases.ts';
import { resolveImportedChildComponent } from './collect-components.ts';
import { resolvedSymbolAt } from './collect-expressions.ts';
import type { WalkState } from './types.ts';

type ImportedInterfaces = Readonly<Record<string, ModuleGraphInterfaceArtifact>> | undefined;
type PropGraph = Pick<SemanticGraphArtifact, 'componentEdges'>;

/** The prop of the component being walked that a tag's name resolves to. */
export function renderedPropPath(
	tag: AnyNode | undefined,
	state: WalkState,
): ReadonlyArray<string> | undefined {
	if (tag?.type !== 'JSXIdentifier' && tag?.type !== 'Identifier') return undefined;
	const declaration = resolvedDeclaration(tag, state);
	if (!declaration) return undefined;
	const bindingId = sourceBindingId(declaration);
	return state.graph.componentPropBindings.find(
		(binding) =>
			binding.componentName === state.currentComponentName && binding.bindingId === bindingId,
	)?.propPath;
}

/** The component a prop value names when it is a bare module-scope binding: an import, or a declaration of this module. */
export function propValueComponent(
	expression: AnyNode | undefined,
	state: WalkState,
): SemanticPropComponent | undefined {
	if (expression?.type !== 'Identifier' || typeof expression.name !== 'string') return undefined;
	if (typeof expression.start !== 'number') return undefined;
	const semantic = state.semantic();
	const symbolId = resolvedSymbolAt(semantic, expression.start);
	if (symbolId === null || semantic.bindings[symbolId]!.scope.kind !== 'module') return undefined;
	const link = resolveImportedChildComponent(expression.name, state);
	return { childComponentName: link.childComponentName, ...link.importSource };
}

function resolvedDeclaration(
	identifier: AnyNode,
	state: WalkState,
): { readonly start: number; readonly end: number } | undefined {
	if (typeof identifier.start !== 'number') return undefined;
	const semantic = state.semantic();
	const symbolId = resolvedSymbolAt(semantic, identifier.start);
	if (symbolId === null) return undefined;
	const [declaration] = semantic.bindings[symbolId]!.declarations;
	return declaration && typeof declaration.start === 'number' && typeof declaration.end === 'number'
		? { start: declaration.start, end: declaration.end }
		: undefined;
}

/** Props each component renders as a component: through its own tag, or by handing them to a child that renders them. */
export function componentsRenderedProps(
	graph: PropGraph,
	importedModuleInterfaces: ImportedInterfaces,
): ReadonlyMap<string, ReadonlySet<string>> {
	const rendered = new Map<string, Set<string>>();
	const add = (componentName: string, propName: string): boolean => {
		const props = rendered.get(componentName) ?? new Set<string>();
		rendered.set(componentName, props);
		if (props.has(propName)) return false;
		props.add(propName);
		return true;
	};
	for (const edge of graph.componentEdges)
		if (edge.renderedProp?.[0] !== undefined) add(edge.parentComponentName, edge.renderedProp[0]);
	for (let grew = true; grew; ) {
		grew = false;
		for (const edge of graph.componentEdges) {
			const childRenders = edgeChildRenderedProps(edge, rendered, importedModuleInterfaces);
			for (const prop of edge.props) {
				if (prop.kind !== 'graph-reference' || prop.graphBindingKind !== 'prop') continue;
				const handed = prop.graphNodeId === 'prop:props' ? prop.path[0] : undefined;
				if (handed !== undefined && childRenders.has(prop.name) && add(edge.parentComponentName, handed))
					grew = true;
			}
		}
	}
	return rendered;
}

/** The components an edge's props hand to a child that renders them. */
export function propComponentTargets(
	edge: SemanticComponentEdge,
	rendered: ReadonlyMap<string, ReadonlySet<string>>,
	importedModuleInterfaces: ImportedInterfaces,
): ReadonlyArray<SemanticPropComponent> {
	const childRenders = edgeChildRenderedProps(edge, rendered, importedModuleInterfaces);
	return edge.props.flatMap((prop) =>
		prop.kind === 'opaque' && prop.component && childRenders.has(prop.name) ? [prop.component] : [],
	);
}

function edgeChildRenderedProps(
	edge: SemanticComponentEdge,
	rendered: ReadonlyMap<string, ReadonlySet<string>>,
	importedModuleInterfaces: ImportedInterfaces,
): ReadonlySet<string> {
	if (!edge.importSource) return rendered.get(edge.childComponentName) ?? new Set();
	return new Set(
		importedEdgeComponent(edge, importedModuleInterfaces?.[edge.importSource])?.renderedProps ?? [],
	);
}
