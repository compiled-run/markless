// The create command on a terminal sheet, and beside it the CLI's own questions on a card, already answered by the flags before it can ask them.
import { ellipse } from '../ink/desk.ts';
import { lengthOf, line, pathOf, resample } from '../ink/ink.ts';
import { desk, type P } from '../ink/sheets.ts';

export const LINES = ['npm create markless@latest my-app \\', '    -- --yes --starter app --no-git'];

/** The questions packages/cli asks, in its order, with the answer the command gives each and the flag that gave it. */
export const QUESTIONS = [
	{ q: 'What are you building today?', options: ['Learn Markless', 'Build an app', 'Write docs', 'Full-stack app'], pick: 1, flag: '--starter app' },
	{ q: 'What should we call it?', options: [], pick: -1, flag: 'my-app' },
	{ q: 'Where should it run?', options: ['Node', 'Bun'], pick: 0, flag: '--yes' },
	{ q: 'Install dependencies now?', options: ['Yes', 'No'], pick: 0, flag: '--yes' },
	{ q: 'Initialize git?', options: ['Yes', 'No'], pick: 1, flag: '--no-git' },
];

/** Shantell Sans at the card's size, in sheet units per character, measured on the drawing. */
const UI = 0.3;

export function drawing() {
	const rowV = (i: number) => 3.1 + i * 1.72;
	const cardH = rowV(QUESTIONS.length) + 0.2;
	const k = desk(680, [
		{ key: 'term', x: 0, y: 0, w: 21, h: 4.3, bar: 'terminal', curl: false },
		{ key: 'card', x: 0.6, y: 5.6, w: 20, h: cardH, turn: -0.012 },
		{ key: 'slip', x: 14.9, y: 1.9, w: 5.6, h: 2.6, turn: 0.06, curl: false },
	]);
	k.lay();
	k.row('term', 1, 2.6, '$', 'dim');
	LINES.forEach((text, i) => k.row('term', 1.7, 2.6 + i * 0.8, text, 'bold'));
	k.row('slip', 0.6, 1.5, '--', 'big');
	k.hand('slip', 1.7, 1.45, 'NPM PASSES', 'show', 300);
	k.hand('slip', 1.7, 2.2, 'THE REST ON', 'show', 300);
	k.row('card', 1, 1.6, 'Welcome to Markless', 'big');
	QUESTIONS.forEach(({ q, options }, i) => {
		const v = rowV(i);
		k.row('card', 1, v, q, 'ui');
		let u = 1.4;
		options.forEach((o) => {
			k.raw.path(pathOf(k.raw.on('card', ellipse(u, v + 0.62, 0.17, 0.17, 14))), 'perforation');
			k.row('card', u + 0.4, v + 0.75, o, 'ui');
			u += 0.75 + o.length * UI + 0.35;
		});
	});
	k.next();
	let at = 700;
	QUESTIONS.forEach(({ options, pick, flag }, i) => {
		const v = rowV(i);
		if (pick < 0) {
			k.hand('card', 1.6, v + 0.85, 'my-app', 'show', at, 'hand big');
			const pts = resample(k.raw.on('card', [[1.4, v + 1.05], [5.2, v + 1.0]]), 3);
			k.raw.path(pathOf(pts), 'pen draw', k.raw.motion('draw', at, '--l:' + Math.round(lengthOf(pts) + 4)));
		} else {
			let u = 1.4;
			options.forEach((o, j) => {
				if (j === pick) {
					if (o === 'No' || pick > 0) k.ring('card', u + 0.25, u + 0.4 + o.length * UI, v + 0.75, 'draw', at, 0.42);
					else k.tick('card', u + 0.05, v + 0.72, 'draw', at);
				} else if (i === 4) k.strike('card', u + 0.25, u + 0.45 + o.length * UI, v + 0.72, 'draw', at + 250);
				u += 0.75 + o.length * UI + 0.35;
			});
		}
		k.row('card', 10.6, v, flag, flag === '--yes' ? 'dim' : 'bold', 'show', at + 200);
		at += 650;
	});
	const stampAt = 4400;
	const box: P[] = [[13.4, 0.7], [19.4, 0.7], [19.4, 2.1], [13.4, 2.1], [13.4, 0.7]];
	k.raw.path(line(k.raw.on('card', box), { w: 1.2, seed: 2101 }), 'stamp-ink show', k.raw.motion('show', stampAt));
	k.raw.text('card', 13.9, 1.65, '--yes: NO QUESTIONS', 'stamp-word', 'show', stampAt);
	return k.build();
}
