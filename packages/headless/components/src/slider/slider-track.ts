import type { SliderOrientation } from './slider-types.ts';

/** The rail's geometry, read once per gesture rather than per frame. */
export type SliderAxis = {
	readonly start: number;
	readonly size: number;
	readonly isFlipped: boolean;
};

/** Direction lives on the element, so it is read from the element rather than taken as a prop. */
export function isRightToLeft(track: HTMLElement | null | undefined): boolean {
	if (!track) return false;
	return window.getComputedStyle(track).direction === 'rtl';
}

export function measureTrack(track: HTMLElement, orientation: SliderOrientation): SliderAxis {
	const box = track.getBoundingClientRect();
	const isVertical = orientation === 'vertical';
	return {
		start: isVertical ? box.top : box.left,
		size: isVertical ? box.height : box.width,
		// The low value sits at the bottom of a vertical rail and at the right edge in right-to-left text.
		isFlipped: isVertical || isRightToLeft(track),
	};
}
