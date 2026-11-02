// The site navbar's card drawings and the theme toggle's sun and moon, drawn with the figures' ink pen.
import { ellipse, roundRect } from '../../figures/ink/desk.ts';
import { hatch, hull, line, outline, type P, pathOf, resample, seeded, stroke, wash } from '../../figures/ink/ink.ts';

/** What a layer paints: the paper an object is cut from, its wash, its hatching or its ink. */
export type LayerKind = 'paper' | 'wash' | 'hatch' | 'ink';

/** One drawing, as layers painted in order: each object's paper, wash, hatching and ink, back to front. */
/** How an object moves while its card is hovered: a transform scaled by `--hover` (0 or 1), about a point on the sheet. */
export interface Motion {
	readonly transform: string;
	readonly origin: P;
	/** An opacity that also follows `--hover`, for something that appears only while hovered. */
	readonly opacity?: string;
	/** Milliseconds to wait before moving, so one motion can follow another. */
	readonly delay?: number;
	readonly easing?: string;
}

const sway = (deg: number, origin: P): Motion => ({ transform: `rotate(calc(var(--hover, 0) * ${deg}deg))`, origin });
const shift = (dx: number, dy: number, origin: P = [0, 0]): Motion => ({ transform: `translate(calc(var(--hover, 0) * ${dx}px), calc(var(--hover, 0) * ${dy}px))`, origin });

export interface Drawing {
	readonly width: number;
	readonly height: number;
	/** The box the drawing actually covers, `[x, y, width, height]`: a card fits this, not the sheet, into its picture area. */
	readonly box: readonly [number, number, number, number];
	readonly layers: readonly { readonly kind: LayerKind; readonly d: string; readonly motion?: Motion }[];
}

/** The order one object paints in: the shadow it casts on what is behind it, then itself. */
export const OBJECT_ORDER = ['cast', 'paper', 'wash', 'hatch', 'ink'] as const;
type Part = (typeof OBJECT_ORDER)[number];

const rad = (deg: number) => (deg * Math.PI) / 180;
const move = (pts: P[], dx: number, dy: number): P[] => pts.map(([x, y]) => [x + dx, y + dy]);
const turn = (pts: P[], deg: number, [cx, cy]: P): P[] => {
	const [c, s] = [Math.cos(rad(deg)), Math.sin(rad(deg))];
	return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
};
const quad = (x0: number, y0: number, x1: number, y1: number): P[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const arc = (cx: number, cy: number, rx: number, ry: number, from: number, to: number, n = 24): P[] =>
	Array.from({ length: n + 1 }, (_, k) => {
		const a = rad(from + ((to - from) * k) / n);
		return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as P;
	});

/** A hand-ruled line: resampled and nudged so it is never quite straight. */
function wander(points: P[], seed: number, amount = 0.8, step = 14): P[] {
	const rnd = seeded(seed);
	return resample(points, step).map(([x, y], k, all) => (k === 0 || k === all.length - 1 ? [x, y] : [x + (rnd() - 0.5) * amount, y + (rnd() - 0.5) * amount]));
}

/**
 * A drawing built object by object, back to front. `object()` starts the next one; everything drawn
 * until the next call belongs to it, and each object's closed shapes are filled with paper, so it
 * hides what lies behind it before its own wash, hatching and ink go on.
 */
class Sheet {
	#layers: { kind: LayerKind; d: string; motion?: Motion }[] = [];
	#motion: Motion | undefined;
	#parts: Record<Part, string> = { cast: '', paper: '', wash: '', hatch: '', ink: '' };
	#seed: number;
	#min: P = [Infinity, Infinity];
	#max: P = [-Infinity, -Infinity];
	readonly #paper: boolean;
	readonly width: number;
	readonly height: number;

	constructor(width: number, height: number, seed: number, paper = true) {
		this.width = width;
		this.height = height;
		this.#seed = seed * 1000;
		this.#paper = paper;
	}

	#next() {
		return ++this.#seed;
	}

	#cover(points: P[], margin = 0) {
		for (const [x, y] of points) {
			this.#min = [Math.min(this.#min[0], x - margin), Math.min(this.#min[1], y - margin)];
			this.#max = [Math.max(this.#max[0], x + margin), Math.max(this.#max[1], y + margin)];
		}
	}

	/** Ends the object being drawn and starts the next, which moves by `motion` while its card is hovered. */
	object(motion?: Motion): this {
		for (const part of OBJECT_ORDER) {
			const d = this.#parts[part];
			if (!d) continue;
			const kind: LayerKind = part === 'cast' ? 'hatch' : part;
			const last = this.#layers.at(-1);
			if (last && last.kind === kind && last.motion === this.#motion) last.d += d;
			else this.#layers.push(this.#motion ? { kind, d, motion: this.#motion } : { kind, d });
			this.#parts[part] = '';
		}
		this.#motion = motion;
		return this;
	}

	shape(points: P[], w = 1.8, heavy = 1.2, fill = this.#paper) {
		this.#cover(points);
		if (fill) this.#parts.paper += pathOf(points, true);
		this.#parts.ink += outline(points, { w, heavy, seed: this.#next() });
	}

	line(points: P[], w = 1.4, wobble = 0.5) {
		this.#cover(points);
		this.#parts.ink += line(points, { w, wobble, seed: this.#next() });
	}

	dot(at: P, r: number) {
		this.#parts.ink += stroke([[at[0] - r * 0.4, at[1]], [at[0] + r * 0.4, at[1] + 0.2]], { w: r * 1.6, seed: this.#next(), over: 0, wobble: 0.1 });
	}

	tone(poly: P[], angle: number, gap = 2.6, skip = 0.3) {
		this.#cover(poly, 1);
		this.#parts.hatch += hatch(poly, rad(angle), gap, this.#next(), { cluster: 5, skip, trim: 0.5 });
	}

	/** The darkest pocket: two passes at different angles, never a solid fill. */
	shade(poly: P[], angle: number, gap = 1.7) {
		this.tone(poly, angle, gap, 0.15);
		this.tone(poly, angle + 62, gap * 1.2, 0.3);
	}

	/** A shadow cast down and right onto the surface below: only the band the shape uncovers, never the shape itself. */
	cast(poly: P[], dx = 7, dy = 6, gap = 2.4) {
		const ring = hull(poly);
		const n = ring.length;
		const faces = ring.map((p, k) => {
			const q = ring[(k + 1) % n]!;
			return (q[1] - p[1]) * dx - (q[0] - p[0]) * dy > 0;
		});
		const first = faces.findIndex((lit, k) => lit && !faces[(k - 1 + n) % n]);
		if (first < 0) return;
		const chain: P[] = [ring[first]!];
		for (let k = first; faces[k % n]; k++) chain.push(ring[(k + 1) % n]!);
		this.#cover([...chain, ...move(chain, dx, dy)], 1);
		this.#parts.cast += hatch([...chain, ...move(chain, dx, dy).reverse()], rad(-28), gap, this.#next(), { cluster: 5, skip: 0.35, trim: 0.5 });
	}

	wash(poly: P[], grow = 2, rough = 3) {
		this.#cover(move(poly, 1.6, -1.2), grow + rough + 1);
		this.#parts.wash += wash(poly, this.#next(), grow, rough);
	}

	done(pad = 8): Drawing {
		this.object();
		const [x0, y0] = this.#min;
		const [x1, y1] = this.#max;
		const box = [x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2].map((v) => Math.round(v)) as [number, number, number, number];
		return { width: this.width, height: this.height, box, layers: this.#layers };
	}
}

/** A card's or panel's edge dotted round with a pen: uneven gaps, uneven dots, never quite on the line. */
function edge(width: number, height: number, seed: number, radius: number): Drawing {
	const s = new Sheet(width, height, seed, false);
	const rnd = seeded(seed * 97 + 5);
	const ring = resample(roundRect(3, 3, width - 3, height - 3, radius, 6), 1, true);
	let next = 0;
	let walked = 0;
	for (let k = 1; k < ring.length; k++) {
		const [ax, ay] = ring[k - 1]!;
		const [bx, by] = ring[k]!;
		walked += Math.hypot(bx - ax, by - ay);
		if (walked < next) continue;
		s.dot([bx + (rnd() - 0.5) * 0.9, by + (rnd() - 0.5) * 0.9], 1 + rnd() * 0.9);
		next = walked + 5.5 + rnd() * 4.5;
	}
	return s.done(0);
}

/** Start here: a fingerpost by a path, its top board pointing the way in. */
function start(): Drawing {
	const s = new Sheet(276, 128, 1);
	s.line(wander([[96, 112], [272, 108]], 3, 1.2), 1.6);
	s.line(wander([[120, 120], [168, 119]], 4, 1), 1);
	for (const x of [132, 236, 254]) for (let k = 0; k < 4; k++) s.line([[x + k * 3, 112], [x + k * 3 + (k - 1.5) * 2.2, 103 - (k % 2) * 4]], 0.9, 0.2);
	s.object();
	const post = quad(195, 14, 205, 111);
	s.cast(post, 26, 5, 2);
	s.shape(post, 2);
	s.tone(quad(200, 16, 205, 110), 80, 2.2);
	const board = (y: number, dir: 1 | -1, len: number, deg: number): P[] => {
		const tip = 200 + dir * len;
		const back = 200 - dir * 20;
		return turn([[back, y], [tip - dir * 13, y], [tip, y + 11], [tip - dir * 13, y + 22], [back, y + 22]], deg, [200, y + 11]);
	};
	s.object();
	const lower = board(52, -1, 76, 4);
	s.cast(lower, 4, 4, 2.6);
	s.shape(lower, 1.9);
	s.tone(lower.slice(2), 20, 2.8);
	for (const at of [[212, 63], [134, 62]] as P[]) s.dot(at, 1.4);
	s.object(sway(-7, [200, 31]));
	const top = board(20, 1, 66, -3);
	s.wash(top, 2.5, 3.5);
	s.cast(top, 4, 5, 2.6);
	s.shape(top, 2.1);
	for (const at of [[188, 31], [252, 29]] as P[]) s.dot(at, 1.4);
	return s.done();
}

/** Core concepts: the State figure's jar of beans with its tag wired out; hovering crosses out the tag's number and inks the new one in. */
function concepts(): Drawing {
	const s = new Sheet(276, 128, 2);
	s.line(wander([[110, 117], [262, 117]], 6, 1), 1.5);
	s.line(wander([[223, 54], [246, 50], [258, 38], [264, 22], [272, 10]], 7, 1.2, 8), 1.6, 0.8);
	s.object();
	const body = roundRect(162, 30, 226, 116, 12);
	s.cast(body, 9, 4, 2.3);
	s.shape(body, 2.2, 1.6);
	s.shade(quad(212, 40, 223, 110), 74, 1.8);
	s.object();
	const beans: P[] = [[174, 104], [188, 108], [202, 105], [215, 102], [180, 94], [195, 95], [209, 91], [173, 84], [188, 84], [203, 81]];
	s.wash(roundRect(168, 76, 221, 112, 9), 2, 3);
	beans.forEach((at, k) => {
		const bean = turn(ellipse(at[0], at[1], 6, 4, 18), k * 37, at);
		s.shape(bean, 1.1, 0.7);
		s.line(turn([[at[0] - 3.4, at[1] + 0.4], [at[0], at[1] - 0.6], [at[0] + 3.4, at[1] + 0.4]], k * 37, at), 0.7, 0.1);
	});
	s.object();
	const lid = roundRect(167, 18, 221, 32, 4);
	s.cast(lid, 3, 3, 2);
	s.shape(lid, 1.9);
	for (let x = 172; x < 218; x += 5) s.line([[x, 20.5], [x + 0.3, 29.5]], 0.6, 0.1);
	s.object();
	s.shape(roundRect(170, 40, 222, 68, 3, 3), 1.6);
	s.line([[178, 47], [182, 44.5], [187, 46], [187, 50.5], [182, 53]], 1.7, 0.2);
	s.line([[182, 53], [188, 55.5], [188, 60.5], [183, 63], [177, 61]], 1.7, 0.2);
	s.object({ transform: 'scale(var(--hover, 0), 1)', origin: [175, 60], easing: 'ease-out' });
	s.line([[175, 60], [192, 46]], 1.8, 0.2);
	s.object({ transform: 'translate(calc((1 - var(--hover, 0)) * -3px), 0)', origin: [206, 54], opacity: 'var(--hover, 0)', delay: 150, easing: 'ease-out' });
	s.wash(ellipse(207, 54, 9, 10, 18), 1.5, 2);
	s.line([[209, 44], [200, 57], [214, 57]], 1.7, 0.2);
	s.line([[209, 48], [209, 64]], 1.7, 0.2);
	return s.done();
}

/** Router: a folded street map with a dashed route and a pin where it ends. */
function router(): Drawing {
	const s = new Sheet(276, 128, 4);
	const folds = [120, 162, 204, 246];
	const tops = [20, 26, 20, 26];
	const bottoms = [96, 90, 96, 90];
	const sheet: P[] = [...folds.map((x, k) => [x, tops[k]!] as P), ...folds.map((x, k) => [x, bottoms[k]!] as P).reverse()];
	s.cast(sheet, 6, 6, 2.6);
	s.shape(sheet, 2);
	for (let k = 1; k < folds.length - 1; k++) s.line([[folds[k]!, tops[k]! + 1], [folds[k]!, bottoms[k]! - 1]], 1.1, 0.2);
	s.tone(quad(162, 28, 204, 88), 70, 2.8);
	s.line(wander([[124, 52], [244, 46]], 11, 0.8), 0.9);
	s.line(wander([[140, 24], [150, 92]], 12, 0.8), 0.9);
	s.line(wander([[214, 24], [222, 92]], 13, 0.8), 0.9);
	const route: P[] = resample([[130, 82], [158, 74], [176, 60], [196, 64], [214, 50], [226, 40]], 7);
	for (let k = 0; k + 1 < route.length; k += 2) s.line([route[k]!, route[k + 1]!], 1.5, 0.2);
	s.object(shift(0, -6));
	const pin: P[] = [...arc(228, 26, 9, 9, 150, 390, 18), [228, 44]];
	s.cast(pin, 4, 3, 2);
	s.wash(pin, 2, 2.5);
	s.shape(pin, 1.9);
	s.shape(ellipse(228, 26, 3.2, 3.2, 12), 1.1, 0.4);
	return s.done();
}

/** UI components: a sheet of controls, a switch, a ticked box and a button, laid out like a parts card. */
function ui(): Drawing {
	const s = new Sheet(276, 128, 5);
	const card = roundRect(118, 14, 254, 100, 8);
	s.cast(card, 6, 6, 2.6);
	s.shape(card, 2);
	s.line(wander([[182, 37], [236, 37]], 21, 0.6), 1);
	s.line(wander([[160, 67], [214, 67]], 22, 0.6), 1);
	s.object();
	const track = roundRect(132, 28, 170, 46, 9, 6);
	s.wash(track, 1.5, 2);
	s.shape(track, 1.6);
	s.object(shift(-21, 0));
	s.shape(ellipse(161, 37, 6.5, 6.5, 18), 1.6);
	s.shade(ellipse(161, 37, 5.2, 5.2, 14), 30, 1.4);
	s.object();
	s.shape(roundRect(132, 58, 150, 76, 3, 3), 1.6);
	s.line([[135, 66], [141, 72], [152, 54]], 2, 0.2);
	s.object();
	const button = roundRect(200, 76, 244, 94, 6, 4);
	s.cast(button, 3, 3, 1.8);
	s.shape(button, 1.6);
	s.line([[210, 85], [234, 85]], 1.2, 0.2);
	return s.done();
}

/** How it works: two gears meshing, the small one driving the large. */
function how(): Drawing {
	const s = new Sheet(276, 280, 6);
	const gear = (cx: number, cy: number, r: number, teeth: number, phase: number): P[] => {
		const pts: P[] = [];
		const n = teeth * 8;
		for (let k = 0; k < n; k++) {
			const a = (k / n) * Math.PI * 2 + rad(phase);
			const t = ((k % 8) + 8) % 8;
			const out = t >= 1 && t <= 3 ? r + r * 0.16 : r;
			pts.push([cx + out * Math.cos(a), cy + out * Math.sin(a)]);
		}
		return pts;
	};
	s.line(arc(116, 128, 76, 76, 150, 196, 12), 1.1, 0.4);
	s.line([[44, 160], [38, 170], [50, 168]], 1.1, 0.2);
	s.object(sway(-16, [116, 128]));
	const big = gear(116, 128, 62, 12, 0);
	s.cast(big, 9, 7, 2.4);
	s.shape(big, 2.3, 1.5);
	s.tone(arc(116, 128, 54, 54, -20, 100, 16).concat(arc(116, 128, 36, 36, 100, -20, 12)), 60, 2.4);
	for (let k = 0; k < 5; k++) {
		const a = rad(30 + k * 72);
		s.line([[116 + 24 * Math.cos(a), 128 + 24 * Math.sin(a)], [116 + 46 * Math.cos(a), 128 + 46 * Math.sin(a)]], 1.6, 0.3);
	}
	s.object(sway(-16, [116, 128]));
	s.shape(ellipse(116, 128, 18, 18, 28), 1.6);
	s.shade(ellipse(117, 129, 10.8, 10.8, 16), 40, 1.5);
	s.object(sway(29, [204, 74]));
	const small = gear(204, 74, 34, 8, 11);
	s.cast(small, 7, 6, 2.4);
	s.wash(small, 2.5, 3);
	s.shape(small, 2.1, 1.3);
	s.object(sway(29, [204, 74]));
	s.shape(ellipse(204, 74, 10, 10, 28), 1.6);
	s.shade(ellipse(205, 75, 6, 6, 16), 40, 1.5);
	return s.done();
}

/** Native targets: a laptop with a phone propped against it, both showing the same screen. */
function native(): Drawing {
	const s = new Sheet(276, 128, 10);
	s.line(wander([[96, 108], [272, 108]], 41, 1), 1.5);
	s.object();
	const lid = roundRect(134, 28, 226, 90, 5, 3);
	s.cast(lid, 8, 5, 2.4);
	s.shape(lid, 2);
	s.shape(roundRect(142, 35, 218, 84, 2, 2), 1, 0.4, false);
	s.line(wander([[150, 48], [190, 48]], 42, 0.5), 1.4);
	s.line(wander([[150, 58], [176, 58]], 43, 0.5), 0.9);
	s.object();
	const base: P[] = [[128, 91], [232, 91], [244, 106], [116, 106]];
	s.cast(base, 6, 2, 2.4);
	s.shape(base, 2, 1.6);
	s.tone(quad(150, 94, 210, 102), 10, 2.6);
	s.object(sway(-7, [232, 106]));
	const phone = turn(roundRect(212, 36, 248, 106, 7, 4), 4, [230, 71]);
	s.cast(phone, 7, 4, 2.2);
	s.shape(phone, 2, 1.4);
	const screen = turn(roundRect(217, 46, 243, 96, 2, 2), 6, [230, 71]);
	s.wash(screen, 1.5, 2);
	s.shape(screen, 1, 0.4, false);
	s.line(turn([[225, 41], [235, 41]], 6, [230, 71]), 1.1, 0.1);
	s.line(turn(wander([[221, 58], [238, 58]], 44, 0.4), 6, [230, 71]), 1.3);
	s.line(turn(wander([[221, 66], [233, 66]], 45, 0.4), 6, [230, 71]), 0.9);
	return s.done();
}

/** Contributing: a pencil laid across a notebook page that already carries a tick. */
function contributing(): Drawing {
	const s = new Sheet(276, 128, 7);
	const tilt = (pts: P[]) => turn(pts, -5, [186, 58]);
	const page = tilt(roundRect(124, 10, 248, 106, 4, 3));
	s.cast(page, 7, 6, 2.4);
	s.shape(page, 2.1);
	for (let k = 0; k < 5; k++) s.line(tilt(wander([[140, 28 + k * 16], [238, 28 + k * 16]], 30 + k, 0.6)), 0.7, 0.2);
	s.line(tilt([[134, 14], [134, 102]]), 1, 0.2);
	for (let k = 0; k < 4; k++) s.shape(tilt(ellipse(130, 22 + k * 24, 2.6, 2.6, 12)), 0.9, 0.3);
	s.line(tilt([[148, 38], [156, 46], [172, 26]]), 2.4, 0.4);
	s.object(sway(9, [190, 86]));
	const lay = (pts: P[]) => turn(pts, -22, [190, 86]);
	const pencil = lay([[118, 80], [238, 80], [262, 86], [238, 92], [118, 92]]);
	s.cast(pencil, 5, 6, 2.2);
	s.wash(lay(quad(132, 80, 238, 92)), 2, 2.5);
	s.shape(pencil, 1.9);
	s.shape(lay(quad(118, 80, 132, 92)), 1.4);
	s.shape(lay([[255, 84], [262, 86], [255, 88]]), 1.2);
	s.line(lay([[132, 86], [238, 86]]), 0.8, 0.2);
	s.tone(lay(quad(132, 87, 238, 92)), -22 + 90, 2);
	return s.done();
}

/** Migrate an app: a moving box, flaps open, the app's page lifting out of it. */
function migrate(): Drawing {
	const s = new Sheet(276, 280, 11);
	s.line(wander([[28, 236], [250, 236]], 51, 1.2), 1.6);
	s.object();
	const leftFlap: P[] = [[64, 132], [36, 100], [112, 96], [138, 132]];
	s.shape(leftFlap, 1.8);
	s.tone(leftFlap, 20, 2.8);
	const rightFlap: P[] = [[138, 132], [166, 92], [242, 98], [212, 132]];
	s.shape(rightFlap, 1.8);
	s.tone(rightFlap, -20, 2.8);
	s.object(shift(0, -14));
	const sheet = turn(roundRect(92, 46, 186, 150, 5, 3), -4, [139, 98]);
	s.cast(sheet, 5, 5, 2.4);
	s.shape(sheet, 2);
	const bar = turn(quad(92, 46, 186, 62), -4, [139, 98]);
	s.wash(bar, 2, 2.5);
	s.line(turn([[92, 62], [186, 62]], -4, [139, 98]), 1.2, 0.2);
	for (const [x, y] of [[100, 54], [108, 54], [116, 54]] as P[]) s.shape(turn(ellipse(x, y, 2.4, 2.4, 10), -4, [139, 98]), 0.9, 0.3);
	s.line(turn(wander([[104, 78], [170, 78]], 52, 0.5), -4, [139, 98]), 1.5);
	s.line(turn(wander([[104, 92], [152, 92]], 53, 0.5), -4, [139, 98]), 1);
	s.object();
	const body = quad(64, 132, 212, 236);
	s.cast(body, 9, 4, 2.4);
	s.shape(body, 2.3, 1.6);
	s.shade(quad(184, 136, 210, 234), 70, 2);
	s.shape(quad(126, 132, 150, 170), 1.2, 0.5);
	s.object();
	const label = turn(quad(82, 182, 140, 222), -3, [111, 202]);
	s.shape(label, 1.4);
	s.line(turn([[92, 202], [128, 202]], -3, [111, 202]), 1.6, 0.2);
	s.line(turn([[120, 194], [129, 202], [120, 210]], -3, [111, 202]), 1.6, 0.2);
	return s.done();
}

/** Apps being moved: a clipboard log of ports, every line ticked off. */
function apps(): Drawing {
	const s = new Sheet(276, 128, 12);
	s.line(wander([[110, 118], [272, 118]], 61, 1), 1.4);
	s.object(sway(5, [196, 118]));
	const tilt = (pts: P[]) => turn(pts, 5, [196, 64]);
	const board = tilt(roundRect(152, 12, 240, 116, 6, 3));
	s.cast(board, 7, 4, 2.4);
	s.shape(board, 2.1, 1.5);
	s.shape(tilt(roundRect(160, 26, 232, 110, 2, 2)), 1, 0.4);
	for (let k = 0; k < 4; k++) {
		const y = 40 + k * 18;
		s.shape(tilt(roundRect(166, y - 5, 176, y + 5, 2, 2)), 1, 0.4);
		s.line(tilt([[167.5, y], [170.5, y + 3], [177, y - 6]]), 1.5, 0.2);
		s.line(tilt(wander([[182, y], [222 - (k % 2) * 12, y]], 62 + k, 0.5)), 0.9);
	}
	const clip = tilt(roundRect(180, 4, 212, 18, 4, 3));
	s.wash(clip, 1.5, 2);
	s.shape(clip, 1.8);
	return s.done();
}

/** Markless Migrate on GitHub: a repository folder with its branch graph, and the arrow out to another site. */
function repo(): Drawing {
	const s = new Sheet(276, 128, 13);
	const folder: P[] = [[132, 30], [168, 30], [176, 40], [244, 40], [244, 112], [132, 112]];
	s.cast(folder, 7, 5, 2.4);
	s.shape(folder, 2.1, 1.5);
	s.line([[133, 46], [243, 46]], 1, 0.3);
	const nodes: P[] = [[156, 92], [184, 92], [214, 92], [198, 64]];
	s.line([nodes[0]!, nodes[2]!], 1.6, 0.3);
	s.line([[184, 92], [192, 72], [198, 64]], 1.6, 0.3);
	for (const [x, y] of nodes) s.shape(ellipse(x, y, 5, 5, 14), 1.4, 0.5);
	s.wash(ellipse(198, 64, 5.5, 5.5, 14), 1.5, 1.5);
	s.object(shift(4, -4));
	const badge = roundRect(226, 16, 262, 52, 6, 3);
	s.cast(badge, 3, 3, 2);
	s.shape(badge, 1.8);
	s.line([[236, 43], [252, 26]], 2, 0.2);
	s.line([[242, 25], [253, 25], [253, 36]], 2, 0.2);
	return s.done();
}

/** The sun the light theme's toggle shows: a disc and a ring of tapered rays. */
function sun(): Drawing {
	const s = new Sheet(48, 48, 8, false);
	const disc = ellipse(24, 24, 9, 9, 32);
	s.wash(disc, 1.5, 1.5);
	s.shape(disc, 1.9, 1.2);
	s.tone(arc(24, 24, 7, 7, -10, 120, 10).concat([[24, 24]]), 50, 1.5);
	for (let k = 0; k < 8; k++) {
		const a = rad(k * 45 + 8);
		const [r0, r1] = k % 2 ? [13, 18] : [13, 21];
		s.line([[24 + r0 * Math.cos(a), 24 + r0 * Math.sin(a)], [24 + r1 * Math.cos(a), 24 + r1 * Math.sin(a)]], 2, 0.2);
	}
	return s.done();
}

/** The search button's magnifying glass: a washed lens and a hatched handle. */
function magnifier(): Drawing {
	const s = new Sheet(48, 48, 14, false);
	const handle = turn(roundRect(27, 26, 44, 33, 3, 3), 45, [30, 30]);
	s.shape(handle, 1.8, 1.2);
	s.tone(handle, -45, 1.6);
	s.object();
	const lens = ellipse(20, 20, 12, 12, 36);
	s.wash(ellipse(20, 20, 9, 9, 24), 1.2, 1.5);
	s.shape(lens, 2, 1.3);
	s.line(arc(20, 20, 8, 8, 200, 260, 8), 1.1, 0.2);
	return s.done(0);
}

/** The part of one disc a second disc does not cover, traced as one ring. */
function crescent(o: P, r: number, i: P, ri: number): P[] {
	const run = (c: P, rr: number, keep: (p: P) => boolean): P[] => {
		const pts = Array.from({ length: 144 }, (_, k): P => [c[0] + rr * Math.cos((k / 144) * Math.PI * 2), c[1] + rr * Math.sin((k / 144) * Math.PI * 2)]);
		const from = pts.findIndex((p, k) => keep(p) && !keep(pts[(k + 143) % 144]!));
		const out: P[] = [];
		for (let k = from; keep(pts[k % 144]!) && out.length < 144; k++) out.push(pts[k % 144]!);
		return out;
	};
	const outer = run(o, r, (p) => Math.hypot(p[0] - i[0], p[1] - i[1]) > ri);
	const inner = run(i, ri, (p) => Math.hypot(p[0] - o[0], p[1] - o[1]) < r);
	return [...outer, ...inner.reverse()];
}

/** The moon the dark theme's toggle shows: a crescent hatched on its inner edge, and two stars. */
function moon(): Drawing {
	const s = new Sheet(48, 48, 9, false);
	const body = crescent([22, 26], 16, [31, 19], 13);
	s.wash(body, 1.2, 1.5);
	s.shape(body, 1.9, 1.2);
	s.tone(crescent([22, 26], 14, [29, 21], 13), 30, 1.6);
	for (const [x, y, r] of [[40, 9, 3.4], [43, 37, 2.4]] as [number, number, number][]) {
		s.line([[x - r, y], [x + r, y]], 1.2, 0.1);
		s.line([[x, y - r], [x, y + r]], 1.2, 0.1);
	}
	return s.done();
}

/** The cards' drawings, keyed by the symbol id the navbar links. */
export function decor() {
	return { start: start(), concepts: concepts(), router: router(), ui: ui(), migrate: migrate(), apps: apps(), repo: repo(), how: how(), native: native(), contributing: contributing() };
}

export type DecorName = keyof ReturnType<typeof decor>;

/** The inked edges of the cards and panels, by the size each is drawn for. */
export const EDGE_SIZES = {
	card: [276, 200],
	tall: [276, 416],
	panel: [600, 448],
} as const satisfies Record<string, readonly [number, number]>;

export function edges() {
	return Object.fromEntries(Object.entries(EDGE_SIZES).map(([name, [w, h]], k) => [name, edge(w, h, 20 + k, name === 'panel' ? 16 : 10)])) as Record<keyof typeof EDGE_SIZES, Drawing>;
}

/** The toggle's two drawings, frozen into a module so they render inline with no request. */
export function themeArt() {
	return { sun: sun(), moon: moon(), magnifier: magnifier() };
}
