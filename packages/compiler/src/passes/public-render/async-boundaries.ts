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

export type AsyncBoundaryNode = {
	readonly node: AnyNode;
	readonly nested: boolean;
	containsNested: boolean;
	readonly conditional: boolean;
};

export function collectAsyncBoundaryNodes(root: AnyNode): AsyncBoundaryNode[] {
	const found: AsyncBoundaryNode[] = [];
	const boundaryStack: AsyncBoundaryNode[] = [];

	const visit = (node: AnyNode, conditional: boolean): void => {
		if (node.type === 'JSXTryExpression') {
			const entry: AsyncBoundaryNode = {
				node,
				nested: boundaryStack.length > 0,
				containsNested: false,
				conditional,
			};
			for (const outer of boundaryStack) outer.containsNested = true;
			found.push(entry);
			boundaryStack.push(entry);
			for (const child of childNodes(node)) visit(child, conditional);
			boundaryStack.pop();
			return;
		}
		const entersControlFlow =
			node.type === 'JSXIfExpression' ||
			node.type === 'JSXSwitchExpression' ||
			node.type === 'JSXForExpression';
		for (const child of childNodes(node)) {
			visit(child, conditional || entersControlFlow);
		}
	};

	visit(root, false);
	return found;
}

