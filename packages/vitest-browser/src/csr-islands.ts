import type { CsrRenderArtifact, CsrRenderOutput, RenderTarget, ResumeDomElement } from '@markless/web';
// The production island merge itself, reached by path for the reason
// ssr-plugin.ts reaches it: @markless/router is not a dependency of this
// test-only package, and emulating the merge here would make every CSR pin a
// statement about the harness instead of the router.
import {
	composeMdxState,
	composeMdxView,
	loadMdxSymbol,
	type MdxChild,
	type MdxRoutePart,
} from '../../router/src/vite/runtime/mdx-route.ts';
import { protocolIslandSegment } from '../../serializer/src/protocol-constants.ts';
// The client render a compiled artifact with a canonical renderData surface
// takes under @markless/web render(). Not on that package's entry, so reached by
// path the same way.
import { renderCanonicalClientOutput } from '../../web/src/render-canonical.ts';

/**
 * A compiled `.tsrx` artifact mounted as one island of a composed client page.
 * The browser build of a scenario module publishes a canonical `renderData`
 * surface plus its own `loadSymbol`, which is what the client render below
 * reads — but a component's own type is the signature the type service derives
 * for it, so both are accepted and narrowed at the runtime boundary, exactly as
 * the harness's render() does.
 */
export type CsrIslandComponent = CsrRenderArtifact | (() => unknown);

export type ComposedCsrIslands = {
	/** The merged mount @markless/web render() starts one runtime over. */
	readonly output: CsrRenderOutput;
	readonly state: CsrRenderOutput['state'];
	readonly view: CsrRenderOutput['view'];
};

/**
 * Client-side island composition: N scenario roots rendered in the BROWSER
 * through the real canonical client render, then merged through the ROUTER's
 * composeMdxState / composeMdxView under `m<n>:` island segments, with symbol
 * loading routed through loadMdxSymbol's CHILD branch (each island answers from
 * the live output it just rendered, not from a `?markless-symbols` re-import).
 *
 * This is client-side composition of a composed page, not emulated SPA
 * navigation: nothing here re-enters the router's navigation intercept. What it
 * does exercise end to end is the half a served page never touches — the merged
 * payload being built in the browser and one runtime starting over it.
 */
export async function composeCsrIslands(
	components: ReadonlyArray<CsrIslandComponent>,
	ownerDocument: Document,
): Promise<ComposedCsrIslands> {
	if (components.length === 0) {
		throw new Error('renderCsrIslands([...]): at least one island component is required.');
	}

	// The same holder the composed MDX route's own static markup roots at, so the
	// merged payload describes the page shape the router would have produced.
	const root = ownerDocument.createElement('main');
	root.setAttribute('data-markless-mdx-root', '');

	const children: MdxChild[] = [];
	const liveHostNodes = new Map<string, ResumeDomElement>();
	for (const [componentIndex, component] of components.entries()) {
		const segment = protocolIslandSegment(componentIndex);
		const output = await renderCanonicalClientOutput(
			component as CsrRenderArtifact,
			root as unknown as RenderTarget,
		);
		children.push({
			componentIndex,
			hostPrefix: segment,
			symbolPrefix: segment,
			output: output as unknown as MdxChild['output'],
		});
		for (const [hostNodeId, element] of output.liveHostNodes ?? []) {
			liveHostNodes.set(segment + hostNodeId, element);
		}
		root.appendChild(output.root as unknown as Node);
	}

	// A page whose parts are nothing but its component children, in mount order —
	// which is what fixes each island's element offset in composeMdxView.
	const parts: MdxRoutePart[] = components.map((_, componentIndex) => ({
		kind: 'component',
		componentIndex,
	}));
	const state = composeMdxState(children) as unknown as CsrRenderOutput['state'];
	// The holder joins the dom-order walk the element census takes over the
	// runtime root, so every child locator sits one element further along.
	const view = composeMdxView(parts, children, 1) as unknown as CsrRenderOutput['view'];

	return {
		output: {
			root: root as unknown as ResumeDomElement,
			state,
			view,
			liveHostNodes,
			// The child branch: `children` carry live outputs, so an `m<n>:` symbol
			// resolves off the island that rendered it.
			loadSymbol: ((symbolId: string) =>
				loadMdxSymbol(symbolId, children, [])) as CsrRenderOutput['loadSymbol'],
		},
		state,
		view,
	};
}
