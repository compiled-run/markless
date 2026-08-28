/**
 * Every computation `ink` does: the outline of one freehand stroke, the SVG path
 * data it becomes, and the document/raster conversions the state's methods hand
 * back. The family's `.tsrx` holds markup and gesture wiring and nothing else.
 *
 * The outline is a port of perfect-freehand (Steve Ruiz, MIT) —
 * https://github.com/steveruizok/perfect-freehand — specifically
 * `getStrokePoints`, `getStrokeOutlinePoints` and `getSvgPathFromStroke`. It is
 * ported rather than installed because this unit adds no dependency; what it
 * leaves out (start/end tapering, custom easing, flat caps, the `last` flag) is
 * listed in the family's note.
 */

/** One sample off the pointer, in coordinates local to the drawing area. */
export type InkPoint = {
	readonly x: number;
	readonly y: number;
	/** 0–1 as the device reported it; 0 when it reports none. */
	readonly pressure: number;
};

export type StrokeOptions = {
	/** Stroke width in px at full pressure. */
	readonly size: number;
	/** 0 keeps one width the whole way; 1 makes the width entirely pressure. */
	readonly thinning: number;
	/** How far apart two outline points must be before the second is kept. */
	readonly smoothing: number;
	/** 0 follows the raw pointer exactly; 1 lags a long way behind it. */
	readonly streamline: number;
	/** Derive pressure from how fast the pointer moved, for devices that report none. */
	readonly simulatePressure: boolean;
};

/** A point of the finished outline. */
export type Vec = readonly [number, number];

type SpacedPoint = {
	readonly point: Vec;
	readonly pressure: number;
	readonly vector: Vec;
	readonly distance: number;
	readonly runningLength: number;
};

const RATE_OF_PRESSURE_CHANGE = 0.275;
// Rotating a cap by exactly PI lands both ends on the same point and the join vanishes.
const FIXED_PI = Math.PI + 0.0001;
const CAP_STEP = 0.1;
const CORNER_STEP = 0.25;

const THINNING = 0.5;
const SMOOTHING = 0.5;
const STREAMLINE = 0.5;

function add(a: Vec, b: Vec): Vec {
	return [a[0] + b[0], a[1] + b[1]];
}

function sub(a: Vec, b: Vec): Vec {
	return [a[0] - b[0], a[1] - b[1]];
}

function mul(a: Vec, n: number): Vec {
	return [a[0] * n, a[1] * n];
}

function neg(a: Vec): Vec {
	return [-a[0], -a[1]];
}

/** The vector turned a quarter turn, which is the direction the outline offsets along. */
function per(a: Vec): Vec {
	return [a[1], -a[0]];
}

function dot(a: Vec, b: Vec): number {
	return a[0] * b[0] + a[1] * b[1];
}

function dist2(a: Vec, b: Vec): number {
	return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
}

function dist(a: Vec, b: Vec): number {
	return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function uni(a: Vec): Vec {
	const length = Math.hypot(a[0], a[1]);
	return length === 0 ? [0, 0] : [a[0] / length, a[1] / length];
}

function lrp(a: Vec, b: Vec, t: number): Vec {
	return add(a, mul(sub(b, a), t));
}

function rotate(a: Vec, centre: Vec, radians: number): Vec {
	const sine = Math.sin(radians);
	const cosine = Math.cos(radians);
	const px = a[0] - centre[0];
	const py = a[1] - centre[1];
	return [px * cosine - py * sine + centre[0], px * sine + py * cosine + centre[1]];
}

function project(a: Vec, direction: Vec, distance: number): Vec {
	return add(a, mul(direction, distance));
}

function strokeRadius(size: number, thinning: number, pressure: number): number {
	return size * (0.5 - thinning * (0.5 - pressure));
}

/**
 * The raw samples, streamlined and measured: each kept point carries the
 * direction it arrived from, how far it moved, and the length of the stroke so
 * far. A one-sample stroke is given a second point a pixel away so a tap still
 * has a direction to build a dot around.
 */
function spacedPoints(raw: readonly InkPoint[], streamline: number): SpacedPoint[] {
	if (raw.length === 0) return [];
	const t = 0.15 + (1 - streamline) * 0.85;
	const samples =
		raw.length === 1
			? [raw[0], { x: raw[0].x + 1, y: raw[0].y + 1, pressure: raw[0].pressure }]
			: raw;

	let previous: Vec = [samples[0].x, samples[0].y];
	let runningLength = 0;
	const spaced: SpacedPoint[] = [
		{
			point: previous,
			pressure: samples[0].pressure > 0 ? samples[0].pressure : 0.25,
			vector: [1, 1],
			distance: 0,
			runningLength: 0,
		},
	];

	for (let index = 1; index < samples.length; index++) {
		const target: Vec = [samples[index].x, samples[index].y];
		const point = index === samples.length - 1 ? target : lrp(previous, target, t);
		if (point[0] === previous[0] && point[1] === previous[1]) continue;

		const moved = dist(point, previous);
		runningLength += moved;
		spaced.push({
			point,
			pressure: samples[index].pressure > 0 ? samples[index].pressure : 0.5,
			vector: uni(sub(previous, point)),
			distance: moved,
			runningLength,
		});
		previous = point;
	}

	if (spaced.length > 1) spaced[0] = { ...spaced[0], vector: spaced[1].vector };
	return spaced;
}

function firstPressure(points: readonly SpacedPoint[]): number {
	let held = points[0].pressure;
	for (let index = 1; index < Math.min(10, points.length); index++) {
		held = (held + points[index].pressure) / 2;
	}
	return held;
}

/** The closed polygon around one stroke, walked up the left side and back down the right. */
export function strokeOutline(raw: readonly InkPoint[], options: StrokeOptions): Vec[] {
	const points = spacedPoints(raw, options.streamline);
	if (points.length === 0) return [];

	const size = options.size;
	const thinning = options.thinning;
	const totalLength = points[points.length - 1].runningLength;
	const minDistance = (size * options.smoothing) ** 2;
	const left: Vec[] = [];
	const right: Vec[] = [];

	let heldPressure = firstPressure(points);
	let radius = strokeRadius(size, thinning, points[points.length - 1].pressure);
	let heldVector = points[0].vector;
	let leftLast = points[0].point;
	let rightLast = leftLast;
	let leftNext = leftLast;
	let rightNext = rightLast;
	let sharpBefore = false;

	for (let index = 0; index < points.length; index++) {
		const point = points[index].point;
		const vector = points[index].vector;
		const distance = points[index].distance;
		const runningLength = points[index].runningLength;
		let pressure = points[index].pressure;

		// The last few points of a stroke wobble as the pointer lifts; the cap is
		// drawn from the ones before them instead.
		if (index < points.length - 1 && totalLength - runningLength < 3) continue;

		if (thinning !== 0) {
			if (options.simulatePressure) {
				const speed = Math.min(1, distance / size);
				const slow = Math.min(1, 1 - speed);
				pressure = Math.min(
					1,
					heldPressure + (slow - heldPressure) * Math.min(1, speed * RATE_OF_PRESSURE_CHANGE),
				);
			}
			radius = strokeRadius(size, thinning, pressure);
		} else {
			radius = size / 2;
		}

		const nextVector = (index < points.length - 1 ? points[index + 1] : points[index]).vector;
		const nextDot = index < points.length - 1 ? dot(vector, nextVector) : 1;
		const heldDot = dot(vector, heldVector);
		const sharpHere = heldDot < 0 && !sharpBefore;
		const sharpNext = nextDot < 0;

		// A corner sharper than a right angle gets a half-circle on each side rather
		// than an offset, which is what stops the outline from crossing itself.
		if (sharpHere || sharpNext) {
			const offset = mul(per(heldVector), radius);
			for (let turn = 0; turn <= 1; turn += CORNER_STEP) {
				leftNext = rotate(add(point, offset), point, FIXED_PI * turn);
				left.push(leftNext);
				rightNext = rotate(sub(point, offset), point, FIXED_PI * -turn);
				right.push(rightNext);
			}
			leftLast = leftNext;
			rightLast = rightNext;
			sharpBefore = sharpNext;
			continue;
		}
		sharpBefore = false;

		if (index === points.length - 1) {
			const offset = mul(per(vector), radius);
			left.push(sub(point, offset));
			right.push(add(point, offset));
			continue;
		}

		const offset = mul(per(lrp(nextVector, vector, nextDot)), radius);
		leftNext = sub(point, offset);
		if (index <= 1 || dist2(leftLast, leftNext) > minDistance) {
			left.push(leftNext);
			leftLast = leftNext;
		}
		rightNext = add(point, offset);
		if (index <= 1 || dist2(rightLast, rightNext) > minDistance) {
			right.push(rightNext);
			rightLast = rightNext;
		}

		heldPressure = pressure;
		heldVector = vector;
	}

	const head = points[0].point;
	const tail =
		points.length > 1 ? points[points.length - 1].point : add(points[0].point, [1, 1] as Vec);

	// A tap is a dot: a full circle around the one point, with no sides to walk.
	if (points.length === 1) {
		const start = project(head, uni(per(sub(head, tail))), -radius);
		const dot2: Vec[] = [];
		for (let turn = 0; turn <= 1; turn += CAP_STEP) {
			dot2.push(rotate(start, head, FIXED_PI * 2 * turn));
		}
		return dot2;
	}

	const startCap: Vec[] = [];
	for (let turn = 0; turn <= 1; turn += CAP_STEP) {
		startCap.push(rotate(right[0], head, FIXED_PI * turn));
	}

	const endCap: Vec[] = [];
	const heading = per(neg(points[points.length - 1].vector));
	const capStart = project(tail, heading, radius);
	for (let turn = 0; turn <= 1; turn += CAP_STEP) {
		endCap.push(rotate(capStart, tail, FIXED_PI * 3 * turn));
	}

	return left.concat(endCap, right.reverse(), startCap);
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}

/** The outline as SVG path data, smoothed with quadratics between midpoints. */
export function outlinePath(outline: readonly Vec[]): string {
	if (outline.length < 4) return '';

	const first = outline[0];
	const second = outline[1];
	const third = outline[2];
	let data = `M${round(first[0])},${round(first[1])} Q${round(second[0])},${round(second[1])} ${round((second[0] + third[0]) / 2)},${round((second[1] + third[1]) / 2)} T`;

	for (let index = 2; index < outline.length - 1; index++) {
		const a = outline[index];
		const b = outline[index + 1];
		data += `${round((a[0] + b[0]) / 2)},${round((a[1] + b[1]) / 2)} `;
	}

	return `${data}Z`;
}

/**
 * Captures the pointer, tolerating an id the platform is not tracking: a press
 * replayed after its handler loaded can arrive with the pointer already lifted,
 * and capturing one of those throws `NotFoundError` rather than doing nothing.
 * The stroke runs without capture; only samples that reach the area are seen.
 */
export function capturePointer(area: Element, pointerId: number): void {
	try {
		area.setPointerCapture(pointerId);
	} catch (error) {
		if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error;
	}
}

/**
 * The path data for one stroke. `usePressure` off gives one width the whole way;
 * `simulate` is for a device that reports no pressure of its own, where the width
 * comes from how fast the pointer was moving instead.
 */
export function strokePath(
	points: readonly InkPoint[],
	size: number,
	usePressure: boolean,
	simulate: boolean,
): string {
	if (points.length === 0) return '';
	return outlinePath(
		strokeOutline(points, {
			size,
			thinning: usePressure ? THINNING : 0,
			smoothing: SMOOTHING,
			streamline: STREAMLINE,
			simulatePressure: usePressure && simulate,
		}),
	);
}

/** Which paths are the drawing's: the controlled prop, else what a gesture wrote, else the seed. */
export function heldPaths(
	given: readonly string[] | undefined,
	own: readonly string[] | null,
	seed: readonly string[],
): readonly string[] {
	if (given !== undefined) return given;
	if (own !== null) return own;
	return seed;
}

/** One committed stroke, with an identity a keyed repeat can hold onto. */
export type InkStrokeRow = { readonly id: string; readonly d: string };

/**
 * The strokes as keyed rows. The index is part of the id because two strokes can
 * carry byte-identical path data, and a repeat keyed on the data alone would draw
 * one row where there are two.
 */
export function strokeRows(paths: readonly string[]): readonly InkStrokeRow[] {
	return paths.map((drawn, index) => ({ id: `${index}:${drawn}`, d: drawn }));
}

/** The newest stroke, or an empty string when there is none. */
export function lastPath(paths: readonly string[]): string {
	return paths.length === 0 ? '' : paths[paths.length - 1];
}

/** Every stroke but the newest. */
export function withoutLast(paths: readonly string[]): readonly string[] {
	return paths.length === 0 ? paths : paths.slice(0, paths.length - 1);
}

/** One `d` string for the whole drawing, which is what the form field submits. */
export function joinPaths(paths: readonly string[]): string {
	return paths.join(' ');
}

/** What the live region says, so a reader knows a stroke landed without seeing it. */
export function strokeCountText(count: number): string {
	if (count === 0) return 'Empty';
	return count === 1 ? '1 stroke' : `${count} strokes`;
}

function escapeAttribute(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

/** The drawing as a standalone SVG document, in the area's own pixel coordinates. */
export function svgDocument(
	paths: readonly string[],
	width: number,
	height: number,
	colour: string,
): string {
	const w = Math.max(1, Math.round(width));
	const h = Math.max(1, Math.round(height));
	const body = paths
		.filter((drawn) => drawn !== '')
		.map((drawn) => `<path d="${escapeAttribute(drawn)}" fill="${escapeAttribute(colour)}"/>`)
		.join('');
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}

/**
 * The SVG document through a canvas and back out as a data URL. The image is the
 * only asynchronous step: an `<img>` with an SVG source has to decode before it
 * can be drawn.
 */
export function rasterise(
	markup: string,
	width: number,
	height: number,
	type: string,
	quality: number | undefined,
): Promise<string> {
	return new Promise((resolve, reject) => {
		const canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.round(width));
		canvas.height = Math.max(1, Math.round(height));
		const context = canvas.getContext('2d');
		if (context === null) {
			reject(new Error('This browser handed back no 2D canvas context.'));
			return;
		}

		const image = new Image();
		image.onload = () => {
			context.drawImage(image, 0, 0, canvas.width, canvas.height);
			try {
				resolve(canvas.toDataURL(type, quality));
			} catch (cause) {
				reject(cause instanceof Error ? cause : new Error(String(cause)));
			}
		};
		image.onerror = () => reject(new Error('The drawing could not be rasterised.'));
		image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
	});
}
