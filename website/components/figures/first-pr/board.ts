// A board game on the desk: your branch's pawn walks six squares in order, turns red on the test square before it may leave, answers the review cards, and reaches main only through the merge-queue square.
import { hatch, pathOf, resample } from '../ink/ink.ts';
import { desk } from '../ink/sheets.ts';
import { die, pawn } from './pieces.ts';

/** The six steps of the page, in order, as the board's squares print them. */
export const SQUARES = [
	['read the', 'rules'],
	['write the', 'failing test'],
	['make the', 'smallest change'],
	['run the', 'two checks'],
	['commit,', 'the hook runs'],
	['answer every', 'finding'],
];

export const REQUIRED = ['test', 'typecheck', 'agent-files'];

const W = 4.1;
const H = 3.8;
/** Where each square sits on the board, in board units: a loop clockwise from the top left, then the queue and main along the bottom. */
const AT: [number, number][] = [
	[0.7, 1.1],
	[5.1, 1.1],
	[9.5, 1.1],
	[13.9, 1.1],
	[13.9, 9.3],
	[9.5, 9.3],
	[5.1, 9.3],
	[0.7, 9.3],
];
const STEP = 650;
const t = (i: number) => 400 + i * STEP;

export function drawing() {
	const k = desk(680, [{ key: 'board', x: 0, y: 0, w: 18.7, h: 13.6, curl: false }], [[21.4, 7, 1]]);
	k.lay();
	AT.forEach(([u, v], i) => {
		k.box('board', u, v, u + W, v + H, '', undefined, 'pen');
		k.box('board', u + 0.18, v + 0.18, u + W - 0.18, v + H - 0.18, '', undefined, 'pen faint');
		if (i % 2 === 1) k.raw.path(hatch(k.raw.on('board', [[u + 0.25, v + 0.25], [u + W - 0.25, v + 0.25], [u + W - 0.25, v + H - 0.25], [u + 0.25, v + H - 0.25]], 0.01), 0.7, 3.4, 2500 + i, { cluster: 3, skip: 0.4, trim: 0.5 }), 'sheet-hatch light');
		if (i < 6) {
			k.number('board', u + 0.75, v + 0.95, String(i + 1));
			k.row('board', u + 0.4, v + 1.85, SQUARES[i]![0]!, 'mono small');
			k.row('board', u + 0.4, v + 2.45, SQUARES[i]![1]!, 'mono small');
		}
	});
	k.row('board', AT[6]![0] + 0.4, AT[6]![1] + 1.0, 'merge queue', 'ui bold-ui');
	REQUIRED.forEach((name, i) => k.row('board', AT[6]![0] + 0.95, AT[6]![1] + 1.75 + i * 0.6, name, 'mono small'));
	k.row('board', AT[7]![0] + 0.7, AT[7]![1] + 2, 'main', 'big');
	const dots = (a: [number, number], b: [number, number]) => {
		const pts = resample(k.raw.on('board', [a, b], 0.02), 5);
		k.raw.path(pts.map((p) => pathOf([p, [p[0] + 1.2, p[1] + 0.2]])).join(''), 'perforation');
	};
	for (let i = 0; i < 3; i++) dots([AT[i]![0] + W + 0.05, AT[i]![1] + H / 2], [AT[i + 1]![0] - 0.05, AT[i + 1]![1] + H / 2]);
	dots([AT[3]![0] + W / 2, AT[3]![1] + H + 0.05], [AT[4]![0] + W / 2, AT[4]![1] - 0.05]);
	for (let i = 4; i < 7; i++) dots([AT[i]![0] - 0.05, AT[i]![1] + H / 2], [AT[i + 1]![0] + W + 0.05, AT[i + 1]![1] + H / 2]);
	k.raw.text('board', 5.1, 8.8, 'THE ONLY WAY ONTO MAIN', 'hand');
	k.raw.text('board', 0.7, 0.75, 'START', 'hand');
	k.box('board', 0.25, 0.3, 18.45, 13.3, '', undefined, 'pen faint');
	k.next();

	const deck = { u: 4.6, v: 5.5 };
	k.box('board', deck.u + 0.25, deck.v + 0.2, deck.u + 4.25, deck.v + 2.9, '', undefined, 'pen faint');
	k.box('board', deck.u, deck.v, deck.u + 4, deck.v + 2.7, '', undefined, 'pen');
	k.row('board', deck.u + 0.4, deck.v + 1, 'REVIEW', 'hand');
	k.row('board', deck.u + 0.4, deck.v + 1.75, 'CodeRabbit', 'mono small');
	k.row('board', deck.u + 0.4, deck.v + 2.35, 'and people', 'mono small');
	const cards: [string, string][] = [
		['right:', 'fix it'],
		['stale or wrong:', 'reply'],
	];
	cards.forEach(([a, b], i) => {
		const u = 9.4 + i * 4.3;
		const at = t(5) + 150 + i * 300;
		k.box('board', u, deck.v + 0.2, u + 4, deck.v + 2.9, 'show', at, 'pen');
		k.row('board', u + 0.3, deck.v + 1.2, a, 'mono small', 'show', at);
		k.row('board', u + 0.3, deck.v + 2, b, 'mono small', 'show', at);
		k.tick('board', u + 3.3, deck.v + 2.3, 'draw', at + 250);
	});

	AT.slice(0, 6).forEach(([u, v], i) => {
		const done = i === 1 ? t(i) + 500 : t(i) + 250;
		if (i === 1) {
			const red = k.raw.motion('flash', t(1) + 100, '', t(1) + 1100);
			k.raw.path(pathOf(k.raw.on('board', [[u + 3.1, v + 0.4], [u + 3.7, v + 1.1]])) + pathOf(k.raw.on('board', [[u + 3.7, v + 0.4], [u + 3.12, v + 1.08]])), 'pen squiggle flash', red);
			k.raw.path(pathOf(k.raw.on('board', [[u + 0.35, v + 2.7], [u + 3, v + 2.7]])), 'pen squiggle flash', red);
			k.raw.text('board', u + 1.35, v + 1.05, 'FAILS', 'hand tint-err', 'flash', t(1) + 100);
		}
		k.tick('board', u + 3.4, v + 1, 'draw', done + (i === 1 ? 300 : 0));
	});
	REQUIRED.forEach((_, i) => k.tick('board', AT[6]![0] + 0.5, AT[6]![1] + 1.75 + i * 0.6, 'draw', t(6) + 150 + i * 150));
	k.swipe('board', AT[7]![0] + 0.6, AT[7]![0] + 2.4, AT[7]![1] + 2, 'show', t(7) + 200);

	die(k, 19.6, 4.8, 1.3, 5, 2100);
	const foot = (i: number) => k.raw.at('board', AT[i]![0] + 3.45, AT[i]![1] + 3.45, 0.05);
	for (let i = 0; i < 7; i++) pawn(k, foot(i), 2200 + i * 20, 'flash', t(i) - 80, t(i + 1) - 80 + (i === 1 ? 300 : 0));
	pawn(k, foot(7), 2400, 'show', t(7) - 80);
	return k.build();
}
