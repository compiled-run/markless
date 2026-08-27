import { computed } from '@markless/core';
import type { PadPoint } from '../index.ts';
import * as pad from '../index.ts';

const FIELD = 'display: block; width: 200px; height: 200px';
const SHEET = 'position: absolute; inset: 0; width: 100%; height: 100%';
const CONTROLS = [
	{ id: 'p1', x: 0.25, y: 0.1 },
	{ id: 'p2', x: 0.75, y: 0.9 },
];

// The curve is the consumer's own drawing: the family holds two points and knows
// nothing about easing.
function curvePath(points: readonly PadPoint[]): string {
	const first = points[0] ?? { id: 'p1', x: 0, y: 0 };
	const second = points[1] ?? { id: 'p2', x: 1, y: 1 };
	const x1 = first.x * 100;
	const y1 = 100 - first.y * 100;
	const x2 = second.x * 100;
	const y2 = 100 - second.y * 100;
	return `M 0 100 C ${x1} ${y1} ${x2} ${y2} 100 0`;
}

// Two control points in one pad: two tab stops, the shape Josh Comeau's
// cubic-bezier editor has, with the reader semantics his has not.
export default function Curve() @{
	<main>
		<pad.root data-testid="root" defaultValue={CONTROLS}>
			<pad.label data-testid="label">Easing curve</pad.label>
			<pad.area data-testid="area" style={FIELD}>
				<Drawing />
			</pad.area>
			<pad.valuelabel data-testid="valuelabel" />
		</pad.root>
	</main>
}

// Inside the root: a component that reads the pad's state is a part of that
// pad's widget, and one placed outside would start a second pad of its own. A
// construct may not be the direct child of a component tag either, so the repeat
// opens in a plain element.
function Drawing() @{
	const held = pad.state();
	const drawn = computed(() => curvePath(held.points));

	<div style="display: contents">
		<svg
			data-testid="curve"
			viewBox="0 0 100 100"
			preserveAspectRatio="none"
			aria-hidden="true"
			style={SHEET}
		>
			<path data-testid="curve-path" d={drawn} fill="none" stroke="currentColor" />
		</svg>
		@for (const point of held.points; key point.id) {
			<pad.thumb value={point} data-testid="thumb" />
		}
	</div>
}
