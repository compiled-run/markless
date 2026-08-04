import type { ProtocolViewPayload } from '@markless/serializer';
import type { ResumeDomElement } from './resume.ts';
import type { RenderTarget } from './render.ts';

// The holder wraps a fragment-rooted page for a held route swap. It stays in
// the page as the container root, so it must be layout-transparent
// (display: contents) — the page's own top-level elements keep their layout.
export function createFragmentHolder(target: RenderTarget): ResumeDomElement | undefined {
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

export function offsetElementLocators(
	view: ProtocolViewPayload,
	offset: number,
): ProtocolViewPayload {
	return {
		...view,
		locators: view.locators.map((locator) => ({
			...locator,
			index: locator.index + offset,
		})),
	};
}
