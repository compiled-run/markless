import { parseModule } from '../../js-ast.ts';
import { childNodes, walkNode, type AnyNode } from '../../ast/nodes.ts';
import { getElementTagName, isHostTagName } from '../../ast/tsrx.ts';
import { parseJavaScriptModule } from '../../js-ast.ts';
import type {
	PlannedSymbol,
	PublicRenderPlanArtifact,
	PublicRenderPlanInput,
	SemanticGraphArtifact,
	SemanticSyncPolicy,
	SemanticSyncPolicyAction,
} from '../../artifacts.ts';
import { extractedSyncPolicyActionCalls } from '../semantic-graph/collect-sync-policy.ts';
import { collectStyleScopes } from './style-scopes.ts';
import { collectAsyncBoundaryNodes } from './async-boundaries.ts';
import { resolveBoundaryRunners } from './boundary-runner.ts';
import { gatePlanDisagreementDiagnostic, tryBlockToggleRerenderDiagnostic } from './diagnostics.ts';
import {
	collectChildrenOpacityDiagnostics,
	collectUndeclaredTemplateReadDiagnostics,
	collectUnsupportedConstructDiagnostics,
	componentConditionalRootDiagnostics,
	componentRootDiagnostics,
	componentUnsupportedBodyDiagnostics,
	emptyPlan,
	sameModuleChildBoundaryDiagnostics,
} from './validation.ts';
import { selectPublicRenderRoot } from './template.ts';

// The compatibility plan now owns only fail-closed diagnostics and style
// scopes. Render and resume facts are produced once by semantic-graph and
// render-data; emitters must not rebuild a second AST projection here.
export function planPublicRender(input: PublicRenderPlanInput): PublicRenderPlanArtifact {
	const ast = parseModule(input.source.source, input.source.filename) as unknown as AnyNode;
	const conditionalRootDiagnostics = componentConditionalRootDiagnostics(
		ast,
		input.source.filename,
	);
	if (conditionalRootDiagnostics.length > 0) return emptyPlan(conditionalRootDiagnostics);
	const unsupportedBodyDiagnostics = componentUnsupportedBodyDiagnostics(
		ast,
		input.source.filename,
		input.source.source,
	);
	if (unsupportedBodyDiagnostics.length > 0) return emptyPlan(unsupportedBodyDiagnostics);

	const selectedRoot = selectPublicRenderRoot(ast);
	if (!selectedRoot) return emptyPlan(componentRootDiagnostics(ast, input.source.filename));

	stripExtractedSyncPolicyCalls(input.symbolResolver.symbols, input.semanticGraph);
	const undeclaredTemplateReadDiagnostics = collectUndeclaredTemplateReadDiagnostics({
		ast,
		component: selectedRoot.component,
		filename: input.source.filename,
		moduleImports: input.semanticGraph.moduleImports.map((item) => item.localName),
		repeatLocals: input.semanticGraph.keyedRepeats.flatMap((repeat) =>
			repeat.indexName ? [repeat.itemName, repeat.indexName] : [repeat.itemName],
		),
		root: selectedRoot.root,
		source: input.source.source,
	});
	if (undeclaredTemplateReadDiagnostics.length > 0) {
		return emptyPlan(undeclaredTemplateReadDiagnostics);
	}

	const styles = collectStyleScopes(selectedRoot.root, input.source.filename);
	const boundaryNodes = collectAsyncBoundaryNodes(selectedRoot.root);
	const boundaryRunners = resolveBoundaryRunners(input.semanticGraph);
	const boundaryRunnerDiagnostics = input.semanticGraph.asyncBoundaries.flatMap(
		(boundary, index) => {
			const found = boundaryNodes[index];
			const resolution = boundaryRunners.get(boundary.id);
			if (!found || !resolution) return [];
			if (resolution.reads.length === 0 && resolution.unresolvedSources.length === 0)
				return [];
			const runner = input.symbolResolver.symbols.find(
				(symbol) =>
					(symbol.kind === 'async-computed-runner' ||
						symbol.kind === 'sync-computed-derive') &&
					symbol.graphNodeId === resolution.runnerGraphNodeId,
			);
			if (resolution.runnerGraphNodeId && runner) return [];
			const readNames = resolution.reads.map((item) => `"${item.source}"`);
			return [
				gatePlanDisagreementDiagnostic({
					label: '@try',
					message:
						readNames.length > 1
							? `This @try block reads more than one async value (${readNames.join(', ')}), so one runner cannot safely bind every name used by its settled content.`
							: 'This @try block has no single resolvable async computed read, so no runner can settle its rendered content.',
					node: found.node,
					filename: input.source.filename,
					suggestion:
						'Make the @try content read one async computed value directly. Deriving additional values inside a settled browser arm is not supported yet.',
				}),
			];
		},
	);
	const branchNodes: AnyNode[] = [];
	walkNode(selectedRoot.root, (node) => {
		if (node.type === 'JSXIfExpression' || node.type === 'JSXSwitchExpression')
			branchNodes.push(node);
	});
	const armEscalationDiagnostics = input.semanticGraph.branchSites.flatMap((site, index) => {
		if (!site.asyncBoundaryId) return [];
		const branchNode = branchNodes[index];
		const containsComponent = input.semanticGraph.markup.chunks
			.filter((chunk) => chunk.id.startsWith(`branch:${site.id}:arm:`))
			.some((chunk) => chunk.slots.some((slot) => slot.kind === 'child-component'));
		const componentName = branchNode ? firstComponentName(branchNode) : null;
		if (!branchNode || !containsComponent || !componentName) return [];
		return [
			tryBlockToggleRerenderDiagnostic({
				branchLabel: site.kind === 'switch' ? '@switch' : '@if',
				componentName,
				node: branchNode,
				filename: input.source.filename,
			}),
		];
	});
	return {
		passId: 'public-render-plan',
		styleScopes: styles.styleScopes,
		diagnostics: [
			...styles.diagnostics,
			...sameModuleChildBoundaryDiagnostics(
				ast,
				selectedRoot.componentName,
				input.source.filename,
			),
			...collectUnsupportedConstructDiagnostics(selectedRoot.root, input.source.filename),
			...collectChildrenOpacityDiagnostics(ast, input.source.filename),
			...boundaryRunnerDiagnostics,
			...armEscalationDiagnostics,
		],
	};
}

function firstComponentName(node: AnyNode): string | null {
	if (node.type === 'Element' || node.type === 'JSXElement') {
		const tagName = getElementTagName(node);
		if (tagName && !isHostTagName(tagName)) return tagName;
	}
	for (const child of childNodes(node)) {
		const found = firstComponentName(child);
		if (found) return found;
	}
	return null;
}

function stripExtractedSyncPolicyCalls(
	symbols: ReadonlyArray<PlannedSymbol>,
	semanticGraph: SemanticGraphArtifact,
): void {
	for (const event of semanticGraph.events) {
		if (!event.syncPolicy) continue;
		const actions = syncPolicyActionSet(event.syncPolicy);
		if (actions.size === 0) continue;
		for (const symbol of symbols) {
			if (
				symbol.kind !== 'event-handler' ||
				symbol.hostNodeId !== event.hostNodeId ||
				symbol.eventName !== event.eventName
			)
				continue;
			const stripped = stripSyncPolicyCallsFromHandlerSource(
				symbol.source,
				symbol.parameters[0] ?? 'event',
				actions,
				semanticGraph,
			);
			if (stripped !== symbol.source) (symbol as { source: string }).source = stripped;
		}
	}
}

function syncPolicyActionSet(policy: SemanticSyncPolicy): ReadonlySet<SemanticSyncPolicyAction> {
	const actions = new Set<SemanticSyncPolicyAction>();
	const branches = 'branches' in policy ? policy.branches : [policy];
	for (const branch of branches) for (const action of branch.actions) actions.add(action);
	return actions;
}

function stripSyncPolicyCallsFromHandlerSource(
	source: string,
	eventParam: string,
	actions: ReadonlySet<SemanticSyncPolicyAction>,
	semanticGraph: SemanticGraphArtifact,
): string {
	const prefix = 'const __marklessHandler = ';
	const wrappedSource = `${prefix}${source};`;
	let handler: AnyNode | undefined;
	try {
		const ast = parseJavaScriptModule(wrappedSource, 'markless-handler.js') as AnyNode;
		walkNode(ast, (node) => {
			if (
				!handler &&
				(node.type === 'ArrowFunctionExpression' ||
					node.type === 'FunctionExpression' ||
					node.type === 'FunctionDeclaration')
			)
				handler = node;
		});
	} catch {
		return source;
	}
	const body = handler?.body as AnyNode | undefined;
	const replacements = extractedSyncPolicyActionCalls(body, eventParam, actions, {
		graph: semanticGraph as never,
		source: wrappedSource,
	})
		.flatMap((node) =>
			removableCallSpan(
				source,
				(node.start ?? 0) - prefix.length,
				(node.end ?? 0) - prefix.length,
			),
		)
		.sort((left, right) => right.start - left.start);
	let stripped = source;
	for (const replacement of replacements) {
		stripped = stripped.slice(0, replacement.start) + stripped.slice(replacement.end);
	}
	return stripped;
}

function removableCallSpan(
	source: string,
	start: number,
	end: number,
): Array<{ readonly start: number; readonly end: number }> {
	if (start < 0 || end <= start || end > source.length) return [];
	let removeEnd = end;
	while (source[removeEnd] === ' ' || source[removeEnd] === '\t') removeEnd++;
	if (source[removeEnd] === ';') removeEnd++;
	const lineStart = source.lastIndexOf('\n', start - 1) + 1;
	if (/^[\t ]*$/.test(source.slice(lineStart, start)) && source[removeEnd] === '\n') {
		return [{ start: lineStart, end: removeEnd + 1 }];
	}
	return [{ start, end: removeEnd }];
}

export { firstComponentRoot, selectPublicRenderRoot } from './template.ts';
export type { PublicRenderRootSelection } from './template.ts';
