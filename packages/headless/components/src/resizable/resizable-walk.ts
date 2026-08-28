// Every question about "which panels are mine" is answered by containment over
// the handles the family bound, never by a selector or a parent walk.

import { FULL, rounded } from './resizable-math.ts';
import type { ResizableOrientation, ResizableSizes } from './resizable-types.ts';

/** The group's geometry, read once per gesture rather than per frame. */
export type ResizableAxis = {
	readonly start: number;
	readonly size: number;
	readonly isFlipped: boolean;
};

/** Direction lives on the element, so it is read from the element rather than taken as a prop. */
export function isRightToLeft(target: HTMLElement | null | undefined): boolean {
	if (!target) return false;
	return window.getComputedStyle(target).direction === 'rtl';
}

/**
 * Captures the pointer, tolerating an id the platform is not tracking: a press
 * replayed after its handler loaded can arrive with the pointer already lifted,
 * and capturing one of those throws `NotFoundError` rather than doing nothing.
 */
export function capturePointer(target: HTMLElement, pointerId: number): void {
	try {
		target.setPointerCapture(pointerId);
	} catch (error) {
		if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error;
	}
}

export function measureGroup(
	group: HTMLElement,
	orientation: ResizableOrientation,
): ResizableAxis {
	const box = group.getBoundingClientRect();
	const isVertical = orientation === 'vertical';
	return {
		start: isVertical ? box.top : box.left,
		size: isVertical ? box.height : box.width,
		// A stacked group grows downward like the page; only right-to-left text mirrors an axis.
		isFlipped: !isVertical && isRightToLeft(group),
	};
}

/** Where a pointer landed along the axis the group runs on. */
export function alongAxis(
	clientX: number,
	clientY: number,
	orientation: ResizableOrientation,
): number {
	return orientation === 'vertical' ? clientY : clientX;
}

/**
 * The group a divider belongs to: the innermost registered panel that contains
 * it, or the widget's root when no panel does.
 */
export function groupOf(
	node: EventTarget | null,
	items: readonly HTMLElement[],
	root: HTMLElement,
): HTMLElement {
	if (node === null) return root;
	const holders = items.filter((one) => one.contains(node as Node));
	const innermost = holders.find((one) =>
		holders.every((other) => other === one || other.contains(one)),
	);
	return innermost ?? root;
}

/** The panels of one group: inside it, and inside no panel that is itself inside it. */
export function itemsIn(group: Element, items: readonly HTMLElement[]): HTMLElement[] {
	const inside = items.filter((one) => one !== group && group.contains(one));
	return inside.filter((one) => !inside.some((other) => other !== one && other.contains(one)));
}

/** The name a panel was written with, as it published it. */
export function nameOf(item: Element): string {
	return item.getAttribute('ui-value') ?? '';
}

/** The panel a divider takes from: the one after the panel it names, in render order. */
export function nextName(items: readonly HTMLElement[], name: string): string | undefined {
	const at = items.findIndex((one) => nameOf(one) === name);
	if (at < 0) return undefined;
	const behind = items[at + 1];
	if (!behind) return undefined;
	return nameOf(behind);
}

/**
 * How much of the axis the panels themselves span. The dividers between them are
 * part of the group's box and not part of anybody's share, so this — and not the
 * group's own width — is what a share of 100 is a share of. Measured with it, a
 * drag of eighty pixels moves the boundary eighty pixels.
 */
export function panelSpan(
	items: readonly HTMLElement[],
	orientation: ResizableOrientation,
): number {
	let span = 0;
	for (const item of items) {
		const box = item.getBoundingClientRect();
		span += orientation === 'vertical' ? box.height : box.width;
	}
	return span;
}

/**
 * What the browser actually laid the group's panels out at, as shares of what
 * the panels span. This is what makes a widget nobody gave sizes to draggable:
 * the first gesture starts from the equal shares CSS produced.
 */
export function measuredSizes(
	items: readonly HTMLElement[],
	orientation: ResizableOrientation,
): ResizableSizes {
	const whole = panelSpan(items, orientation);
	const measured: ResizableSizes = {};
	if (whole <= 0) return measured;

	for (const item of items) {
		const box = item.getBoundingClientRect();
		const along = orientation === 'vertical' ? box.height : box.width;
		measured[nameOf(item)] = rounded((along / whole) * FULL);
	}
	return measured;
}

/** The sizes a gesture starts from: what is declared, filled in from the layout for panels nobody sized. */
export function startingSizes(held: ResizableSizes, measured: ResizableSizes): ResizableSizes {
	const start: ResizableSizes = { ...measured };
	for (const name of Object.keys(held)) {
		const size = held[name];
		if (typeof size === 'number') start[name] = size;
	}
	return start;
}
