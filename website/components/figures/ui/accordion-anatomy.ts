// The accordion as an assembly drawn in ink: each part a tinted sheet that lifts straight up by how deep it nests, with a one-word tag.
import { roundRect } from '../ink/desk.ts';
import { pathOf, wash } from '../ink/ink.ts';
import { sketcher } from '../reading/sketch.ts';

/** How far each part lifts off the page when the assembly is taken apart. */
const LIFT: Readonly<Record<string, readonly [number, number]>> = {
	root: [0, 0],
	item: [10, -62],
	itemlabel: [20, -124],
	itemtrigger: [30, -186],
	itemcontent: [20, -124],
};

const TAGS: Readonly<Record<string, string>> = {
	root: 'root',
	item: 'item',
	itemlabel: 'heading',
	itemtrigger: 'trigger',
	itemcontent: 'panel',
};

const PARTS = ['root', 'item', 'itemlabel', 'itemcontent', 'itemtrigger'] as const;

export function drawing() {
	const s = sketcher(520, 260, [], 15);
	const ranges: { part: string; shapes: number; strokes: number; texts: number }[] = [];
	const mark = (part: string) => ranges.push({ part, shapes: s.out.shapes.length, strokes: s.out.strokes.length, texts: s.out.texts.length });
	let seed = 400;
	const tint = (x0: number, y0: number, x1: number, y1: number, part: string) => s.shape(wash(roundRect(x0 + 3, y0 + 3, x1 - 3, y1 - 3, 6), (seed += 11), 0.8, 1.8), 'tint tint-' + part);
	const tag = (part: string, y: number, edge: number) => {
		s.pen([[edge + 4, y - 5], [452, y - 5]], 0, 'pen leader');
		s.text(460, y, TAGS[part]!, 'tag tag-' + part);
		s.text(460, y + 18, 'accordion.' + part, 'name');
	};

	mark('root');
	s.paper(20, 20, 440, 250, 12);
	tint(20, 20, 440, 250, 'root');
	s.shape(pathOf(roundRect(36, 198, 424, 236, 7), true), 'button-face');
	s.pen([...roundRect(36, 198, 424, 236, 7), [43, 198]], 0, 'pen');
	s.pen([[52, 210], [58, 217], [52, 224]], 0, 'pen');
	s.text(70, 222, 'How do I return it?', 'ui');
	tag('root', 244, 440);

	mark('item');
	s.paper(36, 36, 424, 184, 10);
	tint(36, 36, 424, 184, 'item');
	tag('item', 176, 424);

	mark('itemlabel');
	s.paper(48, 48, 412, 92, 8);
	tint(48, 48, 412, 92, 'itemlabel');
	s.pen([...roundRect(56, 54, 404, 86, 7), [63, 54]], 0, 'pen ghost-slot');
	s.text(94, 76, 'Do you ship overseas?', 'ui ghost-text');
	tag('itemlabel', 64, 412);

	mark('itemcontent');
	s.paper(48, 102, 412, 172, 8);
	tint(48, 102, 412, 172, 'itemcontent');
	s.text(64, 134, 'Yes, to forty countries.', 'ui');
	s.text(64, 158, 'Shipping takes a week.', 'ui light');
	tag('itemcontent', 140, 412);

	mark('itemtrigger');
	s.shape(pathOf(roundRect(56, 54, 404, 86, 7), true), 'button-face');
	tint(56, 54, 404, 86, 'itemtrigger');
	s.pen([...roundRect(56, 54, 404, 86, 7), [63, 54]], 0, 'pen');
	s.pen([[68, 66], [75, 73], [82, 66]], 0, 'pen chevron');
	s.text(94, 76, 'Do you ship overseas?', 'ui');
	tag('itemtrigger', 74, 404);

	mark('end');
	const layers = PARTS.map((part) => {
		const at = ranges.findIndex((r) => r.part === part);
		const from = ranges[at]!;
		const to = ranges[at + 1]!;
		return {
			part,
			dx: LIFT[part]![0],
			dy: LIFT[part]![1],
			shapes: s.out.shapes.slice(from.shapes, to.shapes),
			strokes: s.out.strokes.slice(from.strokes, to.strokes),
			texts: s.out.texts.slice(from.texts, to.texts),
		};
	});
	const corners: Readonly<Record<string, readonly [number, number, string]>> = {
		item: [36, 36, 'root'],
		itemlabel: [48, 48, 'item'],
		itemcontent: [48, 172, 'item'],
		itemtrigger: [56, 54, 'itemlabel'],
	};
	const guides = Object.entries(corners).map(([part, [x, y, parent]]) => {
		const [px, py] = LIFT[parent]!;
		const [dx, dy] = LIFT[part]!;
		return { part, d: pathOf([[x + px, y + py], [x + dx, y + dy]]) };
	});
	return { width: 640, height: 430, layers, guides };
}
