import type { CropAxis, CropRect } from './crop-types.ts';

/** How much bigger a shifted arrow and a Ctrl/Cmd arrow are than one step. */
export const SHIFT_STEP = 10;
export const MODIFIER_STEP = 50;

/** The area's geometry, read once per gesture rather than per frame. */
export type CropAreaBox = {
	readonly originInline: number;
	readonly originBlock: number;
	readonly inlineSize: number;
	readonly blockSize: number;
	readonly inlineSign: number;
};

export function clamp(value: number, low: number, high: number): number {
	if (!(high > low)) return low;
	if (value < low) return low;
	if (value > high) return high;
	return value;
}

/**
 * The area in the units the rectangle speaks. Direction lives on the element, so
 * it is read from the element rather than taken as a prop, and a right-to-left
 * area runs its inline axis from the box's right edge inward.
 */
export function measureArea(area: HTMLElement): CropAreaBox {
	const box = area.getBoundingClientRect();
	const isRtl = window.getComputedStyle(area).direction === 'rtl';
	return {
		originInline: isRtl ? box.right : box.left,
		originBlock: box.top,
		inlineSize: box.width,
		blockSize: box.height,
		inlineSign: isRtl ? -1 : 1,
	};
}

/** Where a pointer landed, in area units on the inline axis. */
export function inlineAt(clientX: number, origin: number, sign: number): number {
	return (clientX - origin) * sign;
}

/** The rectangle in force: the controlled one, then the family's own, then the seed. */
export function heldRect(
	given: CropRect | undefined,
	own: CropRect | undefined,
	seed: CropRect | undefined,
	minWidth: number,
	minHeight: number,
): CropRect {
	if (given !== undefined) return given;
	if (own !== undefined) return own;
	if (seed !== undefined) return seed;
	return { x: 0, y: 0, width: minWidth, height: minHeight };
}

/** The widest a rectangle may be on one axis: the declared cap, never past the area. */
function sizeCeiling(areaSize: number, cap: number): number {
	if (areaSize > 0 && areaSize < cap) return areaSize;
	return cap;
}

/** The furthest a rectangle of this size may start on one axis. */
function originCeiling(areaSize: number, size: number): number {
	if (areaSize > 0) return Math.max(0, areaSize - size);
	return Number.POSITIVE_INFINITY;
}

/** Width and height fitted to the ratio, each still inside its own bounds. */
function fittedSize(
	width: number,
	height: number,
	aspect: number,
	lowWidth: number,
	highWidth: number,
	lowHeight: number,
	highHeight: number,
	widthDrives: boolean,
): { readonly width: number; readonly height: number } {
	if (widthDrives) {
		const wanted = clamp(width / aspect, lowHeight, highHeight);
		return { width: clamp(wanted * aspect, lowWidth, highWidth), height: wanted };
	}
	const wanted = clamp(height * aspect, lowWidth, highWidth);
	return { width: wanted, height: clamp(wanted / aspect, lowHeight, highHeight) };
}

/** A rectangle cut down to the size limits, the ratio and the area, in that order. */
export function boundedRect(
	rect: CropRect,
	areaInline: number,
	areaBlock: number,
	minWidth: number,
	minHeight: number,
	maxWidth: number,
	maxHeight: number,
	aspect: number | undefined,
): CropRect {
	const highWidth = sizeCeiling(areaInline, maxWidth);
	const highHeight = sizeCeiling(areaBlock, maxHeight);
	let width = clamp(rect.width, minWidth, highWidth);
	let height = clamp(rect.height, minHeight, highHeight);

	if (aspect !== undefined && aspect > 0) {
		const fitted = fittedSize(
			width,
			height,
			aspect,
			minWidth,
			highWidth,
			minHeight,
			highHeight,
			true,
		);
		width = fitted.width;
		height = fitted.height;
	}

	return {
		x: clamp(rect.x, 0, originCeiling(areaInline, width)),
		y: clamp(rect.y, 0, originCeiling(areaBlock, height)),
		width,
		height,
	};
}

/** The same rectangle, moved and kept inside the area. Its size never changes. */
export function movedRect(
	rect: CropRect,
	deltaInline: number,
	deltaBlock: number,
	areaInline: number,
	areaBlock: number,
): CropRect {
	return {
		x: clamp(rect.x + deltaInline, 0, originCeiling(areaInline, rect.width)),
		y: clamp(rect.y + deltaBlock, 0, originCeiling(areaBlock, rect.height)),
		width: rect.width,
		height: rect.height,
	};
}

/** One axis of a resize: the moved edges, anchored on whichever one stayed put. */
function resizedAxis(
	start: number,
	size: number,
	movesStart: boolean,
	movesEnd: boolean,
	delta: number,
	areaSize: number,
	low: number,
	high: number,
): { readonly start: number; readonly size: number } {
	const edge = areaSize > 0 ? areaSize : Number.POSITIVE_INFINITY;
	const from = movesStart ? clamp(start + delta, 0, edge) : start;
	const to = movesEnd ? clamp(start + size + delta, 0, edge) : start + size;
	const wanted = clamp(to - from, low, sizeCeiling(areaSize, high));
	// The edge that did not move is what the size grows away from.
	if (movesStart && !movesEnd) return { start: clamp(to - wanted, 0, edge), size: wanted };
	return { start: from, size: wanted };
}

/**
 * The rectangle a resize produces. `deltaInline` and `deltaBlock` are the whole
 * gesture's travel from where it was grabbed, not the last frame's, so a drag
 * that leaves the area and comes back lands where the pointer is.
 */
export function resizedRect(
	rect: CropRect,
	inlineStart: boolean,
	inlineEnd: boolean,
	blockStart: boolean,
	blockEnd: boolean,
	deltaInline: number,
	deltaBlock: number,
	areaInline: number,
	areaBlock: number,
	minWidth: number,
	minHeight: number,
	maxWidth: number,
	maxHeight: number,
	aspect: number | undefined,
): CropRect {
	const inline = resizedAxis(
		rect.x,
		rect.width,
		inlineStart,
		inlineEnd,
		deltaInline,
		areaInline,
		minWidth,
		maxWidth,
	);
	const block = resizedAxis(
		rect.y,
		rect.height,
		blockStart,
		blockEnd,
		deltaBlock,
		areaBlock,
		minHeight,
		maxHeight,
	);

	if (aspect === undefined || !(aspect > 0)) {
		return { x: inline.start, y: block.start, width: inline.size, height: block.size };
	}

	// A handle that owns an inline edge drives the ratio from the width; a
	// block-only handle drives it from the height.
	const fitted = fittedSize(
		inline.size,
		block.size,
		aspect,
		minWidth,
		sizeCeiling(areaInline, maxWidth),
		minHeight,
		sizeCeiling(areaBlock, maxHeight),
		inlineStart || inlineEnd,
	);
	const x = inlineStart && !inlineEnd ? inline.start + inline.size - fitted.width : inline.start;
	const y = blockStart && !blockEnd ? block.start + block.size - fitted.height : block.start;
	return {
		x: clamp(x, 0, originCeiling(areaInline, fitted.width)),
		y: clamp(y, 0, originCeiling(areaBlock, fitted.height)),
		width: fitted.width,
		height: fitted.height,
	};
}

export function sameRect(one: CropRect, two: CropRect): boolean {
	return (
		one.x === two.x && one.y === two.y && one.width === two.width && one.height === two.height
	);
}

/** How far one keystroke moves, with the two fixed multipliers applied. */
export function keyStep(isShift: boolean, isModifier: boolean, step: number): number {
	if (isModifier) return step * MODIFIER_STEP;
	if (isShift) return step * SHIFT_STEP;
	return step;
}

export function keyInlineDelta(key: string, size: number): number {
	if (key === 'ArrowLeft') return -size;
	if (key === 'ArrowRight') return size;
	return 0;
}

export function keyBlockDelta(key: string, size: number): number {
	if (key === 'ArrowUp') return -size;
	if (key === 'ArrowDown') return size;
	return 0;
}

/** Which axis a key works on, or null when it is not one of ours. */
export function keyAxisOf(key: string): CropAxis | null {
	if (key === 'ArrowLeft' || key === 'ArrowRight') return 'inline';
	if (key === 'ArrowUp' || key === 'ArrowDown') return 'block';
	return null;
}

export function isCropKey(key: string): boolean {
	if (keyAxisOf(key) !== null) return true;
	return key === 'Home' || key === 'End';
}

/** Where Home and End send the whole rectangle on one axis. */
export function endStopRect(
	rect: CropRect,
	key: string,
	axis: CropAxis,
	areaInline: number,
	areaBlock: number,
): CropRect {
	const toStart = key === 'Home';
	if (axis === 'inline') {
		const x = toStart ? 0 : originCeiling(areaInline, rect.width);
		if (!Number.isFinite(x)) return rect;
		return { x, y: rect.y, width: rect.width, height: rect.height };
	}
	const y = toStart ? 0 : originCeiling(areaBlock, rect.height);
	if (!Number.isFinite(y)) return rect;
	return { x: rect.x, y, width: rect.width, height: rect.height };
}

/** How far Home or End has to push an edge to reach the area's own bound. */
export function endStopDelta(
	rect: CropRect,
	key: string,
	inlineStart: boolean,
	inlineEnd: boolean,
	blockStart: boolean,
	blockEnd: boolean,
	areaInline: number,
	areaBlock: number,
): { readonly inline: number; readonly block: number } {
	const toStart = key === 'Home';
	let inline = 0;
	let block = 0;
	if (inlineStart) inline = toStart ? -rect.x : areaInline - rect.x;
	if (inlineEnd) inline = toStart ? -(rect.x + rect.width) : areaInline - (rect.x + rect.width);
	if (blockStart) block = toStart ? -rect.y : areaBlock - rect.y;
	if (blockEnd) block = toStart ? -(rect.y + rect.height) : areaBlock - (rect.y + rect.height);
	return { inline, block };
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}

/** The rectangle as a reader hears it: position first, then size. */
export function rectText(rect: CropRect): string {
	return `${round(rect.x)}, ${round(rect.y)}, ${round(rect.width)}×${round(rect.height)}`;
}

/** The rectangle as a form carries it. */
export function fieldText(rect: CropRect): string {
	return `${round(rect.x)},${round(rect.y)},${round(rect.width)},${round(rect.height)}`;
}

/** Where the rectangle is painted, and how big, for the consumer's own CSS. */
export function selectionStyleText(rect: CropRect, fixed: boolean): string {
	const x = fixed ? 0 : round(rect.x);
	const y = fixed ? 0 : round(rect.y);
	return `--x: ${x}px; --y: ${y}px; --width: ${round(rect.width)}px; --height: ${round(rect.height)}px`;
}

/** How far the content has travelled under a fixed rectangle. Zero when it has not. */
export function areaStyleText(rect: CropRect, fixed: boolean): string {
	const x = fixed ? -round(rect.x) : 0;
	const y = fixed ? -round(rect.y) : 0;
	return `--pan-x: ${x}px; --pan-y: ${y}px`;
}

export function ownsInline(inlineStart: boolean, inlineEnd: boolean): boolean {
	return inlineStart || inlineEnd;
}

export function ownsBlock(blockStart: boolean, blockEnd: boolean): boolean {
	return blockStart || blockEnd;
}

/** The coordinate a handle reports. A corner reports its inline edge. */
export function edgeValue(
	rect: CropRect,
	inlineStart: boolean,
	inlineEnd: boolean,
	blockStart: boolean,
	blockEnd: boolean,
): number {
	if (inlineStart) return round(rect.x);
	if (inlineEnd) return round(rect.x + rect.width);
	if (blockStart) return round(rect.y);
	if (blockEnd) return round(rect.y + rect.height);
	return round(rect.x);
}

/**
 * The top of a handle's range. The area's own size once it has been measured;
 * until then the rectangle's far edge on that axis, which is a true lower bound
 * on the area and is replaced by the real one on the first focus or press.
 */
export function edgeMax(
	rect: CropRect,
	isInline: boolean,
	areaInline: number,
	areaBlock: number,
): number {
	if (isInline) {
		if (areaInline > 0) return round(areaInline);
		return round(rect.x + rect.width);
	}
	if (areaBlock > 0) return round(areaBlock);
	return round(rect.y + rect.height);
}

/** A corner owns two coordinates and ARIA gives a slider one, so it speaks both. */
export function edgeValueText(
	rect: CropRect,
	inlineStart: boolean,
	inlineEnd: boolean,
	blockStart: boolean,
	blockEnd: boolean,
): string | undefined {
	if (!ownsInline(inlineStart, inlineEnd)) return undefined;
	if (!ownsBlock(blockStart, blockEnd)) return undefined;
	const x = inlineStart ? rect.x : rect.x + rect.width;
	const y = blockStart ? rect.y : rect.y + rect.height;
	return `${round(x)}, ${round(y)}`;
}

/** The axis a handle's edge runs against. A corner runs against both, so it names neither. */
export function edgeOrientation(
	inlineStart: boolean,
	inlineEnd: boolean,
	blockStart: boolean,
	blockEnd: boolean,
): string | undefined {
	const inline = ownsInline(inlineStart, inlineEnd);
	const block = ownsBlock(blockStart, blockEnd);
	if (inline && block) return undefined;
	if (inline) return 'horizontal';
	if (block) return 'vertical';
	return undefined;
}

/** What a reader calls each handle, unless the consumer names it themselves. */
export function edgeName(
	inlineStart: boolean,
	inlineEnd: boolean,
	blockStart: boolean,
	blockEnd: boolean,
): string {
	const inline = inlineStart ? 'start' : inlineEnd ? 'end' : '';
	const block = blockStart ? 'Top' : blockEnd ? 'Bottom' : '';
	if (inline !== '' && block !== '') return `${block} ${inline} corner`;
	if (block !== '') return `${block} edge`;
	if (inlineStart) return 'Start edge';
	if (inlineEnd) return 'End edge';
	return 'Edge';
}

/**
 * Whether a node the platform handed over sits inside one of the elements the
 * family bound. It asks a question about a node it was given; it never finds one.
 */
export function isInsideAny(node: EventTarget | null, elements: readonly Element[]): boolean {
	if (node === null) return false;
	for (const element of elements) {
		if (element.contains(node as Node)) return true;
	}
	return false;
}
