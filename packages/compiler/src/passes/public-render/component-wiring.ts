import { isEventAttribute, normalizeEventName } from '@tsrx/core';
import { asNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource } from '../../ast/source.ts';
import {
	getElementAttributes,
	getElementTagName,
	isHostTagName,
	isIgnorableJsxTextNode as isIgnorableTextNode,
	isSpreadAttribute,
	unwrapExpressionContainer,
} from '../../ast/tsrx.ts';
import { emitHtmlChildren } from './html.ts';
import { objectPropertyName } from './shared.ts';
import type { ComponentEdge, CsrRenderContext, SsrRenderContext } from './types.ts';

export function emitSsrComponent(
	node: AnyNode,
	componentName: string,
	context: SsrRenderContext,
): string {
	const localName = context.componentImports.get(componentName);
	if (!localName) return '""';
	const edge = context.componentEdges[context.nextComponentEdgeIndex++];
	const childIndex = context.nextChildIndex++;
	const props = ssrComponentPropsSource(node, context, edge, context.callbackSymbols);
	const placement = {
		hostPrefix: `c${childIndex}:`,
		symbolPrefix: edge?.importSource ? `c${childIndex}:` : '',
		graphProps: componentEdgeGraphRoutes(edge),
		boundSymbols: boundSymbolsForEdge(edge, context.callbackSymbols),
	};

	return `(await marklessSsrRenderChild(marklessSsrChildren, ${localName}, { ${props.join(', ')} }, { hostPrefix: ${JSON.stringify(placement.hostPrefix)}, symbolPrefix: ${JSON.stringify(placement.symbolPrefix)}, localIndex: marklessSsrHostLocators.length, graphProps: ${JSON.stringify(placement.graphProps)}, boundSymbols: ${JSON.stringify(placement.boundSymbols)} }, marklessSsrRenderContext))`;
}

// Component invocation inside a keyed repeat row (SSR): the row mapper
// executes the component per row with the item in scope and splices the html.
// No child composition record exists (rows repeat; composed records cannot),
// so the row-child helper fail-closes on interactive child output. The
// component edge is still consumed to keep later edges document-aligned.
export function emitSsrRowComponent(
	node: AnyNode,
	componentName: string,
	context: SsrRenderContext,
): string {
	const localName = context.componentImports.get(componentName);
	if (!localName) return '""';
	const edge = context.componentEdges[context.nextComponentEdgeIndex++];
	const props = ssrComponentPropsSource(node, context, edge, context.callbackSymbols);
	return `(await marklessSsrRowChild(${localName}, { ${props.join(', ')} }, ${JSON.stringify(componentName)}))`;
}

// CSR mirror of emitSsrRowComponent: renders the child synchronously and
// splices its markup into the row html string.
export function emitCsrRowComponent(
	node: AnyNode,
	componentName: string,
	context: CsrRenderContext,
): string {
	const localName = context.componentImports.get(componentName);
	if (!localName) return '""';
	const edge = context.componentEdges[context.nextComponentEdgeIndex++];
	const props = componentPropsSource(node, context, edge, context.callbackSymbols);
	return `marklessCsrRowChild(${localName}, { ${props.join(', ')} }, ${JSON.stringify(componentName)})`;
}

// Component invocation projected through another component's children prop
// (CSR string emission): placeholder replacement cannot reach projected
// content, so the child renders markup-only via a synchronous splice — SSR
// already composes these children, and silently dropping them lost router
// <Link> anchors on client-side route swaps. Interactive child output refuses
// loudly at render (the projected-child helper fail-closes).
export function emitCsrProjectedComponent(
	node: AnyNode,
	componentName: string,
	context: CsrRenderContext,
): string {
	const localName = context.componentImports.get(componentName);
	if (!localName) return '""';
	const edge = context.componentEdges[context.nextComponentEdgeIndex++];
	const props = componentPropsSource(node, context, edge, context.callbackSymbols);
	return `marklessCsrProjectedChild(${localName}, { ${props.join(', ')} }, ${JSON.stringify(componentName)})`;
}

export function emitCsrComponent(
	node: AnyNode,
	componentName: string,
	context: CsrRenderContext,
): string {
	const localName = context.componentImports.get(componentName);
	if (!localName) return '""';
	// Arm-render modules number children page-aligned (symbol routes key on
	// the component-edge index); the page module keeps its own numbering.
	const index =
		context.nextChildIndex !== undefined
			? context.nextChildIndex++
			: context.childReplacements.length;
	const edge = context.componentEdges[context.nextComponentEdgeIndex++];
	const props = componentPropsSource(node, context, edge, context.callbackSymbols);
	const childName = `marklessCsrChild${index}`;
	context.childReplacements.push(
		`	const ${childName} = marklessCsrRenderChild(${localName}, { ${props.join(', ')} });`,
		node === context.componentRoot
			? `	root = marklessCsrReplaceChild(root, ${index}, ${childName}?.root);`
			: `	marklessCsrReplaceChild(root, ${index}, ${childName}?.root);`,
		`	marklessCsrChildren.push({ hostPrefix: ${JSON.stringify(`c${index}:`)}, symbolPrefix: ${JSON.stringify(edge?.importSource ? `c${index}:` : '')}, output: ${childName}, graphProps: ${JSON.stringify(componentEdgeGraphRoutes(edge))}, boundSymbols: ${JSON.stringify(boundSymbolsForEdge(edge, context.callbackSymbols))} });`,
	);
	return JSON.stringify(`<span data-markless-csr-child="${index}"></span>`);
}

function componentPropsSource(
	node: AnyNode,
	context: CsrRenderContext,
	edge: ComponentEdge | undefined,
	callbackSymbols: ReadonlyMap<string, string>,
): string[] {
	const source = context.source;
	const props = getElementAttributes(node).flatMap((attribute) => {
		const name = getIdentifierName(attribute.name as AnyNode | undefined);
		if (!name) return [];
		const callbackSymbolId = edge ? callbackSymbols.get(`${edge.id}:${name}`) : undefined;
		if (callbackSymbolId) {
			return `${objectPropertyName(name)}: marklessCsrCallback(${JSON.stringify(callbackSymbolId)})`;
		}
		return componentAttributePropSource(attribute, source);
	});
	// Children render in the PARENT's template space: branch sites and keyed
	// repeats authored inside them belong to the parent's semantic streams, so
	// their gates/plans (and index consumption) must flow through — otherwise
	// an arm-scoped flip site inside projected children loses its anchors.
	// Component invocations inside projected children render markup-only
	// through the projected-child/row-child splice (childReplacements cannot
	// reach placeholders that live inside another child's rendered output).
	const childrenContext: CsrRenderContext = {
		mode: 'csr',
		source,
		childReplacements: [],
		componentEdges: context.componentEdges,
		componentImports: context.componentImports,
		callbackSymbols: context.callbackSymbols,
		nextComponentEdgeIndex: context.nextComponentEdgeIndex,
		childrenMarkupOnly: true,
		branchSites: context.branchSites,
		branchReactivityGates: context.branchReactivityGates,
		nextBranchSiteIndex: context.nextBranchSiteIndex,
		keyedRepeats: context.keyedRepeats,
		repeatGates: context.repeatGates,
		nextRepeatIndex: context.nextRepeatIndex,
		styleScopeClass: context.styleScopeClass,
		armHostIdByNode: context.armHostIdByNode,
	};
	const children = emitHtmlChildren(node, childrenContext);
	context.nextComponentEdgeIndex = childrenContext.nextComponentEdgeIndex;
	context.nextBranchSiteIndex = childrenContext.nextBranchSiteIndex;
	context.nextRepeatIndex = childrenContext.nextRepeatIndex;
	if (children !== '""') {
		props.push(`children: ${children}`);
	}
	return props;
}

function boundSymbolsForEdge(
	edge: ComponentEdge | undefined,
	symbols: ReadonlyMap<string, string>,
): Readonly<Record<string, string>> {
	if (!edge) return {};
	const prefix = `bound:${edge.id}:`;
	return Object.fromEntries(
		[...symbols].flatMap(([key, value]) =>
			key.startsWith(prefix) ? [[key.slice(prefix.length), value]] : [],
		),
	);
}

function ssrComponentPropsSource(
	node: AnyNode,
	context: SsrRenderContext,
	edge: ComponentEdge | undefined,
	callbackSymbols: ReadonlyMap<string, string>,
): string[] {
	const props = getElementAttributes(node).flatMap((attribute) =>
		componentAttributePropSource(attribute, context.source),
	);
	const children = emitHtmlChildren(node, context);
	if (children !== '""') {
		props.push(`children: ${children}`);
	}
	const callbackEntries = (edge?.props ?? []).flatMap((prop) => {
		const callbackSymbolId = edge ? callbackSymbols.get(`${edge.id}:${prop.name}`) : undefined;
		if (callbackSymbolId) {
			return `${JSON.stringify(prop.name)}: ${JSON.stringify(callbackSymbolId)}`;
		}
		if (prop.kind !== 'graph-reference') return [];
		if (prop.graphNodeId === 'prop:props') {
			return `${JSON.stringify(prop.name)}: marklessSsrCallbackSymbol(props, ${JSON.stringify(prop.path)})`;
		}
		if (prop.graphNodeId.startsWith('prop:')) {
			return `${JSON.stringify(prop.name)}: marklessSsrCallbackSymbol(props, ${JSON.stringify([prop.graphNodeId.slice(5), ...prop.path])})`;
		}
		return [];
	});

	if (callbackEntries.length > 0) {
		props.push(
			`__marklessSsrCallbacks: marklessSsrCallbacks({ ${callbackEntries.join(', ')} })`,
		);
	}
	return props;
}

export function componentEdgeGraphRoutes(edge: ComponentEdge | undefined) {
	return (edge?.props ?? []).map((prop) =>
		prop.kind === 'graph-reference'
			? { name: prop.name, graphNodeId: prop.graphNodeId, path: prop.path }
			: {
					name: prop.name,
					kind: prop.kind === 'serializable' ? 'compiler-known-constant' : prop.kind,
				},
	);
}

function componentAttributePropSource(attribute: AnyNode, source: string): string[] {
	if (isSpreadAttribute(attribute)) {
		const argument = attribute.argument as AnyNode | undefined;
		return argument ? [`...(${expressionSource(argument, source)})`] : [];
	}
	const name = getIdentifierName(attribute.name as AnyNode | undefined);
	if (!name) return [];
	const propertyName = objectPropertyName(name);
	const value = attribute.value as AnyNode | undefined;
	const expression = unwrapExpressionContainer(value);
	if (!value) return [`${propertyName}: true`];
	if (expression) return [`${propertyName}: ${expressionSource(expression, source)}`];
	if (value.type === 'Literal') return [`${propertyName}: ${JSON.stringify(value.value)}`];
	return [];
}

export function collectSsrPropEvents(
	root: AnyNode,
	propNames: ReadonlyArray<string>,
	source: string,
	hostLocators: ReadonlyArray<{
		readonly hostNodeId: string;
		readonly hostPath: ReadonlyArray<number>;
	}>,
) {
	const hostNodeIdByPath = new Map(
		hostLocators.map((locator) => [JSON.stringify(locator.hostPath), locator.hostNodeId]),
	);
	return collectCsrPropEvents(root, propNames, source).flatMap((event) => {
		const hostNodeId = hostNodeIdByPath.get(JSON.stringify(event.hostPath));
		return hostNodeId
			? [{ hostNodeId, eventName: event.eventName, propName: event.propName }]
			: [];
	});
}

export function collectCsrPropEvents(
	root: AnyNode,
	propNames: ReadonlyArray<string>,
	source: string,
): ReadonlyArray<{
	readonly eventName: string;
	readonly hostPath: ReadonlyArray<number>;
	readonly propName: string;
}> {
	const propNameSet = new Set(propNames);
	const events: Array<{
		readonly eventName: string;
		readonly hostPath: ReadonlyArray<number>;
		readonly propName: string;
	}> = [];

	const visit = (node: AnyNode, path: ReadonlyArray<number>): void => {
		if (
			node.type !== 'Element' &&
			node.type !== 'JSXElement' &&
			node.type !== 'Fragment' &&
			node.type !== 'JSXFragment'
		) {
			return;
		}

		const tagName = getElementTagName(node);
		if (tagName && isHostTagName(tagName)) {
			for (const attribute of getElementAttributes(node)) {
				const name = getIdentifierName(attribute.name as AnyNode | undefined);
				if (!name || !isEventAttribute(name)) continue;

				const expression = unwrapExpressionContainer(
					attribute.value as AnyNode | undefined,
				);
				const propName = expression ? expressionSource(expression, source) : '';
				if (!propNameSet.has(propName)) continue;

				events.push({
					eventName: normalizeEventName(name),
					hostPath: path,
					propName,
				});
			}
		}

		let childDomIndex = 0;
		for (const child of asNodes(node.children)) {
			if (isIgnorableTextNode(child)) continue;
			if (child.type === 'Element' || child.type === 'JSXElement') {
				visit(child, [...path, childDomIndex]);
			}
			childDomIndex++;
		}
	};

	visit(root, []);
	return events;
}
export { objectPropertyName } from './shared.ts';
