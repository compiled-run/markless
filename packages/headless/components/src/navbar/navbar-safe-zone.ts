/**
 * QDS's safe zone for a hover-opened dropdown: the convex hull of its trigger and its panel,
 * each grown by a small margin. A pointer inside it is on its way between the two; a pointer
 * outside it has left the dropdown, even if it is still inside the landmark.
 */

type Point = readonly [number, number];

const MARGIN = 10;
const EDGE = 5;

function isInsideRect(x: number, y: number, rect: DOMRect, grow: number): boolean {
	return x >= rect.left - grow && x <= rect.right + grow && y >= rect.top - grow && y <= rect.bottom + grow;
}

function cross(o: Point, a: Point, b: Point): number {
	return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function hullOf(points: Point[]): Point[] {
	const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	const lower: Point[] = [];
	for (const p of sorted) {
		while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
		lower.push(p);
	}
	const upper: Point[] = [];
	for (const p of sorted.reverse()) {
		while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
		upper.push(p);
	}
	return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function corners(rect: DOMRect): Point[] {
	return [
		[rect.left - MARGIN, rect.top - MARGIN],
		[rect.right + MARGIN, rect.top - MARGIN],
		[rect.right + MARGIN, rect.bottom + MARGIN],
		[rect.left - MARGIN, rect.bottom + MARGIN],
	];
}

function isInsidePolygon(x: number, y: number, polygon: Point[]): boolean {
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const [xi, yi] = polygon[i]!;
		const [xj, yj] = polygon[j]!;
		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
	}
	return inside;
}

/** Whether a pointer at (`x`, `y`) is on the trigger, on the panel, or crossing between them. */
export function isInSafeZone(x: number, y: number, trigger: HTMLElement, panel: HTMLElement): boolean {
	const from = trigger.getBoundingClientRect();
	const to = panel.getBoundingClientRect();
	if (isInsideRect(x, y, from, EDGE) || isInsideRect(x, y, to, EDGE)) return true;
	return isInsidePolygon(x, y, hullOf([...corners(from), ...corners(to)]));
}

const watching = new WeakSet<HTMLElement>();
const exited = new WeakSet<HTMLElement>();

/**
 * Follows the pointer until it leaves the safe zone, then re-delivers a `pointerout` on `item`
 * for the item's own handler to close with. It stops on its own once the panel is hidden.
 */
export function watchSafeZone(item: HTMLElement, trigger: HTMLElement, panel: HTMLElement): void {
	if (watching.has(item)) return;
	watching.add(item);
	const stop = () => {
		watching.delete(item);
		document.removeEventListener('pointermove', onMove);
	};
	const onMove = (event: PointerEvent) => {
		if (panel.hidden) return stop();
		if (isInSafeZone(event.clientX, event.clientY, trigger, panel)) return;
		stop();
		exited.add(item);
		item.dispatchEvent(new PointerEvent('pointerout', { bubbles: true }));
	};
	document.addEventListener('pointermove', onMove, { passive: true });
}

/** Reports a pointer that left outside the zone once the crossing it is part of has finished, so the item it went to still sees this dropdown open. */
export function leaveSafeZone(item: HTMLElement): void {
	exited.add(item);
	setTimeout(() => item.dispatchEvent(new PointerEvent('pointerout', { bubbles: true })), 0);
}

/** Whether this `pointerout` is a reported exit; reading it clears it. */
export function takeSafeZoneExit(item: HTMLElement): boolean {
	return exited.delete(item);
}
