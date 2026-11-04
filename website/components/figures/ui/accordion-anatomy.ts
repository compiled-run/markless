// The accordion page's anatomy: a shop help page drawn in ink, its question stack labelled by part, with a wire from each heading to the panel it names.
import { roundRect } from '../ink/desk.ts';
import { type P, pathOf } from '../ink/ink.ts';
import { sketcher } from '../reading/sketch.ts';

const QUESTIONS = ['When does my order ship?', 'How do I return something?', 'Do you ship overseas?'];

/** One section as drawn: the heading band, and the panel under it while the section is open. */
function section(s: ReturnType<typeof sketcher>, x0: number, x1: number, y: number, question: string, open: boolean) {
	const head = 34;
	const panel = open ? 64 : 0;
	const bottom = y + head + panel;
	s.shape(pathOf(roundRect(x0, y, x1, bottom, 6), true), 'box');
	if (open) s.highlight(x0 + 3, y + head / 2, x1 - 3, head - 6, 'open');
	s.pen([...roundRect(x0, y, x1, bottom, 6), [x0 + 6, y]], 200, 'pen part');
	if (open) s.pen([[x0, y + head], [x1, y + head]], 380, 'pen part');
	s.pen(open ? [[x0 + 12, y + 14], [x0 + 17, y + 20], [x0 + 22, y + 14]] : [[x0 + 14, y + 11], [x0 + 20, y + 17], [x0 + 14, y + 23]], 420, 'pen part');
	s.text(x0 + 32, y + 22, question, 'ui');
	if (open) {
		s.text(x0 + 14, y + head + 26, 'Orders leave within two', 'ui light');
		s.text(x0 + 14, y + head + 48, 'working days.', 'ui light');
	}
	return { top: y, head: y + head, bottom };
}

/** A hand-lettered label at (x, y) with a pen arrow to `to`. */
function label(s: ReturnType<typeof sketcher>, x: number, y: number, name: string, what: string, to: P, at: number, bend: [P, P]) {
	s.text(x, y, name, 'hand');
	s.text(x, y + 20, what, 'note');
	s.arrow([x - 8, y - 5], to, at, 'pen', bend);
}

export function wide() {
	const s = sketcher(720, 400, [], 15);
	s.paper(16, 16, 392, 384, 10);
	s.text(40, 52, 'Shipping & returns', 'title');
	s.pen([[40, 64], [200, 65]], 100, 'pen guide');
	const x0 = 40;
	const x1 = 368;
	const one = section(s, x0, x1, 84, QUESTIONS[0]!, true);
	const two = section(s, x0, x1, one.bottom + 12, QUESTIONS[1]!, false);
	const three = section(s, x0, x1, two.bottom + 12, QUESTIONS[2]!, false);
	s.pen([...roundRect(x0 - 10, 74, x1 + 10, three.bottom + 10, 10), [x0, 74]], 150, 'pen root');
	s.shape(pathOf(roundRect(x0 + 6, two.bottom + 1, x1 - 6, two.bottom + 9, 2), true), 'hidden');
	s.arrow([x0 + 8, one.head - 4], [x0 + 8, one.head + 30], 1200, 'pen names', [[-26, 4], [-26, -4]]);
	s.text(x0 - 22, one.head + 56, 'names', 'pencil');
	label(s, 424, 64, 'accordion.root', 'holds which one is open', [x1 + 10, 96], 1400, [[-20, 0], [20, -10]]);
	label(s, 424, 128, 'accordion.itemlabel', 'an <h3>: the heading line', [x1 - 4, one.top + 10], 1550, [[-20, 0], [20, 0]]);
	label(s, 424, 186, 'accordion.itemtrigger', 'the <button> inside the heading', [300, one.top + 22], 1700, [[-30, 10], [30, 10]]);
	label(s, 424, 244, 'accordion.itemcontent', 'a region the heading names', [x1 - 4, one.head + 36], 1850, [[-20, 0], [20, 0]]);
	label(s, 424, 302, 'accordion.item', 'one question and its answer', [x1 - 2, one.bottom - 4], 2000, [[-30, -20], [30, 20]]);
	label(s, 424, 352, 'closed answers stay', 'in the page, hidden', [x1 - 40, two.bottom + 5], 2150, [[-30, 0], [30, 10]]);
	return s.out;
}

export function tall() {
	const s = sketcher(360, 340, [], 15);
	s.paper(8, 8, 352, 330, 10);
	s.text(28, 42, 'Shipping & returns', 'title');
	const x0 = 28;
	const x1 = 332;
	const one = section(s, x0, x1, 66, QUESTIONS[0]!, true);
	const two = section(s, x0, x1, one.bottom + 12, QUESTIONS[1]!, false);
	section(s, x0, x1, two.bottom + 12, QUESTIONS[2]!, false);
	s.arrow([x0 + 8, one.head - 4], [x0 + 8, one.head + 30], 1200, 'pen names', [[-20, 4], [-20, -4]]);
	return s.out;
}

export function drawing() {
	return { wide: wide(), tall: tall() };
}
