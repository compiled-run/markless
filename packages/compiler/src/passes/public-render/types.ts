import type {
	PublicRenderModuleInput,
	PublicRenderPlanAsyncBoundaryGate,
	PublicRenderPlanBranchGate,
	PublicRenderPlanRepeatGate,
} from '../../artifacts.ts';
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
	readonly repeatGates: ReadonlyArray<PublicRenderPlanRepeatGate>;
	nextRepeatIndex: number;
	readonly insideRepeatRow: boolean;
	readonly asyncBoundaries: PublicRenderModuleInput['semanticGraph']['asyncBoundaries'];
	readonly asyncBoundaryGates: ReadonlyArray<PublicRenderPlanAsyncBoundaryGate>;
	nextAsyncBoundaryIndex: number;
	// boundaryId -> the async computed the SSR render awaits inline.
	readonly asyncRunners?: ReadonlyMap<
		string,
		{ readonly graphNodeId: string; readonly name: string; readonly source: string }
	>;
	readonly asyncDependencyRegistry?: boolean;
	readonly branchSites: PublicRenderModuleInput['semanticGraph']['branchSites'];
	readonly branchReactivityGates: ReadonlyArray<PublicRenderPlanBranchGate>;
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
	// The selected root when this renderer is rooted at a component invocation.
	// Component wiring uses identity to restrict root reassignment to that node.
	readonly componentRoot?: AnyNode;
	readonly componentEdges: PublicRenderModuleInput['semanticGraph']['componentEdges'];
	readonly componentImports: ReadonlyMap<string, string>;
	readonly callbackSymbols: ReadonlyMap<string, string>;
	nextComponentEdgeIndex: number;
	// Optional because component-children emission builds a partial context;
	// repeats inside projected children keep the prior render-nothing behavior.
	readonly keyedRepeats?: PublicRenderModuleInput['semanticGraph']['keyedRepeats'];
	readonly repeatGates?: ReadonlyArray<PublicRenderPlanRepeatGate>;
	nextRepeatIndex?: number;
	readonly branchSites?: PublicRenderModuleInput['semanticGraph']['branchSites'];
	readonly branchReactivityGates?: ReadonlyArray<PublicRenderPlanBranchGate>;
	nextBranchSiteIndex?: number;
	readonly asyncBoundaries?: PublicRenderModuleInput['semanticGraph']['asyncBoundaries'];
	readonly asyncBoundaryGates?: ReadonlyArray<PublicRenderPlanAsyncBoundaryGate>;
	nextAsyncBoundaryIndex?: number;
	// Arm-render modules number child components page-aligned (symbol routes
	// key on the component-edge index); unset keeps the page-module numbering.
	nextChildIndex?: number;
	// Arm-render modules tag static in-arm hosts so the emitted module can
	// derive arm-relative locators from the rendered truth (D3). Mutable:
	// repeat-row emission unsets it — rows never carry per-instance locators.
	armHostIdByNode?: ReadonlyMap<AnyNode, string>;
	// Inside a keyed repeat row: component invocations render per row through
	// the markup-only row-child helper instead of the child composition
	// machinery (rows repeat; composed child records cannot).
	insideRepeatRow?: boolean;
	// Inside another component's children prop (CSR string emission): child
	// replacement machinery cannot reach projected placeholders, so component
	// invocations render through the markup-only projected-child splice.
	childrenMarkupOnly?: boolean;
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
	// The parsed module the root was selected from. Host ids are assigned in
	// MODULE document order (the semantic graph's id space); emitters that only
	// walk the page root would renumber from 0 and misalign every
	// hostNodeId-keyed payload record when a same-module component is declared
	// before the page.
	readonly moduleAst?: AnyNode;
};
