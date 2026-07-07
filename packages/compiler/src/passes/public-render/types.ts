import type { PublicRenderModuleInput } from '../../artifacts.ts';
import type { AnyNode } from '../../ast/nodes.ts';

export type ComponentEdge = PublicRenderModuleInput['semanticGraph']['componentEdges'][number];

export type SsrRenderContext = {
	readonly mode: 'ssr';
	readonly componentEdges: PublicRenderModuleInput['semanticGraph']['componentEdges'];
	readonly componentImports: ReadonlyMap<string, string>;
	readonly callbackSymbols: ReadonlyMap<string, string>;
	nextComponentEdgeIndex: number;
	nextChildIndex: number;
	readonly hostIdByNode: ReadonlyMap<AnyNode, string>;
	readonly keyedRepeats: PublicRenderModuleInput['semanticGraph']['keyedRepeats'];
	readonly repeatGates: PublicRenderModuleInput['publicRenderPlan']['repeatGates'];
	nextRepeatIndex: number;
	readonly insideRepeatRow: boolean;
	readonly asyncBoundaries: PublicRenderModuleInput['semanticGraph']['asyncBoundaries'];
	readonly asyncBoundaryGates: PublicRenderModuleInput['publicRenderPlan']['asyncBoundaryGates'];
	nextAsyncBoundaryIndex: number;
	// boundaryId -> the async computed the SSR render awaits inline.
	readonly asyncRunners?: ReadonlyMap<
		string,
		{ readonly graphNodeId: string; readonly name: string; readonly source: string }
	>;
	readonly branchSites: PublicRenderModuleInput['semanticGraph']['branchSites'];
	readonly branchReactivityGates: PublicRenderModuleInput['publicRenderPlan']['branchReactivityGates'];
	nextBranchSiteIndex: number;
	// Inside a gate-supported branch arm, host elements skip the locator
	// stream (their records rewire via arm-relative host paths) but must
	// still shift later locator indexes — the repeat-row extras discipline.
	insideSupportedBranchArm?: boolean;
	readonly hasChildrenProp?: boolean;
	readonly styleScopeClass: string | null;
	readonly source: string;
};

export type CsrRenderContext = {
	readonly mode: 'csr';
	readonly childReplacements: string[];
	readonly componentEdges: PublicRenderModuleInput['semanticGraph']['componentEdges'];
	readonly componentImports: ReadonlyMap<string, string>;
	readonly callbackSymbols: ReadonlyMap<string, string>;
	nextComponentEdgeIndex: number;
	// Optional because component-children emission builds a partial context;
	// repeats inside projected children keep the prior render-nothing behavior.
	readonly keyedRepeats?: PublicRenderModuleInput['semanticGraph']['keyedRepeats'];
	readonly repeatGates?: PublicRenderModuleInput['publicRenderPlan']['repeatGates'];
	nextRepeatIndex?: number;
	readonly branchSites?: PublicRenderModuleInput['semanticGraph']['branchSites'];
	readonly branchReactivityGates?: PublicRenderModuleInput['publicRenderPlan']['branchReactivityGates'];
	nextBranchSiteIndex?: number;
	readonly asyncBoundaries?: PublicRenderModuleInput['semanticGraph']['asyncBoundaries'];
	readonly asyncBoundaryGates?: PublicRenderModuleInput['publicRenderPlan']['asyncBoundaryGates'];
	nextAsyncBoundaryIndex?: number;
	// Arm-render modules number child components page-aligned (symbol routes
	// key on the component-edge index); unset keeps the page-module numbering.
	nextChildIndex?: number;
	// Arm-render modules tag static in-arm hosts so the emitted module can
	// derive arm-relative locators from the rendered truth (D3). Mutable:
	// repeat-row emission unsets it — rows never carry per-instance locators.
	armHostIdByNode?: ReadonlyMap<AnyNode, string>;
	readonly hasChildrenProp?: boolean;
	readonly styleScopeClass?: string | null;
	readonly source: string;
};

export type HtmlRenderContext = SsrRenderContext | CsrRenderContext;

export type PublicRenderRoot = {
	readonly component: AnyNode;
	readonly componentName: string;
	readonly root: AnyNode;
	readonly propNames: ReadonlyArray<string>;
};
