/**
 * Placing the surface against the trigger.
 *
 * The measurement is retried per frame rather than taken on the call: the
 * surface is still `hidden` when the opening handler runs, and a hidden element
 * has no box to measure. The retry gives up rather than spinning.
 *
 * Positions are written to the element directly, not through a rendered style
 * string, because they are read back from the same two boxes that produced them
 * - a value the graph would have to re-render to learn.
 */

import type { PopoverSide } from './popover-types.ts';

const TRIES = 12;

export function anchorSurface(
	trigger: HTMLElement | undefined,
	content: HTMLElement | undefined,
	side: PopoverSide,
): void {
	if (!trigger || !content) return;

	let tries = TRIES;
	const step = () => {
		tries = tries - 1;
		if (content.hidden !== true) return place(trigger, content, side);
		if (tries > 0) requestAnimationFrame(step);
	};
	requestAnimationFrame(step);
}

function place(trigger: HTMLElement, content: HTMLElement, side: PopoverSide): void {
	// Positioned before either box is read: taking the surface out of flow moves
	// whatever was laid out around it, and measuring first anchors to a page that
	// no longer exists by the time the offsets land.
	content.style.position = 'absolute';
	const anchor = trigger.getBoundingClientRect();
	const surface = content.getBoundingClientRect();
	const isRtl = getComputedStyle(content).direction === 'rtl';

	content.style.left = `${window.scrollX + inlineOf(anchor, surface, side, isRtl)}px`;
	content.style.top = `${window.scrollY + blockOf(anchor, surface, side)}px`;
}

function inlineOf(anchor: DOMRect, surface: DOMRect, side: PopoverSide, isRtl: boolean): number {
	if (side === 'top' || side === 'bottom') return anchor.left;
	// `start` is the left side only in a left-to-right page, and the flip is the
	// whole reason the two sides are named this way rather than left and right.
	const isBefore = (side === 'start') !== isRtl;
	return isBefore ? anchor.left - surface.width : anchor.right;
}

function blockOf(anchor: DOMRect, surface: DOMRect, side: PopoverSide): number {
	if (side === 'bottom') return anchor.bottom;
	if (side === 'top') return anchor.top - surface.height;
	return anchor.top;
}
