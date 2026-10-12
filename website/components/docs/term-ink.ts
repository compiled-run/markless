// The two glossary sketches a Term opens: a tiny page of elements, and a cursor clicking a button.
import { hatch, line, outline, type P, wash } from '../figures/ink/ink.ts';

export const WIDTH = 200;
export const HEIGHT = 128;

export interface Label {
	readonly key: string;
	readonly x: number;
	readonly y: number;
	readonly text: string;
	/** Degrees, so the lettering sits a little off the line like handwriting. */
	readonly tilt: number;
}

export interface Sketch {
	readonly paper: string;
	/** Paper laid over the washes, for a shape in front of them. */
	readonly cover: string;
	readonly pink: string;
	readonly hatch: string;
	readonly ink: string;
	readonly fine: string;
	readonly labels: Label[];
}

function box(x0: number, y0: number, x1: number, y1: number, r: number): P[] {
	const pts: P[] = [];
	const corner = (cx: number, cy: number, from: number) => {
		for (let i = 0; i <= 6; i++) {
			const a = from + (i / 6) * (Math.PI / 2);
			pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
		}
	};
	corner(x1 - r, y0 + r, -Math.PI / 2);
	corner(x1 - r, y1 - r, 0);
	corner(x0 + r, y1 - r, Math.PI / 2);
	corner(x0 + r, y0 + r, Math.PI);
	return pts;
}

const wavy = (x0: number, x1: number, y: number, lift: number): P[] =>
	Array.from({ length: 9 }, (_, i) => {
		const t = i / 8;
		return [x0 + (x1 - x0) * t, y + Math.sin(t * Math.PI * 3) * lift] as P;
	});

const tilt = (key: string, x: number, y: number, text: string, deg: number): Label => ({ key, x, y, text, tilt: deg });

/** A page with a heading bar, two lines of text and a pink button, each tagged with the element that draws it. */
function elements(): Sketch {
	const page = box(14, 8, 128, 120, 5);
	const heading = box(26, 21, 92, 33, 2);
	const button = box(26, 82, 74, 102, 6);
	const fold: P[] = [
		[112, 8],
		[128, 24],
	];
	return {
		paper: wash(page, 801, 0.4, 0.6),
		cover: '',
		pink: wash(button, 802, 1.2, 1.6),
		hatch: hatch(heading, -0.6, 1.9, 803, { cluster: 3, skip: 0.05, trim: 0.08 }),
		ink:
			outline(page, { w: 1.5, heavy: 0.7, seed: 810 }) +
			outline(heading, { w: 1.1, seed: 811 }) +
			outline(button, { w: 1.3, heavy: 0.5, seed: 812 }) +
			line(wavy(28, 110, 51, 0.7), { w: 0.95, seed: 813, over: 0.6 }) +
			line(wavy(28, 98, 62, 0.6), { w: 0.95, seed: 814, over: 0.6 }) +
			line(wavy(36, 64, 92, 0.4), { w: 0.8, seed: 815, over: 0.3 }),
		fine:
			line(fold, { w: 0.6, seed: 816, over: 0.4 }) +
			line([[96, 27], [104, 26.5], [134, 26]], { w: 0.55, seed: 817, over: 0.2 }) +
			line([[113, 57], [124, 56.6], [136, 56]], { w: 0.55, seed: 818, over: 0.2 }) +
			line([[78, 92], [104, 91], [134, 89]], { w: 0.55, seed: 819, over: 0.2 }),
		labels: [tilt('h1', 139, 30, '<h1>', -4), tilt('p', 140, 60, '<p>', 3), tilt('button', 138, 93, '<button>', -3)],
	};
}

/** A cursor pressing a pink button, a little burst where it clicks, and the onClick note that hears it. */
function events(): Sketch {
	const button = box(22, 50, 132, 90, 10);
	const tip: P = [104, 74];
	const k = 1.4;
	const cursor: P[] = (
		[
			[0, 0],
			[0, 30],
			[7.5, 23.5],
			[13, 35],
			[18, 32.5],
			[12.5, 21.5],
			[22, 21],
		] as P[]
	).map(([x, y]) => [tip[0] + x * k, tip[1] + y * k]);
	const burst = [-2.75, -2.2, -1.62, -1.05, -0.5].map((a, i) => {
		const near = 8 + (i % 2) * 2;
		const far = near + 8 + (i % 2 === 0 ? 3 : 0);
		return line(
			[
				[tip[0] + Math.cos(a) * near, tip[1] + Math.sin(a) * near],
				[tip[0] + Math.cos(a) * far, tip[1] + Math.sin(a) * far],
			],
			{ w: 1.4, seed: 840 + i, over: 0.4 },
		);
	});
	const end: P = [90, 46];
	return {
		paper: '',
		cover: wash(cursor, 821, 0.2, 0.3),
		pink: wash(button, 822, 1.4, 2),
		hatch: hatch(box(24, 82, 130, 92, 5), -0.35, 1.8, 823, { cluster: 3, skip: 0.2, trim: 0.25 }),
		ink:
			outline(button, { w: 1.6, heavy: 1, seed: 830 }) +
			outline(cursor, { w: 1.4, heavy: 0.5, seed: 831 }) +
			line(wavy(40, 80, 70, 0.5), { w: 0.9, seed: 832, over: 0.3 }) +
			burst.join(''),
		fine:
			line(
				[
					[70, 20],
					[82, 26],
					[88, 36],
					end,
				],
				{ w: 0.95, seed: 850, over: 0.4 },
			) +
			line(
				[
					[85, 40.5],
					end,
					[92.5, 40],
				],
				{ w: 0.95, seed: 851, over: 0.2 },
			),
		labels: [tilt('onclick', 14, 22, 'onClick', -5)],
	};
}

export function drawing() {
	return { width: WIDTH, height: HEIGHT, elements: elements(), events: events() };
}
