// Brief (checklist passed). Belief: a reload keeps a storage() value, and starts state() over.
// Objects: the browser window with its reload arrow; the dark-mode switch (storage()); the sidebar (state()).
// Action: press reload. Change: the page redraws, the switch stays where you left it, the sidebar closes. Unchanged: the switch.
// Prevents: "every value is lost on reload". Surprise: drag the cookie out of the address bar, reload, and the switch resets too.
import { ellipse, roundRect } from '../ink/desk.ts';
import { hatch, line, outline, type P, pathOf, stroke, wash } from '../ink/ink.ts';

export const WIDTH = 680;
export const HEIGHT = 420;

const WIN = { x0: 90, y0: 28, x1: 590, y1: 372 };
const BAR = 74;
const HEAD = 116;
export const RELOAD: P = [178, 51];
export const COOKIE: P = [516, 51];
/** Where a cleared cookie lies, on the desk beside the window. */
export const COOKIE_OUT: P = [632, 312];
const SWITCH = { x0: 494, y0: 84, x1: 554, y1: 106 };
const MENU: P = [116, 95];
const SIDE = { x0: 92, x1: 238 };

/** The window: its shadow on the desk, frame, title bar, three dots and the address pill. */
function windowArt() {
	const frame = roundRect(WIN.x0, WIN.y0, WIN.x1, WIN.y1, 14);
	const bar: P[] = [[WIN.x0 + 2, WIN.y0 + 10], [WIN.x1 - 2, WIN.y0 + 10], [WIN.x1 - 2, BAR], [WIN.x0 + 2, BAR]];
	const pill = roundRect(204, 38, 540, 64, 13);
	const shadow = roundRect(WIN.x0 + 12, WIN.y0 + 16, WIN.x1 + 14, WIN.y1 + 12, 16);
	const dots = [112, 128, 144].map((x, k) => outline(ellipse(x, 51, 4.6, 4.6, 16), { w: 1, seed: 610 + k })).join('');
	return {
		shadow: hatch(shadow, -0.7, 2.6, 600, { cluster: 5, skip: 0.3, trim: 0.5 }),
		paper: pathOf(frame, true),
		barTone: hatch(bar, 0.1, 2.6, 601, { cluster: 5, skip: 0.25, trim: 0.5 }),
		ink: outline(frame, { w: 2.2, heavy: 1.6, seed: 602 }) + line([[WIN.x0, BAR], [WIN.x1, BAR]], { w: 1.2, seed: 603, over: 0.3 }) + dots,
		pill: pathOf(pill, true),
		pillInk: outline(pill, { w: 1, seed: 604 }),
		site: { x: 222, y: 56 },
	};
}

/** The reload button: a raised round button with a circular arrow, pink because it is the action. */
function reloadArt() {
	const [cx, cy] = RELOAD;
	const disc = ellipse(cx, cy, 13, 13, 30);
	const side = ellipse(cx + 1.5, cy + 2, 13, 13, 30);
	const arc: P[] = Array.from({ length: 18 }, (_, i) => {
		const a = -0.9 + (i / 17) * 4.9;
		return [cx + Math.cos(a) * 7, cy + Math.sin(a) * 7];
	});
	const tip = arc.at(-1)!;
	const before = arc.at(-4)!;
	const ang = Math.atan2(tip[1] - before[1], tip[0] - before[0]);
	const head = (s: number): P[] => [[tip[0] - Math.cos(ang + s) * 4.5, tip[1] - Math.sin(ang + s) * 4.5], tip];
	return {
		side: pathOf(side, true),
		paper: pathOf(disc, true),
		wash: wash(disc, 620, 1, 2),
		ink: outline(disc, { w: 1.3, heavy: 0.9, seed: 621 }) + line(arc, { w: 1.2, seed: 622, over: 0 }) + stroke(head(0.5), { w: 1.2, seed: 623, over: 0.3 }) + stroke(head(-0.5), { w: 1.2, seed: 624, over: 0.3 }),
	};
}

/** The cookie in the address bar: a round biscuit with a bite and three chips; and the dashed spot it leaves when dragged out. */
function cookieArt() {
	const [cx, cy] = COOKIE;
	const body: P[] = ellipse(cx, cy, 11, 11, 32).filter(([x, y]) => Math.hypot(x - (cx + 8.5), y - (cy - 7)) > 6);
	const chips = [[-4, -3], [4, 3], [-2, 5], [1, -1]].map(([dx, dy], k) => outline(ellipse(cx + dx!, cy + dy!, 1.6, 1.4, 10), { w: 1, seed: 631 + k })).join('');
	const hole = ellipse(cx, cy, 11.5, 11.5, 24);
	return {
		paper: pathOf(body, true),
		ink: outline(body, { w: 1.1, heavy: 0.7, seed: 630 }) + chips,
		hole: pathOf(hole, true),
		out: `--out-x:${COOKIE_OUT[0] - cx}px;--out-y:${COOKIE_OUT[1] - cy}px`,
		outX: COOKIE_OUT[0] - cx,
		outY: COOKIE_OUT[1] - cy,
	};
}

/** The page inside the window: header rule, menu button, the switch, and the article's pencilled lines. */
function pageArt() {
	const r = 12;
	const corner = (cx: number, cy: number, from: number): P[] =>
		Array.from({ length: 7 }, (_, i) => {
			const a = from + (i / 6) * (Math.PI / 2);
			return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
		});
	const body: P[] = [[WIN.x0 + 2, BAR + 1], [WIN.x1 - 2, BAR + 1], ...corner(WIN.x1 - 2 - r, WIN.y1 - 2 - r, 0), ...corner(WIN.x0 + 2 + r, WIN.y1 - 2 - r, Math.PI / 2)];
	const scribble = (x: number, y: number, w: number, k: number): string =>
		stroke(Array.from({ length: 16 }, (_, i): P => [x + (i / 15) * w, y + Math.sin(i * 1.7 + k) * 1.4]), { w: 0.9, seed: 640 + k, over: 0 });
	const heading = stroke([[262, 150], [300, 149], [340, 151], [372, 150]], { w: 4, seed: 650, over: 0 });
	const lines = [178, 198, 218, 238, 268, 288, 308].map((y, k) => scribble(262, y, k % 3 === 2 ? 190 : 290, k)).join('');
	const menu = [-5, 0, 5].map((dy, k) => stroke([[MENU[0] - 9, MENU[1] + dy], [MENU[0] + 9, MENU[1] + dy]], { w: 2.4, seed: 660 + k, over: 0 })).join('');
	const menuHit = roundRect(MENU[0] - 14, MENU[1] - 12, MENU[0] + 14, MENU[1] + 12, 5);
	return {
		paper: pathOf(body, true),
		rule: line([[WIN.x0 + 2, HEAD], [WIN.x1 - 2, HEAD]], { w: 0.9, seed: 661, over: 0 }),
		heading,
		lines,
		menu,
		menuHit: pathOf(menuHit, true),
		menuInk: outline(menuHit, { w: 0.9, seed: 662 }),
	};
}

/** The dark-mode switch: a track, a knob that slides, a small sun and moon on either end. */
function switchArt() {
	const track = roundRect(SWITCH.x0, SWITCH.y0, SWITCH.x1, SWITCH.y1, 11);
	const knob = ellipse(SWITCH.x0 + 11, (SWITCH.y0 + SWITCH.y1) / 2, 8.5, 8.5, 26);
	const cy = (SWITCH.y0 + SWITCH.y1) / 2;
	const sun = outline(ellipse(SWITCH.x0 - 14, cy, 4, 4, 14), { w: 1, seed: 671 }) +
		[0, 1, 2, 3, 4, 5].map((k) => {
			const a = (k / 6) * Math.PI * 2;
			return stroke([[SWITCH.x0 - 14 + Math.cos(a) * 6, cy + Math.sin(a) * 6], [SWITCH.x0 - 14 + Math.cos(a) * 8.5, cy + Math.sin(a) * 8.5]], { w: 0.9, seed: 672 + k, over: 0 });
		}).join('');
	const moonOuter = ellipse(SWITCH.x1 + 14, cy, 6, 6, 20);
	const moon = outline(moonOuter.filter(([x, y]) => Math.hypot(x - (SWITCH.x1 + 17), y - (cy - 2)) > 4.6), { w: 1, seed: 680 }, false);
	return {
		track: pathOf(track, true),
		trackInk: outline(track, { w: 1.2, heavy: 0.8, seed: 670 }),
		knob: pathOf(knob, true),
		knobInk: outline(knob, { w: 1.1, heavy: 0.8, seed: 682 }),
		knobShade: hatch(knob.filter(([, y]) => y > cy), 1.2, 1.8, 683, { cluster: 3, trim: 0.3 }),
		travel: SWITCH.x1 - SWITCH.x0 - 22,
		sun,
		moon,
		hit: pathOf(roundRect(SWITCH.x0 - 24, SWITCH.y0 - 6, SWITCH.x1 + 24, SWITCH.y1 + 6, 8), true),
	};
}

/** The sidebar: a panel down the left of the page with its own pencilled links. */
function sidebarArt() {
	const panel: P[] = [[SIDE.x0, HEAD + 1], [SIDE.x1, HEAD + 1], [SIDE.x1, WIN.y1 - 2], [SIDE.x0 + 12, WIN.y1 - 2], [SIDE.x0 + 4, WIN.y1 - 5], [SIDE.x0, WIN.y1 - 12]];
	const links = [146, 172, 198, 224].map((y, k) => stroke(Array.from({ length: 8 }, (_, i): P => [112 + i * (k % 2 ? 9 : 12), y + Math.sin(i * 2 + k) * 1.2]), { w: 1, seed: 690 + k, over: 0 })).join('');
	return {
		paper: pathOf(panel, true),
		tone: hatch(panel, 1.45, 3.4, 699, { cluster: 3, skip: 0.45, trim: 0.5 }),
		ink: line([[SIDE.x1, HEAD + 1], [SIDE.x1, WIN.y1 - 2]], { w: 1.3, seed: 698, over: 0 }),
		links,
	};
}

/** The whole figure, frozen into browser.art.ts. */
export function drawing() {
	return {
		width: WIDTH,
		height: HEIGHT,
		window: windowArt(),
		reload: reloadArt(),
		cookie: cookieArt(),
		page: pageArt(),
		switch: switchArt(),
		sidebar: sidebarArt(),
		caption: { x: (WIN.x0 + WIN.x1) / 2, y: 410 },
	};
}
