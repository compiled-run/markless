import { asNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { isIgnorableJsxTextNode as isIgnorableTextNode } from '../../ast/tsrx.ts';
import {
	armScopedBranchHostIds,
	armScopedBranchRecords,
} from '../../artifact-helpers/arm-branch-records.ts';
import type {
	PayloadArmRecordSet,
	PlannedSymbol,
	PublicRenderPlanArtifact,
	PublicRenderPlanAsyncBoundaryArmRender,
	PublicRenderPlanInput,
} from '../../artifacts.ts';
import type { CompilerDiagnostic } from '../../diagnostics.ts';
import { resolveBoundaryRunners } from './boundary-runner.ts';
import {
	asyncArmRenderUnsupportedDiagnostic,
	gatePlanDisagreementDiagnostic,
} from './diagnostics.ts';
import { emitHtmlNode } from './html.ts';
import { emitCatalogHelperImports } from './runtime-helpers.ts';
import {
	componentReferences,
	emitComponentImport,
	emitValueImport,
	joinSsrExpressions,
	moduleScopeLines,
	publicRenderValueImports,
} from './shared.ts';
import type { AsyncBoundaryNode } from './async-boundaries.ts';
import type { AssignedHosts } from './host-locators.ts';
import type { CsrRenderContext, PublicRenderRoot } from './types.ts';

// D1 tier 4 (arm commit): when the cheap parts tier cannot rebuild a settled
// @try/@catch arm (components, repeats, @if, fragments), the boundary gets a
// component-executing arm-render module instead of no update module at all.
// Executing components here is INITIAL render happening in the browser — the
// unified render/resume model allows it; nothing re-executes over server DOM.
// The module returns { arm, html, armRecords } where armRecords index from
// the boundary's start anchor (D3 arm-relative coordinates).
export function planAsyncBoundaryArmRenders(context: {
	readonly input: PublicRenderPlanInput;
	readonly boundaryNodes: ReadonlyArray<AsyncBoundaryNode>;
	readonly asyncBoundaryGates: PublicRenderPlanArtifact['asyncBoundaryGates'];
	readonly asyncBoundaryArms: PublicRenderPlanArtifact['asyncBoundaryArms'];
	readonly branchReactivityGates: PublicRenderPlanArtifact['branchReactivityGates'];
	readonly branchArms: PublicRenderPlanArtifact['branchArms'];
	readonly armBranchEscalations: NonNullable<PublicRenderPlanArtifact['armBranchEscalations']>;
	readonly repeatGates: PublicRenderPlanArtifact['repeatGates'];
	readonly assignedHosts: AssignedHosts;
	readonly styleScopeClass: string | null;
	readonly rootInfo: Pick<PublicRenderRoot, 'componentName' | 'propNames'>;
}): {
	readonly armRenders: ReadonlyArray<PublicRenderPlanAsyncBoundaryArmRender>;
	readonly diagnostics: ReadonlyArray<CompilerDiagnostic>;
} {
	const armRenders: PublicRenderPlanAsyncBoundaryArmRender[] = [];
	const diagnostics: CompilerDiagnostic[] = [];
	const { input } = context;
	const partsBoundaryIds = new Set(context.asyncBoundaryArms.map((entry) => entry.boundaryId));
	const boundaryRunners = resolveBoundaryRunners(input.semanticGraph);

	input.semanticGraph.asyncBoundaries.forEach((boundarySite, index) => {
		const found = context.boundaryNodes[index];
		const gate = context.asyncBoundaryGates.find((item) => item.boundaryId === boundarySite.id);
		// A boundary that cannot render anchors has its own gate diagnostic.
		if (!found || !gate?.supported) return;

		const payloadBoundary = input.payloadArena.view.asyncBoundaries.find(
			(boundary) => boundary.id === boundarySite.id,
		);
		const resolution = boundaryRunners.get(boundarySite.id);
		// A syntactic @try with no async-capable read keeps its established static
		// pending behavior; there is no async settle contract to validate.
		if (resolution?.reads.length === 0 && resolution.unresolvedSources.length === 0) return;
		const read = resolution?.runnerGraphNodeId
			? { graphNodeId: resolution.runnerGraphNodeId }
			: undefined;
		const runner = input.symbolResolver.symbols.find(
			(symbol) =>
				(symbol.kind === 'async-computed-runner' ||
					symbol.kind === 'sync-computed-derive') &&
				symbol.graphNodeId === read?.graphNodeId,
		);
		if (!payloadBoundary || !read || !runner) {
			const readNames = resolution?.reads.map((item) => `"${item.source}"`) ?? [];
			diagnostics.push(
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
			);
			return;
		}

		// The cheap parts tier still needs the same resolved settle node and
		// symbol contract. Validate those before allowing it to skip tier 4.
		if (partsBoundaryIds.has(boundarySite.id)) return;

		const plan = planOneArmRender({
			...context,
			boundarySite,
			found,
			payloadBoundary,
			read,
			runner,
		});
		if ('diagnostic' in plan) {
			diagnostics.push(plan.diagnostic);
			return;
		}
		armRenders.push(plan.armRender);
	});

	return { armRenders, diagnostics };
}

type ArmRenderCandidate = Parameters<typeof planAsyncBoundaryArmRenders>[0] & {
	readonly boundarySite: PublicRenderPlanInput['semanticGraph']['asyncBoundaries'][number];
	readonly found: AsyncBoundaryNode;
	readonly payloadBoundary: PublicRenderPlanInput['payloadArena']['view']['asyncBoundaries'][number];
	readonly read: { readonly graphNodeId: string };
	readonly runner: Extract<
		PlannedSymbol,
		{ kind: 'async-computed-runner' | 'sync-computed-derive' }
	>;
};

function planOneArmRender(
	candidate: ArmRenderCandidate,
):
	| { readonly armRender: PublicRenderPlanAsyncBoundaryArmRender }
	| { readonly diagnostic: CompilerDiagnostic } {
	const { input, boundarySite, found } = candidate;
	const filename = input.source.filename;
	const boundaryEdges = input.semanticGraph.componentEdges.filter(
		(edge) => edge.asyncBoundaryId === boundarySite.id,
	);

	const sameModuleEdge = boundaryEdges.find((edge) => !edge.importSource);
	if (sameModuleEdge) {
		return {
			diagnostic: asyncArmRenderUnsupportedDiagnostic({
				message: `This @try block renders <${sameModuleEdge.childComponentName}>, which is defined in the same file. Rendering the settled @try content in the browser needs components imported from their own module.`,
				node: found.node,
				filename,
				suggestion: `Move <${sameModuleEdge.childComponentName}> into its own .tsrx file and import it.`,
			}),
		};
	}
	const callbackEdge = boundaryEdges.find((edge) =>
		input.symbolResolver.symbols.some(
			(symbol) => symbol.kind === 'callback-prop' && symbol.componentEdgeId === edge.id,
		),
	);
	if (callbackEdge) {
		return {
			diagnostic: asyncArmRenderUnsupportedDiagnostic({
				message: `This @try block passes a function prop to <${callbackEdge.childComponentName}>. Function props inside @try/@catch content cannot be wired up again when the settled content renders in the browser yet.`,
				node: found.node,
				filename,
				suggestion: `Handle the event inside <${callbackEdge.childComponentName}> itself, or lift the change into shared state both components read.`,
			}),
		};
	}

	const references = componentReferences(boundaryEdges, '__marklessCsrComponent');
	const renderContext: CsrRenderContext = {
		mode: 'csr',
		childReplacements: [],
		componentEdges: boundaryEdges,
		componentImports: new Map(references.map((item) => [item.componentName, item.localName])),
		callbackSymbols: new Map(),
		nextComponentEdgeIndex: 0,
		// Child prefixes must stay page-aligned (the page's symbol routes key on
		// the component-edge index), so numbering starts at this boundary's
		// first edge instead of zero.
		nextChildIndex: firstIndexMatching(
			input.semanticGraph.componentEdges,
			(edge) => edge.asyncBoundaryId === boundarySite.id,
		),
		keyedRepeats: input.semanticGraph.keyedRepeats,
		repeatGates: candidate.repeatGates,
		nextRepeatIndex: firstIndexMatching(
			input.semanticGraph.keyedRepeats,
			(repeat) => repeat.asyncBoundaryId === boundarySite.id,
		),
		branchSites: input.semanticGraph.branchSites,
		branchReactivityGates: candidate.branchReactivityGates,
		nextBranchSiteIndex: firstIndexMatching(
			input.semanticGraph.branchSites,
			(site) => site.asyncBoundaryId === boundarySite.id,
		),
		asyncBoundaries: [],
		asyncBoundaryGates: [],
		nextAsyncBoundaryIndex: 0,
		hasChildrenProp: candidate.rootInfo.propNames.includes('children'),
		styleScopeClass: candidate.styleScopeClass,
		source: input.source.source,
		armHostIdByNode: candidate.assignedHosts.hostIdByNode,
	};

	const tryChildren = armChildren((found.node.block as AnyNode | undefined)?.body);
	const handler = found.node.handler as AnyNode | undefined;
	const catchChildren = armChildren((handler?.body as AnyNode | undefined)?.body);
	const catchParam =
		getIdentifierName(handler?.param as AnyNode | undefined) ?? 'marklessArmError';

	const tryHtml = joinSsrExpressions(
		tryChildren.map((child) => emitHtmlNode(child, renderContext)),
	);
	const tryReplacementCount = renderContext.childReplacements.length;
	const catchHtml = joinSsrExpressions(
		catchChildren.map((child) => emitHtmlNode(child, renderContext)),
	);
	const emittedBody = [tryHtml, catchHtml, ...renderContext.childReplacements].join('\n');

	const readProp = candidate.rootInfo.propNames.find(
		(propName) =>
			propName !== candidate.runner.name &&
			propName !== catchParam &&
			referencesIdentifier(emittedBody, propName),
	);
	if (readProp) {
		return {
			diagnostic: asyncArmRenderUnsupportedDiagnostic({
				message: `This @try block reads "${readProp}" from the component props. Rendering the settled @try content in the browser cannot reach component props yet.`,
				node: found.node,
				filename,
				suggestion: `Lift "${readProp}" into state() or computed() so the settled content reads it from the graph.`,
			}),
		};
	}

	// Free state/computed reads resolve through the live graph at settle time;
	// the settled value itself binds through the arm lambda below.
	const graphLocals = input.semanticGraph.graphBindings.filter(
		(binding) =>
			(binding.kind === 'state' || binding.kind === 'computed') &&
			binding.name !== candidate.runner.name &&
			binding.name !== catchParam &&
			referencesIdentifier(emittedBody, binding.name),
	);
	const reserved = graphLocals.find(
		(binding) => binding.name === 'context' || binding.name === 'root',
	);
	if (reserved) {
		return {
			diagnostic: asyncArmRenderUnsupportedDiagnostic({
				message: `This @try block reads "${reserved.name}", a name the browser-side renderer reserves. Rename it so the settled content can render in the browser.`,
				node: found.node,
				filename,
				suggestion: `Rename "${reserved.name}" to a different name.`,
			}),
		};
	}

	const wiredArmPlans = [0, 2].map((arm) =>
		wiredArmRecordSet(candidate.payloadBoundary.armRecords[arm], input.symbolResolver.symbols, {
			publicRenderPlan: {
				branchArms: candidate.branchArms,
				armBranchEscalations: candidate.armBranchEscalations,
			},
			payloadView: input.payloadArena.view,
			boundaryId: boundarySite.id,
			arm,
		}),
	);
	const bodyLines = [
		'	const marklessArmIndex = context.status === "rejected" ? 1 : 0;',
		`	const marklessArmSnapshot = context.graph.read(${JSON.stringify(candidate.read.graphNodeId)}, []);`,
		...graphLocals.map(
			(binding) =>
				`	const ${binding.name} = context.graph.read(${JSON.stringify(binding.id)}, ${binding.kind === 'computed' && binding.async === true ? '["value"]' : '[]'});`,
		),
		'	const marklessCsrChildren = [];',
		'	const marklessArmRoot = marklessArmIndex === 0',
		`		? ((${candidate.runner.name}) => {`,
		`			const root = marklessCsrFragmentFromHtml(${tryHtml});`,
		...renderContext.childReplacements
			.slice(0, tryReplacementCount)
			.map((line) => `\t\t${line}`),
		'			return root;',
		'		})(marklessArmSnapshot.value)',
		`		: ((${catchParam}) => {`,
		`			const root = marklessCsrFragmentFromHtml(${catchHtml});`,
		...renderContext.childReplacements.slice(tryReplacementCount).map((line) => `\t\t${line}`),
		'			return root;',
		'		})(marklessArmSnapshot.error);',
		'	return marklessArmUpdate(marklessArmIndex, marklessArmRoot, marklessCsrChildren);',
	];

	const moduleLines = [
		...moduleScopeLines(input.source.source, filename),
		`const marklessArmPlans = ${JSON.stringify(wiredArmPlans)};`,
		...armUpdateHelperLines(),
	];
	const moduleText = [...moduleLines, ...bodyLines].join('\n');
	const imports = [
		...references.flatMap((reference) =>
			reference.importSource ? [emitComponentImport(reference as never)] : [],
		),
		...publicRenderValueImports(input.semanticGraph.moduleImports, boundaryEdges)
			.filter((moduleImport) => referencesIdentifier(moduleText, moduleImport.localName))
			.map(emitValueImport),
		...emitCatalogHelperImports(moduleText, [
			{
				module: 'csr',
				names: [
					'marklessCsrFragmentFromHtml',
					'marklessCsrRenderChild',
					'marklessCsrRowChild',
					'marklessCsrProjectedChild',
					'marklessCsrReplaceChild',
					'marklessCsrCollectElements',
					'marklessCsrAppendChildView',
				],
			},
			{
				module: 'html',
				names: [
					'marklessCsrText',
					'marklessCsrChildrenHtml',
					'marklessCsrAttribute',
					'readMarklessPublicPath',
					'marklessCsrDynamicTagName',
					'marklessCsrSpreadAttributes',
				],
			},
			{ module: 'repeats', names: ['marklessCsrRepeatRows'] },
		]),
	];

	return { armRender: { boundaryId: boundarySite.id, imports, moduleLines, bodyLines } };
}

// The runtime-side tail every arm-render module shares: derive arm-relative
// locators from the rendered truth (tagged hosts + composed children), merge
// the compile-time planned records, and serialize the fragment back to html.
function armUpdateHelperLines(): string[] {
	return [
		'function marklessArmUpdate(arm, root, children) {',
		'	const elements = marklessCsrCollectElements(root);',
		'	const indexByElement = new Map(elements.map((element, index) => [element, index]));',
		'	const plan = marklessArmPlans[arm] ?? { events: [], behaviors: [], elementHandles: [] };',
		'	const locators = [];',
		'	const events = [...plan.events];',
		'	const behaviors = [...plan.behaviors];',
		'	const elementHandles = [...plan.elementHandles];',
		'	for (const element of elements) {',
		'		const hostNodeId = element.getAttribute?.("data-markless-arm-host");',
		'		if (hostNodeId == null) continue;',
		'		element.removeAttribute("data-markless-arm-host");',
		'		locators.push({ hostNodeId, strategy: "arm-relative", index: indexByElement.get(element), tagName: element.tagName.toLowerCase() });',
		'	}',
		'	for (const child of children) marklessCsrAppendChildView({ child, elements, indexByElement, locators, events, domUpdates: [], behaviors, elementHandles, branches: [], asyncBoundaries: [], csrCallbacks: new Map() });',
		'	const armRecords = {',
		'		locators: locators.map((locator) => ({ ...locator, strategy: "arm-relative" })).sort((left, right) => left.index - right.index),',
		'		events,',
		'		behaviors,',
		'		elementHandles,',
		'		branches: plan.branches ?? [],',
		'	};',
		'	return { arm, html: marklessArmSerializeHtml(root), armRecords };',
		'}',
		'function marklessArmSerializeHtml(fragment) {',
		'	const template = document.createElement("template");',
		'	template.content.appendChild(fragment);',
		'	return template.innerHTML;',
		'}',
	];
}

// Compile-time record sets for the taken arm, with lazy symbol ids attached —
// the flat-stream wiring applied inside the boundary's coordinate space.
// Locators are omitted: the module derives them from the rendered fragment,
// which is the only truth once repeats and @if arms shift element positions.
// Hosts owned by arm-scoped flip sites leave the sets: their records nest
// under the flip record and re-register per flip (D1 tier 3 inside arms).
function wiredArmRecordSet(
	set: PayloadArmRecordSet | undefined,
	symbols: ReadonlyArray<PlannedSymbol>,
	armBranches: {
		readonly publicRenderPlan: Parameters<typeof armScopedBranchRecords>[0]['publicRenderPlan'];
		readonly payloadView: Parameters<typeof armScopedBranchRecords>[0]['payloadView'];
		readonly boundaryId: string;
		readonly arm: number;
	},
) {
	const flipHostIds = armScopedBranchHostIds(
		armBranches.publicRenderPlan.branchArms,
		armBranches.boundaryId,
	);
	const eventSymbols = new Map<string, string[]>();
	const behaviorSymbols = new Map<string, string[]>();
	for (const symbol of symbols) {
		if (symbol.kind === 'event-handler') {
			const key = `${symbol.hostNodeId}:${symbol.eventName}`;
			const ids = eventSymbols.get(key) ?? [];
			ids[symbol.order] = symbol.id;
			eventSymbols.set(key, ids);
		}
		if (symbol.kind === 'behavior') {
			const ids = behaviorSymbols.get(symbol.hostNodeId) ?? [];
			ids[symbol.order] = symbol.id;
			behaviorSymbols.set(symbol.hostNodeId, ids);
		}
	}
	const branches = armScopedBranchRecords({
		publicRenderPlan: armBranches.publicRenderPlan,
		symbols,
		payloadView: armBranches.payloadView,
		boundaryId: armBranches.boundaryId,
		arm: armBranches.arm,
	});
	return {
		events: (set?.events ?? [])
			.filter((event) => !flipHostIds.has(event.hostNodeId))
			.map((event) => ({
				hostNodeId: event.hostNodeId,
				eventName: event.eventName,
				syncPolicy: event.syncPolicy,
				symbolIds: eventSymbols.get(`${event.hostNodeId}:${event.eventName}`) ?? [],
			})),
		behaviors: (set?.behaviors ?? [])
			.filter((behavior) => !flipHostIds.has(behavior.hostNodeId))
			.map((behavior, index) => ({
				...behavior,
				symbolId: behaviorSymbols.get(behavior.hostNodeId)?.[index],
			})),
		elementHandles: (set?.elementHandles ?? []).filter(
			(handle) => !flipHostIds.has(handle.hostNodeId),
		),
		...(branches ? { branches } : {}),
	};
}

function armChildren(body: unknown): AnyNode[] {
	return asNodes(body as AnyNode[] | undefined).filter((child) => !isIgnorableTextNode(child));
}

function firstIndexMatching<T>(list: ReadonlyArray<T>, matches: (item: T) => boolean): number {
	const index = list.findIndex(matches);
	return index === -1 ? list.length : index;
}

function referencesIdentifier(source: string, name: string): boolean {
	return new RegExp(`\\b${name.replace(/[$^\\.*+?()[\]{}|]/g, '\\$&')}\\b`).test(source);
}
