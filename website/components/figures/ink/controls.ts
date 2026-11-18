// Hand-drawn controls for live examples: a switch track and knob, a select box, and a plain paper slip for code.
import { ellipse, jitter, roundRect } from './desk.ts';
import { hatch, line, outline, type P, pathOf, wash } from './ink.ts';
import { pencil } from './plane.ts';

/** A switch: the track, a wash for when it is on, and a round knob with a little shade. */
export function toggle(width: number, height: number, seed: number) {
	const track = jitter(roundRect(1.5, 1.5, width - 1.5, height - 1.5, height / 2 - 1.5, 6), seed, 0.6);
	const r = height / 2 - 4;
	const knob = ellipse(height / 2, height / 2, r, r, 24);
	const shade: P[] = knob.filter(([, y]) => y > height / 2 - 1);
	return {
		width,
		height,
		face: pathOf(track, true),
		wash: wash(track, seed + 2, 0.4, 1.6),
		ink: outline(track, { w: 1.1, heavy: 0.9, centre: [width / 2, height / 2], seed: seed + 3 }),
		knob: {
			size: height,
			face: pathOf(knob, true),
			shade: hatch(shade.length > 2 ? shade : knob, 0.9, 1.6, seed + 4, { cluster: 3, skip: 0.15 }),
			ink: outline(knob, { w: 1, heavy: 0.8, centre: [height / 2, height / 2], seed: seed + 5 }),
		},
	};
}

/** A select box with a hand-drawn caret at its right end. */
export function pick(width: number, height: number, seed: number) {
	const box = jitter(roundRect(1.5, 1.5, width - 1.5, height - 1.5, 5, 4), seed, 0.7);
	const cx = width - 10;
	const cy = height / 2;
	return {
		width,
		height,
		face: pathOf(box, true),
		ink: outline(box, { w: 1.1, heavy: 0.9, centre: [width / 2, height / 2], seed: seed + 1 }),
		caret: line([[cx - 4, cy - 2], [cx, cy + 2.4], [cx + 4, cy - 2]], { w: 0.9, seed: seed + 2 }),
	};
}

/** A sheet of paper with no browser bar, for code: paper, inked edge, a hatched shadow and faint pencil. */
export function slip(width: number, height: number, seed: number) {
	const corners = jitter([[0, 0], [width, 0], [width, height], [0, height]], seed, 2.2);
	const [, tr, br, bl] = corners as [P, P, P, P];
	const drop = 7;
	const shadow: P[] = [
		[tr[0], tr[1] + 6],
		[tr[0] + drop, tr[1] + 6 + drop],
		[br[0] + drop, br[1] + drop],
		[bl[0] + 6, bl[1] + drop],
		[bl[0] + 6, bl[1]],
		[br[0], br[1]],
	];
	return {
		width,
		height,
		paper: pathOf(corners, true),
		shadow: { wash: pathOf(shadow, true), hatch: hatch(shadow, 0.9, 2.6, seed + 3, { cluster: 5, skip: 0.2 }) },
		ink: outline(corners, { w: 1.2, heavy: 1, centre: [width / 2, height / 2], seed: seed + 1 }),
		pencil: pencil([[-10, -5], [width * 0.6, -3]], seed + 20) + pencil([[width + 5, height * 0.3], [width + 3, height + 12]], seed + 21),
	};
}

export function art() {
	return {
		toggle: toggle(46, 26, 900),
		pick: pick(96, 24, 920),
		slip: { wide: slip(280, 150, 940), narrow: slip(170, 210, 960) },
	};
}
