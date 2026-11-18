// Shared helpers for the How it works toys: finding what a dragged object was dropped on.

/** The target whose anchor lies nearest a drop point, or '' when none is within reach. */
export function nearestTarget(targets: Readonly<Record<string, readonly [number, number]>>, x: number, y: number, reach = 90): string {
	let best = '';
	let gap = reach;
	for (const [id, [tx, ty]] of Object.entries(targets)) {
		const d = Math.hypot(tx - x, ty - y);
		if (d < gap) {
			gap = d;
			best = id;
		}
	}
	return best;
}
