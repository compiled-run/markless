/**
 * Placing the surface.
 *
 * A menu opened from its trigger is a CSS anchor: the trigger carries the anchor
 * name, the surface points at it, and the browser resolves the geometry, so a
 * surface that arrives already showing is placed on its first layout with no
 * script. A menu opened from `menu.contextarea` is placed at the point instead,
 * because there is no element to anchor to.
 *
 * Nothing here measures a box, which is also this family's one real placement
 * limit: a context menu asked for near the bottom right corner overflows rather
 * than flipping. The anchored path can be given `position-try-fallbacks` from a
 * consumer's stylesheet; the point path cannot.
 */

import type { MenuPoint, MenuSide } from './menu-types.ts';

// One name for every menu; `anchor-scope` on each root confines it to that root's subtree, so a surface only ever finds its own trigger. menu.tsrx spells the name out again because the compiler will not read an imported value for `style`.
const ANCHOR = '--ui-menu';

/** Set on the surface: where it sits, from the point if there is one and against the trigger otherwise. */
export function surfaceStyle(side: MenuSide, point: MenuPoint | null): string {
	if (point !== null) return `position: fixed; left: ${point.x}px; top: ${point.y}px;`;
	return `position: absolute; position-anchor: ${ANCHOR}; position-area: ${areaOf(side)};`;
}

// `self-inline-*` reads the surface's own writing direction; plain `inline-*` reads the containing block's, which for a surface taken out of flow is usually the document's and so never flips.
function areaOf(side: MenuSide): string {
	if (side === 'top') return 'top span-right';
	if (side === 'start') return 'span-self-block-end self-inline-start';
	if (side === 'end') return 'span-self-block-end self-inline-end';
	return 'bottom span-right';
}
