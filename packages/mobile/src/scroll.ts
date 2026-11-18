// What scrollIntoView() and focus() do to the scroll offsets of an element's scrolling ancestors, as Chrome does it
// (CSSOM View "scroll a target into view"); both hosts implement this same function and reproduce scroll/*.json.
export const NATIVE_SCROLL_VECTORS_VERSION = 'markless.native-scroll/0';

export type ScrollRect = {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
};

/** An offset range in CSS scroll-offset terms: 0 is the start position, and the user scrolls between min and max. */
export type ScrollRange = {
	readonly minX: number;
	readonly maxX: number;
	readonly minY: number;
	readonly maxY: number;
};

/**
 * One scrolling box. `port` is its scrollport at offset 0, in the content coordinates of the box around it (screen
 * coordinates for the page); its content's coordinates start at the port's top-left when the offset is 0.
 */
export type ScrollBox = {
	readonly port: ScrollRect;
	readonly offset: { readonly x: number; readonly y: number };
	readonly range: ScrollRange;
};

/**
 * `start`, `center`, `end` and `nearest` are scrollIntoView's; `if-needed` is what Chrome's focus() uses: no scroll when
 * the element is fully shown, its closest edge when it is partly shown, centred when it is hidden.
 */
export type ScrollAlign = 'start' | 'center' | 'end' | 'nearest' | 'if-needed';

/** scrollIntoView() with no options. */
export const SCROLL_INTO_VIEW = { block: 'start', inline: 'nearest' } as const;
/** focus() without preventScroll. */
export const FOCUS_INTO_VIEW = { block: 'if-needed', inline: 'if-needed' } as const;

function axis(
	offset: number,
	start: number,
	size: number,
	port: number,
	align: ScrollAlign,
): number {
	const shownStart = start - offset;
	const shownEnd = shownStart + size;
	const toStart = offset + shownStart;
	const toEnd = offset + shownEnd - port;
	const toCenter = offset + shownStart + size / 2 - port / 2;
	if (align === 'start') return toStart;
	if (align === 'end') return toEnd;
	if (align === 'center') return toCenter;
	const fullyShown = shownStart >= 0 && shownEnd <= port;
	if (align === 'if-needed') {
		if (fullyShown) return offset;
		if (shownEnd <= 0 || shownStart >= port) return toCenter;
	}
	// CSSOM View "nearest": an element that covers the port, or fits inside it, stays.
	if ((shownStart <= 0 && shownEnd >= port) || fullyShown) return offset;
	if (shownStart < 0 === size <= port) return toStart;
	return toEnd;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * The offsets of `chain` (innermost box first, the page last) after bringing `target`, a rect in the innermost box's
 * content coordinates, into view. Each box scrolls in turn, and the next one sees the element where the previous scroll left it.
 */
export function scrollIntoView(
	chain: readonly ScrollBox[],
	target: ScrollRect,
	align: { readonly block: ScrollAlign; readonly inline: ScrollAlign },
): Array<{ readonly x: number; readonly y: number }> {
	let rect = target;
	return chain.map((box) => {
		const x = clamp(
			axis(box.offset.x, rect.x, rect.width, box.port.width, align.inline),
			box.range.minX,
			box.range.maxX,
		);
		const y = clamp(
			axis(box.offset.y, rect.y, rect.height, box.port.height, align.block),
			box.range.minY,
			box.range.maxY,
		);
		rect = {
			x: box.port.x + rect.x - x,
			y: box.port.y + rect.y - y,
			width: rect.width,
			height: rect.height,
		};
		return { x, y };
	});
}

export type ScrollVectorCase = {
	readonly name: string;
	readonly chain: readonly ScrollBox[];
	readonly target: ScrollRect;
	readonly align: { readonly block: ScrollAlign; readonly inline: ScrollAlign };
};

export type ScrollVectors = {
	readonly version: typeof NATIVE_SCROLL_VECTORS_VERSION;
	readonly cases: ReadonlyArray<
		ScrollVectorCase & {
			readonly offsets: ReadonlyArray<{ readonly x: number; readonly y: number }>;
		}
	>;
};

export function scrollVectors(cases: readonly ScrollVectorCase[]): ScrollVectors {
	return {
		version: NATIVE_SCROLL_VECTORS_VERSION,
		cases: cases.map((c) => ({ ...c, offsets: scrollIntoView(c.chain, c.target, c.align) })),
	};
}
