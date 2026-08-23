import type { PropsOf } from '@markless/core';

/**
 * The box the whole area sits in. Give it `position: relative` so a painted
 * scrollbar can sit over the viewport, and declare the scroll timeline names
 * the thumb reads here (`timeline-scope`), which is what keeps two areas on
 * one page from reading each other's scroll position.
 */
export type ScrollAreaRootProps = PropsOf<'div'>;

/**
 * The element that actually scrolls, and the only part with an accessibility
 * obligation: it is focusable, so it needs a name. Give it `aria-label`, or
 * point `aria-labelledby` at a heading. Style it `overflow: auto`, and add
 * `scrollbar-width: none` only when a painted scrollbar replaces the native
 * one.
 */
export type ScrollAreaViewportProps = PropsOf<'div'>;

export type ScrollAreaScrollbarProps = PropsOf<'div'> & {
	/** Which axis this scrollbar paints. Omit it for "vertical". */
	readonly orientation?: 'vertical' | 'horizontal';
};

/**
 * The painted thumb. Its position comes from CSS: name a scroll timeline on
 * the viewport and drive the thumb's offset from it with `animation-timeline`.
 * Dragging it is not implemented - see `note.md`.
 */
export type ScrollAreaThumbProps = PropsOf<'div'>;
