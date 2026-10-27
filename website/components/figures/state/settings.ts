// The State page's settings demo: its words, and the sun and moon it shows for each theme.
import { ellipse } from '../ink/desk.ts';
import { hatch, line, outline, type P, pathOf, wash } from '../ink/ink.ts';

export type Theme = 'light' | 'dark';

/** The sentence a screen reader hears after a press. */
export const describe = (theme: Theme, presses: number): string =>
	'Theme is ' + theme + '. The page colours, the heading and the picture changed together. Settings() ran once; the handler ran ' + times(presses) + '.';

export const times = (count: number): string => (count === 1 ? '1 time' : count + ' times');

/** Flips between two values each press, so the same CSS animation can replay. */
export const flip = (beat: string): string => (beat === 'odd' ? 'even' : 'odd');

function sun() {
	const c: P = [40, 40];
	const disc = ellipse(c[0], c[1], 17, 17, 40);
	const rays = Array.from({ length: 12 }, (_, i) => {
		const a = (i / 12) * Math.PI * 2 + 0.15;
		const r0 = 22;
		const r1 = 31 + (i % 2) * 6;
		return line([[c[0] + Math.cos(a) * r0, c[1] + Math.sin(a) * r0], [c[0] + Math.cos(a) * r1, c[1] + Math.sin(a) * r1]], { w: 2, seed: 920 + i, over: 0.2, wobble: 0.3 });
	}).join('');
	return { disc: pathOf(disc, true), wash: wash(disc, 911, 1.5, 2.5), ink: outline(disc, { w: 1.9, heavy: 1.4, centre: c, seed: 912 }) + rays,
		shade: hatch(disc.filter(([x, y]) => x + y > 84), 0.8, 2, 913, { cluster: 3 }) };
}

function moon() {
	const outer = ellipse(40, 40, 18, 18, 48);
	const bitten = ([x, y]: P) => (x - 49) ** 2 + (y - 33) ** 2 < 15 ** 2;
	const from = outer.findIndex((p, i) => !bitten(p) && bitten(outer.at(i - 1)!));
	const crescent = [...outer.slice(from), ...outer.slice(0, from)].filter((p) => !bitten(p));
	const bite = ellipse(49, 33, 15, 15, 48);
	const back = bite.findIndex((p, i) => (p[0] - 40) ** 2 + (p[1] - 40) ** 2 < 18 ** 2 && (bite.at(i - 1)![0] - 40) ** 2 + (bite.at(i - 1)![1] - 40) ** 2 >= 18 ** 2);
	const inner = [...bite.slice(back), ...bite.slice(0, back)].filter(([x, y]) => (x - 40) ** 2 + (y - 40) ** 2 < 18 ** 2).reverse();
	const shape = [...crescent, ...inner];
	const star = (x: number, y: number, s: number, seed: number) =>
		line([[x - s, y], [x + s, y]], { w: 0.9, seed, over: 0.2 }) + line([[x, y - s], [x, y + s]], { w: 0.9, seed: seed + 1, over: 0.2 });
	return {
		disc: pathOf(shape, true),
		wash: wash(shape, 931, 0.8, 1.6),
		shade: hatch(shape, 0.8, 2, 932, { cluster: 3 }),
		ink: outline(shape, { w: 1.6, heavy: 1.2, centre: [36, 44], seed: 933 }) + star(62, 20, 4, 934) + star(66, 52, 2.6, 936) + star(18, 16, 2.6, 938),
	};
}

export function drawing() {
	return { sun: sun(), moon: moon() };
}
