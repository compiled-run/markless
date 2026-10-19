import { PROTOCOL_CONTAINER_HOST_NODE_ID } from '../../serializer/src/protocol-page-markers.ts';
import type { ResumeDomElement } from './resume.ts';
import type { CsrRenderOutput, RenderTarget } from './render.ts';

// The holder wraps a fragment-rooted page for a held route swap. It stays in
// the page as the container root, so it must be layout-transparent
// (display: contents) — the page's own top-level elements keep their layout.
export function createFragmentHolder(target: RenderTarget): ResumeDomElement | undefined {
	// A target whose own element becomes the root (the router's <body>) hands over that element.
	const own = (target as { readonly createHolder?: () => unknown }).createHolder?.();
	if (own) return own as ResumeDomElement;
	const documentHost =
		(target as { readonly ownerDocument?: unknown }).ownerDocument ??
		(globalThis as { readonly document?: unknown }).document;
	const createElement = (
		documentHost as { readonly createElement?: (tagName: string) => unknown } | undefined
	)?.createElement;
	if (typeof createElement !== 'function') return undefined;
	const holder = createElement.call(documentHost, 'div') as ResumeDomElement & {
		readonly setAttribute?: (name: string, value: string) => void;
	};
	holder.setAttribute?.('style', 'display: contents');
	holder.setAttribute?.('data-markless-route-holder', '');
	return holder;
}

// The container joins the locator walk at index 0 and parents top-level rows.
export function fragmentOutput(output: CsrRenderOutput, root: ResumeDomElement): CsrRenderOutput {
	const { view, liveHostNodes } = output;
	return {
		...output,
		root,
		view: view && {
			...view,
			locators: view.locators.map((locator) => ({ ...locator, index: locator.index + 1 })),
		},
		liveHostNodes:
			liveHostNodes && new Map(liveHostNodes).set(PROTOCOL_CONTAINER_HOST_NODE_ID, root),
	};
}
