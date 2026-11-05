// The accordion as an exploded assembly drawn in ink: each part a sheet of paper, offset by how deep it nests.
import { roundRect } from '../ink/desk.ts';
import { hatch, pathOf } from '../ink/ink.ts';
import { sketcher } from '../reading/sketch.ts';

/** How far each part lifts off the one it sits in, in drawing units, when the assembly is pulled apart. */
const LIFT: Readonly<Record<string, readonly [number, number]>> = {
	root: [0, 0],
	item: [50, -72],
	itemlabel: [100, -144],
	itemtrigger: [150, -216],
	itemcontent: [100, -144],
};

const PARTS = ['root', 'item', 'itemlabel', 'itemcontent', 'itemtrigger'] as const;

export function drawing() {
	const s = sketcher(520, 340, [], 15);
	const ranges: { part: string; shapes: number; strokes: number; texts: number }[] = [];
	const mark = (part: string) => ranges.push({ part, shapes: s.out.shapes.length, strokes: s.out.strokes.length, texts: s.out.texts.length });

	mark('root');
	s.paper(20, 20, 420, 320, 12);
	s.shape(hatch(roundRect(48, 238, 392, 290, 8), 0.8, 4, 31, { cluster: 3, skip: 0.3 }), 'faint');
	s.pen([...roundRect(48, 238, 392, 290, 8), [56, 238]], 0, 'pen ghost');
	s.text(28, 14, 'accordion.root', 'name');

	mark('item');
	s.paper(40, 40, 400, 222, 10);
	s.text(48, 34, 'accordion.item', 'name');

	mark('itemlabel');
	s.paper(56, 54, 384, 104, 8);
	s.text(64, 48, 'accordion.itemlabel', 'name');

	mark('itemcontent');
	s.paper(56, 116, 384, 208, 8);
	for (const [i, end] of [280, 230, 170].entries()) s.pen([[78, 146 + i * 22], [78 + end * 0.5, 147 + i * 22], [78 + end, 145 + i * 22]], 0, 'pen scribble');
	s.text(64, 222, 'accordion.itemcontent', 'name');

	mark('itemtrigger');
	s.shape(pathOf(roundRect(68, 62, 372, 96, 7), true), 'button-face');
	s.shape(pathOf(roundRect(70, 64, 370, 94, 7), true), 'wash');
	s.pen([...roundRect(68, 62, 372, 96, 7), [75, 62]], 0, 'pen');
	s.pen([[82, 74], [89, 81], [96, 74]], 0, 'pen chevron');
	s.text(108, 85, 'Do you ship overseas?', 'ui');
	s.text(76, 114, 'accordion.itemtrigger', 'name');

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
		item: [40, 40, 'root'],
		itemlabel: [384, 54, 'item'],
		itemcontent: [384, 208, 'item'],
		itemtrigger: [372, 62, 'itemlabel'],
	};
	const guides = Object.entries(corners).map(([part, [x, y, parent]]) => {
		const [px, py] = LIFT[parent]!;
		const [dx, dy] = LIFT[part]!;
		return { part, d: pathOf([[x + px, y + py], [x + dx, y + dy]]) };
	});
	return { width: 520, height: 340, layers, guides };
}
