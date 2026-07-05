import { isEventAttribute, normalizeEventName } from '@tsrx/core';
import { asNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource } from '../../ast/source.ts';
import { getElementAttributes, getElementTagName, isHostTagName, isIgnorableJsxTextNode as isIgnorableTextNode, isSpreadAttribute, unwrapExpressionContainer } from '../../ast/tsrx.ts';
import { emitHtmlChildren } from './html.ts';
import { objectPropertyName } from './shared.ts';
import type { ComponentEdge, CsrRenderContext, SsrRenderContext } from './types.ts';

export function emitSsrComponent(node: AnyNode, componentName: string, context: SsrRenderContext): string {
	const localName = context.componentImports.get(componentName);
	if (!localName) return '""';
	const edge = context.componentEdges[context.nextComponentEdgeIndex++];
	const childIndex = context.nextChildIndex++;
	const props = ssrComponentPropsSource(node, context, edge, context.callbackSymbols);
	const placement = {
		hostPrefix: `c${childIndex}:`,
		symbolPrefix: `c${childIndex}:`,
		graphProps: graphReferenceProps(edge),
	};

	return `(await marklessSsrRenderChild(marklessSsrChildren, ${localName}, { ${props.join(', ')} }, { hostPrefix: ${JSON.stringify(placement.hostPrefix)}, symbolPrefix: ${JSON.stringify(placement.symbolPrefix)}, localIndex: marklessSsrHostLocators.length, graphProps: ${JSON.stringify(placement.graphProps)} }))`;
}

export function emitCsrComponent(node: AnyNode, componentName: string, context: CsrRenderContext): string {
	const localName = context.componentImports.get(componentName);
	if (!localName) return '""';
	const index = context.childReplacements.length;
	const edge = context.componentEdges[context.nextComponentEdgeIndex++];
	const props = componentPropsSource(node, context.source, edge, context.callbackSymbols);
	const childName = `marklessCsrChild${index}`;
	context.childReplacements.push(
		`	const ${childName} = marklessCsrRenderChild(${localName}, { ${props.join(', ')} });`,
		`	marklessCsrReplaceChild(root, ${index}, ${childName}?.root);`,
		`	marklessCsrChildren.push({ hostPrefix: ${JSON.stringify(`c${index}:`)}, symbolPrefix: ${JSON.stringify(`c${index}:`)}, output: ${childName}, graphProps: ${JSON.stringify(graphReferenceProps(edge))} });`,
	);
	return JSON.stringify(`<span data-markless-csr-child="${index}"></span>`);
}

function componentPropsSource(
	node: AnyNode,
	source: string,
	edge: ComponentEdge | undefined,
	callbackSymbols: ReadonlyMap<string, string>,
): string[] {
	const props = getElementAttributes(node).flatMap((attribute) => {
		const name = getIdentifierName(attribute.name as AnyNode | undefined);
		if (!name) return [];
		const callbackSymbolId = edge ? callbackSymbols.get(`${edge.id}:${name}`) : undefined;
		if (callbackSymbolId) {
			return `${objectPropertyName(name)}: marklessCsrCallback(${JSON.stringify(callbackSymbolId)})`;
		}
		return componentAttributePropSource(attribute, source);
	});
	const children = emitHtmlChildren(node, { mode: 'csr', source });
	if (children !== '""') {
		props.push(`children: ${children}`);
	}
	return props;
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

export function graphReferenceProps(edge: ComponentEdge | undefined) {
	return (edge?.props ?? []).flatMap((prop) =>
		prop.kind === 'graph-reference'
			? [{ name: prop.name, graphNodeId: prop.graphNodeId, path: prop.path }]
			: [],
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

