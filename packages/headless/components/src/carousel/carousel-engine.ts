import { slideValues } from './carousel-navigation.ts';
import type { CarouselAlign, CarouselOrientation } from './carousel-types.ts';

/**
 * The slide-math engine. It is a plain module rather than graph state on
 * purpose: a drag writes a new transform on every pointer move, and a graph cell
 * per move would allocate per event and re-render per event. One module instance
 * is shared by every handler that imports it, so the handlers agree.
 */

/** How much of a drag past the ends still moves the slides. iOS uses about half. */
const RUBBER_BAND_FACTOR = 0.4;
/** Pixels per millisecond. A flick faster than this is a fling, not a nudge. */
const FLING_MIN_VELOCITY = 0.1;
/** A fling also has to have travelled this far, so a tap never counts as one. */
const FLING_MIN_DISTANCE = 10;
const MAX_VELOCITY = 3;
const VELOCITY_SAMPLES = 5;
const VELOCITY_WINDOW_MS = 100;
/** How far ahead a fling is projected before the nearest slide is picked. */
const MOMENTUM_TIME_CONSTANT = 200;
/** Used when the scroll area carries no CSS transition of its own. */
const FALLBACK_DURATION_MS = 400;

type AxisNames = {
	readonly offset: 'offsetLeft' | 'offsetTop';
	readonly size: 'offsetWidth' | 'offsetHeight';
	readonly scroll: 'scrollWidth' | 'scrollHeight';
	readonly client: 'clientWidth' | 'clientHeight';
};

const AXES: Record<CarouselOrientation, AxisNames> = {
	horizontal: {
		offset: 'offsetLeft',
		size: 'offsetWidth',
		scroll: 'scrollWidth',
		client: 'clientWidth',
	},
	vertical: {
		offset: 'offsetTop',
		size: 'offsetHeight',
		scroll: 'scrollHeight',
		client: 'clientHeight',
	},
};

/**
 * A ring buffer of the last few pointer positions. It is pre-sized and writes
 * two numbers per sample, so a drag allocates nothing while it runs.
 */
class VelocityTracker {
	private readonly positions = new Float64Array(VELOCITY_SAMPLES);
	private readonly times = new Float64Array(VELOCITY_SAMPLES);
	private head = 0;
	private count = 0;

	reset(): void {
		this.head = 0;
		this.count = 0;
	}

	add(position: number): void {
		this.positions[this.head] = position;
		this.times[this.head] = performance.now();
		this.head = (this.head + 1) % VELOCITY_SAMPLES;
		if (this.count < VELOCITY_SAMPLES) this.count += 1;
	}

	/** Pixels per millisecond over the recent window, positive when moving forward. */
	read(): number {
		if (this.count < 2) return 0;

		const cutoff = performance.now() - VELOCITY_WINDOW_MS;
		let oldest = -1;
		let newest = -1;

		for (let step = 0; step < this.count; step += 1) {
			const slot = (this.head - 1 - step + VELOCITY_SAMPLES) % VELOCITY_SAMPLES;
			if (this.times[slot]! < cutoff) continue;
			if (oldest < 0 || this.times[slot]! < this.times[oldest]!) oldest = slot;
			if (newest < 0 || this.times[slot]! > this.times[newest]!) newest = slot;
		}

		if (oldest < 0 || newest < 0 || oldest === newest) return 0;

		const elapsed = this.times[newest]! - this.times[oldest]!;
		if (elapsed === 0) return 0;

		const travelled = this.positions[newest]! - this.positions[oldest]!;
		return clamp(travelled / elapsed, -MAX_VELOCITY, MAX_VELOCITY);
	}
}

function clamp(value: number, low: number, high: number): number {
	if (value < low) return low;
	if (value > high) return high;
	return value;
}

function parseMilliseconds(value: string): number {
	const amount = Number.parseFloat(value);
	if (Number.isNaN(amount)) return 0;
	return value.includes('ms') ? amount : amount * 1000;
}

/**
 * Moves the slides by writing one `translate3d` on the scroll area, and answers
 * which slide the person landed on. Every number it works in is a translate:
 * zero is the first slide at rest and the values run negative from there.
 */
export class SlideEngine {
	private readonly scrollArea: HTMLElement;
	/** The clipping window. Its size is the viewport a slide has to fit into. */
	private viewport: HTMLElement;
	private readonly velocity = new VelocityTracker();
	private axis: CarouselOrientation;

	/** The translate showing right now, tracked so no drag frame reads style back. */
	private position = 0;
	private isStarted = false;

	private dragFrom: number | null = null;
	private dragOrigin = 0;
	private dragSensitivity = 1;
	private bounds: { min: number; max: number } | null = null;

	private animation: Animation | null = null;
	private animatingTo = 0;
	private animatingFrom = 0;

	constructor(scrollArea: HTMLElement, viewport: HTMLElement, axis: CarouselOrientation) {
		this.scrollArea = scrollArea;
		this.viewport = viewport;
		this.axis = axis;
	}

	setViewport(viewport: HTMLElement): void {
		if (this.viewport === viewport) return;
		this.viewport = viewport;
		this.bounds = null;
	}

	get isDragging(): boolean {
		return this.dragFrom !== null;
	}

	setAxis(axis: CarouselOrientation): void {
		if (this.axis === axis) return;
		this.axis = axis;
		this.bounds = null;
	}

	/**
	 * Takes the scroll area off native scrolling and onto transforms. The served
	 * page scrolls natively so it works before resume; the first gesture or the
	 * first programmatic move hands over to the engine.
	 */
	start(): void {
		if (this.isStarted) return;
		this.isStarted = true;

		const names = AXES[this.axis];
		const scrolled =
			names.client === 'clientWidth' ? this.scrollArea.scrollLeft : this.scrollArea.scrollTop;

		this.position = -scrolled;
		this.scrollArea.style.overflow = 'hidden';
		this.write(this.position);
	}

	/** Layout has changed, so the cached ends are stale. */
	invalidate(): void {
		this.bounds = null;
	}

	/** How far the slides may travel: zero at the start, negative at the far end. */
	private getBounds(): { min: number; max: number } {
		if (this.bounds) return this.bounds;

		const names = AXES[this.axis];
		const travel = this.scrollArea[names.scroll] - this.viewport[names.client];
		this.bounds = { min: -Math.max(0, travel), max: 0 };
		return this.bounds;
	}

	private write(value: number): void {
		this.position = value;
		this.scrollArea.style.transition = 'none';
		this.scrollArea.style.transform =
			this.axis === 'horizontal'
				? `translate3d(${value}px, 0, 0)`
				: `translate3d(0, ${value}px, 0)`;
	}

	/** Where a slide comes to rest, as a positive scroll distance from the start. */
	slidePosition(slideEls: readonly HTMLElement[], index: number, align: CarouselAlign): number {
		const slide = slideEls[index];
		if (!slide) return 0;

		const names = AXES[this.axis];
		const viewport = this.viewport[names.client];
		const slideSize = slide[names.size];
		let position = slide[names.offset];

		if (align === 'center') position -= (viewport - slideSize) / 2;
		if (align === 'end') position -= viewport - slideSize;

		const furthest = this.scrollArea[names.scroll] - viewport;
		return clamp(position, 0, Math.max(0, furthest));
	}

	/** How many slides fit in the viewport at once, never fewer than one. */
	slidesPerView(slideEls: readonly HTMLElement[]): number {
		const first = slideEls[0];
		if (!first) return 1;

		const names = AXES[this.axis];
		const slideSize = first[names.size];
		if (slideSize <= 0) return 1;

		return Math.max(1, Math.round(this.viewport[names.client] / slideSize));
	}

	private closestIndex(
		scroll: number,
		slideEls: readonly HTMLElement[],
		align: CarouselAlign,
	): number {
		let closest = 0;
		let shortest = Number.POSITIVE_INFINITY;

		for (let index = 0; index < slideEls.length; index += 1) {
			const distance = Math.abs(this.slidePosition(slideEls, index, align) - scroll);
			if (distance >= shortest) continue;
			closest = index;
			shortest = distance;
		}

		return closest;
	}

	/** The scroll area's own CSS transition, so consumers keep control of the feel. */
	private readDuration(): { duration: number; easing: string } {
		const styles = getComputedStyle(this.scrollArea);
		const duration = parseMilliseconds(styles.transitionDuration);
		if (duration <= 0) return { duration: FALLBACK_DURATION_MS, easing: 'ease' };
		return { duration, easing: styles.transitionTimingFunction };
	}

	/**
	 * Stops the running animation where it stands and answers that spot, so a
	 * gesture that interrupts a slide picks up exactly where the eye left it.
	 */
	cancelAnimation(): number | null {
		if (!this.animation) return null;

		const timing = this.animation.effect?.getComputedTiming();
		const progress = timing?.progress ?? 0;
		const reached = this.animatingFrom + (this.animatingTo - this.animatingFrom) * progress;

		this.animation.cancel();
		this.animation = null;
		this.write(reached);
		return reached;
	}

	animateTo(target: number, onDone?: () => void): void {
		this.cancelAnimation();

		const from = this.position;
		if (from === target) {
			this.write(target);
			onDone?.();
			return;
		}

		const { duration, easing } = this.readDuration();
		const end =
			this.axis === 'horizontal'
				? `translate3d(${target}px, 0, 0)`
				: `translate3d(0, ${target}px, 0)`;

		this.scrollArea.style.transition = 'none';
		const animation = this.scrollArea.animate([{ transform: end }], {
			duration,
			easing,
			fill: 'forwards',
		});

		this.animation = animation;
		this.animatingFrom = from;
		this.animatingTo = target;

		animation.addEventListener(
			'finish',
			() => {
				if (this.animation !== animation) return;
				this.animation = null;
				this.write(target);
				animation.cancel();
				onDone?.();
			},
			{ once: true },
		);
	}

	/** Brings a slide to rest in the viewport. */
	showIndex(slideEls: readonly HTMLElement[], index: number, align: CarouselAlign): void {
		this.start();
		this.invalidate();
		this.animateTo(-this.slidePosition(slideEls, index, align));
	}

	beginDrag(pointer: number, sensitivity: number): void {
		this.start();
		this.invalidate();
		this.cancelAnimation();

		this.dragFrom = pointer;
		this.dragOrigin = this.position;
		this.dragSensitivity = sensitivity;
		this.velocity.reset();
		this.velocity.add(pointer);
	}

	/** One pointer move: no allocation, no layout read, one style write. */
	dragTo(pointer: number): void {
		if (this.dragFrom === null) return;

		this.velocity.add(pointer);

		const travelled = (pointer - this.dragFrom) * this.dragSensitivity;
		const raw = this.dragOrigin + travelled;
		const next = this.resist(raw);
		if (next === this.position) return;

		this.write(next);
	}

	/** Past either end the slides still follow the finger, just reluctantly. */
	private resist(raw: number): number {
		const { min, max } = this.getBounds();
		if (raw > max) return max + (raw - max) * RUBBER_BAND_FACTOR;
		if (raw < min) return min - (min - raw) * RUBBER_BAND_FACTOR;
		return raw;
	}

	/**
	 * Ends the gesture and snaps. Answers the slide index it settled on, or null
	 * when the pointer never really moved and nothing should change.
	 */
	endDrag(
		pointer: number,
		slideEls: readonly HTMLElement[],
		align: CarouselAlign,
	): number | null {
		const from = this.dragFrom;
		this.dragFrom = null;
		if (from === null) return null;
		if (slideEls.length === 0) return null;

		const distance = Math.abs(pointer - from);
		const velocity = this.velocity.read();
		this.velocity.reset();

		const isTap = distance < FLING_MIN_DISTANCE && Math.abs(velocity) < FLING_MIN_VELOCITY;
		if (isTap) return null;

		const isFling = distance >= FLING_MIN_DISTANCE && Math.abs(velocity) >= FLING_MIN_VELOCITY;
		const projected = isFling ? this.position + velocity * MOMENTUM_TIME_CONSTANT : this.position;

		const index = this.closestIndex(-projected, slideEls, align);
		this.animateTo(-this.slidePosition(slideEls, index, align));
		return index;
	}
}

const engines = new WeakMap<HTMLElement, SlideEngine>();

/**
 * One engine per scroll area, so every handler on the same carousel drives the
 * same slides. Keyed by the element, so it needs no widget plumbing and it goes
 * away with the page.
 */
export function slideEngine(
	scrollArea: HTMLElement | undefined,
	viewport: HTMLElement | undefined,
	axis: CarouselOrientation,
): SlideEngine | null {
	if (!scrollArea || !viewport) return null;

	let engine = engines.get(scrollArea);
	if (!engine) {
		engine = new SlideEngine(scrollArea, viewport, axis);
		engines.set(scrollArea, engine);
	}

	engine.setViewport(viewport);
	engine.setAxis(axis);
	return engine;
}

/**
 * Brings the named slide to rest. Every argument is a plain value, so a part's
 * handler can call it with what it read off the graph.
 */
export function moveToValue(
	scrollArea: HTMLElement | undefined,
	viewport: HTMLElement | undefined,
	axis: CarouselOrientation,
	slideEls: readonly HTMLElement[],
	value: string,
	align: CarouselAlign,
): void {
	const engine = slideEngine(scrollArea, viewport, axis);
	if (!engine) return;

	const index = slideValues(slideEls).indexOf(value);
	if (index < 0) return;

	engine.showIndex(slideEls, index, align);
}
