import { isEventAttribute, normalizeEventName, parseModule } from '@tsrx/core';
import { asNodes, childNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource } from '../../ast/source.ts';
import {
	escapeAttribute,
	escapeHtml,
	getComponentFunction,
	getDynamicTagExpression,
	getElementAttributes,
	getElementTagName,
	isHostTagName,
	isIgnorableStaticTextNode as isIgnorableTextNode,
	isPlainHostTemplateNode,
	isSpreadAttribute,
	isStaticTextNode,
	staticTextValue,
	trimmedStaticTextValue,
	unwrapExpressionContainer,
} from '../../ast/tsrx.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
	splitStaticGraphPath,
} from '../../artifact-helpers/graph-paths.ts';
import {
	childrenOpacityDiagnostic,
	conditionalComponentRootDiagnostic,
	noRenderableRootDiagnostic,
	repeatRowStateScopeUnsupportedDiagnostic,
	undeclaredTemplateReadDiagnostic,
	unsupportedRenderBodyDiagnostic,
	unsupportedRenderConstructDiagnostic,
	unsupportedRenderRootDiagnostic,
} from './diagnostics.ts';
import { collectStyleScopes } from './style-scopes.ts';
import type {
	PayloadKeyedRepeat,
	PlannedSymbol,
	PublicRenderPlanArtifact,
	PublicRenderPlanAsyncBoundaryGate,
	PublicRenderPlanBranchArmPart,
	PublicRenderPlanBranchGate,
	PublicRenderPlanClassWrite,
	PublicRenderPlanEventControl,
	PublicRenderPlanInput,
	PublicRenderPlanKeyedRepeat,
	PublicRenderPlanRepeatGate,
	PublicRenderPlanStaticEventControl,
	PublicRenderPlanStaticTextWrite,
	PublicRenderPlanTextWrite,
	PublicRenderPlanUnsupportedReason,
	SemanticGraphBinding,
	SemanticKeyedRepeat,
} from '../../artifacts.ts';

export function collectStaticTextWrites(input: {
	readonly aliases: ReturnType<typeof semanticAliasMap>;
	readonly bindings: ReadonlyMap<string, SemanticGraphBinding>;
	readonly root: AnyNode;
	readonly source: string;
}): PublicRenderPlanStaticTextWrite[] | null {
	const writes: PublicRenderPlanStaticTextWrite[] = [];
	let sawRepeat = false;

	const visitElement = (node: AnyNode, hostPath: ReadonlyArray<number>): boolean => {
		let childDomIndex = 0;
		for (const child of asNodes(node.children)) {
			if (isIgnorableTextNode(child)) continue;
			if (isStaticTextNode(child)) {
				childDomIndex++;
				continue;
			}
			if (child.type === 'JSXForExpression') {
				sawRepeat = true;
				continue;
			}
			if (child.type === 'JSXExpressionContainer' || child.type === 'TSRXExpression') {
				const expression = child.expression as AnyNode | undefined;
				if (!expression) return false;

				const source = expressionSource(expression, input.source);
				const graph = resolveGraphPath(source, input.bindings, input.aliases);
				if (!graph || graph.binding.kind !== 'state') return false;
				const target = staticTextWriteTarget(node, child, hostPath, childDomIndex);

				writes.push({
					source,
					graphNodeId: graph.binding.id,
					path: graph.path,
					...target,
				});
				childDomIndex++;
				continue;
			}
			if (child.type === 'Element' || child.type === 'JSXElement') {
				if (!visitElement(child, [...hostPath, childDomIndex])) return false;
				childDomIndex++;
				continue;
			}
			return false;
		}

		return true;
	};

	if (!visitElement(input.root, [])) return null;
	if (sawRepeat && writes.length > 0) return null;
	return writes;
}

function staticTextWriteTarget(
	host: AnyNode,
	expressionChild: AnyNode,
	hostPath: ReadonlyArray<number>,
	childDomIndex: number,
): Pick<PublicRenderPlanStaticTextWrite, 'nodePath' | 'prefix' | 'suffix'> {
	const children = asNodes(host.children).filter((child) => !isIgnorableTextNode(child));
	const expressionChildren = children.filter(
		(child) => child.type === 'JSXExpressionContainer' || child.type === 'TSRXExpression',
	);
	if (expressionChildren.length !== 1 || expressionChildren[0] !== expressionChild) {
		return { nodePath: [...hostPath, childDomIndex] };
	}

	const expressionIndex = children.indexOf(expressionChild);
	let prefix = '';
	let suffix = '';
	for (const child of children.slice(0, expressionIndex)) {
		if (!isStaticTextNode(child)) return { nodePath: [...hostPath, childDomIndex] };
		prefix += staticTextValue(child);
	}
	for (const child of children.slice(expressionIndex + 1)) {
		if (!isStaticTextNode(child)) return { nodePath: [...hostPath, childDomIndex] };
		suffix += staticTextValue(child);
	}
	if (!prefix && !suffix) return { nodePath: [...hostPath, childDomIndex] };

	return {
		nodePath: hostPath,
		...(prefix ? { prefix } : {}),
		...(suffix ? { suffix } : {}),
	};
}

