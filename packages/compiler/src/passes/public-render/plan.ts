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
import { collectAsyncBoundaryNodes } from './async-boundaries.ts';
import { branchArmSupported, branchArms, buildBranchArmParts, collectArmHosts, collectBranchSiteNodes, scopeClassOf, switchArmTests } from './branch-planning.ts';
import { assignHostIds, collectHostPaths, collectStaticEventControls, collectStaticHostNodeIds, keyedRepeatNodes } from './host-locators.ts';
import { collectRowPlan, planKeyedRepeat, supportedRepeatGate } from './repeat-planning.ts';
import { firstComponentRoot, sameModuleComponentRoots, selectPublicRenderRoot, singleRowRoot, staticHtml, staticShellSupported } from './template.ts';
import { collectStaticTextWrites } from './text-bindings.ts';
import { branchRenderDiagnostics, collectChildrenOpacityDiagnostics, collectUndeclaredTemplateReadDiagnostics, collectUnsupportedConstructDiagnostics, componentConditionalRootDiagnostics, componentRootDiagnostics, componentUnsupportedBodyDiagnostics, emptyPlan, repeatRenderDiagnostics } from './validation.ts';
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

// Builds the public render artifact that the module emitter consumes. This pass
// decides what direct DOM work is compiler-proven instead of emitting code itself.
export function planPublicRender(input: PublicRenderPlanInput): PublicRenderPlanArtifact {
	const ast = parseModule(input.source.source, input.source.filename) as unknown as AnyNode;
	const conditionalRootDiagnostics = componentConditionalRootDiagnostics(ast, input.source.filename);
	if (conditionalRootDiagnostics.length > 0) return emptyPlan(conditionalRootDiagnostics);
	const unsupportedBodyDiagnostics = componentUnsupportedBodyDiagnostics(ast, input.source.filename, input.source.source);
	if (unsupportedBodyDiagnostics.length > 0) return emptyPlan(unsupportedBodyDiagnostics);

	const selectedRoot = selectPublicRenderRoot(ast);
	if (!selectedRoot) {
		return emptyPlan(componentRootDiagnostics(ast, input.source.filename));
	}
	const root = selectedRoot.root;
	const componentRoots = sameModuleComponentRoots(ast);
	const undeclaredTemplateReadDiagnostics = collectUndeclaredTemplateReadDiagnostics({
		ast,
		component: selectedRoot.component,
		filename: input.source.filename,
		moduleImports: input.semanticGraph.moduleImports.map((moduleImport) => moduleImport.localName),
		repeatLocals: input.semanticGraph.keyedRepeats.flatMap((repeat) =>
			repeat.indexName ? [repeat.itemName, repeat.indexName] : [repeat.itemName],
		),
		root,
		source: input.source.source,
	});
	if (undeclaredTemplateReadDiagnostics.length > 0) {
		return emptyPlan(undeclaredTemplateReadDiagnostics);
	}

	const assignedHosts = assignHostIds(
		ast,
		input.semanticGraph.hostNodes.map((host) => host.id),
	);
	const hostPaths = collectHostPaths(root, assignedHosts);
	const repeatNodes = keyedRepeatNodes(root);
	const repeatNodeById = new Map<string, AnyNode>();
	input.semanticGraph.keyedRepeats.forEach((repeat, index) => {
		const node = repeatNodes[index];
		if (node) repeatNodeById.set(repeat.id, node);
	});

	const bindings = graphBindingMap(input.semanticGraph);
	const aliases = semanticAliasMap(input.semanticGraph);
	const locatorByHostNodeId = new Map(
		input.payloadArena.view.locators.map((locator) => [locator.hostNodeId, locator]),
	);
	const staticTextWrites = collectStaticTextWrites({
		aliases,
		bindings,
		root,
		source: input.source.source,
	});

	const repeatGates: PublicRenderPlanRepeatGate[] = [];
	const keyedRepeats: PublicRenderPlanKeyedRepeat[] = [];

	for (const payloadRepeat of input.payloadArena.view.keyedRepeats) {
		const semanticRepeat = input.semanticGraph.keyedRepeats.find(
			(repeat) => repeat.id === payloadRepeat.id,
		);
		const repeatNode = repeatNodeById.get(payloadRepeat.id);
		if (!semanticRepeat || !repeatNode) continue;

		const gate = supportedRepeatGate({
			aliases,
			assignedHosts,
			bindings,
			payloadRepeat,
			repeatNode,
			semanticRepeat,
			source: input.source.source,
			symbols: input.symbolResolver.symbols,
		});
		repeatGates.push(gate);
		if (!gate.supported || gate.ssrOnly) continue;

		const row = singleRowRoot(repeatNode);
		const parentLocator = locatorByHostNodeId.get(payloadRepeat.parentHostNodeId);
		const parentPath = hostPaths.get(payloadRepeat.parentHostNodeId);
		if (!row || !parentLocator || !parentPath) continue;

		const rowPlan = collectRowPlan({
			aliases,
			assignedHosts,
			bindings,
			itemName: semanticRepeat.itemName,
			keyPath: payloadRepeat.keyPath,
			repeatId: payloadRepeat.id,
			row,
			source: input.source.source,
			symbols: input.symbolResolver.symbols,
		});
		if (!rowPlan) continue;

		keyedRepeats.push(
			planKeyedRepeat({
				payloadRepeat,
				parentLocator,
				parentPath,
				row,
				repeatNode,
				rowPlan,
				semanticRepeat,
				source: input.source.source,
			}),
		);
	}

	const styleScopeCollection = collectStyleScopes(root, input.source.filename);
	const branchNodes = collectBranchSiteNodes(root);
	const branchReactivityGates: PublicRenderPlanBranchGate[] = input.semanticGraph.branchSites.map(
		(site, index) => {
			const found = branchNodes[index];
			if (!found || found.nested || found.containsNested) {
				return {
					branchSiteId: site.id,
					supported: false,
					reason: 'nested-branch-unsupported',
				};
			}
			if (found.conditional) {
				return {
					branchSiteId: site.id,
					supported: false,
					reason: 'conditional-branch-unsupported',
				};
			}
			const arms = branchArms(found.node);
			const armsSupported =
				arms.length > 0 &&
				arms.every((arm) =>
					branchArmSupported(arm, bindings, aliases, input.source.source),
				);
			if (!armsSupported) {
				return {
					branchSiteId: site.id,
					supported: false,
					reason: 'arm-content-unsupported',
				};
			}
			return { branchSiteId: site.id, supported: true };
		},
	);

	const branchArmsPlans = input.semanticGraph.branchSites.flatMap((site, index) => {
		const gate = branchReactivityGates[index];
		const found = branchNodes[index];
		if (!gate?.supported || !found) return [];
		const testResolved = resolveGraphPath(site.testSource, bindings, aliases);
		const arms = branchArms(found.node).map((arm) =>
			buildBranchArmParts(
				arm,
				bindings,
				aliases,
				input.source.source,
				scopeClassOf(styleScopeCollection),
			),
		);
		if (arms.some((arm) => arm === null)) return [];
		let armTests: unknown[] | null = null;
		if (site.kind === 'switch') {
			armTests = switchArmTests(found.node);
			if (armTests === null) return [];
		}
		const armHosts = branchArms(found.node).map((arm) => collectArmHosts(arm, assignedHosts));
		return [
			{
				branchSiteId: site.id,
				testRead: testResolved
					? { graphNodeId: testResolved.binding.id, path: testResolved.path }
					: null,
				arms: arms as ReadonlyArray<ReadonlyArray<PublicRenderPlanBranchArmPart>>,
				armHosts,
				...(armTests ? { armTests } : {}),
			},
		];
	});

	const boundaryNodes = collectAsyncBoundaryNodes(root);
	const asyncBoundaryArms = input.semanticGraph.asyncBoundaries.flatMap((boundarySite, index) => {
		const boundaryNode = boundaryNodes[index];
		if (!boundaryNode || boundaryNode.nested || boundaryNode.containsNested) return [];
		const tryChildren = asNodes((boundaryNode.node.block as AnyNode | undefined)?.body).filter(
			(child) => !isIgnorableTextNode(child),
		);
		const handler = boundaryNode.node.handler as AnyNode | undefined;
		const catchChildren = asNodes((handler?.body as AnyNode | undefined)?.body).filter(
			(child) => !isIgnorableTextNode(child),
		);
		const arms = [tryChildren, catchChildren].map((arm) =>
			buildBranchArmParts(
				arm,
				bindings,
				aliases,
				input.source.source,
				scopeClassOf(styleScopeCollection),
			),
		);
		if (arms.some((arm) => arm === null)) return [];
		return [
			{
				boundaryId: boundarySite.id,
				arms: arms as ReadonlyArray<ReadonlyArray<PublicRenderPlanBranchArmPart>>,
			},
		];
	});
	const asyncBoundaryGates: PublicRenderPlanAsyncBoundaryGate[] =
		input.payloadArena.view.asyncBoundaries.map((boundary, index) => {
			const found = boundaryNodes[index];
			if (!found) {
				return {
					boundaryId: boundary.id,
					supported: false,
					reason: 'conditional-boundary-unsupported',
				};
			}
			if (found.nested || found.containsNested) {
				return {
					boundaryId: boundary.id,
					supported: false,
					reason: 'nested-boundary-unsupported',
				};
			}
			if (found.conditional) {
				return {
					boundaryId: boundary.id,
					supported: false,
					reason: 'conditional-boundary-unsupported',
				};
			}
			const pendingChildren = asNodes(
				(found.node.pending as AnyNode | undefined)?.body,
			).filter((child) => !isIgnorableTextNode(child));
			if (pendingChildren.some((child) => !isPlainHostTemplateNode(child))) {
				return {
					boundaryId: boundary.id,
					supported: false,
					reason: 'pending-branch-unsupported',
				};
			}
			return { boundaryId: boundary.id, supported: true };
		});

	const rootTemplateHtml = staticHtml(root, {
		componentRoots,
		componentStack: [selectedRoot.componentName],
		expressionText: ' ',
		omitForExpressions: true,
	});
	const directRenderTemplateHtml =
		staticTextWrites && staticShellSupported(root)
			? staticHtml(root, {
					componentRoots,
					componentStack: [selectedRoot.componentName],
					expressionText: ' ',
					omitForExpressions: true,
				})
			: null;

	return {
		passId: 'public-render-plan',
		rootTemplateHtml,
		directRenderTemplateHtml,
		staticHostNodeIds: collectStaticHostNodeIds(root, assignedHosts),
		staticHostLocators: input.payloadArena.view.locators.flatMap((locator) => {
			const hostPath = hostPaths.get(locator.hostNodeId);
			return hostPath
				? [
						{
							hostNodeId: locator.hostNodeId,
							tagName: locator.tagName,
							hostPath,
						},
					]
				: [];
		}),
		staticEventControls: collectStaticEventControls({
			hostPaths,
			payloadEvents: input.payloadArena.view.events,
			symbols: input.symbolResolver.symbols,
		}),
		staticTextWrites: staticTextWrites ?? [],
		repeatGates,
		keyedRepeats,
		asyncBoundaryGates,
		branchReactivityGates,
		branchArms: branchArmsPlans,
		asyncBoundaryArms,
		styleScopes: styleScopeCollection.styleScopes,
		diagnostics: [
			...styleScopeCollection.diagnostics,
			...collectUnsupportedConstructDiagnostics(root, input.source.filename),
			...collectChildrenOpacityDiagnostics(ast, input.source.filename),
			...repeatRenderDiagnostics({
				componentEdgeCount: input.semanticGraph.componentEdges.length,
				filename: input.source.filename,
				keyedRepeats,
				repeatGates,
				repeatNodeById,
			}),
			...branchRenderDiagnostics({
				branchGates: branchReactivityGates,
				branchNodes,
				filename: input.source.filename,
			}),
			...asyncBoundaryGates.flatMap((gate, index) => {
				const found = boundaryNodes[index];
				if (gate.supported || !found) return [];
				return [
					unsupportedRenderConstructDiagnostic({
						label: '@try/@pending/@catch',
						message: `The async boundary branches are dropped from rendered HTML (reason: ${gate.reason}); only top-level boundaries with plain-host @pending content render anchors today.`,
						node: found.node,
						filename: input.source.filename,
						suggestion:
							'Move the boundary out of nested control flow, or keep the @pending branch to host elements, text, and expressions.',
					}),
				];
			}),
		],
	};
}


export { firstComponentRoot, selectPublicRenderRoot } from './template.ts';
