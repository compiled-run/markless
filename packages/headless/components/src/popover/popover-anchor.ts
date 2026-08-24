/**
 * Placing the surface against the trigger.
 *
 * The placement is a CSS anchor: the trigger carries the anchor name, the
 * surface points at it, and the browser resolves the geometry. Nothing measures
 * a box, so a surface that arrives already showing is placed on its first
 * layout, with no script and no interaction.
 */

import type { PopoverSide } from './popover-types.ts';

// One name for every popover; `anchor-scope` on each root confines it to that root's subtree, so a surface only ever finds its own trigger. popover.tsrx spells the name out again because the compiler will not read an imported value for `style`.
const ANCHOR = '--ui-popover';

/** Set on the surface: where it sits against the trigger, for one side. */
export function surfaceAnchorStyle(side: PopoverSide): string {
	return `position: absolute; position-anchor: ${ANCHOR}; position-area: ${areaOf(side)};`;
}

// `self-inline-*` reads the surface's own writing direction; plain `inline-*` reads the containing block's, which for a surface taken out of flow is usually the document's and so never flips.
function areaOf(side: PopoverSide): string {
	if (side === 'top') return 'top span-right';
	if (side === 'start') return 'span-self-block-end self-inline-start';
	if (side === 'end') return 'span-self-block-end self-inline-end';
	return 'bottom span-right';
}
